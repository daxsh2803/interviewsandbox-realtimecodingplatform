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

describe('Interview Endpoints', () => {
  let token;

  beforeAll(() => {
    token = jwt.sign({ userId: '1', email: 'test@test.com' }, config.jwtSecret);
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  const authHeader = (req) => req.set('Cookie', [`auth_token=${token}`]);

  describe('POST /api/interviews', () => {
    it('should create an interview and assign INTERVIEWER role', async () => {
      const mockClient = {
        query: jest.fn(),
        release: jest.fn()
      };
      
      mockClient.query
        .mockResolvedValueOnce() // BEGIN
        .mockResolvedValueOnce({ rows: [{ id: 'int_1', title: 'Test Int' }] }) // INSERT interview
        .mockResolvedValueOnce() // INSERT participant
        .mockResolvedValueOnce(); // COMMIT

      db.pool.connect.mockResolvedValueOnce(mockClient);

      const res = await authHeader(request(app).post('/api/interviews'))
        .send({ title: 'Test Int' });

      expect(res.status).toBe(201);
      expect(res.body.interview.id).toBe('int_1');
      expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
    });
  });

  describe('GET /api/interviews/:id', () => {
    it('should return 403 if unauthorized', async () => {
      // Mock requireParticipant failure
      db.query.mockResolvedValueOnce({ rows: [] }); // User is not a participant

      const res = await authHeader(request(app).get('/api/interviews/1'));

      expect(res.status).toBe(403);
    });

    it('should return interview data if participant', async () => {
      db.query
        .mockResolvedValueOnce({ rows: [{ role: 'CANDIDATE' }] }) // Middleware auth pass
        .mockResolvedValueOnce({ rows: [{ id: '1', title: 'Test' }] }) // Interview fetch
        .mockResolvedValueOnce({ rows: [] }) // Participants fetch
        .mockResolvedValueOnce({ rows: [] }); // Problems fetch

      const res = await authHeader(request(app).get('/api/interviews/1'));

      expect(res.status).toBe(200);
      expect(res.body.interview.id).toBe('1');
    });
  });

  describe('POST /api/interviews/:id/participants', () => {
    it('should return 403 if user is not an INTERVIEWER', async () => {
      // Middleware mock
      db.query.mockResolvedValueOnce({ rows: [{ role: 'CANDIDATE' }] });

      const res = await authHeader(request(app).post('/api/interviews/1/participants'))
        .send({ user_id: '2', role: 'CANDIDATE' });

      expect(res.status).toBe(403);
    });

    it('should add participant if user is INTERVIEWER', async () => {
      db.query
        .mockResolvedValueOnce({ rows: [{ role: 'INTERVIEWER' }] }) // Auth middleware
        .mockResolvedValueOnce({ rows: [{ id: '2' }] }) // User exists
        .mockResolvedValueOnce({ rows: [] }) // No existing participant
        .mockResolvedValueOnce({ rows: [] }); // Insert

      const res = await authHeader(request(app).post('/api/interviews/1/participants'))
        .send({ user_id: '2', role: 'CANDIDATE' });

      expect(res.status).toBe(201);
    });
  });

  describe('PATCH /api/interviews/:id/status', () => {
    it('should return 403 if user is not an INTERVIEWER', async () => {
      db.query.mockResolvedValueOnce({ rows: [{ role: 'CANDIDATE' }] });

      const res = await authHeader(request(app).patch('/api/interviews/1/status'))
        .send({ status: 'IN_PROGRESS' });

      expect(res.status).toBe(403);
    });

    it('should update status if user is INTERVIEWER', async () => {
      db.query
        .mockResolvedValueOnce({ rows: [{ role: 'INTERVIEWER' }] }) // Middleware
        .mockResolvedValueOnce({ rows: [{ status: 'SCHEDULED' }] }) // Existing status
        .mockResolvedValueOnce({ rows: [{ id: '1', status: 'IN_PROGRESS' }] }); // Update

      const res = await authHeader(request(app).patch('/api/interviews/1/status'))
        .send({ status: 'IN_PROGRESS' });

      expect(res.status).toBe(200);
      expect(res.body.interview.status).toBe('IN_PROGRESS');
    });
  });
});
