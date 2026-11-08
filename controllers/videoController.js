const fs = require('fs');
const Registration = require('../models/Registration');
const { uploadVideoToYouTube, extractYouTubeId } = require('../utils/youtubeService');

/**
 * Uploads athlete performance video directly to YouTube (Unlisted)
 * and permanently binds videoUrl + youtubeId to the specific athlete in MongoDB.
 */
exports.uploadAthleteVideo = async (req, res) => {
  const tempFilePath = req.file?.path;

  try {
    const regId = req.params.regId || req.body.regId;
    const { athleteId, athleteIndex, athleteName, categoryName, videoUrl: linkUrl, videoLink } = req.body;

    if (!regId) {
      return res.status(400).json({ success: false, message: 'Registration ID (regId) is required.' });
    }

    const reg = await Registration.findById(regId);
    if (!reg) {
      return res.status(404).json({ success: false, message: 'Registration record not found.' });
    }

    let finalVideoUrl = '';
    let finalYoutubeId = '';

    // 1. If physical file was uploaded via Multer
    if (tempFilePath) {
      const cleanAthleteName = (athleteName || 'Athlete').trim();
      const cleanCategory = (categoryName || 'Open Routine').trim();
      const youtubeTitle = `${cleanAthleteName} - ${cleanCategory}`;
      const youtubeDescription = 'Team Kabirians Tournament Footage';

      // Upload to YouTube via Data API v3 (Unlisted)
      const ytResult = await uploadVideoToYouTube({
        filePath: tempFilePath,
        title: youtubeTitle,
        description: youtubeDescription,
      });

      finalYoutubeId = ytResult.videoId;
      finalVideoUrl = ytResult.videoUrl;
    } else {
      // 2. If a video URL or YouTube link was provided
      const inputUrl = (linkUrl || videoLink || '').trim();
      if (!inputUrl) {
        return res.status(400).json({
          success: false,
          message: 'Please provide either a video file or a video URL.',
        });
      }

      const extractedId = extractYouTubeId(inputUrl);
      if (extractedId) {
        finalYoutubeId = extractedId;
        finalVideoUrl = `https://www.youtube.com/watch?v=${extractedId}`;
      } else {
        finalVideoUrl = inputUrl;
        finalYoutubeId = '';
      }
    }

    // 3. Strict Athlete Match & MongoDB Persistence
    let targetAth = null;
    let matchedIndex = -1;

    if (Array.isArray(reg.athletes) && reg.athletes.length > 0) {
      // Priority 1: Match by Athlete _id
      if (athleteId) {
        const idx = reg.athletes.findIndex((a) => a._id && String(a._id) === String(athleteId));
        if (idx !== -1) {
          targetAth = reg.athletes[idx];
          matchedIndex = idx;
        }
      }

      // Priority 2: Match by Array Index
      if (!targetAth && athleteIndex !== undefined && athleteIndex !== null && athleteIndex !== '') {
        const numIdx = Number(athleteIndex);
        if (!isNaN(numIdx) && reg.athletes[numIdx]) {
          targetAth = reg.athletes[numIdx];
          matchedIndex = numIdx;
        }
      }

      // Priority 3: Match by Athlete Name
      if (!targetAth && athleteName) {
        const cleanName = String(athleteName).trim().toLowerCase();
        const idx = reg.athletes.findIndex(
          (a) => a.name && a.name.trim().toLowerCase() === cleanName
        );
        if (idx !== -1) {
          targetAth = reg.athletes[idx];
          matchedIndex = idx;
        }
      }
    }

    if (!targetAth) {
      return res.status(404).json({
        success: false,
        message: 'Could not find the specified athlete inside this registration batch.',
      });
    }

    // Update athlete fields strictly
    targetAth.videoUrl = finalVideoUrl;
    targetAth.submissionVideoUrl = finalVideoUrl;
    targetAth.youtubeUrl = finalVideoUrl;
    targetAth.youtubeId = finalYoutubeId;
    targetAth.videoStatus = 'submitted';
    targetAth.submissionDate = new Date();

    reg.markModified('athletes');
    await reg.save();

    return res.status(200).json({
      success: true,
      message: `Video successfully saved for ${targetAth.name}!`,
      data: {
        registrationId: reg._id,
        athleteId: targetAth._id,
        athleteIndex: matchedIndex,
        athleteName: targetAth.name,
        videoUrl: finalVideoUrl,
        youtubeId: finalYoutubeId,
        videoStatus: 'submitted',
      },
    });
  } catch (err) {
    console.error('Athlete video upload error:', err);
    return res.status(500).json({
      success: false,
      message: err.message || 'Failed to process and upload video to YouTube.',
      error: err.toString(),
    });
  } finally {
    // Local disk cleanup: Always delete temporary file from disk immediately
    if (tempFilePath && fs.existsSync(tempFilePath)) {
      try {
        fs.unlinkSync(tempFilePath);
      } catch (cleanupErr) {
        console.error('Error removing temporary video file:', cleanupErr);
      }
    }
  }
};

/**
 * Standalone direct video upload to YouTube unlisted mode
 */
exports.directYouTubeUpload = async (req, res) => {
  const tempFilePath = req.file?.path;
  try {
    if (!tempFilePath) {
      return res.status(400).json({ success: false, message: 'No video file uploaded.' });
    }

    const { title, description } = req.body;
    const result = await uploadVideoToYouTube({
      filePath: tempFilePath,
      title: title || 'Team Kabirians Tournament Footage',
      description: description || 'Team Kabirians Tournament Footage',
    });

    return res.status(200).json({
      success: true,
      message: 'Video successfully uploaded to YouTube as Unlisted!',
      data: result,
    });
  } catch (err) {
    console.error('Direct YouTube upload error:', err);
    return res.status(500).json({
      success: false,
      message: err.message || 'YouTube upload failed.',
    });
  } finally {
    if (tempFilePath && fs.existsSync(tempFilePath)) {
      try {
        fs.unlinkSync(tempFilePath);
      } catch (e) {
        console.error('Error deleting temp video file:', e);
      }
    }
  }
};
