const db = require('../db');

exports.getTestCases = async (req, res, next) => {
  try {
    const { id: interviewId, problemId } = req.params;
    const userId = req.user.userId;

    // Verify interviewer role and problem belongs to interview
    const checkRes = await db.query(
      `SELECT ip.role 
       FROM interview_participants ip 
       JOIN interview_problems iprob ON ip.interview_id = iprob.interview_id
       WHERE ip.interview_id = $1 AND ip.user_id = $2 AND iprob.problem_id = $3`,
      [interviewId, userId, problemId]
    );

    if (checkRes.rowCount === 0 || checkRes.rows[0].role !== 'INTERVIEWER') {
      return res.status(403).json({ error: 'Not authorized for this operation.' });
    }

    const testCasesRes = await db.query(
      'SELECT id, problem_id, input, expected_output, is_hidden, created_at FROM test_cases WHERE problem_id = $1 ORDER BY created_at ASC',
      [problemId]
    );

    return res.json({ testCases: testCasesRes.rows });
  } catch (error) {
    next(error);
  }
};

exports.createTestCase = async (req, res, next) => {
  try {
    const { id: interviewId, problemId } = req.params;
    const { input, expectedOutput, isHidden = true } = req.body;
    const userId = req.user.userId;

    if (!input || !expectedOutput) {
      return res.status(400).json({ error: 'Input and expected output are required.' });
    }

    const checkRes = await db.query(
      `SELECT ip.role 
       FROM interview_participants ip 
       JOIN interview_problems iprob ON ip.interview_id = iprob.interview_id
       WHERE ip.interview_id = $1 AND ip.user_id = $2 AND iprob.problem_id = $3`,
      [interviewId, userId, problemId]
    );

    if (checkRes.rowCount === 0 || checkRes.rows[0].role !== 'INTERVIEWER') {
      return res.status(403).json({ error: 'Not authorized for this operation.' });
    }

    const insertRes = await db.query(
      `INSERT INTO test_cases (problem_id, input, expected_output, is_hidden) 
       VALUES ($1, $2, $3, $4) RETURNING id, problem_id, input, expected_output, is_hidden, created_at`,
      [problemId, input, expectedOutput, isHidden]
    );

    return res.status(201).json({ testCase: insertRes.rows[0] });
  } catch (error) {
    next(error);
  }
};

exports.deleteTestCase = async (req, res, next) => {
  try {
    const { id: interviewId, problemId, testCaseId } = req.params;
    const userId = req.user.userId;

    const checkRes = await db.query(
      `SELECT ip.role 
       FROM interview_participants ip 
       JOIN interview_problems iprob ON ip.interview_id = iprob.interview_id
       WHERE ip.interview_id = $1 AND ip.user_id = $2 AND iprob.problem_id = $3`,
      [interviewId, userId, problemId]
    );

    if (checkRes.rowCount === 0 || checkRes.rows[0].role !== 'INTERVIEWER') {
      return res.status(403).json({ error: 'Not authorized for this operation.' });
    }

    const delRes = await db.query('DELETE FROM test_cases WHERE id = $1 AND problem_id = $2 RETURNING id', [testCaseId, problemId]);
    if (delRes.rowCount === 0) {
      return res.status(404).json({ error: 'Test case not found.' });
    }

    return res.status(204).send();
  } catch (error) {
    next(error);
  }
};
