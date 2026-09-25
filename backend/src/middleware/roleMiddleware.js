const db = require('../db');

/**
 * Middleware factory to require a specific role in an interview.
 * This establishes the authorization groundwork without inventing fake routes.
 * 
 * Usage example in future routes:
 * router.post('/:interviewId/lock', requireAuth, requireInterviewRole('INTERVIEWER'), lockController);
 */
exports.requireInterviewRole = (requiredRole) => {
  return async (req, res, next) => {
    try {
      const { interviewId } = req.params;
      const userId = req.user.userId;

      if (!interviewId) {
        return res.status(400).json({ error: 'Interview ID is required for authorization' });
      }

      const participantResult = await db.query(
        'SELECT role FROM interview_participants WHERE interview_id = $1 AND user_id = $2',
        [interviewId, userId]
      );

      if (participantResult.rows.length === 0) {
        return res.status(403).json({ error: 'User is not a participant in this interview' });
      }

      const userRole = participantResult.rows[0].role;

      if (userRole !== requiredRole) {
        return res.status(403).json({ error: `Requires ${requiredRole} role` });
      }

      // Attach role to request for downstream usage
      req.interviewRole = userRole;
      next();
    } catch (error) {
      next(error);
    }
  };
};

/**
 * Middleware to simply verify the user is any participant in the interview.
 */
exports.requireParticipant = async (req, res, next) => {
  try {
    const { interviewId } = req.params;
    const userId = req.user.userId;

    if (!interviewId) {
      return res.status(400).json({ error: 'Interview ID is required for authorization' });
    }

    const participantResult = await db.query(
      'SELECT role FROM interview_participants WHERE interview_id = $1 AND user_id = $2',
      [interviewId, userId]
    );

    if (participantResult.rows.length === 0) {
      return res.status(403).json({ error: 'User is not a participant in this interview' });
    }

    req.interviewRole = participantResult.rows[0].role;
    next();
  } catch (error) {
    next(error);
  }
};
