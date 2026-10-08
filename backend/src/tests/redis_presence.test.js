const { createServer } = require('http');
const { Server } = require('socket.io');
const Client = require('socket.io-client');
const { initSocket } = require('../socket');
const jwt = require('jsonwebtoken');
const config = require('../config');
const db = require('../db');
const { redisClient } = require('../db/redis');

jest.mock('../db', () => ({
  query: jest.fn()
}));

describe('Distributed Redis Presence', () => {
  let io, httpServer, port;
  const interviewId = 'int-multi';

  beforeAll((done) => {
    httpServer = createServer();
    io = initSocket(httpServer);

    httpServer.listen(() => {
      port = httpServer.address().port;
      done();
    });
  });

  afterAll(async () => {
    // Close Socket.IO first so socket disconnect handlers
    // can finish their Redis presence cleanup.
    io.close();

    await new Promise((resolve) => {
      httpServer.close(resolve);
    });

    // Give async socket disconnect handlers time to finish.
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Redis must be closed last.
    await require('../db/redis').closeRedis();
  });

  beforeEach(async () => {
    jest.clearAllMocks();

    // Clean up Redis keys before each test
    await redisClient.del(
      `interview:${interviewId}:presence:counts`
    );

    await redisClient.del(
      `interview:${interviewId}:presence:roles`
    );
  });

  const setupClient = (userId, done) => {
    const token = jwt.sign({ userId }, config.jwtSecret);

    const client = new Client(`http://localhost:${port}`, {
      extraHeaders: {
        Cookie: `auth_token=${token}`
      }
    });

    client.on('connect', () => done(client));

    return client;
  };

  it(
    'should broadcast connected:true on first join and connected:false on final leave',
    (done) => {
      db.query.mockResolvedValue({
        rows: [{ role: 'CANDIDATE' }]
      });

      setupClient('user-1', (client1) => {
        // We need a second client to listen for presence events
        setupClient('observer', (observer) => {
          observer.emit('interview:join', { interviewId });

          observer.on('interview:joined', () => {
            let presenceCount = 0;

            observer.on('interview:presence', (payload) => {
              if (payload.userId === 'user-1') {
                if (payload.connected) {
                  presenceCount++;

                  expect(presenceCount).toBe(1);

                  // Now connect a second tab for user-1
                  setupClient('user-1', (client2) => {
                    client2.emit('interview:join', { interviewId });

                    client2.on('interview:joined', () => {
                      // One socket leaves
                      client1.disconnect();

                      setTimeout(() => {
                        // Final socket leaves
                        client2.disconnect();
                      }, 100);
                    });
                  });
                } else {
                  expect(payload.connected).toBe(false);

                  // The test finishes when the user disconnects
                  // their last tab
                  observer.disconnect();
                  done();
                }
              }
            });

            // Join the first tab
            client1.emit('interview:join', { interviewId });
          });
        });
      });
    }
  );

  it('should handle sequential interview joins and maintain correct presence state', (done) => {
    const intA = 'int-A';
    const intB = 'int-B';
    const userId = 'user-seq';

    db.query.mockImplementation(async (query, args) => {
      const id = args[0];
      if (id === intA) {
        return { rows: [{ role: 'CANDIDATE', status: 'IN_PROGRESS' }] };
      }
      if (id === intB) {
        return { rows: [{ role: 'INTERVIEWER', status: 'IN_PROGRESS' }] };
      }
      return { rows: [] };
    });

    setupClient(userId, (client) => {
      client.emit('interview:join', { interviewId: intA });

      client.once('interview:joined', async () => {
        let countA = await redisClient.hGet(`interview:${intA}:presence:counts`, userId);
        expect(countA).toBe('1');

        // Repeated join to A
        client.emit('interview:join', { interviewId: intA });
        client.once('interview:joined', async () => {
          countA = await redisClient.hGet(`interview:${intA}:presence:counts`, userId);
          expect(countA).toBe('1'); // Should not inflate

          // Unauthorized join to unknown
          client.emit('interview:join', { interviewId: 'int-unauth' });
          client.once('interview:error', async () => {
            // Should still be in A
            countA = await redisClient.hGet(`interview:${intA}:presence:counts`, userId);
            expect(countA).toBe('1');

            // Now join B
            client.emit('interview:join', { interviewId: intB });
            client.once('interview:joined', async () => {
              await new Promise(r => setTimeout(r, 50)); // allow async leave

              // Check A presence is gone
              countA = await redisClient.hGet(`interview:${intA}:presence:counts`, userId);
              expect(countA || null).toBeNull();

              // Check B presence exists
              const countB = await redisClient.hGet(`interview:${intB}:presence:counts`, userId);
              expect(countB).toBe('1');

              // Disconnect and verify B is cleaned up
              client.disconnect();

              await new Promise(r => setTimeout(r, 100));

              const countBAfter = await redisClient.hGet(`interview:${intB}:presence:counts`, userId);
              expect(countBAfter || null).toBeNull();

              done();
            });
          });
        });
      });
    });
  });
});