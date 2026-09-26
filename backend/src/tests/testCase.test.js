const request = require('supertest');
const app = require('../app');
const db = require('../db');
const jwt = require('jsonwebtoken');
const config = require('../config');

describe('Test Case API', () => {
  let tokenInterviewer, tokenCandidate;
  let userInterviewer, userCandidate;
  let interview;
  let problem;

  beforeAll(async () => {
    await db.query('DELETE FROM users');
    await db.query('DELETE FROM problems');
    await db.query('DELETE FROM interviews');
    
    const u1Res = await db.query(
      "INSERT INTO users (email, password_hash, name) VALUES ('int@test.com', 'hash', 'Int') RETURNING id, email"
    );
    userInterviewer = u1Res.rows[0];
    tokenInterviewer = jwt.sign({ userId: userInterviewer.id, email: userInterviewer.email }, config.jwtSecret, { expiresIn: '1h' });

    const u2Res = await db.query(
      "INSERT INTO users (email, password_hash, name) VALUES ('cand@test.com', 'hash', 'Cand') RETURNING id, email"
    );
    userCandidate = u2Res.rows[0];
    tokenCandidate = jwt.sign({ userId: userCandidate.id, email: userCandidate.email }, config.jwtSecret, { expiresIn: '1h' });

    const probRes = await db.query(
      "INSERT INTO problems (title, description, difficulty) VALUES ('Test Prob', 'Desc', 'EASY') RETURNING id"
    );
    problem = probRes.rows[0];

    const intRes = await db.query(
      "INSERT INTO interviews (title, status) VALUES ('Test Interview', 'SCHEDULED') RETURNING id"
    );
    interview = intRes.rows[0];

    await db.query(
      "INSERT INTO interview_participants (interview_id, user_id, role) VALUES ($1, $2, 'INTERVIEWER')",
      [interview.id, userInterviewer.id]
    );
    await db.query(
      "INSERT INTO interview_participants (interview_id, user_id, role) VALUES ($1, $2, 'CANDIDATE')",
      [interview.id, userCandidate.id]
    );
    await db.query(
      "INSERT INTO interview_problems (interview_id, problem_id) VALUES ($1, $2)",
      [interview.id, problem.id]
    );
  });

  afterAll(async () => {
    await db.pool.end();
  });

  it('should allow interviewer to create test case', async () => {
    const res = await request(app)
      .post(`/api/interviews/${interview.id}/problems/${problem.id}/test-cases`)
      .set('Cookie', `auth_token=${tokenInterviewer}`)
      .send({ input: '2 2', expectedOutput: '4' });

    expect(res.status).toBe(201);
    expect(res.body.testCase.input).toBe('2 2');
    expect(res.body.testCase.expected_output).toBe('4');
  });

  it('should prevent candidate from creating test case', async () => {
    const res = await request(app)
      .post(`/api/interviews/${interview.id}/problems/${problem.id}/test-cases`)
      .set('Cookie', `auth_token=${tokenCandidate}`)
      .send({ input: '3 3', expectedOutput: '9' });

    expect(res.status).toBe(403);
  });
  
  it('should prevent candidate from retrieving test cases', async () => {
    const res = await request(app)
      .get(`/api/interviews/${interview.id}/problems/${problem.id}/test-cases`)
      .set('Cookie', `auth_token=${tokenCandidate}`);

    expect(res.status).toBe(403);
  });
});
