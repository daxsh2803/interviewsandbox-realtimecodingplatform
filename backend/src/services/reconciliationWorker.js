const db = require('../db');
const config = require('../config');
const { getSocketIo } = require('../socket');
const { evaluateTestCases } = require('../controllers/submissionController');

let timer = null;
let isSweeping = false;

const sweep = async () => {
  if (isSweeping) return;
  isSweeping = true;

  try {
    const thresholdMs = config.reconciliation.staleThresholdMs;
    const cutoffStr = new Date(Date.now() - thresholdMs).toISOString();

    // Reconcile code_executions
    const execRes = await db.query(
      `UPDATE code_executions
       SET status = 'Internal Error', stderr = 'Execution timed out (No Judge0 callback received)'
       WHERE status = 'Processing' AND created_at < $1
       RETURNING id, interview_id`,
      [cutoffStr]
    );

    const io = getSocketIo();
    if (io && execRes.rowCount > 0) {
      for (const row of execRes.rows) {
        io.to(`interview:${row.interview_id}`).emit('execution:updated', {
          executionId: row.id,
          status: 'Internal Error',
          stderr: 'Execution timed out (No Judge0 callback received)'
        });
        io.to(`interview:${row.interview_id}`).emit('interview:activity', {
          type: 'execution_completed',
          status: 'Internal Error',
          timestamp: new Date().toISOString()
        });
      }
    }

    // Reconcile submission_results
    const subRes = await db.query(
      `UPDATE submission_results sr
       SET status = 'Internal Error', stderr = 'Execution timed out (No Judge0 callback received)'
       WHERE status = 'Processing' AND created_at < $1
       RETURNING sr.id, sr.submission_id`,
      [cutoffStr]
    );

    if (subRes.rowCount > 0) {
      // Find distinct submission_ids
      const uniqueSubmissions = [...new Set(subRes.rows.map(r => r.submission_id))];
      for (const subId of uniqueSubmissions) {
        const intRes = await db.query('SELECT interview_id FROM submissions WHERE id = $1', [subId]);
        if (intRes.rowCount > 0) {
          await evaluateTestCases(subId, intRes.rows[0].interview_id);
        }
      }
    }
  } catch (err) {
    console.error('Reconciliation worker error:', err);
  } finally {
    isSweeping = false;
  }
};

const start = () => {
  if (!config.reconciliation.enabled) return;
  if (timer) clearInterval(timer);
  timer = setInterval(sweep, config.reconciliation.intervalMs);
};

const stop = () => {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
};

module.exports = { start, stop, sweep };
