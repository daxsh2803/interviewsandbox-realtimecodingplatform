const express = require('express');
const healthRoutes = require('./healthRoutes');
const authRoutes = require('./authRoutes');
const problemRoutes = require('./problemRoutes');
const interviewRoutes = require('./interviewRoutes');

const router = express.Router();

router.use('/health', healthRoutes);
router.use('/auth', authRoutes);
router.use('/problems', problemRoutes);
router.use('/interviews', interviewRoutes);

module.exports = router;
