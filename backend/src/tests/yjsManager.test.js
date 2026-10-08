const Y = require('yjs');
const yjsManager = require('../yjsManager');
const db = require('../db');

jest.mock('../db', () => ({
  query: jest.fn()
}));

describe('yjsManager Cleanup TTL', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    db.query.mockResolvedValue({ rows: [{ status: 'IN_PROGRESS' }] });
    jest.useFakeTimers();
    // Clear internal state between tests
    yjsManager.docs.clear();
    yjsManager.docSockets.clear();
    yjsManager.pendingCleanups.clear();
  });

  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  it('document remains after final socket disconnect before TTL', () => {
    const interviewId = 'int-1';
    const problemId = 'prob-1';
    const socketId = 'sock-1';
    const docId = `${interviewId}:${problemId}`;

    yjsManager.getDoc(interviewId, problemId);
    yjsManager.attachSocketToDoc(interviewId, problemId, socketId);

    // Simulate final socket disconnect
    yjsManager.cleanupSocketFromDocs(socketId);

    // Verify document still exists
    expect(yjsManager.docs.has(docId)).toBe(true);
    expect(yjsManager.docSockets.has(docId)).toBe(true);
    expect(yjsManager.docSockets.get(docId).size).toBe(0);
    expect(yjsManager.pendingCleanups.has(docId)).toBe(true);
  });

  it('reconnect cancels pending cleanup', () => {
    const interviewId = 'int-2';
    const problemId = 'prob-2';
    const socketId = 'sock-2';
    const docId = `${interviewId}:${problemId}`;

    yjsManager.getDoc(interviewId, problemId);
    yjsManager.attachSocketToDoc(interviewId, problemId, socketId);

    // Simulate disconnect
    yjsManager.cleanupSocketFromDocs(socketId);
    expect(yjsManager.pendingCleanups.has(docId)).toBe(true);

    // Simulate reconnect within TTL
    yjsManager.attachSocketToDoc(interviewId, problemId, 'sock-3');

    // Verify cleanup was cancelled
    expect(yjsManager.pendingCleanups.has(docId)).toBe(false);
    expect(yjsManager.docs.has(docId)).toBe(true);
    expect(yjsManager.docSockets.get(docId).size).toBe(1);
  });

  it('TTL expiry destroys/removes the document and clears cleanup timer bookkeeping', async () => {
    const interviewId = 'int-3';
    const problemId = 'prob-3';
    const socketId = 'sock-3';
    const docId = `${interviewId}:${problemId}`;

    yjsManager.getDoc(interviewId, problemId);
    yjsManager.attachSocketToDoc(interviewId, problemId, socketId);

    yjsManager.cleanupSocketFromDocs(socketId);
    expect(yjsManager.pendingCleanups.has(docId)).toBe(true);

    // Advance time by 6 minutes (TTL is 5 minutes)
    jest.advanceTimersByTime(360000);

    // Allow async microtasks (DB queries) to settle
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    // Verify document and bookkeeping are wiped
    expect(yjsManager.docs.has(docId)).toBe(false);
    expect(yjsManager.docSockets.has(docId)).toBe(false);
    expect(yjsManager.pendingCleanups.has(docId)).toBe(false);
  });

  it('document sourceCode remains available during the TTL', () => {
    const interviewId = 'int-4';
    const problemId = 'prob-4';
    const socketId = 'sock-4';
    const docId = `${interviewId}:${problemId}`;

    const doc = yjsManager.getDoc(interviewId, problemId);
    yjsManager.attachSocketToDoc(interviewId, problemId, socketId);

    // Add some text
    const text = doc.getText('sourceCode');
    text.insert(0, 'console.log("Hello");');

    // Disconnect
    yjsManager.cleanupSocketFromDocs(socketId);

    // Advance time partially (e.g. 1 minute)
    jest.advanceTimersByTime(60000);

    // Retrieve doc during TTL
    const retrievedDoc = yjsManager.docs.get(docId);
    expect(retrievedDoc).toBeDefined();
    expect(retrievedDoc.getText('sourceCode').toString()).toBe('console.log("Hello");');
  });

  describe('FINDING-1: Snapshot persistence during cleanup', () => {
    it('persists final source code when interview is COMPLETED', async () => {
      const interviewId = '123e4567-e89b-12d3-a456-426614174000'; // valid uuid format
      const problemId = '987e4567-e89b-12d3-a456-426614174000';
      const socketId = 'sock-snap-1';
      const docId = `${interviewId}:${problemId}`;

      const doc = yjsManager.getDoc(interviewId, problemId);
      yjsManager.attachSocketToDoc(interviewId, problemId, socketId);

      const text = doc.getText('sourceCode');
      text.insert(0, 'final completed code');

      // Setup DB mock to return COMPLETED status
      db.query.mockImplementation((queryStr) => {
        if (queryStr.includes('SELECT status FROM interviews')) {
          return Promise.resolve({ rows: [{ status: 'COMPLETED' }] });
        }
        return Promise.resolve({ rows: [] });
      });

      yjsManager.cleanupSocketFromDocs(socketId);

      // Trigger cleanup
      jest.advanceTimersByTime(360000);

      // Allow microtasks to process
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();

      // Verify DB was called to persist snapshot
      expect(db.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO interview_snapshots'),
        [interviewId, 'final completed code', 'javascript', 'TERMINATION']
      );

      // Verify document was destroyed
      expect(yjsManager.docs.has(docId)).toBe(false);
    });

    it('persists final source code when interview is CANCELLED', async () => {
      const interviewId = '123e4567-e89b-12d3-a456-426614174001';
      const problemId = '987e4567-e89b-12d3-a456-426614174001';
      const socketId = 'sock-snap-2';
      const docId = `${interviewId}:${problemId}`;

      const doc = yjsManager.getDoc(interviewId, problemId);
      yjsManager.attachSocketToDoc(interviewId, problemId, socketId);

      const text = doc.getText('sourceCode');
      text.insert(0, 'final cancelled code');

      // Setup DB mock to return CANCELLED status
      db.query.mockImplementation((queryStr) => {
        if (queryStr.includes('SELECT status FROM interviews')) {
          return Promise.resolve({ rows: [{ status: 'CANCELLED' }] });
        }
        return Promise.resolve({ rows: [] });
      });

      yjsManager.cleanupSocketFromDocs(socketId);
      jest.advanceTimersByTime(360000);

      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();

      // Verify DB was called to persist snapshot
      expect(db.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO interview_snapshots'),
        [interviewId, 'final cancelled code', 'javascript', 'TERMINATION']
      );

      expect(yjsManager.docs.has(docId)).toBe(false);
    });

    it('does NOT persist snapshot when interview is IN_PROGRESS', async () => {
      const interviewId = '123e4567-e89b-12d3-a456-426614174002';
      const problemId = '987e4567-e89b-12d3-a456-426614174002';
      const socketId = 'sock-snap-3';

      const doc = yjsManager.getDoc(interviewId, problemId);
      yjsManager.attachSocketToDoc(interviewId, problemId, socketId);

      const text = doc.getText('sourceCode');
      text.insert(0, 'in progress code');

      // Setup DB mock to return IN_PROGRESS status
      db.query.mockImplementation((queryStr) => {
        if (queryStr.includes('SELECT status FROM interviews')) {
          return Promise.resolve({ rows: [{ status: 'IN_PROGRESS' }] });
        }
        return Promise.resolve({ rows: [] });
      });

      yjsManager.cleanupSocketFromDocs(socketId);
      jest.advanceTimersByTime(360000);

      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();

      // Ensure NO snapshot insertion was attempted
      expect(db.query).not.toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO interview_snapshots'),
        expect.anything()
      );
    });

    it('remains safe if no Y.Doc exists during cleanup', async () => {
      const socketId = 'orphan-sock';
      // Simulate socket cleanly tracked but no document in yjsManager.docs
      yjsManager.docSockets.set('int-99:prob-99', new Set([socketId]));

      // We don't call getDoc(), so docs doesn't have it
      expect(yjsManager.docs.has('int-99:prob-99')).toBe(false);

      yjsManager.cleanupSocketFromDocs(socketId);
      jest.advanceTimersByTime(360000);

      await Promise.resolve();
      await Promise.resolve();

      // It shouldn't crash
      expect(yjsManager.pendingCleanups.has('int-99:prob-99')).toBe(false);
    });
  });
});
