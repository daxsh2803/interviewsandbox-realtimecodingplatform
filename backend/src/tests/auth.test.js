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
  });
});
