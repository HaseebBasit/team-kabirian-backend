const cloudinary = require('cloudinary').v2;

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

exports.getUploadSignature = (req, res) => {
  try {
    const { uploadType = 'General' } = req.body;
    const timestamp = Math.round(new Date().getTime() / 1000);

    let folder = 'kabirians/general';
    if (uploadType === 'Cover') folder = 'kabirians/covers';
    else if (uploadType === 'RuleBook') folder = 'kabirians/rulebooks';
    else if (uploadType === 'Payment') folder = 'kabirians/payments';
    else if (uploadType === 'Video') folder = 'kabirians/videos';

    const paramsToSign = {
      folder,
      timestamp,
    };

    const signature = cloudinary.utils.api_sign_request(
      paramsToSign,
      process.env.CLOUDINARY_API_SECRET
    );

    return res.status(200).json({
      success: true,
      data: {
        signature,
        timestamp,
        apiKey: process.env.CLOUDINARY_API_KEY,
        cloudName: process.env.CLOUDINARY_CLOUD_NAME,
        folder,
      },
    });
  } catch (error) {
    console.error('Signature Error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};