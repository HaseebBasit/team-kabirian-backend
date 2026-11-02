const express = require('express');
const router = express.Router();
const { getUploadSignature } = require('../controllers/uploadController');
const { protect } = require('../middlewares/authMiddleware');

// POST /api/v1/upload/signature
router.post('/signature', protect, getUploadSignature);

module.exports = router;