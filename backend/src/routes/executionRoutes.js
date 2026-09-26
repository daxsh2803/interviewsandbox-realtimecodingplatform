const express = require('express');
const executionController = require('../controllers/executionController');

const router = express.Router();

// Public callback endpoint for Judge0
const submissionController = require('../controllers/submissionController');
router.post('/judge0/callback', submissionController.submissionCallback, executionController.judge0Callback);

module.exports = router;
