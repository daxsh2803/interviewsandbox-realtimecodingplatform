const express = require('express');
const router = express.Router();
const problemController = require('../controllers/problemController');
const { requireAuth } = require('../middleware/authMiddleware');

router.use(requireAuth);

router.post('/', problemController.createProblem);
router.get('/', problemController.getProblems);
router.get('/:id', problemController.getProblem);
router.put('/:id', problemController.updateProblem);
router.delete('/:id', problemController.deleteProblem);

module.exports = router;
