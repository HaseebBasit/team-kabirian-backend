const express = require('express');
const router = express.Router();
const { getUploadSignature } = require('../controllers/uploadController');
const { directYouTubeUpload } = require('../controllers/videoController');
const videoUpload = require('../middlewares/videoUploadMiddleware');
const { protect } = require('../middlewares/authMiddleware');

// POST /api/v1/upload/signature (Cloudinary signature for images / PDFs)
router.post('/signature', protect, getUploadSignature);

// POST /api/v1/upload/youtube-video (YouTube Data API v3 Unlisted Video Upload)
router.post('/youtube-video', protect, videoUpload.single('video'), directYouTubeUpload);
router.post('/video', protect, videoUpload.single('video'), directYouTubeUpload);

module.exports = router;
