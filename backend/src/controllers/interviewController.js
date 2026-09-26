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

    // Lifecycle constraints
    if (status === 'IN_PROGRESS' && (currentStatus === 'COMPLETED' || currentStatus === 'CANCELLED')) {
      return res.status(400).json({ error: 'Cannot start an already completed or cancelled interview' });
    }
    
    if (status === 'COMPLETED' && currentStatus !== 'IN_PROGRESS') {
      return res.status(400).json({ error: 'Cannot end an interview that is not in progress' });
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
    const updatedInterview = result.rows[0];

    // Handle COMPLETED side effects
    if (status === 'COMPLETED') {
      const { getIo } = require('../socket');
      const { redisClient } = require('../db/redis');
      const { docs } = require('../yjsManager');
      
      // Save snapshots BEFORE cleanup
      const problemRes = await db.query('SELECT problem_id FROM interview_problems WHERE interview_id = $1', [id]);
      for (const row of problemRes.rows) {
        const docId = `${id}:${row.problem_id}`;
        const doc = docs.get(docId);
        if (doc) {
          const sourceCode = doc.getText('sourceCode').toString();
          if (sourceCode) {
            await db.query(
              `INSERT INTO interview_snapshots (interview_id, snapshot_content, language, trigger_type) 
               VALUES ($1, $2, $3, $4)`,
              [id, sourceCode, 'javascript', 'TERMINATION']
            );
          }
        }
      }
      
      // Clean ephemeral state
      await redisClient.del(`interview:${id}:editor:lock`);
      await redisClient.del(`interview:${id}:active-problem`);
      
      // Emit ended event
      const io = getIo();
      if (io) {
        io.to(`interview:${id}`).emit('interview:ended', { 
          interviewId: id,
          status: 'COMPLETED'
        });
      }
    }

    res.json({ interview: updatedInterview });
  } catch (error) {
    next(error);
  }
};

exports.setLock = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { locked } = req.body;
    
    if (typeof locked !== 'boolean') {
      return res.status(400).json({ error: 'locked must be a boolean' });
    }

    const { redisClient } = require('../db/redis');
    const lockKey = `interview:${id}:editor:lock`;
    
    if (locked) {
      await redisClient.set(lockKey, 'locked');
    } else {
      await redisClient.del(lockKey);
    }
    
    const { getIo } = require('../socket');
    const io = getIo();
    if (io) {
      io.to(`interview:${id}`).emit(locked ? 'interview:editor-lock' : 'interview:editor-unlock', {
        interviewId: id,
        locked
      });
      // Candidate activity event for interviewer
      io.to(`interview:${id}`).emit('interview:activity', {
        type: 'editor_lock',
        locked,
        timestamp: new Date().toISOString()
      });
    }

    res.json({ locked });
  } catch (error) {
    next(error);
  }
};

exports.getLock = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { redisClient } = require('../db/redis');
    const lockKey = `interview:${id}:editor:lock`;
    
    const lockState = await redisClient.get(lockKey);
    const locked = lockState === 'locked';

    res.json({ locked });
  } catch (error) {
    next(error);
  }
};

exports.setActiveProblem = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { problemId } = req.body;

    if (!problemId) {
      return res.status(400).json({ error: 'problemId is required' });
    }

    // Verify problem belongs to interview
    const problemResult = await db.query(
      'SELECT * FROM interview_problems WHERE interview_id = $1 AND problem_id = $2',
      [id, problemId]
    );

    if (problemResult.rows.length === 0) {
      return res.status(403).json({ error: 'Problem is not assigned to this interview' });
    }

    const { redisClient } = require('../db/redis');
    const problemKey = `interview:${id}:active-problem`;
    
    await redisClient.set(problemKey, problemId);

    const { getIo } = require('../socket');
    const io = getIo();
    if (io) {
      io.to(`interview:${id}`).emit('problem:pushed', {
        interviewId: id,
        problemId
      });
      // Candidate activity event
      io.to(`interview:${id}`).emit('interview:activity', {
        type: 'problem_pushed',
        problemId,
        timestamp: new Date().toISOString()
      });
    }

    res.json({ problemId });
  } catch (error) {
    next(error);
  }
};

exports.getActiveProblem = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { redisClient } = require('../db/redis');
    const problemKey = `interview:${id}:active-problem`;
    
    const problemId = await redisClient.get(problemKey);

    res.json({ problemId });
  } catch (error) {
    next(error);
  }
};

