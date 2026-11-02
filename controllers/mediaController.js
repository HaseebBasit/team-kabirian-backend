const cloudinary = require('../config/cloudinary');

exports.getUploadSignature = (req, res) => {
  try {
    const { eventId, categoryId, teamId, uploadType } = req.body; 
    // uploadType: 'Payment' | 'Videos'

    if (!['Payment', 'Videos'].includes(uploadType)) {
      return res.status(400).json({ success: false, message: 'Invalid upload type.' });
    }

    // Dynamic folder formula according to plan: Event -> Category -> Team -> Type
    const folder = `Events/Event_${eventId}/Cat_${categoryId}/Team_${teamId}/${uploadType}`;
    const timestamp = Math.round(new Date().getTime() / 1000);

    const signature = cloudinary.utils.api_sign_request(
      { folder, timestamp },
      process.env.CLOUDINARY_API_SECRET
    );

    res.status(200).json({
      success: true,
      data: {
        signature,
        timestamp,
        folder,
        apiKey: process.env.CLOUDINARY_API_KEY,
        cloudName: process.env.CLOUDINARY_CLOUD_NAME
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};