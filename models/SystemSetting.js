const mongoose = require('mongoose');

const systemSettingSchema = new mongoose.Schema(
  {
    websiteName: { type: String, default: 'EventPortal' },
    contactEmail: { type: String, default: 'admin@eventportal.com' },
    contactPhone: { type: String, default: '+92 300 1234567' },
    address: { type: String, default: 'Karachi, Pakistan' },
    bankName: { type: String, default: 'Meezan Bank' },
    accountTitle: { type: String, default: 'Team Kabirians' },
    accountNumber: { type: String, default: '01020304050607' },
  },
  { timestamps: true }
);

module.exports = mongoose.model('SystemSetting', systemSettingSchema);