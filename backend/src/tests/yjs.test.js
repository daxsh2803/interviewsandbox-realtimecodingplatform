const { createServer } = require('http');
const { Server } = require('socket.io');
const Client = require('socket.io-client');
const { initSocket } = require('../socket');
const jwt = require('jsonwebtoken');
const config = require('../config');
const db = require('../db');
const Y = require('yjs');
const { docs } = require('../yjsManager');

jest.mock('../db', () => ({
  query: jest.fn()
}));

describe('Yjs Real-Time Collaboration', () => {
  let io, client1, client2;
  let httpServer;
  let port;
  const interviewId = 'int-1';
  const problemId = 'prob-1';

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
    docs.clear(); // Clear all Yjs documents from memory before each test
    const { docSockets } = require('../yjsManager');
    if (docSockets) docSockets.clear();
  });

  afterEach(() => {
    if (client1 && client1.connected) client1.disconnect();
    if (client2 && client2.connected) client2.disconnect();
  });

  const setupClient = (userId, done) => {
    const token = jwt.sign({ userId }, config.jwtSecret);
    const client = new Client(`http://localhost:${port}`, {
      extraHeaders: { Cookie: `auth_token=${token}` }
    });
    client.on('connect', () => done(client));
  };

  it('should synchronize Yjs state between two connected participants', (done) => {
    db.query.mockResolvedValue({ rows: [{ role: 'CANDIDATE' }] });

    setupClient('user-1', (c1) => {
      client1 = c1;
      client1.emit('interview:join', { interviewId });

      client1.on('interview:joined', () => {
        setupClient('user-2', (c2) => {
          client2 = c2;
          client2.emit('interview:join', { interviewId });

          client2.on('interview:joined', () => {
            // Both joined. Now client1 creates a document update.
            const doc1 = new Y.Doc();
            const text1 = doc1.getText('sourceCode');
            text1.insert(0, 'Hello World');

            const update = Y.encodeStateAsUpdate(doc1);
            client1.emit('yjs:update', { interviewId, problemId, update: Array.from(update) });

            client2.on('yjs:update', (payload) => {
              expect(payload.interviewId).toBe(interviewId);
              expect(payload.problemId).toBe(problemId);

              const doc2 = new Y.Doc();
              Y.applyUpdate(doc2, new Uint8Array(payload.update));
              expect(doc2.getText('sourceCode').toString()).toBe('Hello World');
              done();
            });
          });
        });
      });
    });
  });

  it('should reject Yjs updates from unauthorized users', (done) => {
    db.query.mockResolvedValueOnce({ rows: [] }); // not a participant

    setupClient('unauthorized-user', (c1) => {
      client1 = c1;
      client1.emit('interview:join', { interviewId });

      client1.on('interview:error', (payload) => {
        expect(payload.message).toBe('Unauthorized: Not a participant in this interview');
        
        // Try to sync anyway
        client1.emit('yjs:sync-step1', { interviewId, problemId, stateVector: [] });
      });

      client1.on('yjs:error', (payload) => {
        expect(payload.message).toBe('Unauthorized for this interview document');
        done();
      });
    });
  });

  it('should correctly handle late joiner synchronization', (done) => {
    db.query.mockResolvedValue({ rows: [{ role: 'CANDIDATE' }] });

    setupClient('user-1', (c1) => {
      client1 = c1;
      client1.emit('interview:join', { interviewId });

      client1.on('interview:joined', () => {
        // Create initial state
        const doc1 = new Y.Doc();
        doc1.getText('sourceCode').insert(0, 'Initial code');
        const update = Y.encodeStateAsUpdate(doc1);
        
        client1.emit('yjs:update', { interviewId, problemId, update: Array.from(update) });

        // Wait a bit to simulate late join
        setTimeout(() => {
          setupClient('user-late', (c2) => {
            client2 = c2;
            client2.emit('interview:join', { interviewId });

            client2.on('interview:joined', () => {
              const doc2 = new Y.Doc();
              const stateVector = Y.encodeStateVector(doc2);
              
              client2.emit('yjs:sync-step1', { 
                interviewId, 
                problemId, 
                stateVector: Array.from(stateVector) 
              });

              client2.on('yjs:sync-step2', (payload) => {
                expect(payload.interviewId).toBe(interviewId);
                Y.applyUpdate(doc2, new Uint8Array(payload.update));
                expect(doc2.getText('sourceCode').toString()).toBe('Initial code');
                done();
              });
            });
          });
        }, 100);
      });
    });
  });

  it('should create document lazily, keep it while active, and destroy it when all sockets leave', (done) => {
    db.query.mockResolvedValue({ rows: [{ role: 'CANDIDATE' }] });
    
    expect(docs.has(`${interviewId}:${problemId}`)).toBe(false);

    setupClient('user-1', (c1) => {
      client1 = c1;
      client1.emit('interview:join', { interviewId });

      client1.on('interview:joined', () => {
        // Trigger doc creation via sync-step1
        const emptyStateVector = Array.from(Y.encodeStateVector(new Y.Doc()));
        client1.emit('yjs:sync-step1', { interviewId, problemId, stateVector: emptyStateVector });
        
        setTimeout(() => {
          expect(docs.has(`${interviewId}:${problemId}`)).toBe(true);
          
          const doc = docs.get(`${interviewId}:${problemId}`);
          doc.getText('sourceCode').insert(0, 'test code');

          // Disconnect client to trigger cleanup
          client1.disconnect();
          
          setTimeout(() => {
            // Document should be removed from memory
            expect(docs.has(`${interviewId}:${problemId}`)).toBe(false);
            
            // Reconnect a new client to verify it recreates successfully
            setupClient('user-1-reconnect', (c2) => {
              client2 = c2;
              client2.emit('interview:join', { interviewId });
              client2.on('interview:joined', () => {
                const emptyStateVector = Array.from(Y.encodeStateVector(new Y.Doc()));
                client2.emit('yjs:sync-step1', { interviewId, problemId, stateVector: emptyStateVector });
                
                client2.on('yjs:sync-step2', (payload) => {
                  expect(docs.has(`${interviewId}:${problemId}`)).toBe(true);
                  const newDoc = new Y.Doc();
                  Y.applyUpdate(newDoc, new Uint8Array(payload.update));
                  // It should be empty again since the previous doc was destroyed from memory
                  expect(newDoc.getText('sourceCode').toString()).toBe('');
                  done();
                });
              });
            });
          }, 100);
        }, 50);
      });
    });
  });

  it('should isolate problems within the same interview', (done) => {
    db.query.mockResolvedValue({ rows: [{ role: 'CANDIDATE' }] });
    const prob1 = 'prob-1';
    const prob2 = 'prob-2';

    setupClient('user-1', (c1) => {
      client1 = c1;
      client1.emit('interview:join', { interviewId });

      client1.on('interview:joined', () => {
        const doc1 = new Y.Doc();
        doc1.getText('sourceCode').insert(0, 'Problem 1');
        client1.emit('yjs:update', { interviewId, problemId: prob1, update: Array.from(Y.encodeStateAsUpdate(doc1)) });

        const doc2 = new Y.Doc();
        doc2.getText('sourceCode').insert(0, 'Problem 2');
        client1.emit('yjs:update', { interviewId, problemId: prob2, update: Array.from(Y.encodeStateAsUpdate(doc2)) });

        setTimeout(() => {
          expect(docs.has(`${interviewId}:${prob1}`)).toBe(true);
          expect(docs.has(`${interviewId}:${prob2}`)).toBe(true);
          
          const srvDoc1 = docs.get(`${interviewId}:${prob1}`);
          const srvDoc2 = docs.get(`${interviewId}:${prob2}`);
          
          expect(srvDoc1.getText('sourceCode').toString()).toBe('Problem 1');
          expect(srvDoc2.getText('sourceCode').toString()).toBe('Problem 2');
          done();
        }, 50);
      });
    });
  });

  it('should enforce cross-interview isolation and reject updates to other interviews', (done) => {
    db.query.mockResolvedValue({ rows: [{ role: 'CANDIDATE' }] });

    setupClient('user-1', (c1) => {
      client1 = c1;
      client1.emit('interview:join', { interviewId: 'int-1' });

      client1.on('interview:joined', () => {
        // Try to update an interview the socket isn't authorized for
        const rogueDoc = new Y.Doc();
        rogueDoc.getText('sourceCode').insert(0, 'Hacked');
        
        client1.emit('yjs:update', { 
          interviewId: 'int-2', 
          problemId, 
          update: Array.from(Y.encodeStateAsUpdate(rogueDoc)) 
        });

        client1.on('yjs:error', (payload) => {
          expect(payload.message).toBe('Unauthorized for this interview document');
          // Ensure int-2:prob-1 was NEVER created
          expect(docs.has(`int-2:${problemId}`)).toBe(false);
          done();
        });
      });
    });
  });

  it('should reject candidate updates when editor is locked', (done) => {
    db.query.mockImplementation((queryStr) => {
      if (queryStr.includes('role FROM interview_participants')) {
        return Promise.resolve({ rows: [{ role: 'CANDIDATE' }] });
      }
      if (queryStr.includes('status FROM interviews')) {
        return Promise.resolve({ rows: [{ status: 'IN_PROGRESS' }] });
      }
      return Promise.resolve({ rows: [] });
    });

    const { redisClient } = require('../db/redis');
    redisClient.set(`interview:${interviewId}:editor:lock`, 'locked').then(() => {
      setupClient('user-1', (c1) => {
        client1 = c1;
        client1.emit('interview:join', { interviewId });

        client1.on('interview:joined', () => {
          const doc1 = new Y.Doc();
          doc1.getText('sourceCode').insert(0, 'Code');
          client1.emit('yjs:update', { interviewId, problemId, update: Array.from(Y.encodeStateAsUpdate(doc1)) });

          client1.on('yjs:error', (payload) => {
            expect(payload.message).toBe('Editor is currently locked by interviewer');
            redisClient.del(`interview:${interviewId}:editor:lock`).then(() => done());
          });
        });
      });
    });
  });

  it('should reject candidate updates when interview is completed', (done) => {
    db.query.mockImplementation((queryStr) => {
      if (queryStr.includes('role FROM interview_participants')) {
        return Promise.resolve({ rows: [{ role: 'CANDIDATE' }] });
      }
      if (queryStr.includes('status FROM interviews')) {
        return Promise.resolve({ rows: [{ status: 'COMPLETED' }] });
      }
      return Promise.resolve({ rows: [] });
    });

    const { redisClient } = require('../db/redis');
    redisClient.del(`interview:${interviewId}:editor:lock`).then(() => {
      setupClient('user-1', (c1) => {
        client1 = c1;
        client1.emit('interview:join', { interviewId });

        client1.on('interview:joined', () => {
          const doc1 = new Y.Doc();
          client1.emit('yjs:update', { interviewId, problemId, update: Array.from(Y.encodeStateAsUpdate(doc1)) });

          client1.on('yjs:error', (payload) => {
            expect(payload.message).toBe('Interview is no longer active');
            done();
          });
        });
      });
    });
  });
});
