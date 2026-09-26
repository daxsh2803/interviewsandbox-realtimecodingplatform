const Y = require('yjs');

// Map of "interviewId:problemId" -> Y.Doc
const docs = new Map();
// Map of "interviewId:problemId" -> Set<socketId>
const docSockets = new Map();

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
  }
};

const cleanupSocketFromDocs = (socketId) => {
  for (const [docId, sockets] of docSockets.entries()) {
    if (sockets.has(socketId)) {
      sockets.delete(socketId);
      if (sockets.size === 0) {
        const doc = docs.get(docId);
        if (doc) doc.destroy();
        docs.delete(docId);
        docSockets.delete(docId);
      }
    }
  }
};

/**
 * Handle Yjs events for a socket
 */
const registerYjsHandlers = (socket) => {
  // yjs:sync-step1: Client sends their state vector so server can compute missing updates
  socket.on('yjs:sync-step1', async (payload) => {
    try {
      const { interviewId, problemId, stateVector } = payload;
      
      // Ensure the socket is actually authorized for this interview
      if (socket.data.interviewId !== interviewId) {
        return socket.emit('yjs:error', { message: 'Unauthorized for this interview document' });
      }

      if (!problemId) {
        return socket.emit('yjs:error', { message: 'problemId is required' });
      }

      const { redisClient } = require('./db/redis');
      const lockKey = `interview:${interviewId}:editor:lock`;
      const lockState = await redisClient.get(lockKey);

      if (lockState === 'locked' && socket.data.role !== 'INTERVIEWER') {
        return socket.emit('yjs:error', { message: 'Editor is currently locked by interviewer' });
      }

      // Also check if interview is ended
      const db = require('./db');
      const statusRes = await db.query('SELECT status FROM interviews WHERE id = $1', [interviewId]);
      if (statusRes.rows.length === 0 || statusRes.rows[0].status === 'COMPLETED' || statusRes.rows[0].status === 'CANCELLED') {
         return socket.emit('yjs:error', { message: 'Interview is no longer active' });
      }

      const doc = getDoc(interviewId, problemId);
      attachSocketToDoc(interviewId, problemId, socket.id);
      
      // Compute updates the client is missing
      const serverStateVector = stateVector ? new Uint8Array(stateVector) : undefined;
      const update = Y.encodeStateAsUpdate(doc, serverStateVector);
      
      // Send missing updates back to client
      socket.emit('yjs:sync-step2', {
        interviewId,
        problemId,
        update: Array.from(update) // Convert to array for socket.io serialization
      });
    } catch (err) {
      console.error('yjs:sync-step1 error:', err.stack);
      socket.emit('yjs:error', { message: 'Internal server error during sync' });
    }
  });

  // yjs:update: Client sends a document update
  socket.on('yjs:update', async (payload) => {
    try {
      const { interviewId, problemId, update } = payload;
      
      // Ensure the socket is authorized
      if (socket.data.interviewId !== interviewId) {
        return socket.emit('yjs:error', { message: 'Unauthorized for this interview document' });
      }

      const { redisClient } = require('./db/redis');
      const lockKey = `interview:${interviewId}:editor:lock`;
      const lockState = await redisClient.get(lockKey);

      if (lockState === 'locked' && socket.data.role !== 'INTERVIEWER') {
        return socket.emit('yjs:error', { message: 'Editor is currently locked by interviewer' });
      }

      const db = require('./db');
      const statusRes = await db.query('SELECT status FROM interviews WHERE id = $1', [interviewId]);
      if (statusRes.rows.length === 0 || statusRes.rows[0].status === 'COMPLETED' || statusRes.rows[0].status === 'CANCELLED') {
         return socket.emit('yjs:error', { message: 'Interview is no longer active' });
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
      socket.emit('yjs:error', { message: 'Internal server error during update' });
    }
  });
};

module.exports = { registerYjsHandlers, getDoc, docs, docSockets, cleanupSocketFromDocs };
