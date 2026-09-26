const request = require('supertest');
const app = require('../app');
const db = require('../db');
const jwt = require('jsonwebtoken');
const config = require('../config');
const { redisClient } = require('../db/redis');

jest.mock('../db', () => ({
  query: jest.fn(),
  pool: {
    connect: jest.fn().mockResolvedValue({
      query: jest.fn(),
      release: jest.fn()
    })
  }
}));

jest.mock('../db/redis', () => ({
  redisClient: {
    get: jest.fn(),
    set: jest.fn(),
    del: jest.fn()
  }
}));

jest.mock('../socket', () => ({
  getIo: jest.fn().mockReturnValue({
    to: jest.fn().mockReturnValue({
      emit: jest.fn()
    })
  }),
  getSocketIo: jest.fn().mockReturnValue({
    to: jest.fn().mockReturnValue({
      emit: jest.fn()
    })
  })
}));

jest.mock('../yjsManager', () => {
  return {
    docs: new Map(),
    getDoc: jest.fn()
  };
});

describe('Interviewer Control Room Endpoints', () => {
  let token;

  beforeAll(() => {
    token = jwt.sign({ userId: '1', email: 'test@test.com' }, config.jwtSecret);
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  const authHeader = (req) => req.set('Cookie', [`auth_token=${token}`]);

  describe('PATCH /api/interviews/:id/status', () => {
    it('should reject transition if already completed', async () => {
      db.query
        .mockResolvedValueOnce({ rows: [{ role: 'INTERVIEWER' }] }) // middleware
        .mockResolvedValueOnce({ rows: [{ status: 'COMPLETED' }] }); // existing status

      const res = await authHeader(request(app).patch('/api/interviews/1/status'))
        .send({ status: 'IN_PROGRESS' });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Cannot start an already completed or cancelled interview');
    });

    it('should capture snapshots and clean up Redis when transitioning to COMPLETED', async () => {
      const { docs } = require('../yjsManager');
      const Y = require('yjs');
      const doc = new Y.Doc();
      doc.getText('sourceCode').insert(0, 'test_code');
      docs.set('1:prob1', doc);

      db.query
        .mockResolvedValueOnce({ rows: [{ role: 'INTERVIEWER' }] }) // middleware
        .mockResolvedValueOnce({ rows: [{ status: 'IN_PROGRESS' }] }) // existing
        .mockResolvedValueOnce({ rows: [{ id: '1', status: 'COMPLETED' }] }) // update
        .mockResolvedValueOnce({ rows: [{ problem_id: 'prob1' }] }) // get problems
        .mockResolvedValueOnce({ rows: [] }); // insert snapshot

      redisClient.del.mockResolvedValue();

      const res = await authHeader(request(app).patch('/api/interviews/1/status'))
        .send({ status: 'COMPLETED' });

      expect(res.status).toBe(200);
      expect(db.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO interview_snapshots'),
        ['1', 'test_code', 'javascript', 'TERMINATION']
      );
      expect(redisClient.del).toHaveBeenCalledWith('interview:1:editor:lock');
      expect(redisClient.del).toHaveBeenCalledWith('interview:1:active-problem');
    });
  });

  describe('POST /api/interviews/:id/lock', () => {
    it('should allow INTERVIEWER to set lock', async () => {
      db.query.mockResolvedValueOnce({ rows: [{ role: 'INTERVIEWER' }] });
      redisClient.set.mockResolvedValue('OK');

      const res = await authHeader(request(app).post('/api/interviews/1/lock'))
        .send({ locked: true });

      expect(res.status).toBe(200);
      expect(redisClient.set).toHaveBeenCalledWith('interview:1:editor:lock', 'locked');
    });

    it('should block CANDIDATE from setting lock', async () => {
      db.query.mockResolvedValueOnce({ rows: [{ role: 'CANDIDATE' }] });

      const res = await authHeader(request(app).post('/api/interviews/1/lock'))
        .send({ locked: true });

      expect(res.status).toBe(403);
    });
  });

  describe('POST /api/interviews/:id/active-problem', () => {
    it('should allow INTERVIEWER to set active problem', async () => {
      db.query
        .mockResolvedValueOnce({ rows: [{ role: 'INTERVIEWER' }] }) // middleware
        .mockResolvedValueOnce({ rows: [{ id: 'prob1' }] }); // problem belongs to interview

      redisClient.set.mockResolvedValue('OK');

      const res = await authHeader(request(app).post('/api/interviews/1/active-problem'))
        .send({ problemId: 'prob1' });

      expect(res.status).toBe(200);
      expect(redisClient.set).toHaveBeenCalledWith('interview:1:active-problem', 'prob1');
    });

    it('should block setting if problem does not belong to interview', async () => {
      db.query
        .mockResolvedValueOnce({ rows: [{ role: 'INTERVIEWER' }] })
        .mockResolvedValueOnce({ rows: [] }); // problem doesn't belong

      const res = await authHeader(request(app).post('/api/interviews/1/active-problem'))
        .send({ problemId: 'prob2' });

      expect(res.status).toBe(403);
    });

    it('should block CANDIDATE from setting active problem', async () => {
      db.query.mockResolvedValueOnce({ rows: [{ role: 'CANDIDATE' }] });

      const res = await authHeader(request(app).post('/api/interviews/1/active-problem'))
        .send({ problemId: 'prob1' });

      expect(res.status).toBe(403);
    });
  });
});
