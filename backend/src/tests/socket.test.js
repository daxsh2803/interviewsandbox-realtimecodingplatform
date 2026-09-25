const { createServer } = require('http');
const { Server } = require('socket.io');
const Client = require('socket.io-client');
const { initSocket } = require('../socket');
const jwt = require('jsonwebtoken');
const config = require('../config');
const db = require('../db');

jest.mock('../db', () => ({
  query: jest.fn()
}));

describe('Socket.io Real-Time Transport', () => {
  let io, serverSocket, clientSocket;
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

  afterAll(() => {
    io.close();
    httpServer.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    if (clientSocket && clientSocket.connected) {
      clientSocket.disconnect();
    }
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
        Cookie: `auth_token=${token}` // Note: in node env for testing, extraHeaders works for cookie
      }
    });

    clientSocket.on('connect', () => {
      expect(clientSocket.connected).toBe(true);
      done();
    });
  });

  it('should allow valid participant to join interview room', (done) => {
    const token = jwt.sign({ userId: 'user-1' }, config.jwtSecret);
    db.query.mockResolvedValueOnce({ rows: [{ role: 'INTERVIEWER' }] });

    clientSocket = new Client(`http://localhost:${port}`, {
      extraHeaders: { Cookie: `auth_token=${token}` }
    });

    clientSocket.on('connect', () => {
      clientSocket.emit('interview:join', { interviewId: 'int-1' });
    });

    clientSocket.on('interview:joined', (payload) => {
      expect(payload.message).toBe('Successfully joined the interview room');
      expect(db.query).toHaveBeenCalledWith(
        'SELECT role FROM interview_participants WHERE interview_id = $1 AND user_id = $2',
        ['int-1', 'user-1']
      );
      done();
    });
  });

  it('should reject non-participant joining room', (done) => {
    const token = jwt.sign({ userId: 'user-2' }, config.jwtSecret);
    db.query.mockResolvedValueOnce({ rows: [] });

    clientSocket = new Client(`http://localhost:${port}`, {
      extraHeaders: { Cookie: `auth_token=${token}` }
    });

    clientSocket.on('connect', () => {
      clientSocket.emit('interview:join', { interviewId: 'int-2' });
    });

    clientSocket.on('interview:error', (payload) => {
      expect(payload.message).toBe('Unauthorized: Not a participant in this interview');
      done();
    });
  });
});
