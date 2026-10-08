const Y = require('yjs');
const config = require('./config');

// Map of "interviewId:problemId" -> Y.Doc
const docs = new Map();

// Map of "interviewId:problemId" -> Set<socketId>
const docSockets = new Map();

// Map of "interviewId:problemId" -> NodeJS.Timeout
const pendingCleanups = new Map();

/**
 * Get or create a Yjs document for an interview problem.
 */
const getDoc = (interviewId, problemId) => {
  const docId = `${interviewId}:${problemId}`;

  if (!docs.has(docId)) {
    docs.set(docId, new Y.Doc());
    docSockets.set(docId, new Set());
  }

  return docs.get(docId);
};

const attachSocketToDoc = (interviewId, problemId, socketId) => {
  const docId = `${interviewId}:${problemId}`;

  if (docSockets.has(docId)) {
    docSockets.get(docId).add(socketId);

    if (pendingCleanups.has(docId)) {
      clearTimeout(pendingCleanups.get(docId));
      pendingCleanups.delete(docId);
    }
  }
};

const cleanupSocketFromDocs = (socketId) => {
  for (const [docId, sockets] of docSockets.entries()) {
    if (sockets.has(socketId)) {
      sockets.delete(socketId);

      if (sockets.size === 0) {
        if (!pendingCleanups.has(docId)) {
          const ttl = process.env.YJS_DOC_CLEANUP_TTL_MS || 300000;

          const timer = setTimeout(async () => {
            const doc = docs.get(docId);

            if (doc) {
              try {
                const [interviewId] = docId.split(':');
                const db = require('./db');
                const statusRes = await db.query(
                  'SELECT status FROM interviews WHERE id = $1',
                  [interviewId]
                );

                if (
                  statusRes.rows.length > 0 &&
                  (statusRes.rows[0].status === 'COMPLETED' || statusRes.rows[0].status === 'CANCELLED')
                ) {
                  const sourceCode = doc.getText('sourceCode').toString();
                  if (sourceCode) {
                    await db.query(
                      `INSERT INTO interview_snapshots (interview_id, snapshot_content, language, trigger_type)
                       VALUES ($1, $2, $3, $4)`,
                      [interviewId, sourceCode, 'javascript', 'TERMINATION']
                    );
                  }
                }
              } catch (err) {
                console.error('Failed to persist snapshot during cleanup:', err);
              }

              doc.destroy();
            }

            docs.delete(docId);
            docSockets.delete(docId);
            pendingCleanups.delete(docId);
          }, ttl);

          pendingCleanups.set(docId, timer);
        }
      }
    }
  }
};

/**
 * Check whether a user has exceeded the Yjs update rate limit.
 *
 * Uses Redis so the limit works across backend instances.
 */
const checkYjsUpdateRateLimit = async (userId, interviewId) => {
  const { redisClient } = require('./db/redis');

  const windowMs = config.yjsUpdateRateLimit.windowMs;
  const maxRequests = config.yjsUpdateRateLimit.max;

  const key = `ratelimit:yjs-update:${userId}:${interviewId}`;

  const currentCount = await redisClient.incr(key);

  if (currentCount === 1) {
    await redisClient.pExpire(key, windowMs);
  }

  return {
    allowed: currentCount <= maxRequests,
    currentCount,
    maxRequests
  };
};

/**
 * Handle Yjs events for a socket.
 */
const registerYjsHandlers = (socket) => {
  // yjs:sync-step1: Client sends their state vector so server can compute missing updates
  socket.on('yjs:sync-step1', async (payload) => {
    try {
      const { interviewId, problemId, stateVector } = payload;

      // Ensure the socket is actually authorized for this interview
      if (socket.data.interviewId !== interviewId) {
        return socket.emit('yjs:error', {
          message: 'Unauthorized for this interview document'
        });
      }

      if (!problemId) {
        return socket.emit('yjs:error', {
          message: 'problemId is required'
        });
      }

      // Verify that the problem is actually assigned to this interview
      const db = require('./db');

      const assignmentRes = await db.query(
        `SELECT 1
         FROM interview_problems
         WHERE interview_id = $1 AND problem_id = $2
         LIMIT 1`,
        [interviewId, problemId]
      );

      if (assignmentRes.rows.length === 0) {
        return socket.emit('yjs:error', {
          message: 'Problem is not assigned to this interview'
        });
      }

      const { redisClient } = require('./db/redis');
      const lockKey = `interview:${interviewId}:editor:lock`;
      const lockState = await redisClient.get(lockKey);

      if (lockState === 'locked' && socket.data.role !== 'INTERVIEWER') {
        return socket.emit('yjs:error', {
          message: 'Editor is currently locked by interviewer'
        });
      }

      // Also check if interview is ended
      const statusRes = await db.query(
        'SELECT status FROM interviews WHERE id = $1',
        [interviewId]
      );

      if (
        statusRes.rows.length === 0 ||
        statusRes.rows[0].status === 'COMPLETED' ||
        statusRes.rows[0].status === 'CANCELLED'
      ) {
        return socket.emit('yjs:error', {
          message: 'Interview is no longer active'
        });
      }

      const doc = getDoc(interviewId, problemId);
      attachSocketToDoc(interviewId, problemId, socket.id);

      // Compute updates the client is missing
      const serverStateVector = stateVector
        ? new Uint8Array(stateVector)
        : undefined;

      const update = Y.encodeStateAsUpdate(doc, serverStateVector);

      // Send missing updates back to client
      socket.emit('yjs:sync-step2', {
        interviewId,
        problemId,
        update: Array.from(update)
      });
    } catch (err) {
      console.error('yjs:sync-step1 error:', err.stack);

      socket.emit('yjs:error', {
        message: 'Internal server error during sync'
      });
    }
  });

  // yjs:update: Client sends a document update
  socket.on('yjs:update', async (payload) => {
    try {
      const { interviewId, problemId, update } = payload;

      // Ensure the socket is authorized
      if (socket.data.interviewId !== interviewId) {
        return socket.emit('yjs:error', {
          message: 'Unauthorized for this interview document'
        });
      }

      if (!problemId) {
        return socket.emit('yjs:error', {
          message: 'problemId is required'
        });
      }

      if (!update) {
        return socket.emit('yjs:error', {
          message: 'Update payload is required'
        });
      }

      const updateLength = update.byteLength !== undefined ? update.byteLength : update.length;
      if (updateLength === undefined || updateLength > 51200) {
        return socket.emit('yjs:error', {
          message: 'Update payload exceeds maximum allowed size (50KB) or is invalid'
        });
      }

      /*
       * Rate-limit Yjs updates before performing database/Redis
       * authorization checks.
       *
       * The key is based on authenticated user + interview so
       * reconnecting with another socket does not bypass the limit.
       */
      const userId = socket.data.userId;

      if (!userId) {
        return socket.emit('yjs:error', {
          message: 'Unauthorized for this interview document'
        });
      }

      const rateLimit = await checkYjsUpdateRateLimit(
        userId,
        interviewId
      );

      if (!rateLimit.allowed) {
        return socket.emit('yjs:error', {
          message: 'Too many Yjs updates. Please slow down.',
          code: 'RATE_LIMITED'
        });
      }

      // Verify that the problem is actually assigned to this interview
      const db = require('./db');

      const assignmentRes = await db.query(
        `SELECT 1
         FROM interview_problems
         WHERE interview_id = $1 AND problem_id = $2
         LIMIT 1`,
        [interviewId, problemId]
      );

      if (assignmentRes.rows.length === 0) {
        return socket.emit('yjs:error', {
          message: 'Problem is not assigned to this interview'
        });
      }

      const { redisClient } = require('./db/redis');
      const lockKey = `interview:${interviewId}:editor:lock`;
      const lockState = await redisClient.get(lockKey);

      if (lockState === 'locked' && socket.data.role !== 'INTERVIEWER') {
        return socket.emit('yjs:error', {
          message: 'Editor is currently locked by interviewer'
        });
      }

      const statusRes = await db.query(
        'SELECT status FROM interviews WHERE id = $1',
        [interviewId]
      );

      if (
        statusRes.rows.length === 0 ||
        statusRes.rows[0].status === 'COMPLETED' ||
        statusRes.rows[0].status === 'CANCELLED'
      ) {
        return socket.emit('yjs:error', {
          message: 'Interview is no longer active'
        });
      }

      const doc = getDoc(interviewId, problemId);
      attachSocketToDoc(interviewId, problemId, socket.id);

      const updateArray = new Uint8Array(update);

      // Apply update to server document
      Y.applyUpdate(doc, updateArray);

      // Broadcast update to everyone else in the interview room
      socket.to(`interview:${interviewId}`).emit('yjs:update', {
        interviewId,
        problemId,
        update: Array.from(updateArray)
      });
    } catch (err) {
      console.error('yjs:update error:', err);

      socket.emit('yjs:error', {
        message: 'Internal server error during update'
      });
    }
  });
};

module.exports = {
  registerYjsHandlers,
  getDoc,
  docs,
  docSockets,
  cleanupSocketFromDocs,
  attachSocketToDoc,
  pendingCleanups,
  checkYjsUpdateRateLimit
};