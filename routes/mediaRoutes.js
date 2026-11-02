const express = require('express');
const router = express.Router();
const { getUploadSignature } = require('../controllers/mediaController');
const { protect } = require('../middlewares/authMiddleware');

router.post('/sign-upload', protect, getUploadSignature);

module.exports = router;