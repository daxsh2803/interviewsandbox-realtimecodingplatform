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
    io.close();
    httpServer.close();
  });

  beforeEach(async () => {
    jest.clearAllMocks();
    // Clean up Redis keys before each test
    await redisClient.del(`interview:${interviewId}:presence:counts`);
    await redisClient.del(`interview:${interviewId}:presence:roles`);
  });

  const setupClient = (userId, done) => {
    const token = jwt.sign({ userId }, config.jwtSecret);
    const client = new Client(`http://localhost:${port}`, {
      extraHeaders: { Cookie: `auth_token=${token}` }
    });
    client.on('connect', () => done(client));
    return client;
  };

  it('should broadcast connected:true on first join and connected:false on final leave', (done) => {
    db.query.mockResolvedValue({ rows: [{ role: 'CANDIDATE' }] });

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
                expect(presenceCount).toBe(1); // Should only happen once
                
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
                // The test finishes when the user disconnects their last tab
                done();
              }
            }
          });

          // Join the first tab
          client1.emit('interview:join', { interviewId });
        });
      });
    });
  });
});
