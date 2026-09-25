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

    const result = await db.query(
      'INSERT INTO problems (title, description, difficulty) VALUES ($1, $2, $3) RETURNING *',
      [title, description, difficulty]
    );

    res.status(201).json({ problem: result.rows[0] });
  } catch (error) {
    next(error);
  }
};

exports.getProblems = async (req, res, next) => {
  try {
    const result = await db.query('SELECT * FROM problems ORDER BY created_at DESC');
    res.json({ problems: result.rows });
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

    const result = await db.query(
      'UPDATE problems SET title = $1, description = $2, difficulty = $3 WHERE id = $4 RETURNING *',
      [title, description, difficulty, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Problem not found' });
    }

    res.json({ problem: result.rows[0] });
  } catch (error) {
    next(error);
  }
};

exports.deleteProblem = async (req, res, next) => {
  try {
    const { id } = req.params;
    const result = await db.query('DELETE FROM problems WHERE id = $1 RETURNING id', [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Problem not found' });
    }

    res.json({ message: 'Problem deleted successfully' });
  } catch (error) {
    next(error);
  }
};
