const request = require('supertest');
const app = require('../app');
const db = require('../db');
const jwt = require('jsonwebtoken');
const config = require('../config');

jest.mock('../db', () => ({
  query: jest.fn(),
  pool: {
    connect: jest.fn().mockResolvedValue({
      query: jest.fn(),
      release: jest.fn()
    })
  }
}));

jest.mock('../socket', () => ({
  getIo: jest.fn().mockReturnValue({
    to: jest.fn().mockReturnValue({
      emit: jest.fn()
    })
  })
}));

describe('Interview Endpoints', () => {
  let token;

  beforeAll(() => {
    token = jwt.sign(
      { userId: '1', email: 'test@test.com' },
      config.jwtSecret
    );
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  const authHeader = (req) =>
    req.set('Cookie', [`auth_token=${token}`]);

  describe('POST /api/interviews', () => {
    it('should create an interview and assign INTERVIEWER role', async () => {
      const mockClient = {
        query: jest.fn(),
        release: jest.fn()
      };

      mockClient.query
        .mockResolvedValueOnce() // BEGIN
        .mockResolvedValueOnce({
          rows: [{ id: 'int_1', title: 'Test Int' }]
        }) // INSERT interview
        .mockResolvedValueOnce() // INSERT participant
        .mockResolvedValueOnce(); // COMMIT

      db.pool.connect.mockResolvedValueOnce(mockClient);

      const res = await authHeader(
        request(app).post('/api/interviews')
      ).send({ title: 'Test Int' });

      expect(res.status).toBe(201);
      expect(res.body.interview.id).toBe('int_1');
      expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
    });
  });

  describe('GET /api/interviews', () => {
    it('should return interviews with pagination', async () => {
      db.query.mockImplementation((queryStr) => {
        if (queryStr.includes('SELECT COUNT(*)')) {
          return Promise.resolve({ rows: [{ count: '1' }] });
        }
        return Promise.resolve({ rows: [{ id: '1', title: 'Test' }] });
      });

      const res = await authHeader(
        request(app).get('/api/interviews?page=2&limit=10')
      );

      expect(res.status).toBe(200);
      expect(res.body.interviews.length).toBe(1);
      expect(res.body.pagination.page).toBe(2);
      expect(res.body.pagination.limit).toBe(10);
      expect(res.body.pagination.total).toBe(1);
    });
  });

  describe('GET /api/interviews/:id', () => {
    it('should return 403 if unauthorized', async () => {
      db.query.mockResolvedValueOnce({ rows: [] });

      const res = await authHeader(
        request(app).get('/api/interviews/1')
      );

      expect(res.status).toBe(403);
    });

    it('should return interview data if participant', async () => {
      db.query.mockImplementation((queryStr) => {
        if (queryStr.includes('FROM interview_participants')) return Promise.resolve({ rows: [{ role: 'CANDIDATE' }] });
        if (queryStr.includes('FROM interviews')) return Promise.resolve({ rows: [{ id: '1', title: 'Test' }] });
        return Promise.resolve({ rows: [] });
      });

      const res = await authHeader(
        request(app).get('/api/interviews/1')
      );

      expect(res.status).toBe(200);
      expect(res.body.interview.id).toBe('1');
    });
  });

  describe('POST /api/interviews/:id/participants', () => {
    it('should return 403 if user is not an INTERVIEWER', async () => {
      db.query.mockResolvedValueOnce({
        rows: [{ role: 'CANDIDATE' }]
      });

      const res = await authHeader(
        request(app).post('/api/interviews/1/participants')
      ).send({
        user_id: '2',
        role: 'CANDIDATE'
      });

      expect(res.status).toBe(403);
    });

    it('should add participant if user is INTERVIEWER', async () => {
      db.query.mockImplementation((queryStr, params) => {
        if (queryStr.includes('FROM interview_participants')) {
          if (params && params[1] === '2') return Promise.resolve({ rows: [] });
          return Promise.resolve({ rows: [{ role: 'INTERVIEWER' }] });
        }
        if (queryStr.includes('status FROM interviews')) return Promise.resolve({ rows: [{ status: 'IN_PROGRESS' }] });
        if (queryStr.includes('FROM users')) return Promise.resolve({ rows: [{ id: '2' }] });
        return Promise.resolve({ rows: [] });
      });

      const res = await authHeader(
        request(app).post('/api/interviews/1/participants')
      ).send({
        user_id: '2',
        role: 'CANDIDATE'
      });

      expect(res.status).toBe(201);
    });
  });

  describe('PATCH /api/interviews/:id/status', () => {
    it('should return 403 if user is not an INTERVIEWER', async () => {
      db.query.mockResolvedValueOnce({
        rows: [{ role: 'CANDIDATE' }]
      });

      const res = await authHeader(
        request(app).patch('/api/interviews/1/status')
      ).send({
        status: 'IN_PROGRESS'
      });

      expect(res.status).toBe(403);
    });

    it('should update status if user is INTERVIEWER', async () => {
      db.query.mockImplementation((queryStr) => {
        if (queryStr.includes('FROM interview_participants')) return Promise.resolve({ rows: [{ role: 'INTERVIEWER' }] });
        if (queryStr.includes('UPDATE interviews SET status')) return Promise.resolve({ rows: [{ id: '1', status: 'IN_PROGRESS' }] });
        if (queryStr.includes('status FROM interviews')) return Promise.resolve({ rows: [{ status: 'SCHEDULED' }] });
        return Promise.resolve({ rows: [] });
      });

      const res = await authHeader(
        request(app).patch('/api/interviews/1/status')
      ).send({
        status: 'IN_PROGRESS'
      });

      expect(res.status).toBe(200);
      expect(res.body.interview.status).toBe('IN_PROGRESS');
    });

    it('should allow IN_PROGRESS to COMPLETED', async () => {
      db.query.mockImplementation((queryStr) => {
        if (queryStr.includes('FROM interview_participants')) return Promise.resolve({ rows: [{ role: 'INTERVIEWER' }] });
        if (queryStr.includes('UPDATE interviews SET status')) return Promise.resolve({ rows: [{ id: '1', status: 'COMPLETED' }] });
        if (queryStr.includes('status FROM interviews')) return Promise.resolve({ rows: [{ status: 'IN_PROGRESS' }] });
        return Promise.resolve({ rows: [] });
      });

      const res = await authHeader(
        request(app).patch('/api/interviews/1/status')
      ).send({
        status: 'COMPLETED'
      });

      expect(res.status).toBe(200);
      expect(res.body.interview.status).toBe('COMPLETED');
    });

    it('should reject SCHEDULED to COMPLETED', async () => {
      db.query.mockImplementation((queryStr) => {
        if (queryStr.includes('FROM interview_participants')) return Promise.resolve({ rows: [{ role: 'INTERVIEWER' }] });
        if (queryStr.includes('status FROM interviews')) return Promise.resolve({ rows: [{ status: 'SCHEDULED' }] });
        return Promise.resolve({ rows: [] });
      });

      const res = await authHeader(
        request(app).patch('/api/interviews/1/status')
      ).send({
        status: 'COMPLETED'
      });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe(
        'Invalid status transition from SCHEDULED to COMPLETED'
      );
    });

    it('should reject COMPLETED to IN_PROGRESS', async () => {
      db.query.mockImplementation((queryStr) => {
        if (queryStr.includes('FROM interview_participants')) return Promise.resolve({ rows: [{ role: 'INTERVIEWER' }] });
        if (queryStr.includes('status FROM interviews')) return Promise.resolve({ rows: [{ status: 'COMPLETED' }] });
        return Promise.resolve({ rows: [] });
      });

      const res = await authHeader(
        request(app).patch('/api/interviews/1/status')
      ).send({
        status: 'IN_PROGRESS'
      });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe(
        'Invalid status transition from COMPLETED to IN_PROGRESS'
      );
    });

    it('should reject CANCELLED to IN_PROGRESS', async () => {
      db.query.mockImplementation((queryStr) => {
        if (queryStr.includes('FROM interview_participants')) return Promise.resolve({ rows: [{ role: 'INTERVIEWER' }] });
        if (queryStr.includes('status FROM interviews')) return Promise.resolve({ rows: [{ status: 'CANCELLED' }] });
        return Promise.resolve({ rows: [] });
      });

      const res = await authHeader(
        request(app).patch('/api/interviews/1/status')
      ).send({
        status: 'IN_PROGRESS'
      });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe(
        'Invalid status transition from CANCELLED to IN_PROGRESS'
      );
    });
  });

  describe('Mutation Lifecycle Restrictions', () => {
    it('should reject adding a participant to a completed interview', async () => {
      db.query.mockImplementation((queryStr) => {
        if (queryStr.includes('FROM interview_participants')) return Promise.resolve({ rows: [{ role: 'INTERVIEWER' }] });
        if (queryStr.includes('status FROM interviews')) return Promise.resolve({ rows: [{ status: 'COMPLETED' }] });
        return Promise.resolve({ rows: [] });
      });

      const res = await authHeader(
        request(app).post('/api/interviews/1/participants')
      ).send({ user_id: '2', role: 'CANDIDATE' });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Cannot modify a completed or cancelled interview');
    });

    it('should reject adding a participant to a cancelled interview', async () => {
      db.query.mockImplementation((queryStr) => {
        if (queryStr.includes('FROM interview_participants')) return Promise.resolve({ rows: [{ role: 'INTERVIEWER' }] });
        if (queryStr.includes('status FROM interviews')) return Promise.resolve({ rows: [{ status: 'CANCELLED' }] });
        return Promise.resolve({ rows: [] });
      });

      const res = await authHeader(
        request(app).post('/api/interviews/1/participants')
      ).send({ user_id: '2', role: 'CANDIDATE' });

      expect(res.status).toBe(400);
    });

    it('should reject assigning a problem to a completed interview', async () => {
      db.query.mockImplementation((queryStr) => {
        if (queryStr.includes('FROM interview_participants')) return Promise.resolve({ rows: [{ role: 'INTERVIEWER' }] });
        if (queryStr.includes('status FROM interviews')) return Promise.resolve({ rows: [{ status: 'COMPLETED' }] });
        return Promise.resolve({ rows: [] });
      });

      const res = await authHeader(
        request(app).post('/api/interviews/1/problems')
      ).send({ problem_id: '1' });

      expect(res.status).toBe(400);
    });

    it('should reject assigning a problem to a cancelled interview', async () => {
      db.query.mockImplementation((queryStr) => {
        if (queryStr.includes('FROM interview_participants')) return Promise.resolve({ rows: [{ role: 'INTERVIEWER' }] });
        if (queryStr.includes('status FROM interviews')) return Promise.resolve({ rows: [{ status: 'CANCELLED' }] });
        return Promise.resolve({ rows: [] });
      });

      const res = await authHeader(
        request(app).post('/api/interviews/1/problems')
      ).send({ problem_id: '1' });

      expect(res.status).toBe(400);
    });

    it('should reject removing a problem from a completed interview', async () => {
      db.query.mockImplementation((queryStr) => {
        if (queryStr.includes('FROM interview_participants')) return Promise.resolve({ rows: [{ role: 'INTERVIEWER' }] });
        if (queryStr.includes('status FROM interviews')) return Promise.resolve({ rows: [{ status: 'COMPLETED' }] });
        return Promise.resolve({ rows: [] });
      });

      const res = await authHeader(
        request(app).delete('/api/interviews/1/problems/1')
      );

      expect(res.status).toBe(400);
    });

    it('should reject removing a problem from a cancelled interview', async () => {
      db.query.mockImplementation((queryStr) => {
        if (queryStr.includes('FROM interview_participants')) return Promise.resolve({ rows: [{ role: 'INTERVIEWER' }] });
        if (queryStr.includes('status FROM interviews')) return Promise.resolve({ rows: [{ status: 'CANCELLED' }] });
        return Promise.resolve({ rows: [] });
      });

      const res = await authHeader(
        request(app).delete('/api/interviews/1/problems/1')
      );

      expect(res.status).toBe(400);
    });
  });
});

afterAll(async () => {
  await require('../db/redis').closeRedis();
});