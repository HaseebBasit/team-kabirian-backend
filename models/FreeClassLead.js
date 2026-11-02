// backend/models/FreeClassLead.js
const mongoose = require('mongoose');

const freeClassLeadSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, lowercase: true, trim: true },
    phone: { type: String, default: '', trim: true },
    age: { type: Number, min: 3, max: 100 },
    city: { type: String },
    interests: [{ type: String }],
    subject: { type: String, trim: true, maxlength: 160 },
    message: { type: String, trim: true, maxlength: 5000 },
    source: { type: String, trim: true, default: 'free-class' },
    emailSentToAdmin: { type: Boolean, default: false }
  },
  { timestamps: true }
);

module.exports = mongoose.model('FreeClassLead', freeClassLeadSchema);
