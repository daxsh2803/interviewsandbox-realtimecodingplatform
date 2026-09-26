const db = require('../db');
const judge0Client = require('../services/judge0Client');
const { getSocketIo } = require('../socket');
const config = require('../config');

// Shared utility to compute final verdict
const normalizeOutput = (str) => {
  if (typeof str !== 'string') return '';
  return str.replace(/\r\n/g, '\n').trimEnd();
};

const evaluateTestCases = async (submissionId, interviewId) => {
  // Check if all test cases have completed
  const results = await db.query(
    `SELECT sr.status, sr.stdout, sr.stderr, tc.expected_output 
     FROM submission_results sr
     JOIN test_cases tc ON sr.test_case_id = tc.id
     WHERE sr.submission_id = $1`,
    [submissionId]
  );
  
  if (results.rowCount === 0) return;

  const hasProcessing = results.rows.some(r => r.status === 'Processing');
  if (hasProcessing) return; // Wait for others to finish

  // All complete, compute final status
  let finalStatus = 'Accepted';
  let hasWA = false;
  let hasCE = false;
  let hasRE = false;
  let hasTLE = false;
  let hasIE = false;

  let passedCount = 0;

  for (const r of results.rows) {
    if (r.status === 'Compilation Error') hasCE = true;
    else if (r.status === 'Internal Error') hasIE = true;
    else if (r.status === 'Time Limit Exceeded') hasTLE = true;
    else if (r.status === 'Runtime Error') hasRE = true;
    else if (r.status === 'Accepted' || r.status === 'Wrong Answer') {
      const actual = normalizeOutput(r.stdout);
      const expected = normalizeOutput(r.expected_output);
      if (actual !== expected) {
        hasWA = true;
        // In case judge0 returned accepted but it doesn't match our expected output, it's WA
        // Update the submission_results row to WA
        // (For simplicity we just derive the overall status here, but let's assume we want to update the DB)
      } else {
        passedCount++;
      }
    } else {
      hasIE = true;
    }
  }

  if (hasIE) finalStatus = 'Internal Error';
  else if (hasCE) finalStatus = 'Compilation Error';
  else if (hasTLE) finalStatus = 'Time Limit Exceeded';
  else if (hasRE) finalStatus = 'Runtime Error';
  else if (hasWA) finalStatus = 'Wrong Answer';
  else if (passedCount === results.rowCount) finalStatus = 'Accepted';
  else finalStatus = 'Wrong Answer'; // Fallback if unexpected

  // Update submission row
  await db.query(`UPDATE submissions SET status = $1 WHERE id = $2`, [finalStatus, submissionId]);

  // Broadcast the final result
  const io = getSocketIo();
  if (io) {
    io.to(`interview:${interviewId}`).emit('submission:updated', {
      submissionId,
      status: finalStatus,
      passedCount,
      totalCount: results.rowCount
    });
  }
};

exports.submitCode = async (req, res, next) => {
  try {
    const interviewId = req.params.id || req.params.interviewId;
    const problemId = req.params.problemId;
    const { language, sourceCode } = req.body;
    const userId = req.user.userId;

    if (!problemId || !language || !sourceCode) {
      return res.status(400).json({ error: 'problemId, language, and sourceCode are required.' });
    }
    
    if (sourceCode.length > 50000) {
      return res.status(400).json({ error: 'Source code is too large.' });
    }

    const interviewRes = await db.query(
      `SELECT ip.role 
       FROM interview_participants ip 
       JOIN interview_problems iprob ON ip.interview_id = iprob.interview_id
       WHERE ip.interview_id = $1 AND ip.user_id = $2 AND iprob.problem_id = $3`,
      [interviewId, userId, problemId]
    );

    if (interviewRes.rowCount === 0) {
      return res.status(403).json({ error: 'Not authorized for this interview or problem not assigned.' });
    }

    const testCasesRes = await db.query('SELECT id, input FROM test_cases WHERE problem_id = $1', [problemId]);
    if (testCasesRes.rowCount === 0) {
      // If no test cases, we could just accept it or error out
      return res.status(400).json({ error: 'No test cases defined for this problem.' });
    }

    // Insert submission
    const insertSub = await db.query(
      `INSERT INTO submissions (interview_id, user_id, problem_id, language, source_code, status) 
       VALUES ($1, $2, $3, $4, $5, 'Processing') RETURNING id`,
      [interviewId, userId, problemId, language, sourceCode]
    );
    const submissionId = insertSub.rows[0].id;

    // Send HTTP 202
    res.status(202).json({ message: 'Submission accepted', submissionId, status: 'Processing' });

    // Background processing
    (async () => {
      try {
        // Step 1: Pre-create ALL submission_results rows so callbacks don't race
        const placeholders = [];
        for (const tc of testCasesRes.rows) {
          const insertRes = await db.query(
            `INSERT INTO submission_results (submission_id, test_case_id, status) VALUES ($1, $2, 'Processing') RETURNING id`,
            [submissionId, tc.id]
          );
          placeholders.push({ resultId: insertRes.rows[0].id, tc });
        }

        // Step 2: Submit to Judge0
        for (const { resultId, tc } of placeholders) {
          try {
            const token = await judge0Client.submitCode({
              sourceCode,
              language,
              stdin: tc.input,
              executionId: `subres-${resultId}`,
              callbackUrlOverride: config.judge0.callbackUrl 
                ? `${config.judge0.callbackUrl}?secret=${encodeURIComponent(config.judge0.callbackSecret)}&type=submission` 
                : undefined
            });
            await db.query(`UPDATE submission_results SET judge0_token = $1 WHERE id = $2`, [token, resultId]);
          } catch (err) {
            console.error(`Failed to submit test case ${tc.id}:`, err);
            await db.query(`UPDATE submission_results SET status = 'Internal Error', stderr = $1 WHERE id = $2`, [err.message, resultId]);
            await evaluateTestCases(submissionId, interviewId);
          }
        }
      } catch (err) {
        console.error('Background submission error:', err);
      }
    })();
  } catch (error) {
    next(error);
  }
};

exports.submissionCallback = async (req, res, next) => {
  try {
    const incomingSecret = req.headers['x-judge0-callback-secret'] || req.query.secret;
    if (config.judge0.callbackSecret && incomingSecret !== config.judge0.callbackSecret) {
       console.warn('Unauthorized callback attempt', req.ip);
       return res.status(403).json({ error: 'Unauthorized callback' });
    }

    const type = req.query.type;
    if (type !== 'submission') {
      return next(); // Pass to next handler if not submission type
    }

    const { token, status, stdout, stderr, compile_output, time, memory } = req.body;
    if (!token || !status) {
      return res.status(400).json({ error: 'Missing token or status' });
    }

    let appStatus = judge0Client.mapJudge0Status(status.id);
    const finalStderr = compile_output ? (stderr ? compile_output + '\\n' + stderr : compile_output) : stderr;

    const updateRes = await db.query(
      `UPDATE submission_results 
       SET status = $1, stdout = $2, stderr = $3, execution_time_ms = $4, memory_bytes = $5
       WHERE judge0_token = $6 AND status = 'Processing'
       RETURNING id, submission_id`,
      [
        appStatus,
        stdout,
        finalStderr,
        time ? Math.round(parseFloat(time) * 1000) : null,
        memory,
        token
      ]
    );

    if (updateRes.rowCount > 0) {
      const { submission_id } = updateRes.rows[0];

      // After updating, check if the submission is fully complete and update overall verdict
      const subRes = await db.query('SELECT interview_id FROM submissions WHERE id = $1', [submission_id]);
      if (subRes.rowCount > 0) {
         await evaluateTestCases(submission_id, subRes.rows[0].interview_id);
      }
    }

    res.status(200).send('OK');
  } catch (error) {
    console.error('Submission callback error:', error);
    next(error);
  }
};
