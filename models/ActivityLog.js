const mongoose = require('mongoose');

const activityLogSchema = new mongoose.Schema(
  {
    action: { type: String, required: true },
    user: { type: String, default: 'Admin' },
    ipAddress: { type: String, default: '105.128.36.1' },
    date: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

module.exports = mongoose.model('ActivityLog', activityLogSchema);