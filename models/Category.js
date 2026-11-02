const mongoose = require('mongoose');

const categorySchema = new mongoose.Schema(
  {
    eventId: { type: mongoose.Schema.Types.ObjectId, ref: 'Event', required: true },
    name: { type: String, required: true, trim: true },
    baseFee: { type: Number, required: true, default: 1000 },
    lateFee: { type: Number, default: 500 },
    baseFeeUSD: { type: Number, default: 20 },
    lateFeeUSD: { type: Number, default: 5 },
    lateFeeStartDate: { type: Date },
    subcategories: { type: [String], default: [] }, // e.g. ['Under 54 kg', 'Under 58 kg']
    status: { type: String, enum: ['active', 'upcoming', 'inactive'], default: 'active' },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Category', categorySchema);