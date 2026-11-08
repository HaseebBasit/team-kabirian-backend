const mongoose = require('mongoose');

const registrationSchema = new mongoose.Schema(
  {
    eventId: { type: mongoose.Schema.Types.Mixed, ref: 'Event', required: true },
    teamId: { type: mongoose.Schema.Types.Mixed, ref: 'Team' },
    userId: { type: mongoose.Schema.Types.Mixed, ref: 'User', required: true },

    teamName: { type: String },
    coachName: { type: String },
    coachPhone: { type: String },
    coachEmail: { type: String },
    phone: { type: String },
    email: { type: String },

    // Athletes with complete Category, Division, Belt & Video persistence
    athletes: [
      {
        name: { type: String, required: true },
        gender: { type: String, default: 'Male' },
        age: { type: Number },
        cnic: { type: String },
        cnicOrBForm: { type: String },
        subCategory: { type: String, default: 'white' },
        division: { type: String, default: 'white' },
        subDivision: { type: String, default: 'white' },
        belt: { type: String, default: 'white' },
        categoryName: { type: String },
        selectedCategories: [
          { type: mongoose.Schema.Types.Mixed },
        ],
        categories: [
          { type: mongoose.Schema.Types.Mixed },
        ],
        // Persistent video links
        videoUrl: { type: String, default: '' },
        submissionVideoUrl: { type: String, default: '' },
        youtubeUrl: { type: String, default: '' },
        youtubeId: { type: String, default: '' },
        videoStatus: { type: String, default: 'pending' },
        submissionDate: { type: Date },
      },
    ],

    totalAthletes: { type: Number, default: 0 },
    athletesCount: { type: Number, default: 0 },
    categories: [{ type: mongoose.Schema.Types.Mixed }],

    // Payment Details
    paymentOption: { type: String, default: 'full' },
    totalAmountDue: { type: Number, default: 0 },
    totalAmountPaid: { type: Number, default: 0 },
    remainingBalance: { type: Number, default: 0 },

    // Payment Slips & Proofs
    transactionId: { type: String, default: 'DRAFT' },
    paymentDate: { type: Date, default: Date.now },
    paymentSlipUrl: { type: String, default: '' },
    slipUrl: { type: String, default: '' },
    receiptUrl: { type: String, default: '' },
    proofUrl: { type: String, default: '' },
    paymentProofUrl: { type: String, default: '' },

    // Secondary / Remaining Payment Slips
    remainingSlipUrl: { type: String },
    remainingPaymentSlipUrl: { type: String },
    remainingTransactionId: { type: String },
    remainingPaymentDate: { type: Date },

    // Root-level video fallback
    videoSubmissionUrl: { type: String, default: '' },

    registrationStatus: {
      type: String,
      default: 'under_review',
    },
    status: { type: String, default: 'under_review' },
    paymentStatus: { type: String, default: 'Pending' },
  },
  {
    timestamps: true,
    strict: false,
  }
);

module.exports = mongoose.model('Registration', registrationSchema);
