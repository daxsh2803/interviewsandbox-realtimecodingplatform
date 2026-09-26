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

describe('Execution API', () => {
  let token;
  let user;
  let interview;
  let problem;

  beforeAll(async () => {
    await db.query('DELETE FROM users');
    await db.query('DELETE FROM problems');
    await db.query('DELETE FROM interviews');
    
    // Create User
    const userRes = await db.query(
      "INSERT INTO users (email, password_hash, name) VALUES ('exec_user@test.com', 'hash', 'Exec User') RETURNING id, email"
    );
    user = userRes.rows[0];
    token = jwt.sign({ userId: user.id, email: user.email }, config.jwtSecret, { expiresIn: '1h' });

    // Create Problem
    const probRes = await db.query(
      "INSERT INTO problems (title, description, difficulty) VALUES ('Test Prob', 'Desc', 'EASY') RETURNING id"
    );
    problem = probRes.rows[0];

    // Create Interview
    const intRes = await db.query(
      "INSERT INTO interviews (title, status) VALUES ('Test Interview', 'SCHEDULED') RETURNING id"
    );
    interview = intRes.rows[0];

    // Link user and problem
    await db.query(
      "INSERT INTO interview_participants (interview_id, user_id, role) VALUES ($1, $2, 'CANDIDATE')",
      [interview.id, user.id]
    );
    await db.query(
      "INSERT INTO interview_problems (interview_id, problem_id) VALUES ($1, $2)",
      [interview.id, problem.id]
    );
  });

  afterAll(async () => {
    await db.pool.end();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should submit code for execution', async () => {
    judge0Client.submitCode.mockResolvedValue('mock-token-123');

    const res = await request(app)
      .post(`/api/interviews/${interview.id}/execute`)
      .set('Cookie', `auth_token=${token}`)
      .send({
        problemId: problem.id,
        language: 'javascript',
        sourceCode: 'console.log("hello");'
      });

    expect(res.status).toBe(202);
    expect(res.body.message).toBe('Execution submitted');
    expect(res.body.executionId).toBeDefined();

    // Verify DB insertion
    const dbRes = await db.query('SELECT status, judge0_token FROM code_executions WHERE id = $1', [res.body.executionId]);
    expect(dbRes.rows[0].status).toBe('Processing');
    
    // Wait slightly to let the async background token update happen
    await new Promise(r => setTimeout(r, 100));
    const dbRes2 = await db.query('SELECT judge0_token FROM code_executions WHERE id = $1', [res.body.executionId]);
    expect(dbRes2.rows[0].judge0_token).toBe('mock-token-123');
  });

  it('should handle judge0 callback', async () => {
    judge0Client.mapJudge0Status.mockReturnValue('Accepted');

    // Manually insert an execution waiting for callback
    const execRes = await db.query(
      `INSERT INTO code_executions (interview_id, user_id, problem_id, language, source_code, status, judge0_token) 
       VALUES ($1, $2, $3, 'javascript', 'code', 'Processing', 'mock-token-abc') RETURNING id`,
      [interview.id, user.id, problem.id]
    );
    const execId = execRes.rows[0].id;

    const res = await request(app)
      .post('/api/executions/judge0/callback')
      .set('x-judge0-callback-secret', config.judge0.callbackSecret)
      .send({
        token: 'mock-token-abc',
        status: { id: 3 }, // 3 is accepted
        stdout: 'aGVsbG8=', // base64 of 'hello' (mock) Wait, our implementation expects string directly. Let's send raw string.
        time: '0.045',
        memory: 1234
      });

    expect(res.status).toBe(200);

    const dbRes = await db.query('SELECT status, stdout, execution_time_ms FROM code_executions WHERE id = $1', [execId]);
    expect(dbRes.rows[0].status).toBe('Accepted');
    expect(dbRes.rows[0].execution_time_ms).toBe(45); // 0.045 * 1000
  });

  it('should be idempotent and not overwrite terminal states', async () => {
    // Execution already in Accepted state
    const execRes = await db.query(
      `INSERT INTO code_executions (interview_id, user_id, problem_id, language, source_code, status, judge0_token) 
       VALUES ($1, $2, $3, 'javascript', 'code', 'Accepted', 'mock-token-terminal') RETURNING id`,
      [interview.id, user.id, problem.id]
    );
    const execId = execRes.rows[0].id;

    // Send callback for the same token but with "Wrong Answer"
    judge0Client.mapJudge0Status.mockReturnValue('Wrong Answer');

    const res = await request(app)
      .post('/api/executions/judge0/callback')
      .set('x-judge0-callback-secret', config.judge0.callbackSecret)
      .send({
        token: 'mock-token-terminal',
        status: { id: 4 }, // 4 is WA
        stdout: 'failed'
      });

    expect(res.status).toBe(200);

    // Verify it did NOT overwrite
    const dbRes = await db.query('SELECT status, stdout FROM code_executions WHERE id = $1', [execId]);
    expect(dbRes.rows[0].status).toBe('Accepted');
    expect(dbRes.rows[0].stdout).toBeNull(); // didn't update to 'failed'
  });

  it('should reject callback with missing secret', async () => {
    const res = await request(app)
      .post('/api/executions/judge0/callback')
      .send({
        token: 'mock-token',
        status: { id: 3 }
      });
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('Unauthorized callback');
  });

  it('should reject callback with incorrect secret', async () => {
    const res = await request(app)
      .post('/api/executions/judge0/callback')
      .set('x-judge0-callback-secret', 'wrong_secret')
      .send({
        token: 'mock-token',
        status: { id: 3 }
      });
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('Unauthorized callback');
  });
});
