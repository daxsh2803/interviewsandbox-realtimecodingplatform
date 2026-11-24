const { createYjsManager } = require('../yjsManager');
const { redisClient, connectPromise, closeRedis } = require('../db/redis');

const waitFor = async (predicate, timeoutMs = 4000, stepMs = 25) => {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await predicate()) return;
    await new Promise((r) => setTimeout(r, stepMs));
  }
  throw new Error(`Timed out waiting for condition after ${timeoutMs}ms`);
};

describe('Yjs Multi-Instance Distributed Convergence & Persistence', () => {
  let subClientA;
  let subClientB;
  let subClientC;
  let instanceA;
  let instanceB;
  let instanceC;

  beforeAll(async () => {
    // Wait for the shared Redis connections to establish
    if (connectPromise) {
      await connectPromise;
    }
    if (!redisClient.isOpen) {
      await redisClient.connect();
    }

    // Create independent Redis subscriber connections for each simulated instance
    subClientA = redisClient.duplicate();
    subClientB = redisClient.duplicate();
    subClientC = redisClient.duplicate();

    await Promise.all([
      subClientA.connect(),
      subClientB.connect(),
      subClientC.connect()
    ]);

    instanceA = createYjsManager({
      instanceId: 'backend-instance-a',
      redisClient,
      subClient: subClientA
    });

    instanceB = createYjsManager({
      instanceId: 'backend-instance-b',
      redisClient,
      subClient: subClientB
    });

    await Promise.all([
      instanceA.initPubSub(),
      instanceB.initPubSub()
    ]);
  });

  afterAll(async () => {
    if (instanceA) await instanceA.destroy();
    if (instanceB) await instanceB.destroy();
    if (instanceC) await instanceC.destroy();

    // Clean up test keys in Redis
    try {
      if (redisClient.isOpen) {
        const testKeys = await redisClient.keys('yjs:updates:int-multi-*');
        if (testKeys.length > 0) {
          await redisClient.del(testKeys);
        }
      }
    } catch (e) {}

    // Close duplicated subscriber clients
    for (const client of [subClientA, subClientB, subClientC]) {
      if (client && client.isOpen) {
        try {
          await client.quit();
        } catch (e) {
          await client.disconnect();
        }
      }
    }

    await closeRedis();
  });

  it('converges edits made on Instance A automatically into Instance B', async () => {
    const interviewId = 'int-multi-converge-1';
    const problemId = 'prob-1';

    const docA = await instanceA.getOrHydrateDoc(interviewId, problemId);
    const docB = await instanceB.getOrHydrateDoc(interviewId, problemId);

    expect(docA.getText('sourceCode').toString()).toBe('');
    expect(docB.getText('sourceCode').toString()).toBe('');

    // Edit on Instance A
    docA.getText('sourceCode').insert(0, 'console.log("Hello from Instance A");');

    // Instance B converges via Redis Pub/Sub
    await waitFor(() => docB.getText('sourceCode').toString() === 'console.log("Hello from Instance A");');
    expect(docB.getText('sourceCode').toString()).toBe('console.log("Hello from Instance A");');

    // Edit on Instance B propagates back to Instance A
    docB.getText('sourceCode').insert(docB.getText('sourceCode').length, '\n// Appended from Instance B');

    await waitFor(() => docA.getText('sourceCode').toString().includes('// Appended from Instance B'));
    expect(docA.getText('sourceCode').toString()).toBe(
      'console.log("Hello from Instance A");\n// Appended from Instance B'
    );
  });

  it('merges concurrent edits on Instance A and Instance B cleanly to identical text, and cold instance receives both', async () => {
    const interviewId = 'int-multi-converge-2';
    const problemId = 'prob-2';

    const docA = await instanceA.getOrHydrateDoc(interviewId, problemId);
    const docB = await instanceB.getOrHydrateDoc(interviewId, problemId);

    docA.getText('sourceCode').insert(0, 'function main() {}\n');
    await waitFor(() => docB.getText('sourceCode').toString() === 'function main() {}\n');

    // Concurrent edits on both instances
    docA.getText('sourceCode').insert(0, '// Top comment from A\n');
    docB.getText('sourceCode').insert(docB.getText('sourceCode').length, '// Bottom comment from B\n');

    // Wait for bidirectional convergence
    await waitFor(() => {
      const textA = docA.getText('sourceCode').toString();
      const textB = docB.getText('sourceCode').toString();
      return (
        textA === textB &&
        textA.includes('Top comment from A') &&
        textA.includes('Bottom comment from B') &&
        textA.includes('function main()')
      );
    });

    const convergedText = docA.getText('sourceCode').toString();
    expect(convergedText).toBe(docB.getText('sourceCode').toString());

    // Verify all delta updates were atomically appended to the Redis list without lost updates
    await waitFor(async () => {
      const deltas = await redisClient.lRange(`yjs:updates:${interviewId}:${problemId}`, 0, -1);
      return deltas && deltas.length >= 3;
    });

    // Cold Instance joins later and hydrates from Redis list
    const subClientCold = redisClient.duplicate();
    await subClientCold.connect();
    const instanceCold = createYjsManager({
      instanceId: 'backend-instance-cold',
      redisClient,
      subClient: subClientCold
    });

    const docCold = await instanceCold.getOrHydrateDoc(interviewId, problemId);
    const textCold = docCold.getText('sourceCode').toString();

    // Verify Cold Instance received both concurrent edits without either overwriting the other
    expect(textCold).toBe(convergedText);
    expect(textCold).toContain('Top comment from A');
    expect(textCold).toContain('Bottom comment from B');
    expect(textCold).toContain('function main()');

    await instanceCold.destroy();
    await subClientCold.quit();
  });

  it('cold Instance C joining later hydrates persisted state from Redis', async () => {
    const interviewId = 'int-multi-converge-3';
    const problemId = 'prob-3';

    // Instance A writes code and persists to Redis list
    const docA = await instanceA.getOrHydrateDoc(interviewId, problemId);
    docA.getText('sourceCode').insert(0, 'const solution = () => { return 42; };');

    // Wait until persisted to Redis list
    await waitFor(async () => {
      const deltas = await redisClient.lRange(`yjs:updates:${interviewId}:${problemId}`, 0, -1);
      return deltas && deltas.length > 0;
    });

    // Cold Instance C starts up and hydrates the document
    instanceC = createYjsManager({
      instanceId: 'backend-instance-c',
      redisClient,
      subClient: subClientC
    });

    expect(instanceC.docs.has(`${interviewId}:${problemId}`)).toBe(false);

    const docC = await instanceC.getOrHydrateDoc(interviewId, problemId);
    expect(docC.getText('sourceCode').toString()).toBe('const solution = () => { return 42; };');

    // Real-time edits on Instance A continue propagating to Instance C
    docA.getText('sourceCode').insert(docA.getText('sourceCode').length, '\nconsole.log(solution());');

    await waitFor(() => docC.getText('sourceCode').toString().includes('console.log(solution());'));
    expect(docC.getText('sourceCode').toString()).toBe(
      'const solution = () => { return 42; };\nconsole.log(solution());'
    );
  });
});
