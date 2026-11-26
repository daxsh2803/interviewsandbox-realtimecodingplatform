const db = require('../db');
const judge0Client = require('../services/judge0Client');
const {
  shouldPollJudge0,
  pollExecution,
  pollSubmissionResult,
  stopAllPolling,
  getActivePollingCount,
} = require('../services/judge0PollingService');
const { connectPromise, closeRedis } = require('../db/redis');

const mockIo = {
  to: jest.fn().mockReturnThis(),
  emit: jest.fn(),
};

jest.mock('../socket', () => ({
  getSocketIo: jest.fn(() => mockIo),
}));

describe('Judge0 Polling Fallback Service', () => {
  let user;
  let interview;
  let problem;
  let testCase;

  beforeAll(async () => {
    if (connectPromise) {
      await connectPromise;
    }

    await db.query('DELETE FROM users');
    await db.query('DELETE FROM problems');
    await db.query('DELETE FROM interviews');

    const userRes = await db.query(
      "INSERT INTO users (email, password_hash, name) VALUES ('polling_user@test.com', 'hash', 'Poll User') RETURNING id, email"
    );
    user = userRes.rows[0];

    const probRes = await db.query(
      "INSERT INTO problems (title, description, difficulty) VALUES ('Poll Prob', 'Desc', 'EASY') RETURNING id"
    );
    problem = probRes.rows[0];

    const intRes = await db.query(
      "INSERT INTO interviews (title, status) VALUES ('Poll Interview', 'IN_PROGRESS') RETURNING id"
    );
    interview = intRes.rows[0];

    await db.query(
      "INSERT INTO interview_participants (interview_id, user_id, role) VALUES ($1, $2, 'CANDIDATE')",
      [interview.id, user.id]
    );
    await db.query(
      "INSERT INTO interview_problems (interview_id, problem_id) VALUES ($1, $2)",
      [interview.id, problem.id]
    );

    const tcRes = await db.query(
      "INSERT INTO test_cases (problem_id, input, expected_output) VALUES ($1, 'in', 'out') RETURNING id",
      [problem.id]
    );
    testCase = tcRes.rows[0];
  });

  afterAll(async () => {
    stopAllPolling();
    await db.pool.end();
    await closeRedis();
  });

  afterEach(() => {
    stopAllPolling();
    jest.clearAllMocks();
  });

  describe('shouldPollJudge0 Detection', () => {
    it('should return true for localhost and 127.0.0.1 callback URLs', () => {
      expect(shouldPollJudge0('http://localhost:5000/api/executions/judge0/callback')).toBe(true);
      expect(shouldPollJudge0('http://127.0.0.1:5000/api/executions/judge0/callback')).toBe(true);
      expect(shouldPollJudge0('http://0.0.0.0:5000/callback')).toBe(true);
      expect(shouldPollJudge0('http://[::1]:5000/callback')).toBe(true);
    });

    it('should return true when callback URL is missing or empty', () => {
      expect(shouldPollJudge0(null)).toBe(true);
      expect(shouldPollJudge0('')).toBe(true);
      expect(shouldPollJudge0(undefined)).toBe(true);
    });

    it('should return false for public internet callback URLs', () => {
      expect(shouldPollJudge0('https://api.interviewsandbox.com/api/executions/judge0/callback')).toBe(false);
      expect(shouldPollJudge0('https://my-domain.ngrok-free.app/callback')).toBe(false);
    });

    it('should honor JUDGE0_ENABLE_POLLING override', () => {
      const orig = process.env.JUDGE0_ENABLE_POLLING;

      process.env.JUDGE0_ENABLE_POLLING = 'true';
      expect(shouldPollJudge0('https://api.interviewsandbox.com/callback')).toBe(true);

      process.env.JUDGE0_ENABLE_POLLING = 'false';
      expect(shouldPollJudge0('http://localhost:5000/callback')).toBe(false);

      if (orig !== undefined) {
        process.env.JUDGE0_ENABLE_POLLING = orig;
      } else {
        delete process.env.JUDGE0_ENABLE_POLLING;
      }
    });
  });

  describe('pollExecution Fallback', () => {
    it('should poll until terminal status, decode Base64 output, and update code_executions', async () => {
      const execRes = await db.query(
        `INSERT INTO code_executions (interview_id, user_id, problem_id, language, source_code, status, judge0_token)
         VALUES ($1, $2, $3, 'javascript', 'console.log(42);', 'Processing', 'poll-token-exec-1') RETURNING id`,
        [interview.id, user.id, problem.id]
      );
      const executionId = execRes.rows[0].id;

      let callCount = 0;
      jest.spyOn(judge0Client, 'getSubmission').mockImplementation(async (tok) => {
        callCount++;
        if (callCount === 1) {
          // Status 2 = Processing
          return { token: tok, status: { id: 2, description: 'Processing' } };
        }
        // Status 3 = Accepted
        return {
          token: tok,
          status: { id: 3, description: 'Accepted' },
          stdout: Buffer.from('42\n').toString('base64'),
          stderr: null,
          compile_output: null,
          time: '0.025',
          memory: 2048,
        };
      });

      pollExecution({
        executionId,
        token: 'poll-token-exec-1',
        intervalMs: 30,
        maxAttempts: 10,
      });

      // Wait for polling loop to complete
      let attempts = 0;
      let finalStatus = 'Processing';
      while (attempts < 50) {
        const check = await db.query('SELECT status, stdout, execution_time_ms, memory_bytes FROM code_executions WHERE id = $1', [executionId]);
        if (check.rows[0].status !== 'Processing') {
          finalStatus = check.rows[0].status;
          expect(check.rows[0].stdout).toBe('42\n');
          expect(check.rows[0].execution_time_ms).toBe(25);
          expect(check.rows[0].memory_bytes).toBe(2048);
          break;
        }
        await new Promise((r) => setTimeout(r, 40));
        attempts++;
      }

      expect(finalStatus).toBe('Accepted');
      expect(callCount).toBeGreaterThanOrEqual(2);

      // Verify Socket.io emission
      expect(mockIo.emit).toHaveBeenCalledWith(
        'execution:updated',
        expect.objectContaining({
          executionId,
          status: 'Accepted',
          stdout: '42\n',
        })
      );

      // Verify timer is cleaned up
      expect(getActivePollingCount()).toBe(0);
    });

    it('should stop polling if database status is no longer Processing (e.g. webhook resolved first)', async () => {
      const execRes = await db.query(
        `INSERT INTO code_executions (interview_id, user_id, problem_id, language, source_code, status, judge0_token)
         VALUES ($1, $2, $3, 'javascript', 'console.log(1);', 'Accepted', 'poll-token-already-done') RETURNING id`,
        [interview.id, user.id, problem.id]
      );
      const executionId = execRes.rows[0].id;

      const getSubSpy = jest.spyOn(judge0Client, 'getSubmission').mockResolvedValue({
        status: { id: 3, description: 'Accepted' },
      });

      pollExecution({
        executionId,
        token: 'poll-token-already-done',
        intervalMs: 20,
        maxAttempts: 5,
      });

      await new Promise((r) => setTimeout(r, 60));

      // Should never call Judge0 because DB is already Accepted
      expect(getSubSpy).not.toHaveBeenCalled();
      expect(getActivePollingCount()).toBe(0);
    });
  });

  describe('pollSubmissionResult Fallback', () => {
    it('should poll submission_results and trigger evaluateTestCases when complete', async () => {
      const subRes = await db.query(
        `INSERT INTO submissions (interview_id, user_id, problem_id, language, source_code, status)
         VALUES ($1, $2, $3, 'javascript', 'console.log("out");', 'Processing') RETURNING id`,
        [interview.id, user.id, problem.id]
      );
      const submissionId = subRes.rows[0].id;

      const subResultRes = await db.query(
        `INSERT INTO submission_results (submission_id, test_case_id, status, judge0_token)
         VALUES ($1, $2, 'Processing', 'poll-token-sub-1') RETURNING id`,
        [submissionId, testCase.id]
      );
      const resultId = subResultRes.rows[0].id;

      jest.spyOn(judge0Client, 'getSubmission').mockResolvedValue({
        token: 'poll-token-sub-1',
        status: { id: 3, description: 'Accepted' },
        stdout: Buffer.from('out\n').toString('base64'),
        time: '0.015',
        memory: 1024,
      });

      pollSubmissionResult({
        resultId,
        token: 'poll-token-sub-1',
        intervalMs: 25,
        maxAttempts: 10,
      });

      let attempts = 0;
      let finalStatus = 'Processing';
      while (attempts < 50) {
        const finalSub = await db.query('SELECT status FROM submissions WHERE id = $1', [submissionId]);
        if (finalSub.rows[0].status !== 'Processing') {
          finalStatus = finalSub.rows[0].status;
          break;
        }
        await new Promise((r) => setTimeout(r, 40));
        attempts++;
      }

      expect(finalStatus).toBe('Accepted');

      const check = await db.query('SELECT status FROM submission_results WHERE id = $1', [resultId]);
      expect(check.rows[0].status).toBe('Accepted');

      expect(mockIo.emit).toHaveBeenCalledWith(
        'submission:updated',
        expect.objectContaining({
          submissionId,
          status: 'Accepted',
          passedCount: 1,
        })
      );
    });
  });

  describe('Timer tracking and stopAllPolling', () => {
    it('should immediately clear all active polling timers on stopAllPolling', async () => {
      const execRes = await db.query(
        `INSERT INTO code_executions (interview_id, user_id, problem_id, language, source_code, status, judge0_token)
         VALUES ($1, $2, $3, 'javascript', 'code', 'Processing', 'timer-test-token') RETURNING id`,
        [interview.id, user.id, problem.id]
      );
      const executionId = execRes.rows[0].id;

      pollExecution({
        executionId,
        token: 'timer-test-token',
        intervalMs: 5000,
        maxAttempts: 15,
      });

      expect(getActivePollingCount()).toBeGreaterThan(0);

      stopAllPolling();

      expect(getActivePollingCount()).toBe(0);
    });

    it('should halt in-flight polls immediately on stopAllPolling() and not reschedule', async () => {
      let resolveDbQuery;
      const hangingQuery = new Promise((resolve) => {
        resolveDbQuery = resolve;
      });

      const querySpy = jest.spyOn(db, 'query').mockImplementationOnce(() => hangingQuery);

      pollExecution({
        executionId: 'test-exec-inflight',
        token: 'test-token',
        intervalMs: 10,
        maxAttempts: 10,
      });

      // Wait a tick for runPoll to enter db.query
      await new Promise((r) => setTimeout(r, 20));

      // Now stop all polling while db.query is still in-flight
      stopAllPolling();
      expect(getActivePollingCount()).toBe(0);

      // Now resolve the db query
      resolveDbQuery({ rowCount: 1, rows: [{ status: 'Processing' }] });
      await new Promise((r) => setTimeout(r, 30));

      // Verify that it did not continue to call getSubmission or reschedule
      expect(getActivePollingCount()).toBe(0);
      querySpy.mockRestore();
    });
  });
});
