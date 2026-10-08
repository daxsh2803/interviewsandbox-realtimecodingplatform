const Y = require('yjs');

describe('Yjs Multi-Instance Split-Brain Limitation', () => {
  const interviewId = 'int-multi-yjs';
  const problemId = 'prob-1';

  it('demonstrates that separate backend instances have independent Yjs state', () => {
    // Simulate Instance 1's process-local Yjs document.
    const instance1Doc = new Y.Doc();

    instance1Doc
      .getText('sourceCode')
      .insert(0, 'Hello from Backend A');

    expect(
      instance1Doc.getText('sourceCode').toString()
    ).toBe('Hello from Backend A');

    // Simulate Instance 2's process-local Yjs document.
    // Because Yjs documents are stored in process-local memory,
    // Instance 2 starts with an independent empty document.
    const instance2Doc = new Y.Doc();

    expect(
      instance2Doc.getText('sourceCode').toString()
    ).toBe('');

    // The two backend instances have separate Yjs state.
    expect(instance1Doc).not.toBe(instance2Doc);

    // Without an explicit Yjs persistence/synchronization mechanism
    // between backend processes, Instance 2 cannot see Instance 1's state.
    expect(
      instance2Doc.getText('sourceCode').toString()
    ).not.toBe(
      instance1Doc.getText('sourceCode').toString()
    );

    // Keep the identifiers explicit so the test documents the
    // interview/problem scope being simulated.
    expect(`${interviewId}:${problemId}`).toBe(
      'int-multi-yjs:prob-1'
    );

    instance1Doc.destroy();
    instance2Doc.destroy();
  });
});