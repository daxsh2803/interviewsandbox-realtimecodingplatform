const request = require('supertest');
const app = require('../app');
const db = require('../db');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

// Mock db
jest.mock('../db', () => ({
  query: jest.fn(),
}));

describe('Auth Endpoints', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('POST /api/auth/register', () => {
    it('should register a new user successfully', async () => {
      db.query.mockResolvedValueOnce({ rows: [] }); // No existing user
      db.query.mockResolvedValueOnce({ 
        rows: [{ id: '1', name: 'Test', email: 'test@test.com' }] 
      });

      const res = await request(app)
        .post('/api/auth/register')
        .send({ name: 'Test', email: 'test@test.com', password: 'password123' });

      expect(res.status).toBe(201);
      expect(res.body.user).toHaveProperty('id', '1');
      expect(res.body.user).not.toHaveProperty('password_hash');
    });

    it('should reject duplicate email', async () => {
      db.query.mockResolvedValueOnce({ rows: [{ id: '1' }] }); // Existing user

      const res = await request(app)
        .post('/api/auth/register')
        .send({ name: 'Test', email: 'test@test.com', password: 'password123' });

      expect(res.status).toBe(409);
      expect(res.body.error).toBe('User with this email already exists');
    });

    it('should reject registration with password > maximum', async () => {
      const longPassword = 'a'.repeat(73);
      const res = await request(app)
        .post('/api/auth/register')
        .send({ name: 'Test', email: 'test@test.com', password: longPassword });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Password exceeds maximum allowed length of 72 characters');
    });
  });

  describe('POST /api/auth/login', () => {
    it('should login successfully', async () => {
      const hash = await bcrypt.hash('password123', 10);
      db.query.mockResolvedValueOnce({ 
        rows: [{ id: '1', email: 'test@test.com', password_hash: hash }] 
      });

      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: 'test@test.com', password: 'password123' });

      expect(res.status).toBe(200);
      expect(res.headers['set-cookie'][0]).toMatch(/auth_token=/);
      expect(res.body.user).not.toHaveProperty('password_hash');
    });

    it('should reject invalid password', async () => {
      const hash = await bcrypt.hash('password123', 10);
      db.query.mockResolvedValueOnce({ 
        rows: [{ id: '1', email: 'test@test.com', password_hash: hash }] 
      });

      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: 'test@test.com', password: 'wrongpassword' });

      expect(res.status).toBe(401);
      expect(res.body.error).toBe('Invalid credentials');
    });

    it('should reject login with password > maximum', async () => {
      const longPassword = 'a'.repeat(73);
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: 'test@test.com', password: longPassword });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Password exceeds maximum allowed length of 72 characters');
    });
    it('should return 401 for nonexistent user with same error message', async () => {
      db.query.mockResolvedValueOnce({ rows: [] }); // User not found

      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: 'nonexistent@test.com', password: 'password123' });

      expect(res.status).toBe(401);
      expect(res.body.error).toBe('Invalid credentials');
    });
  });

  describe('GET /api/auth/me (JWT Validation)', () => {
    const config = require('../config');

    it('should accept a valid HS256 token', async () => {
      const validToken = jwt.sign({ userId: '1', email: 'test@test.com' }, config.jwtSecret, { algorithm: 'HS256' });
      db.query.mockResolvedValueOnce({ rows: [{ id: '1', name: 'Test', email: 'test@test.com' }] });

      const res = await request(app)
        .get('/api/auth/me')
        .set('Cookie', `auth_token=${validToken}`);

      expect(res.status).toBe(200);
      expect(res.body.user).toHaveProperty('email', 'test@test.com');
    });

    it('should reject a tampered token', async () => {
      const validToken = jwt.sign({ userId: '1', email: 'test@test.com' }, config.jwtSecret, { algorithm: 'HS256' });
      const tamperedToken = validToken.slice(0, -5) + 'abcde';

      const res = await request(app)
        .get('/api/auth/me')
        .set('Cookie', `auth_token=${tamperedToken}`);

      expect(res.status).toBe(401);
      expect(res.body.error).toBe('Invalid or expired token');
    });

    it('should reject a token signed with unsupported algorithm', async () => {
      // Create a token with 'none' algorithm
      const noneToken = jwt.sign({ userId: '1', email: 'test@test.com' }, config.jwtSecret, { algorithm: 'none' });

      const res = await request(app)
        .get('/api/auth/me')
        .set('Cookie', `auth_token=${noneToken}`);

      expect(res.status).toBe(401);
      expect(res.body.error).toBe('Invalid or expired token');
    });

    it('should reject an expired token', async () => {
      const expiredToken = jwt.sign({ userId: '1', email: 'test@test.com' }, config.jwtSecret, { algorithm: 'HS256', expiresIn: '-1s' });

      const res = await request(app)
        .get('/api/auth/me')
        .set('Cookie', `auth_token=${expiredToken}`);

      expect(res.status).toBe(401);
      expect(res.body.error).toBe('Invalid or expired token');
    });

    it('should reject missing cookie', async () => {
      const res = await request(app).get('/api/auth/me');

      expect(res.status).toBe(401);
      expect(res.body.error).toBe('Authentication required');
    });
  });
});


afterAll(async () => { await require('../db/redis').closeRedis(); });
