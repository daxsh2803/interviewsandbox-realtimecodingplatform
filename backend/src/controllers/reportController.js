const db = require('../db');

exports.getInterviewReport = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user.userId;

    const role = req.interviewRole;
    if (!role) {
      return res.status(403).json({ error: 'Not authorized for this interview.' });
    }
    const isInterviewer = role === 'INTERVIEWER';

    const interviewRes = await db.query('SELECT * FROM interviews WHERE id = $1', [id]);
    if (interviewRes.rowCount === 0) {
      return res.status(404).json({ error: 'Interview not found' });
    }
    const interview = interviewRes.rows[0];

    const participantsRes = await db.query(`
      SELECT u.id, u.name, u.email, p.role, p.joined_at
      FROM interview_participants p
      JOIN users u ON p.user_id = u.id
      WHERE p.interview_id = $1
    `, [id]);

    const problemsRes = await db.query(`
      SELECT p.*
      FROM interview_problems ip
      JOIN problems p ON ip.problem_id = p.id
      WHERE ip.interview_id = $1
    `, [id]);

    const statsRes = await db.query(`
      SELECT
        COUNT(ce.id) as execution_count,
        COUNT(DISTINCT s.id) as submission_count
      FROM interviews i
      LEFT JOIN code_executions ce ON i.id = ce.interview_id
      LEFT JOIN submissions s ON i.id = s.interview_id
      WHERE i.id = $1
      GROUP BY i.id
    `, [id]);
    const stats = statsRes.rows[0] || { execution_count: 0, submission_count: 0 };

    let notes = null;
    if (isInterviewer) {
      const notesRes = await db.query('SELECT notes FROM interviewer_notes WHERE interview_id = $1 AND interviewer_id = $2', [id, userId]);
      notes = notesRes.rowCount > 0 ? notesRes.rows[0].notes : null;
    }

    res.json({
      interview,
      participants: participantsRes.rows,
      problems: problemsRes.rows,
      stats,
      notes: isInterviewer ? notes : undefined
    });
  } catch (error) {
    next(error);
  }
};

exports.getSubmissions = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user.userId;

    const role = req.interviewRole;
    if (!role) {
      return res.status(403).json({ error: 'Not authorized for this interview.' });
    }
    const isInterviewer = role === 'INTERVIEWER';

    let { page = 1, limit = 50 } = req.query;
    page = Math.max(1, parseInt(page, 10) || 1);
    limit = Math.max(1, Math.min(100, parseInt(limit, 10) || 50));
    const offset = (page - 1) * limit;

    let query = `
      SELECT s.id, s.problem_id, s.language, s.status, s.created_at, s.user_id,
             (SELECT COUNT(*) FROM submission_results sr WHERE sr.submission_id = s.id) as total_tests,
             (SELECT COUNT(*) FROM submission_results sr WHERE sr.submission_id = s.id AND sr.status = 'Accepted') as passed_tests
      FROM submissions s
      WHERE s.interview_id = $1
    `;

    let countQuery = `SELECT COUNT(*) FROM submissions s WHERE s.interview_id = $1`;
    const params = [id];

    if (!isInterviewer) {
      query += ` AND s.user_id = $2`;
      countQuery += ` AND s.user_id = $2`;
      params.push(userId);
    }

    query += ` ORDER BY s.created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;

    const countRes = await db.query(countQuery, params);
    const total = parseInt(countRes.rows[0].count, 10);

    const submissionsRes = await db.query(query, [...params, limit, offset]);

    // Fetch details including source code and results
    for (let sub of submissionsRes.rows) {
      // Include source code only for interviewer or the owner
      if (isInterviewer || sub.user_id === userId) {
        const srcRes = await db.query('SELECT source_code FROM submissions WHERE id = $1', [sub.id]);
        sub.source_code = srcRes.rows[0].source_code;
      }

      const resultsQuery = `
        SELECT sr.id, sr.status, sr.execution_time_ms, sr.memory_bytes, tc.is_hidden
        ${isInterviewer ? ', tc.input, tc.expected_output, sr.stdout, sr.stderr' : ''}
        FROM submission_results sr
        JOIN test_cases tc ON sr.test_case_id = tc.id
        WHERE sr.submission_id = $1
      `;
      const resultsRes = await db.query(resultsQuery, [sub.id]);

      // Filter candidate safe
      if (!isInterviewer) {
        sub.results = resultsRes.rows.map(r => ({
          id: r.id,
          status: r.status,
          execution_time_ms: r.execution_time_ms,
          memory_bytes: r.memory_bytes,
          is_hidden: r.is_hidden
        }));
      } else {
        sub.results = resultsRes.rows;
      }
    }

    res.json({
      submissions: submissionsRes.rows,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    next(error);
  }
};

exports.getSnapshots = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user.userId;

    const role = req.interviewRole;
    if (!role) {
      return res.status(403).json({ error: 'Not authorized for this interview.' });
    }

    const snapshotsRes = await db.query(`
      SELECT id, snapshot_content, language, trigger_type, created_at
      FROM interview_snapshots
      WHERE interview_id = $1
      ORDER BY created_at ASC
    `, [id]);

    res.json({ snapshots: snapshotsRes.rows });
  } catch (error) {
    next(error);
  }
};

exports.getNotes = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user.userId;

    // Must be interviewer
    const role = req.interviewRole;
    if (role !== 'INTERVIEWER') {
      return res.status(403).json({ error: 'Only interviewers can access notes.' });
    }

    const notesRes = await db.query('SELECT notes FROM interviewer_notes WHERE interview_id = $1 AND interviewer_id = $2', [id, userId]);
    const notes = notesRes.rowCount > 0 ? notesRes.rows[0].notes : '';

    res.json({ notes });
  } catch (error) {
    next(error);
  }
};

exports.upsertNotes = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user.userId;
    const { notes } = req.body;

    if (notes === undefined) {
      return res.status(400).json({ error: 'Notes are required' });
    }

    const role = req.interviewRole;
    if (role !== 'INTERVIEWER') {
      return res.status(403).json({ error: 'Only interviewers can access notes.' });
    }

    await db.query(`
      INSERT INTO interviewer_notes (interview_id, interviewer_id, notes)
      VALUES ($1, $2, $3)
      ON CONFLICT (interview_id, interviewer_id)
      DO UPDATE SET notes = EXCLUDED.notes, updated_at = CURRENT_TIMESTAMP
    `, [id, userId, notes]);

    // Optional: emit socket event
    const { getSocketIo } = require('../socket');
    const io = getSocketIo();
    if (io) {
      io.to(`interview:${id}`).emit('interview:report-updated', { type: 'notes' });
    }

    res.json({ success: true, notes });
  } catch (error) {
    next(error);
  }
};
