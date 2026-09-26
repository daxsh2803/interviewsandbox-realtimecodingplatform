const { createServer } = require('http');
const Client = require('socket.io-client');
const jwt = require('jsonwebtoken');
const config = require('../config');
const db = require('../db');
const Y = require('yjs');
const { redisClient } = require('../db/redis');

jest.mock('../db', () => ({
  query: jest.fn()
}));

describe('Yjs Multi-Instance Split-Brain Limitation', () => {
  let instance1, instance2;
  const interviewId = 'int-multi-yjs';
  const problemId = 'prob-1';

  beforeAll(async () => {
    // We will clear require cache to instantiate two COMPLETELY SEPARATE backend "instances" in the same process.
    const createInstance = async (port) => {
      jest.isolateModules(() => {
        const { initSocket } = require('../socket');
        const { docs, docSockets } = require('../yjsManager');
        const httpServer = createServer();
        const io = initSocket(httpServer);
        httpServer.listen(port);
        instance1 = instance1 || { httpServer, io, docs, docSockets, port };
        if (instance1.port !== port) {
          instance2 = { httpServer, io, docs, docSockets, port };
        }
      });
    };
    
    await createInstance(5011);
    await createInstance(5012);
  });

  afterAll(async () => {
    if (instance1) { instance1.io.close(); instance1.httpServer.close(); }
    if (instance2) { instance2.io.close(); instance2.httpServer.close(); }
    await redisClient.del(`interview:${interviewId}:presence:counts`);
    await redisClient.del(`interview:${interviewId}:presence:roles`);
  });

  beforeEach(async () => {
    jest.clearAllMocks();
    if (instance1) { instance1.docs.clear(); instance1.docSockets.clear(); }
    if (instance2) { instance2.docs.clear(); instance2.docSockets.clear(); }
    await redisClient.del(`interview:${interviewId}:presence:counts`);
    await redisClient.del(`interview:${interviewId}:presence:roles`);
  });

  const setupClient = (port, userId, done) => {
    const token = jwt.sign({ userId }, config.jwtSecret);
    const client = new Client(`http://localhost:${port}`, {
      extraHeaders: { Cookie: `auth_token=${token}` }
    });
    client.on('connect', () => done(client));
  };

  it('demonstrates that a late joiner on instance 2 does not receive Yjs state from instance 1', (done) => {
    db.query.mockResolvedValue({ rows: [{ role: 'CANDIDATE' }] });

    setupClient(instance1.port, 'user-A', (clientA) => {
      clientA.emit('interview:join', { interviewId });

      clientA.on('interview:joined', () => {
        // 1. Client A creates doc and updates state
        const docA = new Y.Doc();
        docA.getText('sourceCode').insert(0, 'Hello from Backend A');
        
        // Trigger doc creation on instance 1
        clientA.emit('yjs:sync-step1', { interviewId, problemId, stateVector: Array.from(Y.encodeStateVector(new Y.Doc())) });
        
        setTimeout(() => {
          // Client A sends update
          const updateA = Y.encodeStateAsUpdate(docA);
          clientA.emit('yjs:update', { interviewId, problemId, update: Array.from(updateA) });

          // Verify Instance 1 has the data
          setTimeout(() => {
            const srvDoc1 = instance1.docs.get(`${interviewId}:${problemId}`);
            expect(srvDoc1).toBeDefined();
            expect(srvDoc1.getText('sourceCode').toString()).toBe('Hello from Backend A');

            // 2. Client B connects to Instance 2 (late joiner)
            setupClient(instance2.port, 'user-B', (clientB) => {
              clientB.emit('interview:join', { interviewId });

              clientB.on('interview:joined', () => {
                const docB = new Y.Doc();
                
                clientB.emit('yjs:sync-step1', { interviewId, problemId, stateVector: Array.from(Y.encodeStateVector(docB)) });

                clientB.on('yjs:sync-step2', (payload) => {
                  // Apply Instance 2's knowledge to Client B
                  Y.applyUpdate(docB, new Uint8Array(payload.update));
                  
                  // Assert that Client B did NOT receive the text because Instance 2's doc is completely empty!
                  // This proves the split-brain limitation.
                  expect(docB.getText('sourceCode').toString()).toBe('');
                  
                  // Additionally, Instance 2 has now created a blank document
                  const srvDoc2 = instance2.docs.get(`${interviewId}:${problemId}`);
                  expect(srvDoc2).toBeDefined();
                  expect(srvDoc2.getText('sourceCode').toString()).toBe('');

                  clientA.disconnect();
                  clientB.disconnect();
                  done();
                });
              });
            });
          }, 100);
        }, 50);
      });
    });
  });
});
