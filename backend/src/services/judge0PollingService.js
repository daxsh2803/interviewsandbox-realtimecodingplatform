const db = require('../db');
const config = require('../config');
const judge0Client = require('./judge0Client');

const activeTimers = new Set();
const activePolls = new Set();
let pollGeneration = 0;

/**
 * Checks whether polling should be used instead of relying solely on webhooks.
 * Returns true if:
 * 1. JUDGE0_ENABLE_POLLING is explicitly 'true', OR
 * 2. JUDGE0_ENABLE_POLLING is not 'false' AND callbackUrl is missing or points to localhost/127.0.0.1
 */
function shouldPollJudge0(callbackUrl = config.judge0.callbackUrl) {
  if (process.env.JUDGE0_ENABLE_POLLING === 'true') return true;
  if (process.env.JUDGE0_ENABLE_POLLING === 'false') return false;
  if (!callbackUrl) return true;
  try {
    const parsed = new URL(callbackUrl);
    const host = parsed.hostname.toLowerCase();
    const cleanHost = host.replace(/^\[|\]$/g, '');
    if (['localhost', '127.0.0.1', '::1', '0.0.0.0'].includes(cleanHost)) {
      return true;
    }
  } catch (_) {
    if (callbackUrl.includes('localhost') || callbackUrl.includes('127.0.0.1') || callbackUrl.includes('::1')) {
      return true;
    }
  }
  return false;
}

/**
 * Stop all active polling timers and clear tracking set.
 * Immediately halts both queued and in-flight polls.
 */
function stopAllPolling() {
  pollGeneration++;
  for (const timerId of activeTimers) {
    clearTimeout(timerId);
  }
  activeTimers.clear();

  for (const cleanup of activePolls) {
    try {
      cleanup();
    } catch (_) {}
  }
  activePolls.clear();
}

/**
 * Get count of active polling timers / operations.
 */
function getActivePollingCount() {
  return Math.max(activeTimers.size, activePolls.size);
}

/**
 * Polls Judge0 for a single code_execution until terminal status (status.id >= 3) or maxAttempts.
 */
function pollExecution({
  executionId,
  token,
  intervalMs = config.judge0?.polling?.intervalMs || 1000,
  maxAttempts = config.judge0?.polling?.maxAttempts || 15,
  onResult = null,
}) {
  let attempts = 0;
  let timerId = null;
  let isStopped = false;
  const generation = pollGeneration;

  const cleanup = () => {
    isStopped = true;
    if (timerId) {
      clearTimeout(timerId);
      activeTimers.delete(timerId);
      timerId = null;
    }
    activePolls.delete(cleanup);
  };
  activePolls.add(cleanup);

  const runPoll = async () => {
    if (timerId) {
      activeTimers.delete(timerId);
      timerId = null;
    }

    if (isStopped || pollGeneration !== generation) {
      cleanup();
      return;
    }

    attempts++;

    try {
      // 1. Check if execution is still Processing in DB
      const dbRes = await db.query(
        'SELECT status FROM code_executions WHERE id = $1',
        [executionId]
      );
      if (isStopped || pollGeneration !== generation) return;

      if (dbRes.rowCount === 0 || dbRes.rows[0].status !== 'Processing') {
        cleanup();
        return;
      }

      // 2. Fetch submission from Judge0
      const sub = await judge0Client.getSubmission(token);
      if (isStopped || pollGeneration !== generation) return;

      if (!sub || !sub.status) {
        // If unmocked in test or invalid response, don't spin indefinitely
        cleanup();
        return;
      }

      // 3. Check for terminal status (status.id >= 3)
      if (sub.status.id >= 3) {
        cleanup();
        const handler = onResult || require('../controllers/executionController').processExecutionResult;
        await handler({
          executionId,
          token,
          result: sub,
          isBase64: true,
        });
        return;
      }

      // 4. In queue / processing, retry if attempts remain
      if (isStopped || pollGeneration !== generation) return;

      if (attempts < maxAttempts) {
        timerId = setTimeout(runPoll, intervalMs);
        if (typeof timerId.unref === 'function') timerId.unref();
        activeTimers.add(timerId);
      } else {
        cleanup();
      }
    } catch (err) {
      if (isStopped || pollGeneration !== generation || (db.pool && (db.pool.ending || db.pool.ended)) || err.message?.includes('after calling end on the pool')) return;
      console.warn(`[Judge0 Polling] Execution ${executionId} attempt ${attempts} error:`, err.message);
      if (attempts < maxAttempts) {
        timerId = setTimeout(runPoll, intervalMs);
        if (typeof timerId.unref === 'function') timerId.unref();
        activeTimers.add(timerId);
      } else {
        cleanup();
      }
    }
  };

  timerId = setTimeout(runPoll, intervalMs);
  if (typeof timerId.unref === 'function') timerId.unref();
  activeTimers.add(timerId);

  return { cleanup };
}

/**
 * Polls Judge0 for a single submission_result until terminal status (status.id >= 3) or maxAttempts.
 */
function pollSubmissionResult({
  resultId,
  token,
  intervalMs = config.judge0?.polling?.intervalMs || 1000,
  maxAttempts = config.judge0?.polling?.maxAttempts || 15,
  onResult = null,
}) {
  let attempts = 0;
  let timerId = null;
  let isStopped = false;
  const generation = pollGeneration;

  const cleanup = () => {
    isStopped = true;
    if (timerId) {
      clearTimeout(timerId);
      activeTimers.delete(timerId);
      timerId = null;
    }
    activePolls.delete(cleanup);
  };
  activePolls.add(cleanup);

  const runPoll = async () => {
    if (timerId) {
      activeTimers.delete(timerId);
      timerId = null;
    }

    if (isStopped || pollGeneration !== generation) {
      cleanup();
      return;
    }

    attempts++;

    try {
      // 1. Check if submission_result is still Processing in DB
      const dbRes = await db.query(
        'SELECT status FROM submission_results WHERE id = $1',
        [resultId]
      );
      if (isStopped || pollGeneration !== generation) return;

      if (dbRes.rowCount === 0 || dbRes.rows[0].status !== 'Processing') {
        cleanup();
        return;
      }

      // 2. Fetch submission from Judge0
      const sub = await judge0Client.getSubmission(token);
      if (isStopped || pollGeneration !== generation) return;

      if (!sub || !sub.status) {
        cleanup();
        return;
      }

      // 3. Check for terminal status (status.id >= 3)
      if (sub.status.id >= 3) {
        cleanup();
        const handler = onResult || require('../controllers/submissionController').processSubmissionResult;
        await handler({
          resultId,
          token,
          result: sub,
          isBase64: true,
        });
        return;
      }

      // 4. In queue / processing, retry if attempts remain
      if (isStopped || pollGeneration !== generation) return;

      if (attempts < maxAttempts) {
        timerId = setTimeout(runPoll, intervalMs);
        if (typeof timerId.unref === 'function') timerId.unref();
        activeTimers.add(timerId);
      } else {
        cleanup();
      }
    } catch (err) {
      if (isStopped || pollGeneration !== generation || (db.pool && (db.pool.ending || db.pool.ended)) || err.message?.includes('after calling end on the pool')) return;
      console.warn(`[Judge0 Polling] Submission result ${resultId} attempt ${attempts} error:`, err.message);
      if (attempts < maxAttempts) {
        timerId = setTimeout(runPoll, intervalMs);
        if (typeof timerId.unref === 'function') timerId.unref();
        activeTimers.add(timerId);
      } else {
        cleanup();
      }
    }
  };

  timerId = setTimeout(runPoll, intervalMs);
  if (typeof timerId.unref === 'function') timerId.unref();
  activeTimers.add(timerId);

  return { cleanup };
}

module.exports = {
  shouldPollJudge0,
  pollExecution,
  pollSubmissionResult,
  stopAllPolling,
  getActivePollingCount,
};
