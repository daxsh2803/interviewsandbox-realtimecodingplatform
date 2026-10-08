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
  let problemOther;
  let problemLegacy;

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
      "INSERT INTO problems (title, description, difficulty, created_by) VALUES ('Test Prob', 'Desc', 'EASY', $1) RETURNING id",
      [userInterviewer.id]
    );
    problem = probRes.rows[0];

    const probOtherRes = await db.query(
      "INSERT INTO problems (title, description, difficulty, created_by) VALUES ('Other Prob', 'Desc', 'EASY', $1) RETURNING id",
      [userCandidate.id]
    );
    problemOther = probOtherRes.rows[0];

    const probLegacyRes = await db.query(
      "INSERT INTO problems (title, description, difficulty) VALUES ('Legacy Prob', 'Desc', 'EASY') RETURNING id"
    );
    problemLegacy = probLegacyRes.rows[0];

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
    await db.query(
      "INSERT INTO interview_problems (interview_id, problem_id) VALUES ($1, $2)",
      [interview.id, problemOther.id]
    );
    await db.query(
      "INSERT INTO interview_problems (interview_id, problem_id) VALUES ($1, $2)",
      [interview.id, problemLegacy.id]
    );
  });

  afterAll(async () => {
    await db.pool.end();
    await require('../db/redis').closeRedis();
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

  it('should prevent non-owner interviewer from creating test case for another users problem', async () => {
    const res = await request(app)
      .post(`/api/interviews/${interview.id}/problems/${problemOther.id}/test-cases`)
      .set('Cookie', `auth_token=${tokenInterviewer}`)
      .send({ input: '3 3', expectedOutput: '9' });

    expect(res.status).toBe(403);
  });

  it('should prevent interviewer from creating test case for legacy problem with NULL created_by', async () => {
    const res = await request(app)
      .post(`/api/interviews/${interview.id}/problems/${problemLegacy.id}/test-cases`)
      .set('Cookie', `auth_token=${tokenInterviewer}`)
      .send({ input: '3 3', expectedOutput: '9' });

    expect(res.status).toBe(403);
  });

  it('should allow problem owner to delete their test case', async () => {
    const createRes = await request(app)
      .post(`/api/interviews/${interview.id}/problems/${problem.id}/test-cases`)
      .set('Cookie', `auth_token=${tokenInterviewer}`)
      .send({ input: '5 5', expectedOutput: '25' });

    const testCaseId = createRes.body.testCase.id;

    const delRes = await request(app)
      .delete(`/api/interviews/${interview.id}/problems/${problem.id}/test-cases/${testCaseId}`)
      .set('Cookie', `auth_token=${tokenInterviewer}`);

    expect(delRes.status).toBe(204);
  });

  it('should prevent non-owner interviewer from deleting another users test case', async () => {
    // We need to bypass the API to create the test case because we can't create it via API as a non-owner candidate
    const tcRes = await db.query(
      "INSERT INTO test_cases (problem_id, input, expected_output) VALUES ($1, '1', '1') RETURNING id",
      [problemOther.id]
    );
    const testCaseId = tcRes.rows[0].id;

    const delRes = await request(app)
      .delete(`/api/interviews/${interview.id}/problems/${problemOther.id}/test-cases/${testCaseId}`)
      .set('Cookie', `auth_token=${tokenInterviewer}`);

    expect(delRes.status).toBe(403);
  });

  it('should prevent interviewer from deleting a legacy test case', async () => {
    const tcRes = await db.query(
      "INSERT INTO test_cases (problem_id, input, expected_output) VALUES ($1, '1', '1') RETURNING id",
      [problemLegacy.id]
    );
    const testCaseId = tcRes.rows[0].id;

    const delRes = await request(app)
      .delete(`/api/interviews/${interview.id}/problems/${problemLegacy.id}/test-cases/${testCaseId}`)
      .set('Cookie', `auth_token=${tokenInterviewer}`);

    expect(delRes.status).toBe(403);
  });

  it('should enforce a maximum of 50 test cases per problem', async () => {
    // We already have some test cases from previous tests. Let's insert until we have exactly 50.
    const countRes = await db.query('SELECT COUNT(*) FROM test_cases WHERE problem_id = $1', [problem.id]);
    const currentCount = parseInt(countRes.rows[0].count, 10);

    const placeholders = [];
    for (let i = 0; i < 50 - currentCount; i++) {
      placeholders.push(`($1, 'in', 'out')`);
    }

    if (placeholders.length > 0) {
      const query = `INSERT INTO test_cases (problem_id, input, expected_output) VALUES ${placeholders.join(', ')}`;
      await db.query(query, [problem.id]);
    }

    // Now try to add the 51st test case via the API
    const res = await request(app)
      .post(`/api/interviews/${interview.id}/problems/${problem.id}/test-cases`)
      .set('Cookie', `auth_token=${tokenInterviewer}`)
      .send({ input: '6', expectedOutput: '6' });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Maximum number of test cases (50) reached for this problem.');
  });
});
