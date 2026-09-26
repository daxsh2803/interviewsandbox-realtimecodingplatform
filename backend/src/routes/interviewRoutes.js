const express = require('express');
const router = express.Router();
const interviewController = require('../controllers/interviewController');
const { requireAuth } = require('../middleware/authMiddleware');
const { requireInterviewRole, requireParticipant } = require('../middleware/roleMiddleware');

router.use(requireAuth);

router.post('/', interviewController.createInterview);
router.get('/', interviewController.getInterviews);

// Participant required for viewing interview details
router.get('/:id', requireParticipant, interviewController.getInterviewById);

// INTERVIEWER role required for management endpoints
const interviewerOnly = requireInterviewRole('INTERVIEWER');

router.post('/:id/participants', interviewerOnly, interviewController.addParticipant);
router.post('/:id/problems', interviewerOnly, interviewController.assignProblem);
router.delete('/:id/problems/:problemId', interviewerOnly, interviewController.removeProblem);
router.patch('/:id/status', interviewerOnly, interviewController.updateStatus);

const executionController = require('../controllers/executionController');
const { executionRateLimiter } = require('../middleware/rateLimiter');

router.post('/:id/execute', requireParticipant, executionRateLimiter, executionController.executeCode);

module.exports = router;
