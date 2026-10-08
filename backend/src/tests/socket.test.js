const { createServer } = require('http');
const Client = require('socket.io-client');
const { initSocket } = require('../socket');
const jwt = require('jsonwebtoken');
const config = require('../config');
const db = require('../db');

jest.mock('../db', () => ({
  query: jest.fn()
}));

describe('Socket.io Real-Time Transport', () => {
  let io, clientSocket;
  let httpServer;
  let port;

  beforeAll((done) => {
    httpServer = createServer();
    io = initSocket(httpServer);

    httpServer.listen(() => {
      port = httpServer.address().port;
      done();
    });
  });

  afterEach(async () => {
    if (clientSocket) {
      clientSocket.disconnect();

      // Give the Socket.IO client a chance to close its
      // underlying connection before the next test.
      await new Promise((resolve) => setTimeout(resolve, 50));

      clientSocket = null;
    }
  });

  afterAll(async () => {
    // Stop accepting new connections.
    io.close();

    // Close the HTTP server and wait for it to finish.
    await new Promise((resolve) => {
      httpServer.close(resolve);
    });

    // Give Socket.IO disconnect handlers time to finish.
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Close Redis connections after Socket.IO has shut down.
    await require('../db/redis').closeRedis();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should reject connection without token', (done) => {
    clientSocket = new Client(`http://localhost:${port}`);

    clientSocket.on('connect_error', (err) => {
      expect(err.message).toMatch(/Authentication error/);
      done();
    });
  });

  it('should accept connection with valid token', (done) => {
    const token = jwt.sign({ userId: 'user-1' }, config.jwtSecret);

    clientSocket = new Client(`http://localhost:${port}`, {
      extraHeaders: {
        Cookie: `auth_token=${token}`
      }
    });

    clientSocket.on('connect', () => {
      expect(clientSocket.connected).toBe(true);
      done();
    });
  });

  it('should allow valid participant to join interview room', (done) => {
    const token = jwt.sign({ userId: 'user-1' }, config.jwtSecret);

    db.query.mockResolvedValueOnce({
      rows: [{ role: 'INTERVIEWER', status: 'IN_PROGRESS' }]
    });

    clientSocket = new Client(`http://localhost:${port}`, {
      extraHeaders: {
        Cookie: `auth_token=${token}`
      }
    });

    clientSocket.on('connect', () => {
      clientSocket.emit('interview:join', {
        interviewId: 'int-1'
      });
    });

    clientSocket.on('interview:joined', (payload) => {
      expect(payload.message).toBe(
        'Successfully joined the interview room'
      );

      expect(db.query).toHaveBeenCalledWith(
        expect.stringContaining('JOIN interviews i'),
        ['int-1', 'user-1']
      );

      done();
    });
  });

  it('should reject non-participant joining room', (done) => {
    const token = jwt.sign({ userId: 'user-2' }, config.jwtSecret);

    db.query.mockResolvedValueOnce({
      rows: []
    });

    clientSocket = new Client(`http://localhost:${port}`, {
      extraHeaders: {
        Cookie: `auth_token=${token}`
      }
    });

    clientSocket.on('connect', () => {
      clientSocket.emit('interview:join', {
        interviewId: 'int-2'
      });
    });

    clientSocket.on('interview:error', (payload) => {
      expect(payload.message).toBe(
        'Unauthorized: Not a participant in this interview'
      );

      done();
    });
  });

  it('should reject joining a completed interview', (done) => {
    const token = jwt.sign({ userId: 'user-1' }, config.jwtSecret);

    db.query.mockResolvedValueOnce({
      rows: [{ role: 'CANDIDATE', status: 'COMPLETED' }]
    });

    clientSocket = new Client(`http://localhost:${port}`, {
      extraHeaders: {
        Cookie: `auth_token=${token}`
      }
    });

    clientSocket.on('connect', () => {
      clientSocket.emit('interview:join', {
        interviewId: 'int-3'
      });
    });

    clientSocket.on('interview:error', (payload) => {
      expect(payload.message).toBe(
        'Interview is no longer active'
      );

      done();
    });
  });

  it('should reject joining a cancelled interview', (done) => {
    const token = jwt.sign({ userId: 'user-1' }, config.jwtSecret);

    db.query.mockResolvedValueOnce({
      rows: [{ role: 'CANDIDATE', status: 'CANCELLED' }]
    });

    clientSocket = new Client(`http://localhost:${port}`, {
      extraHeaders: {
        Cookie: `auth_token=${token}`
      }
    });

    clientSocket.on('connect', () => {
      clientSocket.emit('interview:join', {
        interviewId: 'int-4'
      });
    });

    clientSocket.on('interview:error', (payload) => {
      expect(payload.message).toBe(
        'Interview is no longer active'
      );

      done();
    });
  });
});