const mongoose = require('mongoose');

const resultSchema = new mongoose.Schema(
  {
    eventId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Event',
      required: true,
    },
    categoryId: {
      type: String,
      default: '',
    },
    categoryName: {
      type: String,
      default: 'General',
    },
    subCategory: {
      type: String,
      default: 'Open',
    },
    teamName: {
      type: String,
      default: '',
    },
    playerName: {
      type: String,
      required: true,
      trim: true,
    },
    position: {
      type: String,
      required: true,
    },
    score: {
      type: String,
      default: '',
    },
    isPublished: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
    strict: false,
  }
);

module.exports = mongoose.models.Result || mongoose.model('Result', resultSchema);