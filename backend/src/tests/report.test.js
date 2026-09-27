const db = require('../db');
const request = require('supertest');
const app = require('../app');
const jwt = require('jsonwebtoken');
const config = require('../config');

jest.mock('../db', () => ({
  query: jest.fn()
}));

describe('Report and History API', () => {
  const interviewerToken = jwt.sign({ userId: 'interviewer-1' }, config.jwtSecret);
  const candidateToken = jwt.sign({ userId: 'candidate-1' }, config.jwtSecret);
  const interviewId = 'int-1';

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /api/interviews/:id/report', () => {
    it('should reject non-participants', async () => {
      db.query.mockResolvedValueOnce({ rowCount: 0, rows: [] }); // Participant check

      const res = await request(app)
        .get(`/api/interviews/${interviewId}/report`)
        .set('Cookie', [`auth_token=${candidateToken}`]);

      expect(res.status).toBe(403);
      expect(res.body.error).toBe('User is not a participant in this interview');
    });

    it('should return full report for interviewer', async () => {
      db.query
        .mockResolvedValueOnce({ rowCount: 1, rows: [{ role: 'INTERVIEWER' }] }) // Participant check
        .mockResolvedValueOnce({ rowCount: 1, rows: [{ id: interviewId, title: 'Test Interview' }] }) // Interview metadata
        .mockResolvedValueOnce({ rowCount: 2, rows: [
          { id: 'user1', role: 'INTERVIEWER' },
          { id: 'user2', role: 'CANDIDATE' }
        ] }) // Participants
        .mockResolvedValueOnce({ rowCount: 1, rows: [{ id: 'prob1', title: 'Two Sum' }] }) // Problems
        .mockResolvedValueOnce({ rowCount: 1, rows: [{ execution_count: 5, submission_count: 2 }] }) // Stats
        .mockResolvedValueOnce({ rowCount: 1, rows: [{ notes: 'Good candidate' }] }); // Notes

      const res = await request(app)
        .get(`/api/interviews/${interviewId}/report`)
        .set('Cookie', [`auth_token=${interviewerToken}`]);

      expect(res.status).toBe(200);
      expect(res.body.interview.title).toBe('Test Interview');
      expect(res.body.participants.length).toBe(2);
      expect(res.body.stats.execution_count).toBe(5);
      expect(res.body.notes).toBe('Good candidate');
    });

    it('should return candidate-safe report for candidate', async () => {
      db.query
        .mockResolvedValueOnce({ rowCount: 1, rows: [{ role: 'CANDIDATE' }] }) // Participant check
        .mockResolvedValueOnce({ rowCount: 1, rows: [{ id: interviewId, title: 'Test Interview' }] }) // Interview metadata
        .mockResolvedValueOnce({ rowCount: 2, rows: [
          { id: 'user1', role: 'INTERVIEWER' },
          { id: 'user2', role: 'CANDIDATE' }
        ] }) // Participants
        .mockResolvedValueOnce({ rowCount: 1, rows: [{ id: 'prob1', title: 'Two Sum' }] }) // Problems
        .mockResolvedValueOnce({ rowCount: 1, rows: [{ execution_count: 5, submission_count: 2 }] }); // Stats

      const res = await request(app)
        .get(`/api/interviews/${interviewId}/report`)
        .set('Cookie', [`auth_token=${candidateToken}`]);

      expect(res.status).toBe(200);
      expect(res.body.notes).toBeUndefined(); // Notes are hidden from candidate
    });
  });

  describe('GET /api/interviews/:id/submissions', () => {
    it('should filter candidate submissions and hide sensitive data', async () => {
      db.query
        .mockResolvedValueOnce({ rowCount: 1, rows: [{ role: 'CANDIDATE' }] }) // Participant check
        .mockResolvedValueOnce({ rowCount: 1, rows: [
          { id: 'sub-1', problem_id: 'prob-1', language: 'python', status: 'Accepted', created_at: '2026-09-26T00:00:00Z', user_id: 'candidate-1' }
        ] }) // Submissions query
        .mockResolvedValueOnce({ rowCount: 1, rows: [{ source_code: 'print("Hello")' }] }) // Source code query for their own submission
        .mockResolvedValueOnce({ rowCount: 1, rows: [
          { id: 'res-1', status: 'Accepted', execution_time_ms: 10, memory_bytes: 100, is_hidden: true, input: 'hidden_in', expected_output: 'hidden_out', stdout: 'hidden_out' }
        ] }); // Results query - Note: actual query won't return input/expected_output/stdout for candidate because of isInterviewer check, but let's assume it returned all columns and we filter

      const res = await request(app)
        .get(`/api/interviews/${interviewId}/submissions`)
        .set('Cookie', [`auth_token=${candidateToken}`]);

      expect(res.status).toBe(200);
      expect(res.body.submissions.length).toBe(1);

      const sub = res.body.submissions[0];
      expect(sub.source_code).toBe('print("Hello")');

      const result = sub.results[0];
      expect(result.status).toBe('Accepted');
      expect(result.input).toBeUndefined(); // Sensitive data hidden
      expect(result.expected_output).toBeUndefined();
      expect(result.stdout).toBeUndefined();
    });

    it('should allow interviewer to see all submissions with full details', async () => {
      db.query
        .mockResolvedValueOnce({ rowCount: 1, rows: [{ role: 'INTERVIEWER' }] }) // Participant check
        .mockResolvedValueOnce({ rowCount: 1, rows: [
          { id: 'sub-1', problem_id: 'prob-1', language: 'python', status: 'Wrong Answer', created_at: '2026-09-26T00:00:00Z', user_id: 'candidate-1' }
        ] }) // Submissions query
        .mockResolvedValueOnce({ rowCount: 1, rows: [{ source_code: 'print("WA")' }] }) // Source code
        .mockResolvedValueOnce({ rowCount: 1, rows: [
          { id: 'res-1', status: 'Wrong Answer', execution_time_ms: 10, memory_bytes: 100, is_hidden: true, input: 'hidden_in', expected_output: 'hidden_out', stdout: 'WA', stderr: '' }
        ] }); // Results

      const res = await request(app)
        .get(`/api/interviews/${interviewId}/submissions`)
        .set('Cookie', [`auth_token=${interviewerToken}`]);

      expect(res.status).toBe(200);
      const sub = res.body.submissions[0];
      const result = sub.results[0];
      expect(result.input).toBe('hidden_in');
      expect(result.stdout).toBe('WA');
    });
  });

  describe('Interviewer Notes API', () => {
    it('should reject candidate from viewing notes', async () => {
      db.query.mockResolvedValueOnce({ rowCount: 1, rows: [{ role: 'CANDIDATE' }] }); // Participant check

      const res = await request(app)
        .get(`/api/interviews/${interviewId}/notes`)
        .set('Cookie', [`auth_token=${candidateToken}`]);

      expect(res.status).toBe(403);
    });

    it('should reject candidate from modifying notes', async () => {
      db.query.mockResolvedValueOnce({ rowCount: 1, rows: [{ role: 'CANDIDATE' }] }); // Participant check

      const res = await request(app)
        .put(`/api/interviews/${interviewId}/notes`)
        .set('Cookie', [`auth_token=${candidateToken}`])
        .send({ notes: 'Hack' });

      expect(res.status).toBe(403);
    });

    it('should allow interviewer to upsert notes', async () => {
      db.query
        .mockResolvedValueOnce({ rowCount: 1, rows: [{ role: 'INTERVIEWER' }] }) // Participant check
        .mockResolvedValueOnce({ rowCount: 1, rows: [] }); // Upsert

      const res = await request(app)
        .put(`/api/interviews/${interviewId}/notes`)
        .set('Cookie', [`auth_token=${interviewerToken}`])
        .send({ notes: 'Updated notes' });

      expect(res.status).toBe(200);
      expect(res.body.notes).toBe('Updated notes');
    });
  });

  describe('IDOR / Cross-Interview Tests', () => {
    it('should reject access to report if user is not a participant of the interview', async () => {
      // Simulate IDOR: Interviewer of another interview tries to access this interview
      db.query.mockResolvedValueOnce({ rowCount: 0, rows: [] }); // Participant check returns empty

      const res = await request(app)
        .get(`/api/interviews/${interviewId}/report`)
        .set('Cookie', [`auth_token=${interviewerToken}`]);

      expect(res.status).toBe(403);
    });

    it('should reject access to snapshots if user is not a participant', async () => {
      db.query.mockResolvedValueOnce({ rowCount: 0, rows: [] });

      const res = await request(app)
        .get(`/api/interviews/${interviewId}/snapshots`)
        .set('Cookie', [`auth_token=${candidateToken}`]);

      expect(res.status).toBe(403);
    });
  });
});


afterAll(async () => { await require('../db/redis').closeRedis(); });
