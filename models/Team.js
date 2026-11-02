const mongoose = require('mongoose');

const memberSchema = new mongoose.Schema({
  name: { type: String, required: true },
  age: { type: Number },
  gender: { type: String, enum: ['male', 'female', 'other'] },
  role: { type: String, default: 'Member' }
});

const teamSchema = new mongoose.Schema(
  {
    teamHeadId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
      index: true
    },
    teamName: {
      type: String,
      required: [true, 'Team name is required'],
      trim: true
    },
    members: [memberSchema],
    contactPhone: { type: String }
  },
  { timestamps: true }
);

module.exports = mongoose.model('Team', teamSchema);