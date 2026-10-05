const Y = require('yjs');
const yjsManager = require('../yjsManager');

describe('yjsManager Cleanup TTL', () => {
  beforeEach(() => {
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

  it('TTL expiry destroys/removes the document and clears cleanup timer bookkeeping', () => {
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
});
