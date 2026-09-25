const request = require('supertest');
const app = require('../app');
const db = require('../db');
const jwt = require('jsonwebtoken');
const config = require('../config');

jest.mock('../db', () => ({
  query: jest.fn(),
}));

describe('Problem Endpoints', () => {
  let token;

  beforeAll(() => {
    token = jwt.sign({ userId: '1', email: 'test@test.com' }, config.jwtSecret);
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  const authHeader = (req) => req.set('Cookie', [`auth_token=${token}`]);

  describe('POST /api/problems', () => {
    it('should create a problem successfully', async () => {
      db.query.mockResolvedValueOnce({
        rows: [{ id: '1', title: 'Two Sum', description: 'desc', difficulty: 'EASY' }]
      });

      const res = await authHeader(request(app).post('/api/problems'))
        .send({ title: 'Two Sum', description: 'desc', difficulty: 'EASY' });

      expect(res.status).toBe(201);
      expect(res.body.problem.id).toBe('1');
    });

    it('should reject invalid difficulty', async () => {
      const res = await authHeader(request(app).post('/api/problems'))
        .send({ title: 'Two Sum', description: 'desc', difficulty: 'INVALID' });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Difficulty must be EASY, MEDIUM, or HARD');
    });
  });

  describe('GET /api/problems', () => {
    it('should get all problems', async () => {
      db.query.mockResolvedValueOnce({ rows: [{ id: '1' }] });

      const res = await authHeader(request(app).get('/api/problems'));

      expect(res.status).toBe(200);
      expect(res.body.problems.length).toBe(1);
    });
  });

  describe('GET /api/problems/:id', () => {
    it('should get a problem by id', async () => {
      db.query.mockResolvedValueOnce({ rows: [{ id: '1' }] });

      const res = await authHeader(request(app).get('/api/problems/1'));

      expect(res.status).toBe(200);
      expect(res.body.problem.id).toBe('1');
    });

    it('should return 404 for nonexistent problem', async () => {
      db.query.mockResolvedValueOnce({ rows: [] });

      const res = await authHeader(request(app).get('/api/problems/999'));

      expect(res.status).toBe(404);
    });
  });

  describe('PUT /api/problems/:id', () => {
    it('should update a problem', async () => {
      db.query.mockResolvedValueOnce({
        rows: [{ id: '1', title: 'Updated' }]
      });

      const res = await authHeader(request(app).put('/api/problems/1'))
        .send({ title: 'Updated', description: 'desc', difficulty: 'EASY' });

      expect(res.status).toBe(200);
      expect(res.body.problem.title).toBe('Updated');
    });
  });

  describe('DELETE /api/problems/:id', () => {
    it('should delete a problem', async () => {
      db.query.mockResolvedValueOnce({ rows: [{ id: '1' }] });

      const res = await authHeader(request(app).delete('/api/problems/1'));

      expect(res.status).toBe(200);
    });
  });
});
