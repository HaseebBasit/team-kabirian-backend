// backend/models/VideoSubmission.js
const mongoose = require('mongoose');

const videoSubmissionSchema = new mongoose.Schema(
  {
    registrationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Registration', required: true, unique: true },
    eventId: { type: mongoose.Schema.Types.ObjectId, ref: 'Event', required: true, index: true },
    categoryId: { type: mongoose.Schema.Types.ObjectId, ref: 'Category', required: true, index: true },
    teamId: { type: mongoose.Schema.Types.ObjectId, ref: 'Team', required: true, index: true },
    cloudinaryPublicId: { type: String, required: true },
    cloudinaryUrl: { type: String, required: true },
    durationSeconds: { type: Number },
    fileFormat: { type: String },
    submissionStatus: { type: String, enum: ['submitted', 'flagged', 'accepted'], default: 'submitted' },
    submissionDate: { type: Date, default: Date.now }
  },
  { timestamps: true }
);

module.exports = mongoose.model('VideoSubmission', videoSubmissionSchema);