const request = require('supertest');
const app = require('../app');
const db = require('../db');
const judge0Client = require('../services/judge0Client');
const jwt = require('jsonwebtoken');
const config = require('../config');

jest.mock('../services/judge0Client');
jest.mock('../socket', () => ({
  getSocketIo: jest.fn(() => ({
    to: jest.fn().mockReturnThis(),
    emit: jest.fn()
  }))
}));

describe('Submission API', () => {
  let token;
  let user;
  let interview;
  let problem;
  let testCase;

  beforeAll(async () => {
    await db.query('DELETE FROM users');
    await db.query('DELETE FROM problems');
    await db.query('DELETE FROM interviews');
    
    const userRes = await db.query(
      "INSERT INTO users (email, password_hash, name) VALUES ('sub_user@test.com', 'hash', 'Sub User') RETURNING id, email"
    );
    user = userRes.rows[0];
    token = jwt.sign({ userId: user.id, email: user.email }, config.jwtSecret, { expiresIn: '1h' });

    const probRes = await db.query(
      "INSERT INTO problems (title, description, difficulty) VALUES ('Test Prob', 'Desc', 'EASY') RETURNING id"
    );
    problem = probRes.rows[0];

    const intRes = await db.query(
      "INSERT INTO interviews (title, status) VALUES ('Test Interview', 'SCHEDULED') RETURNING id"
    );
    interview = intRes.rows[0];

    await db.query(
      "INSERT INTO interview_participants (interview_id, user_id, role) VALUES ($1, $2, 'CANDIDATE')",
      [interview.id, user.id]
    );
    await db.query(
      "INSERT INTO interview_problems (interview_id, problem_id) VALUES ($1, $2)",
      [interview.id, problem.id]
    );

    const tcRes = await db.query(
      "INSERT INTO test_cases (problem_id, input, expected_output) VALUES ($1, 'in', 'out') RETURNING id",
      [problem.id]
    );
    testCase = tcRes.rows[0];
  });

  afterAll(async () => {
    await db.pool.end();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should submit code for evaluation', async () => {
    judge0Client.submitCode.mockResolvedValue('mock-sub-token-123');

    const res = await request(app)
      .post(`/api/interviews/${interview.id}/problems/${problem.id}/submit`)
      .set('Cookie', `auth_token=${token}`)
      .send({
        language: 'javascript',
        sourceCode: 'console.log("out");'
      });

    expect(res.status).toBe(202);
    expect(res.body.message).toBe('Submission accepted');
    expect(res.body.submissionId).toBeDefined();

    // Verify DB insertion
    const dbRes = await db.query('SELECT status FROM submissions WHERE id = $1', [res.body.submissionId]);
    expect(dbRes.rows[0].status).toBe('Processing');
    
    // Wait slightly for background tasks
    await new Promise(r => setTimeout(r, 100));
    const tcRes = await db.query('SELECT judge0_token FROM submission_results WHERE submission_id = $1', [res.body.submissionId]);
    expect(tcRes.rows[0].judge0_token).toBe('mock-sub-token-123');
  });

  it('should handle judge0 submission callback', async () => {
    judge0Client.mapJudge0Status.mockReturnValue('Accepted');

    const subRes = await db.query(
      `INSERT INTO submissions (interview_id, user_id, problem_id, language, source_code, status) 
       VALUES ($1, $2, $3, 'javascript', 'code', 'Processing') RETURNING id`,
      [interview.id, user.id, problem.id]
    );
    const subId = subRes.rows[0].id;

    await db.query(
      `INSERT INTO submission_results (submission_id, test_case_id, status, judge0_token) 
       VALUES ($1, $2, 'Processing', 'mock-sub-token-abc')`,
      [subId, testCase.id]
    );

    const res = await request(app)
      .post('/api/executions/judge0/callback?type=submission')
      .set('x-judge0-callback-secret', config.judge0.callbackSecret)
      .send({
        token: 'mock-sub-token-abc',
        status: { id: 3 }, // 3 is accepted
        stdout: 'out\n',
        time: '0.045',
        memory: 1234
      });

    expect(res.status).toBe(200);

    const dbSubRes = await db.query('SELECT status FROM submission_results WHERE submission_id = $1', [subId]);
    expect(dbSubRes.rows[0].status).toBe('Accepted');
    
    // Should compute final verdict
    const finalSubRes = await db.query('SELECT status FROM submissions WHERE id = $1', [subId]);
    expect(finalSubRes.rows[0].status).toBe('Accepted');
  });

  it('should reject callback with missing or incorrect secret', async () => {
    const res1 = await request(app)
      .post('/api/executions/judge0/callback?type=submission')
      .send({
        token: 'mock-token',
        status: { id: 3 }
      });
    expect(res1.status).toBe(403);

    const res2 = await request(app)
      .post('/api/executions/judge0/callback?type=submission')
      .set('x-judge0-callback-secret', 'wrong_secret')
      .send({
        token: 'mock-token',
        status: { id: 3 }
      });
    expect(res2.status).toBe(403);
  });

  it('should keep concurrent submissions isolated', async () => {
    // Create Submission A
    const subARes = await db.query(
      `INSERT INTO submissions (interview_id, user_id, problem_id, language, source_code, status) 
       VALUES ($1, $2, $3, 'javascript', 'code A', 'Processing') RETURNING id`,
      [interview.id, user.id, problem.id]
    );
    const subAId = subARes.rows[0].id;

    await db.query(
      `INSERT INTO submission_results (submission_id, test_case_id, status, judge0_token) 
       VALUES ($1, $2, 'Processing', 'token-A1')`,
      [subAId, testCase.id]
    );

    // Create Submission B
    const subBRes = await db.query(
      `INSERT INTO submissions (interview_id, user_id, problem_id, language, source_code, status) 
       VALUES ($1, $2, $3, 'javascript', 'code B', 'Processing') RETURNING id`,
      [interview.id, user.id, problem.id]
    );
    const subBId = subBRes.rows[0].id;

    await db.query(
      `INSERT INTO submission_results (submission_id, test_case_id, status, judge0_token) 
       VALUES ($1, $2, 'Processing', 'token-B1')`,
      [subBId, testCase.id]
    );

    // Callback for Submission A (Wrong Answer)
    judge0Client.mapJudge0Status.mockReturnValue('Wrong Answer');
    await request(app)
      .post('/api/executions/judge0/callback?type=submission')
      .set('x-judge0-callback-secret', config.judge0.callbackSecret)
      .send({ token: 'token-A1', status: { id: 4 }, stdout: 'wrong\n' });

    // Callback for Submission B (Accepted)
    judge0Client.mapJudge0Status.mockReturnValue('Accepted');
    await request(app)
      .post('/api/executions/judge0/callback?type=submission')
      .set('x-judge0-callback-secret', config.judge0.callbackSecret)
      .send({ token: 'token-B1', status: { id: 3 }, stdout: 'out\n' });

    // Verify A
    const finalA = await db.query('SELECT status FROM submissions WHERE id = $1', [subAId]);
    expect(finalA.rows[0].status).toBe('Wrong Answer');

    // Verify B
    const finalB = await db.query('SELECT status FROM submissions WHERE id = $1', [subBId]);
    expect(finalB.rows[0].status).toBe('Accepted');
  });
});
