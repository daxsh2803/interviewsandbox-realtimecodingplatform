const db = require('../db');

exports.createProblem = async (req, res, next) => {
  try {
    const { title, description, difficulty } = req.body;

    if (!title || !description || !difficulty) {
      return res.status(400).json({ error: 'Title, description, and difficulty are required' });
    }

    if (!['EASY', 'MEDIUM', 'HARD'].includes(difficulty)) {
      return res.status(400).json({ error: 'Difficulty must be EASY, MEDIUM, or HARD' });
    }

    const userId = req.user.userId;

    const result = await db.query(
      'INSERT INTO problems (title, description, difficulty, created_by) VALUES ($1, $2, $3, $4) RETURNING *',
      [title, description, difficulty, userId]
    );

    res.status(201).json({ problem: result.rows[0] });
  } catch (error) {
    next(error);
  }
};

exports.getProblems = async (req, res, next) => {
  try {
    let { page = 1, limit = 50 } = req.query;
    page = Math.max(1, parseInt(page, 10) || 1);
    limit = Math.max(1, Math.min(100, parseInt(limit, 10) || 50));

    const offset = (page - 1) * limit;

    const result = await db.query(
      'SELECT * FROM problems ORDER BY created_at DESC LIMIT $1 OFFSET $2',
      [limit, offset]
    );

    const countRes = await db.query('SELECT COUNT(*) FROM problems');
    const total = parseInt(countRes.rows[0].count, 10);

    res.json({
      problems: result.rows,
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

exports.getProblem = async (req, res, next) => {
  try {
    const { id } = req.params;
    const result = await db.query('SELECT * FROM problems WHERE id = $1', [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Problem not found' });
    }

    res.json({ problem: result.rows[0] });
  } catch (error) {
    next(error);
  }
};

exports.updateProblem = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { title, description, difficulty } = req.body;

    if (!title || !description || !difficulty) {
      return res.status(400).json({ error: 'Title, description, and difficulty are required' });
    }

    if (!['EASY', 'MEDIUM', 'HARD'].includes(difficulty)) {
      return res.status(400).json({ error: 'Difficulty must be EASY, MEDIUM, or HARD' });
    }

    const userId = req.user.userId;

    const checkRes = await db.query('SELECT created_by FROM problems WHERE id = $1', [id]);

    if (checkRes.rows.length === 0) {
      return res.status(404).json({ error: 'Problem not found' });
    }

    if (checkRes.rows[0].created_by !== userId) {
      return res.status(403).json({ error: 'Not authorized to update this problem' });
    }

    const result = await db.query(
      'UPDATE problems SET title = $1, description = $2, difficulty = $3 WHERE id = $4 RETURNING *',
      [title, description, difficulty, id]
    );

    res.json({ problem: result.rows[0] });
  } catch (error) {
    next(error);
  }
};

exports.deleteProblem = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user.userId;

    const checkRes = await db.query('SELECT created_by FROM problems WHERE id = $1', [id]);

    if (checkRes.rows.length === 0) {
      return res.status(404).json({ error: 'Problem not found' });
    }

    if (checkRes.rows[0].created_by !== userId) {
      return res.status(403).json({ error: 'Not authorized to delete this problem' });
    }

    await db.query('DELETE FROM problems WHERE id = $1', [id]);

    res.json({ message: 'Problem deleted successfully' });
  } catch (error) {
    next(error);
  }
};
