const express = require('express');
const executionController = require('../controllers/executionController');

const router = express.Router();

// Public callback endpoint for Judge0
router.post('/judge0/callback', executionController.judge0Callback);

module.exports = router;
