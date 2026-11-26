const db = require('../db');
const judge0Client = require('../services/judge0Client');
const { getSocketIo } = require('../socket');
const config = require('../config');

// 1. Submit Code Execution (POST /api/interviews/:interviewId/execute)
exports.executeCode = async (req, res, next) => {
  try {
    const interviewId = req.params.id || req.params.interviewId;
    const { problemId, language, sourceCode, stdin } = req.body;
    const userId = req.user.userId;

    // Validate inputs
    if (!problemId || !language || !sourceCode) {
      return res.status(400).json({ error: 'problemId, language, and sourceCode are required.' });
    }
    
    if (sourceCode.length > 50000) {
      return res.status(400).json({ error: 'Source code is too large.' });
    }

    // Verify user is part of the interview and problem is part of the interview
    const interviewRes = await db.query(
      `SELECT ip.role, i.status 
       FROM interview_participants ip 
       JOIN interview_problems iprob ON ip.interview_id = iprob.interview_id
       JOIN interviews i ON ip.interview_id = i.id
       WHERE ip.interview_id = $1 AND ip.user_id = $2 AND iprob.problem_id = $3`,
      [interviewId, userId, problemId]
    );

    if (interviewRes.rowCount === 0) {
      return res.status(403).json({ error: 'Not authorized for this interview or problem not assigned.' });
    }

    if (interviewRes.rows[0].status === 'COMPLETED' || interviewRes.rows[0].status === 'CANCELLED') {
      return res.status(403).json({ error: 'Interview is no longer active.' });
    }

    // Create execution record in DB
    const insertRes = await db.query(
      `INSERT INTO code_executions 
        (interview_id, user_id, problem_id, language, source_code, status)
       VALUES ($1, $2, $3, $4, $5, 'Processing')
       RETURNING id`,
      [interviewId, userId, problemId, language, sourceCode]
    );

    const executionId = insertRes.rows[0].id;

    // Determine effective code and stdin to send to Judge0
    const codeWrapper = require('../services/codeWrapper');
    let codeToExecute = sourceCode;
    let effectiveStdin = stdin || '';

    if (problemId && !codeWrapper.isStandaloneCode(sourceCode, language)) {
      const probRes = await db.query('SELECT driver_code FROM problems WHERE id = $1', [problemId]);
      if (probRes.rowCount > 0 && probRes.rows[0].driver_code) {
        const driver = probRes.rows[0].driver_code[language.toLowerCase()];
        if (driver) {
          codeToExecute = codeWrapper.wrapCode({
            sourceCode,
            language,
            driverCode: driver,
          });

          // Fall back to problem's first non-hidden test case input if stdin is empty
          if (!effectiveStdin || effectiveStdin.trim() === '') {
            const tcRes = await db.query(
              `SELECT input FROM test_cases 
               WHERE problem_id = $1 AND is_hidden = false 
               ORDER BY created_at ASC LIMIT 1`,
              [problemId]
            );
            if (tcRes.rowCount > 0) {
              effectiveStdin = tcRes.rows[0].input;
            } else {
              const anyTcRes = await db.query(
                `SELECT input FROM test_cases WHERE problem_id = $1 ORDER BY created_at ASC LIMIT 1`,
                [problemId]
              );
              if (anyTcRes.rowCount > 0) {
                effectiveStdin = anyTcRes.rows[0].input;
              }
            }
          }
        }
      }
    }

    // Submit to Judge0 async
    judge0Client.submitCode({
      sourceCode: codeToExecute,
      language,
      stdin: effectiveStdin,
      executionId,
      callbackUrlOverride: config.judge0.callbackUrl
        ? `${config.judge0.callbackUrl}?secret=${encodeURIComponent(config.judge0.callbackSecret)}&base64=true&id=${executionId}`
        : undefined
    })
      .then(async (token) => {
        // Save the token
        await db.query(`UPDATE code_executions SET judge0_token = $1 WHERE id = $2`, [token, executionId]);
        console.log(`Execution ${executionId} submitted to Judge0 with token ${token}`);

        // If callback cannot reach us (e.g. localhost), start polling fallback
        const { shouldPollJudge0, pollExecution } = require('../services/judge0PollingService');
        if (shouldPollJudge0()) {
          pollExecution({ executionId, token });
        }
      })
      .catch(async (error) => {
        console.error(`Failed to submit execution ${executionId}:`, error);
        await db.query(`UPDATE code_executions SET status = 'Internal Error', stderr = $1 WHERE id = $2`, [error.message, executionId]);
        // Broadcast failure
        const io = getSocketIo();
        if (io) {
          io.to(`interview:${interviewId}`).emit('execution:updated', {
            executionId,
            status: 'Internal Error',
            stderr: error.message
          });
        }
      });

    const io = getSocketIo();
    if (io) {
      io.to(`interview:${interviewId}`).emit('interview:activity', {
        type: 'execution_started',
        userId,
        timestamp: new Date().toISOString()
      });
    }

    // Return 202 immediately
    return res.status(202).json({
      message: 'Execution submitted',
      executionId,
      status: 'Processing'
    });

  } catch (error) {
    next(error);
  }
};

// Shared idempotent execution result processor for both webhooks and polling fallback
const processExecutionResult = async ({ executionId, token, result, isBase64 }) => {
  let { token: resToken, status, stdout, stderr, compile_output, time, memory } = result;
  const effectiveToken = resToken || token;

  if (isBase64) {
    if (typeof stdout === 'string') stdout = Buffer.from(stdout, 'base64').toString('utf8');
    if (typeof stderr === 'string') stderr = Buffer.from(stderr, 'base64').toString('utf8');
    if (typeof compile_output === 'string') compile_output = Buffer.from(compile_output, 'base64').toString('utf8');
  }

  // Map Judge0 status to internal status
  const appStatus = judge0Client.mapJudge0Status(status.id);
  const finalStderr = compile_output ? (stderr ? compile_output + '\n' + stderr : compile_output) : stderr;

  // Idempotent update: only update if status is currently 'Processing'
  let updateRes;
  if (executionId) {
    updateRes = await db.query(
      `UPDATE code_executions
       SET status = $1, stdout = $2, stderr = $3, execution_time_ms = $4, memory_bytes = $5, judge0_token = COALESCE(judge0_token, $6)
       WHERE id = $7 AND status = 'Processing'
       RETURNING id, interview_id`,
      [
        appStatus,
        stdout,
        finalStderr,
        time ? Math.round(parseFloat(time) * 1000) : null,
        memory,
        effectiveToken,
        executionId
      ]
    );
  } else {
    updateRes = await db.query(
      `UPDATE code_executions
       SET status = $1, stdout = $2, stderr = $3, execution_time_ms = $4, memory_bytes = $5
       WHERE judge0_token = $6 AND status = 'Processing'
       RETURNING id, interview_id`,
      [
        appStatus,
        stdout,
        finalStderr,
        time ? Math.round(parseFloat(time) * 1000) : null,
        memory,
        effectiveToken
      ]
    );
  }

  if (updateRes.rowCount > 0) {
    const { id, interview_id } = updateRes.rows[0];

    // Emit socket event to the interview room
    const io = getSocketIo();
    if (io) {
      io.to(`interview:${interview_id}`).emit('execution:updated', {
        executionId: id,
        status: appStatus,
        stdout,
        stderr: finalStderr,
        executionTimeMs: time ? Math.round(parseFloat(time) * 1000) : null,
        memoryBytes: memory
      });
      io.to(`interview:${interview_id}`).emit('interview:activity', {
        type: 'execution_completed',
        status: appStatus,
        timestamp: new Date().toISOString()
      });
    }
    return { updated: true, id, status: appStatus };
  }
  return { updated: false };
};

// 2. Judge0 Callback (POST /api/executions/judge0/callback)
exports.judge0Callback = async (req, res, next) => {
  try {
    // Basic verification - check a shared secret in headers if configured
    const incomingSecret = req.headers['x-judge0-callback-secret'] || req.query.secret;
    if (config.judge0.callbackSecret && incomingSecret !== config.judge0.callbackSecret) {
       console.warn('Unauthorized callback attempt', req.ip);
       return res.status(403).json({ error: 'Unauthorized callback' });
    }

    const { token, status } = req.body;
    if (!token || !status) {
      return res.status(400).json({ error: 'Missing token or status' });
    }

    await processExecutionResult({
      executionId: req.query.id,
      token,
      result: req.body,
      isBase64: req.query.base64 === 'true'
    });

    // Always 200 to acknowledge webhook
    res.status(200).send('OK');

  } catch (error) {
    console.error('Callback error:', error);
    next(error);
  }
};

exports.processExecutionResult = processExecutionResult;
