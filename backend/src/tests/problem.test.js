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
        rows: [{ id: '1', title: 'Two Sum', description: 'desc', difficulty: 'EASY', created_by: '1' }]
      });

      const res = await authHeader(request(app).post('/api/problems'))
        .send({ title: 'Two Sum', description: 'desc', difficulty: 'EASY' });

      expect(res.status).toBe(201);
      expect(res.body.problem.id).toBe('1');
      expect(db.query).toHaveBeenCalledWith(
        expect.any(String),
        ['Two Sum', 'desc', 'EASY', '1']
      );
    });

    it('client-supplied created_by cannot override the authenticated user', async () => {
      db.query.mockResolvedValueOnce({
        rows: [{ id: '1', title: 'Two Sum', description: 'desc', difficulty: 'EASY', created_by: '1' }]
      });

      const res = await authHeader(request(app).post('/api/problems'))
        .send({ title: 'Two Sum', description: 'desc', difficulty: 'EASY', created_by: '999' });

      expect(res.status).toBe(201);
      expect(db.query).toHaveBeenCalledWith(
        expect.any(String),
        ['Two Sum', 'desc', 'EASY', '1'] // Still uses '1' from JWT
      );
    });

    it('should reject invalid difficulty', async () => {
      const res = await authHeader(request(app).post('/api/problems'))
        .send({ title: 'Two Sum', description: 'desc', difficulty: 'INVALID' });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Difficulty must be EASY, MEDIUM, or HARD');
    });
  });

  describe('GET /api/problems', () => {
    it('should get all problems with default pagination', async () => {
      db.query.mockResolvedValueOnce({ rows: [{ id: '1' }] }); // SELECT problems
      db.query.mockResolvedValueOnce({ rows: [{ count: '1' }] }); // SELECT COUNT

      const res = await authHeader(request(app).get('/api/problems'));

      expect(res.status).toBe(200);
      expect(res.body.problems.length).toBe(1);
      expect(res.body.pagination.page).toBe(1);
      expect(res.body.pagination.limit).toBe(50);
      expect(res.body.pagination.total).toBe(1);
    });

    it('should respect custom page and limit, and cap excessive limit', async () => {
      db.query.mockResolvedValueOnce({ rows: [{ id: '1' }] }); // SELECT problems
      db.query.mockResolvedValueOnce({ rows: [{ count: '1' }] }); // SELECT COUNT

      const res = await authHeader(request(app).get('/api/problems?page=2&limit=500'));

      expect(res.status).toBe(200);
      expect(res.body.pagination.page).toBe(2);
      expect(res.body.pagination.limit).toBe(100); // capped at 100
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
    it('should update a problem when user is owner', async () => {
      // 1. SELECT checkRes
      db.query.mockResolvedValueOnce({ rows: [{ created_by: '1' }] });
      // 2. UPDATE result
      db.query.mockResolvedValueOnce({
        rows: [{ id: '1', title: 'Updated' }]
      });

      const res = await authHeader(request(app).put('/api/problems/1'))
        .send({ title: 'Updated', description: 'desc', difficulty: 'EASY' });

      expect(res.status).toBe(200);
      expect(res.body.problem.title).toBe('Updated');
    });

    it('should return 403 if non-owner tries to update', async () => {
      // 1. SELECT checkRes
      db.query.mockResolvedValueOnce({ rows: [{ created_by: '2' }] }); // Different user

      const res = await authHeader(request(app).put('/api/problems/1'))
        .send({ title: 'Updated', description: 'desc', difficulty: 'EASY' });

      expect(res.status).toBe(403);
      expect(res.body.error).toBe('Not authorized to update this problem');
    });

    it('should return 404 for nonexistent problem on update', async () => {
      db.query.mockResolvedValueOnce({ rows: [] }); // Not found

      const res = await authHeader(request(app).put('/api/problems/1'))
        .send({ title: 'Updated', description: 'desc', difficulty: 'EASY' });

      expect(res.status).toBe(404);
    });
  });

  describe('DELETE /api/problems/:id', () => {
    it('should delete a problem when user is owner', async () => {
      // 1. SELECT checkRes
      db.query.mockResolvedValueOnce({ rows: [{ created_by: '1' }] });
      // 2. DELETE result
      db.query.mockResolvedValueOnce({ rows: [] });

      const res = await authHeader(request(app).delete('/api/problems/1'));

      expect(res.status).toBe(200);
    });

    it('should return 403 if non-owner tries to delete', async () => {
      // 1. SELECT checkRes
      db.query.mockResolvedValueOnce({ rows: [{ created_by: '2' }] }); // Different user

      const res = await authHeader(request(app).delete('/api/problems/1'));

      expect(res.status).toBe(403);
      expect(res.body.error).toBe('Not authorized to delete this problem');
    });

    it('should return 404 for nonexistent problem on delete', async () => {
      db.query.mockResolvedValueOnce({ rows: [] }); // Not found

      const res = await authHeader(request(app).delete('/api/problems/1'));

      expect(res.status).toBe(404);
    });
  });
});


afterAll(async () => { await require('../db/redis').closeRedis(); });
