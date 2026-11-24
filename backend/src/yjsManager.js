const Y = require('yjs');
const crypto = require('crypto');
const config = require('./config');

const getRedisClient = () => {
  try {
    return require('./db/redis').redisClient;
  } catch (e) {
    return null;
  }
};

const getYjsSubClient = () => {
  try {
    return require('./db/redis').yjsSubClient;
  } catch (e) {
    return null;
  }
};

class DocsMap extends Map {
  constructor(manager) {
    super();
    this.manager = manager;
  }

  clear() {
    super.clear();
    if (this.manager) {
      this.manager.hydratedDocs.clear();
      this.manager.loadingDocs.clear();
    }
  }
}

class YjsManager {
  constructor(options = {}) {
    this.instanceId = options.instanceId || crypto.randomUUID();
    this._redisClient = options.redisClient;
    this._subClient = options.subClient;
    this.channel = options.channel || 'yjs:sync:updates';
    this.docTtlSeconds = options.docTtlSeconds || 86400; // 24 hours

    // Map of "interviewId:problemId" -> Y.Doc
    this.docs = new DocsMap(this);

    // Map of "interviewId:problemId" -> Set<socketId>
    this.docSockets = new Map();

    // Map of "interviewId:problemId" -> NodeJS.Timeout
    this.pendingCleanups = new Map();

    // In-flight hydration deduplication: Map of "interviewId:problemId" -> Promise<Y.Doc>
    this.loadingDocs = new Map();

    // Set of docIds that have completed hydration from Redis
    this.hydratedDocs = new Set();

    this.isSubscribed = false;
    this.isClosed = false;
    this._initPubSubPromise = null;

    // If an explicit subscriber client was passed, auto-subscribe unless explicitly disabled
    if (this._subClient && typeof this._subClient.subscribe === 'function' && options.autoSubscribe !== false) {
      this.initPubSub().catch((err) => {
        if (!this.isClosed) {
          console.error(`[YjsManager ${this.instanceId}] Failed to auto-init pubsub:`, err);
        }
      });
    }
  }

  get redisClient() {
    if (this._redisClient !== undefined) return this._redisClient;
    return getRedisClient();
  }

  get subClient() {
    if (this._subClient !== undefined) return this._subClient;
    return getYjsSubClient();
  }

  _getRedisDocKey(interviewId, problemId) {
    return `yjs:updates:${interviewId}:${problemId}`;
  }

  async initPubSub() {
    if (this.isSubscribed || this.isClosed) return;
    if (this._initPubSubPromise) {
      return await this._initPubSubPromise;
    }

    const sub = this.subClient;
    if (!sub || typeof sub.subscribe !== 'function') return;

    this._initPubSubPromise = (async () => {
      try {
        if (!sub.isOpen) {
          if (typeof sub.connect === 'function') {
            try {
              await sub.connect();
            } catch (e) {
              // May already be connecting or connected
            }
          }
          if (!sub.isOpen) {
            try {
              const { connectPromise } = require('./db/redis');
              if (connectPromise) {
                await connectPromise;
              }
            } catch (e) {}
          }
        }

        if (sub.isOpen && !this.isSubscribed && !this.isClosed) {
          await sub.subscribe(this.channel, (message) => {
            this.handleRemoteMessage(message);
          });
          this.isSubscribed = true;
        }
      } catch (err) {
        if (!this.isClosed) {
          console.error(`[YjsManager ${this.instanceId}] Error initializing Pub/Sub:`, err);
        }
      } finally {
        this._initPubSubPromise = null;
      }
    })();

    return await this._initPubSubPromise;
  }

  handleRemoteMessage(message) {
    try {
      const data = typeof message === 'string' ? JSON.parse(message) : message;
      if (!data || data.senderInstanceId === this.instanceId) {
        // Ignore self-originating updates to prevent echo loops
        return;
      }

      const { interviewId, problemId, updateBase64 } = data;
      if (!interviewId || !problemId || !updateBase64) return;

      const docId = `${interviewId}:${problemId}`;

      // Only apply to documents loaded on this instance
      if (this.docs.has(docId)) {
        const doc = this.docs.get(docId);
        if (doc && !doc.isDestroyed) {
          const updateBytes = Buffer.from(updateBase64, 'base64');
          Y.applyUpdate(doc, updateBytes, 'redis-pubsub');
        }
      }
    } catch (err) {
      console.error(`[YjsManager ${this.instanceId}] handleRemoteMessage error:`, err);
    }
  }

  async publishUpdate(interviewId, problemId, update) {
    const client = this.redisClient;
    if (!client || typeof client.publish !== 'function' || !client.isReady) {
      return;
    }

    try {
      const payload = JSON.stringify({
        senderInstanceId: this.instanceId,
        interviewId,
        problemId,
        updateBase64: Buffer.from(update).toString('base64'),
        timestamp: Date.now()
      });

      await client.publish(this.channel, payload);
    } catch (err) {
      if (!this.isClosed && err.name !== 'ClientClosedError') {
        console.error(`[YjsManager ${this.instanceId}] publishUpdate error:`, err);
      }
    }
  }

  async persistUpdate(interviewId, problemId, update) {
    const client = this.redisClient;
    if (!client || typeof client.rPush !== 'function' || !client.isReady) {
      return;
    }

    try {
      const redisKey = this._getRedisDocKey(interviewId, problemId);
      const base64 = Buffer.from(update).toString('base64');

      await client.rPush(redisKey, base64);
      if (typeof client.expire === 'function' && client.isReady) {
        await client.expire(redisKey, this.docTtlSeconds);
      }
    } catch (err) {
      if (!this.isClosed && err.name !== 'ClientClosedError') {
        console.error(`[YjsManager ${this.instanceId}] persistUpdate error:`, err);
      }
    }
  }

  _bindDocUpdates(interviewId, problemId, doc) {
    doc.on('update', (update, origin) => {
      // Remote pub/sub updates and initial hydration are ignored to prevent loops and redundant writes
      if (origin === 'redis-pubsub' || origin === 'redis-hydration') {
        return;
      }

      this.publishUpdate(interviewId, problemId, update).catch((err) => {
        console.error(`[YjsManager ${this.instanceId}] publishUpdate error:`, err);
      });

      this.persistUpdate(interviewId, problemId, update).catch((err) => {
        console.error(`[YjsManager ${this.instanceId}] persistUpdate error:`, err);
      });
    });
  }

  getDoc(interviewId, problemId) {
    const docId = `${interviewId}:${problemId}`;

    if (!this.docs.has(docId)) {
      const doc = new Y.Doc();
      this._bindDocUpdates(interviewId, problemId, doc);
      this.docs.set(docId, doc);
      this.docSockets.set(docId, new Set());
    }

    return this.docs.get(docId);
  }

  async getOrHydrateDoc(interviewId, problemId) {
    const docId = `${interviewId}:${problemId}`;

    // 1. Ensure Pub/Sub subscription is active before reading from Redis
    // so no remote updates can be missed between hydration and subscription.
    await this.initPubSub();

    // 2. If doc is already in memory and hydrated, return immediately
    if (this.docs.has(docId) && this.hydratedDocs.has(docId)) {
      return this.docs.get(docId);
    }

    // 3. Deduplicate concurrent in-flight hydration requests
    if (this.loadingDocs.has(docId)) {
      return await this.loadingDocs.get(docId);
    }

    const loadPromise = (async () => {
      let doc = this.docs.get(docId);
      if (!doc) {
        doc = new Y.Doc();
        this._bindDocUpdates(interviewId, problemId, doc);
        this.docs.set(docId, doc);
        if (!this.docSockets.has(docId)) {
          this.docSockets.set(docId, new Set());
        }
      }

      if (!this.hydratedDocs.has(docId)) {
        const client = this.redisClient;
        if (!client) {
          // No Redis configured (pure in-memory mode)
          this.hydratedDocs.add(docId);
        } else {
          // If Redis client is not open yet, await connectPromise before reading
          if (!client.isOpen) {
            try {
              const { connectPromise } = require('./db/redis');
              if (connectPromise) {
                await connectPromise;
              }
            } catch (e) {}
          }

          if (client.isOpen && typeof client.lRange === 'function') {
            try {
              const redisKey = this._getRedisDocKey(interviewId, problemId);
              const deltas = await client.lRange(redisKey, 0, -1);
              if (deltas && deltas.length > 0) {
                const updates = deltas.map((d) => Buffer.from(d, 'base64'));
                const mergedUpdate = updates.length === 1 ? updates[0] : Y.mergeUpdates(updates);
                Y.applyUpdate(doc, mergedUpdate, 'redis-hydration');
              }
              // Only mark hydrated on successful Redis read
              this.hydratedDocs.add(docId);
            } catch (err) {
              console.error(`[YjsManager ${this.instanceId}] Error hydrating doc ${docId} from Redis:`, err);
              // Do NOT mark as hydratedDocs on error so subsequent requests can retry
            }
          }
        }
      }

      return doc;
    })().finally(() => {
      this.loadingDocs.delete(docId);
    });

    this.loadingDocs.set(docId, loadPromise);
    return await loadPromise;
  }

  attachSocketToDoc(interviewId, problemId, socketId) {
    const docId = `${interviewId}:${problemId}`;

    if (this.docSockets.has(docId)) {
      this.docSockets.get(docId).add(socketId);

      if (this.pendingCleanups.has(docId)) {
        clearTimeout(this.pendingCleanups.get(docId));
        this.pendingCleanups.delete(docId);
      }
    }
  }

  cleanupSocketFromDocs(socketId) {
    for (const [docId, sockets] of this.docSockets.entries()) {
      if (sockets.has(socketId)) {
        sockets.delete(socketId);

        if (sockets.size === 0) {
          if (!this.pendingCleanups.has(docId)) {
            const ttl = process.env.YJS_DOC_CLEANUP_TTL_MS || 300000;

            const timer = setTimeout(async () => {
              const doc = this.docs.get(docId);

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

              this.docs.delete(docId);
              this.docSockets.delete(docId);
              this.pendingCleanups.delete(docId);
              this.hydratedDocs.delete(docId);
            }, ttl);

            this.pendingCleanups.set(docId, timer);
          }
        }
      }
    }
  }

  async checkYjsUpdateRateLimit(userId, interviewId) {
    const client = this.redisClient;
    const windowMs = config.yjsUpdateRateLimit.windowMs;
    const maxRequests = config.yjsUpdateRateLimit.max;
    const key = `ratelimit:yjs-update:${userId}:${interviewId}`;

    const currentCount = await client.incr(key);

    if (currentCount === 1) {
      await client.pExpire(key, windowMs);
    }

    return {
      allowed: currentCount <= maxRequests,
      currentCount,
      maxRequests
    };
  }

  registerYjsHandlers(socket) {
    // Lazily ensure Redis Pub/Sub subscription is active when sockets register
    this.initPubSub().catch(() => {});

    // yjs:sync-step1: Client sends their state vector so server can compute missing updates
    socket.on('yjs:sync-step1', async (payload) => {
      try {
        const { interviewId, problemId, stateVector } = payload;

        // Ensure the socket is authorized for this interview
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

        // Verify that the problem is assigned to this interview
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

        const client = this.redisClient;
        const lockKey = `interview:${interviewId}:editor:lock`;
        const lockState = client && typeof client.get === 'function' && client.isOpen
          ? await client.get(lockKey)
          : null;

        if (lockState === 'locked' && socket.data.role !== 'INTERVIEWER') {
          return socket.emit('yjs:error', {
            message: 'Editor is currently locked by interviewer'
          });
        }

        // Check if interview is active
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

        const doc = await this.getOrHydrateDoc(interviewId, problemId);
        this.attachSocketToDoc(interviewId, problemId, socket.id);

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

        const userId = socket.data.userId;
        if (!userId) {
          return socket.emit('yjs:error', {
            message: 'Unauthorized for this interview document'
          });
        }

        const rateLimit = await this.checkYjsUpdateRateLimit(
          userId,
          interviewId
        );

        if (!rateLimit.allowed) {
          return socket.emit('yjs:error', {
            message: 'Too many Yjs updates. Please slow down.',
            code: 'RATE_LIMITED'
          });
        }

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

        const client = this.redisClient;
        const lockKey = `interview:${interviewId}:editor:lock`;
        const lockState = client && typeof client.get === 'function' && client.isOpen
          ? await client.get(lockKey)
          : null;

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

        const doc = await this.getOrHydrateDoc(interviewId, problemId);
        this.attachSocketToDoc(interviewId, problemId, socket.id);

        const updateArray = new Uint8Array(update);

        // Apply update to server document (will trigger _bindDocUpdates -> publishUpdate + persistUpdate)
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
  }

  async destroy() {
    this.isClosed = true;

    for (const timer of this.pendingCleanups.values()) {
      clearTimeout(timer);
    }
    this.pendingCleanups.clear();

    for (const doc of this.docs.values()) {
      if (doc && !doc.isDestroyed) {
        doc.destroy();
      }
    }
    this.docs.clear();
    this.docSockets.clear();
    this.hydratedDocs.clear();
    this.loadingDocs.clear();

    const sub = this.subClient;
    if (sub && this.isSubscribed && typeof sub.unsubscribe === 'function') {
      try {
        if (sub.isOpen) {
          await sub.unsubscribe(this.channel);
        }
      } catch (err) {}
      this.isSubscribed = false;
    }
  }
}

// Default singleton instance for backward compatibility
const defaultManager = new YjsManager();

const getDoc = (interviewId, problemId) => defaultManager.getDoc(interviewId, problemId);
const getOrHydrateDoc = (interviewId, problemId) => defaultManager.getOrHydrateDoc(interviewId, problemId);
const attachSocketToDoc = (...args) => defaultManager.attachSocketToDoc(...args);
const cleanupSocketFromDocs = (...args) => defaultManager.cleanupSocketFromDocs(...args);
const checkYjsUpdateRateLimit = (...args) => defaultManager.checkYjsUpdateRateLimit(...args);
const registerYjsHandlers = (socket) => defaultManager.registerYjsHandlers(socket);
const closeYjsSync = () => defaultManager.destroy();

module.exports = {
  YjsManager,
  createYjsManager: (options) => new YjsManager(options),
  defaultManager,
  getDoc,
  getOrHydrateDoc,
  docs: defaultManager.docs,
  docSockets: defaultManager.docSockets,
  pendingCleanups: defaultManager.pendingCleanups,
  attachSocketToDoc,
  cleanupSocketFromDocs,
  checkYjsUpdateRateLimit,
  registerYjsHandlers,
  closeYjsSync,
};
