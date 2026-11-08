const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Temporary disk storage for incoming videos before YouTube streaming
const tempDir = path.join(__dirname, '../uploads/temp');
if (!fs.existsSync(tempDir)) {
  fs.mkdirSync(tempDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, tempDir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname) || '.mp4';
    cb(null, `tkd-video-${uniqueSuffix}${ext}`);
  },
});

const videoFilter = (req, file, cb) => {
  if (
    file.mimetype?.startsWith('video/') ||
    file.originalname?.match(/\.(mp4|mov|avi|wmv|mkv|webm|m4v|3gp|flv)$/i)
  ) {
    cb(null, true);
  } else {
    cb(new Error('Only video files (MP4, MOV, WEBM, MKV, etc.) are allowed!'), false);
  }
};

const videoUpload = multer({
  storage,
  limits: {
    fileSize: 500 * 1024 * 1024, // 500MB max limit
  },
  fileFilter: videoFilter,
});

module.exports = videoUpload;
