const { google } = require('googleapis');
const fs = require('fs');

/**
 * Creates authenticated OAuth2 client with refresh token.
 */
function getOAuth2Client() {
  const clientId = process.env.YT_CLIENT_ID;
  const clientSecret = process.env.YT_CLIENT_SECRET;
  const refreshToken = process.env.YT_REFRESH_TOKEN;

  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error('YouTube API credentials missing in environment variables (YT_CLIENT_ID, YT_CLIENT_SECRET, YT_REFRESH_TOKEN)');
  }

  const oauth2Client = new google.auth.OAuth2(clientId, clientSecret);
  oauth2Client.setCredentials({ refresh_token: refreshToken });
  return oauth2Client;
}

/**
 * Extracts 11-char YouTube ID from URL or bare ID.
 */
function extractYouTubeId(urlOrId) {
  if (!urlOrId || typeof urlOrId !== 'string') return null;
  const trimmed = urlOrId.trim();
  if (/^[a-zA-Z0-9_-]{11}$/.test(trimmed)) return trimmed;
  const match = trimmed.match(/(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/i);
  return match && match[1] ? match[1] : null;
}

/**
 * Uploads video to YouTube in Unlisted mode.
 * @param {Object} options
 * @param {string} options.filePath - Local temp file path
 * @param {string} options.title - YouTube video title
 * @param {string} [options.description] - Video description
 * @returns {Promise<{ videoId: string, videoUrl: string }>}
 */
async function uploadVideoToYouTube({ filePath, title, description }) {
  const auth = getOAuth2Client();
  const youtube = google.youtube({ version: 'v3', auth });

  const res = await youtube.videos.insert({
    part: 'snippet,status',
    requestBody: {
      snippet: {
        title: title || 'Athlete Footage - Team Kabirians',
        description: description || 'Team Kabirians Tournament Footage',
      },
      status: {
        privacyStatus: 'unlisted',
      },
    },
    media: {
      body: fs.createReadStream(filePath),
    },
  });

  const videoId = res.data?.id;
  if (!videoId) {
    throw new Error('YouTube API did not return a valid video ID.');
  }

  const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
  return { videoId, videoUrl };
}

module.exports = {
  uploadVideoToYouTube,
  extractYouTubeId,
  getOAuth2Client,
};
