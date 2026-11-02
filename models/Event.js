const mongoose = require('mongoose');

const eventSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    slug: {
      type: String,
      unique: true,
      sparse: true,
      default: function () {
        return 'event-' + Date.now() + '-' + Math.random().toString(36).substring(2, 8);
      },
    },
    description: { type: String, default: '' },
    coverImageUrl: { type: String, default: '' },
    ruleBookPdfUrl: { type: String, default: '' },
    ruleBookText: { type: String, default: '' },
    eventType: { type: String, enum: ['online', 'physical'], default: 'online' },
    eventDate: { type: Date, required: true },
    standardDeadline: { type: Date },
    lateFeeStartDate: { type: Date },
    registrationDeadline: { type: Date, required: true },
    lateFee: { type: Number, default: 0 },
    bankName: { type: String, default: '' },
    accountTitle: { type: String, default: '' },
    accountNumber: { type: String, default: '' },
    iban: { type: String, default: '' },
    bankDetails: {
      bankName: { type: String, default: '' },
      accountTitle: { type: String, default: '' },
      accountNumber: { type: String, default: '' },
      iban: { type: String, default: '' },
      qrCodeUrl: { type: String, default: '' },
    },
    status: { type: String, enum: ['upcoming', 'live', 'closed', 'ended'], default: 'upcoming' },
    categories: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Category' }],
  },
  { timestamps: true }
);

// MongoDB se purana stale slug_1 index automatically remove karein
mongoose.connection.on('open', async () => {
  try {
    await mongoose.connection.collection('events').dropIndex('slug_1');
    console.log('[MongoDB] Stale slug_1 index removed successfully.');
  } catch (err) {
    // Agar index pehle hi remove ho chuka ho, safely ignore karein
  }
});

const Event = mongoose.model('Event', eventSchema);

module.exports = Event;