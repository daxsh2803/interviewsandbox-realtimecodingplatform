const db = require('../db');

exports.createInterview = async (req, res, next) => {
  const client = await db.pool.connect();
  try {
    const { title, scheduled_at } = req.body;
    const userId = req.user.userId;

    if (!title) {
      return res.status(400).json({ error: 'Title is required' });
    }

    await client.query('BEGIN');

    const interviewResult = await client.query(
      'INSERT INTO interviews (title, scheduled_at) VALUES ($1, $2) RETURNING *',
      [title, scheduled_at || null]
    );

    const interview = interviewResult.rows[0];

    await client.query(
      'INSERT INTO interview_participants (interview_id, user_id, role, joined_at) VALUES ($1, $2, $3, CURRENT_TIMESTAMP)',
      [interview.id, userId, 'INTERVIEWER']
    );

    await client.query('COMMIT');

    res.status(201).json({ interview });
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
};

exports.getInterviews = async (req, res, next) => {
  try {
    const userId = req.user.userId;

    const result = await db.query(`
      SELECT i.*, p.role 
      FROM interviews i
      JOIN interview_participants p ON i.id = p.interview_id
      WHERE p.user_id = $1
      ORDER BY i.created_at DESC
    `, [userId]);

    res.json({ interviews: result.rows });
  } catch (error) {
    next(error);
  }
};

exports.getInterviewById = async (req, res, next) => {
  try {
    const { id } = req.params;
    
    // We can rely on requireParticipant middleware to ensure they have access.
    
    const interviewResult = await db.query('SELECT * FROM interviews WHERE id = $1', [id]);
    
    if (interviewResult.rows.length === 0) {
      return res.status(404).json({ error: 'Interview not found' });
    }

    const interview = interviewResult.rows[0];

    const participantsResult = await db.query(`
      SELECT u.id, u.name, u.email, p.role, p.joined_at
      FROM interview_participants p
      JOIN users u ON p.user_id = u.id
      WHERE p.interview_id = $1
    `, [id]);

    const problemsResult = await db.query(`
      SELECT p.*
      FROM interview_problems ip
      JOIN problems p ON ip.problem_id = p.id
      WHERE ip.interview_id = $1
    `, [id]);

    interview.participants = participantsResult.rows;
    interview.problems = problemsResult.rows;

    res.json({ interview });
  } catch (error) {
    next(error);
  }
};

exports.addParticipant = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { user_id, role } = req.body;

    if (!user_id || !role) {
      return res.status(400).json({ error: 'user_id and role are required' });
    }

    if (!['INTERVIEWER', 'CANDIDATE'].includes(role)) {
      return res.status(400).json({ error: 'Role must be INTERVIEWER or CANDIDATE' });
    }

    const userResult = await db.query('SELECT id FROM users WHERE id = $1', [user_id]);
    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const existingParticipant = await db.query(
      'SELECT role FROM interview_participants WHERE interview_id = $1 AND user_id = $2',
      [id, user_id]
    );

    if (existingParticipant.rows.length > 0) {
      return res.status(409).json({ error: 'User is already a participant' });
    }

    await db.query(
      'INSERT INTO interview_participants (interview_id, user_id, role, joined_at) VALUES ($1, $2, $3, CURRENT_TIMESTAMP)',
      [id, user_id, role]
    );

    res.status(201).json({ message: 'Participant added successfully' });
  } catch (error) {
    next(error);
  }
};

exports.assignProblem = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { problem_id } = req.body;

    if (!problem_id) {
      return res.status(400).json({ error: 'problem_id is required' });
    }

    const problemResult = await db.query('SELECT id FROM problems WHERE id = $1', [problem_id]);
    if (problemResult.rows.length === 0) {
      return res.status(404).json({ error: 'Problem not found' });
    }

    const existingProblem = await db.query(
      'SELECT * FROM interview_problems WHERE interview_id = $1 AND problem_id = $2',
      [id, problem_id]
    );

    if (existingProblem.rows.length > 0) {
      return res.status(409).json({ error: 'Problem is already assigned to this interview' });
    }

    await db.query(
      'INSERT INTO interview_problems (interview_id, problem_id) VALUES ($1, $2)',
      [id, problem_id]
    );

    res.status(201).json({ message: 'Problem assigned successfully' });
  } catch (error) {
    next(error);
  }
};

exports.removeProblem = async (req, res, next) => {
  try {
    const { id, problemId } = req.params;

    const result = await db.query(
      'DELETE FROM interview_problems WHERE interview_id = $1 AND problem_id = $2 RETURNING *',
      [id, problemId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Problem not assigned to this interview' });
    }

    res.json({ message: 'Problem removed successfully' });
  } catch (error) {
    next(error);
  }
};

exports.updateStatus = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    const validStatuses = ['SCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'];
    if (!status || !validStatuses.includes(status)) {
      return res.status(400).json({ error: `Status must be one of: ${validStatuses.join(', ')}` });
    }

    const interviewResult = await db.query('SELECT status FROM interviews WHERE id = $1', [id]);
    if (interviewResult.rows.length === 0) {
      return res.status(404).json({ error: 'Interview not found' });
    }

    const currentStatus = interviewResult.rows[0].status;
    
    if (currentStatus === status) {
      return res.json({ message: 'Status is already set to this value' });
    }

    let query = 'UPDATE interviews SET status = $1, updated_at = CURRENT_TIMESTAMP';
    const params = [status, id];

    if (status === 'IN_PROGRESS' && currentStatus === 'SCHEDULED') {
      query += ', started_at = CURRENT_TIMESTAMP';
    } else if ((status === 'COMPLETED' || status === 'CANCELLED') && currentStatus !== 'COMPLETED' && currentStatus !== 'CANCELLED') {
      query += ', ended_at = CURRENT_TIMESTAMP';
    }

    query += ' WHERE id = $2 RETURNING *';

    const result = await db.query(query, params);

    res.json({ interview: result.rows[0] });
  } catch (error) {
    next(error);
  }
};
