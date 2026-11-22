const db = require('../db');
const { sweep, start, stop } = require('../services/reconciliationWorker');
const config = require('../config');

jest.mock('../socket', () => ({
  getSocketIo: jest.fn(() => ({
    to: jest.fn().mockReturnThis(),
    emit: jest.fn()
  }))
}));

describe('Reconciliation Worker', () => {
  beforeAll(async () => {
    await db.query('DELETE FROM submission_results');
    await db.query('DELETE FROM test_cases');
    await db.query('DELETE FROM submissions');
    await db.query('DELETE FROM code_executions');
    await db.query('DELETE FROM interview_problems');
    await db.query('DELETE FROM problems');
    await db.query('DELETE FROM interview_participants');
    await db.query('DELETE FROM users');
    await db.query('DELETE FROM interviews');
  });

  afterAll(async () => {
    await db.pool.end();
  });

  afterEach(async () => {
    await db.query('DELETE FROM submission_results');
    await db.query('DELETE FROM test_cases');
    await db.query('DELETE FROM submissions');
    await db.query('DELETE FROM code_executions');
    stop();
  });

  it('should reconcile stale processing code_executions', async () => {
    const { rows: userRows } = await db.query("INSERT INTO users (email, password_hash, name) VALUES ('rec_user@test.com', 'hash', 'Rec User') RETURNING id");
    const userId = userRows[0].id;
    const { rows: intRows } = await db.query("INSERT INTO interviews (title, status) VALUES ('Rec Interview', 'SCHEDULED') RETURNING id");
    const intId = intRows[0].id;
    const { rows: probRows } = await db.query("INSERT INTO problems (title, description, difficulty) VALUES ('Rec Prob', 'Desc', 'EASY') RETURNING id");
    const probId = probRows[0].id;

    // Insert a fresh execution
    const freshRes = await db.query(`INSERT INTO code_executions (interview_id, user_id, problem_id, language, source_code, status) VALUES ($1, $2, $3, 'javascript', 'code', 'Processing') RETURNING id`, [intId, userId, probId]);
    const freshId = freshRes.rows[0].id;

    // Insert a stale execution
    const staleRes = await db.query(`INSERT INTO code_executions (interview_id, user_id, problem_id, language, source_code, status, created_at) VALUES ($1, $2, $3, 'javascript', 'code', 'Processing', NOW() - INTERVAL '5 minutes') RETURNING id`, [intId, userId, probId]);
    const staleId = staleRes.rows[0].id;

    await sweep();

    const checkFresh = await db.query('SELECT status FROM code_executions WHERE id = $1', [freshId]);
    expect(checkFresh.rows[0].status).toBe('Processing');

    const checkStale = await db.query('SELECT status FROM code_executions WHERE id = $1', [staleId]);
    expect(checkStale.rows[0].status).toBe('Internal Error');
  });

  it('should reconcile stale processing submission_results', async () => {
    const { rows: userRows } = await db.query("INSERT INTO users (email, password_hash, name) VALUES ('rec_user2@test.com', 'hash', 'Rec User') RETURNING id");
    const userId = userRows[0].id;
    const { rows: intRows } = await db.query("INSERT INTO interviews (title, status) VALUES ('Rec Interview2', 'SCHEDULED') RETURNING id");
    const intId = intRows[0].id;
    const { rows: probRows } = await db.query("INSERT INTO problems (title, description, difficulty) VALUES ('Rec Prob2', 'Desc', 'EASY') RETURNING id");
    const probId = probRows[0].id;

    const tcRes1 = await db.query("INSERT INTO test_cases (problem_id, input, expected_output) VALUES ($1, 'in', 'out') RETURNING id", [probId]);
    const tcId1 = tcRes1.rows[0].id;

    const tcRes2 = await db.query("INSERT INTO test_cases (problem_id, input, expected_output) VALUES ($1, 'in2', 'out2') RETURNING id", [probId]);
    const tcId2 = tcRes2.rows[0].id;

    // Create a submission
    const subRes = await db.query(`INSERT INTO submissions (interview_id, user_id, problem_id, language, source_code, status) VALUES ($1, $2, $3, 'javascript', 'code', 'Processing') RETURNING id`, [intId, userId, probId]);
    const subId = subRes.rows[0].id;

    // Fresh result
    await db.query(`INSERT INTO submission_results (submission_id, test_case_id, status) VALUES ($1, $2, 'Processing')`, [subId, tcId1]);
    
    // Stale result
    await db.query(`INSERT INTO submission_results (submission_id, test_case_id, status, created_at) VALUES ($1, $2, 'Processing', NOW() - INTERVAL '5 minutes')`, [subId, tcId2]);

    await sweep();

    // Stale result should be updated to Internal Error
    // But since one result is still Processing, the overall submission should still be Processing
    const checkSub = await db.query('SELECT status FROM submissions WHERE id = $1', [subId]);
    expect(checkSub.rows[0].status).toBe('Processing');
    
    // Now make the first result stale and sweep again
    await db.query(`UPDATE submission_results SET created_at = NOW() - INTERVAL '5 minutes' WHERE test_case_id = $1`, [tcId1]);
    await sweep();

    // Now all results are evaluated, final status should be 'Internal Error' (because they all timed out)
    const checkSub2 = await db.query('SELECT status FROM submissions WHERE id = $1', [subId]);
    expect(checkSub2.rows[0].status).toBe('Internal Error');
  });

  it('should be idempotent', async () => {
    await sweep();
    await sweep();
  });
});
