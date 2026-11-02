const mongoose = require('mongoose');
const Registration = require('../models/Registration');
const Event = require('../models/Event');
const Notification = require('../models/Notification');

// ==========================================
// 1. CREATE REGISTRATION (FIXED OBJECTID CASTING)
// ==========================================
exports.createRegistration = async (req, res) => {
  try {
    const userId = req.user?._id || req.user?.id;
    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Unauthorized: User authentication token missing.',
      });
    }

    const {
      event,
      eventId,
      athletes,
      paymentOption,
      isLateRegistration,
      baseAmount,
      lateFee,
      totalAmountDue,
      totalAmountPaid,
      paidAmount,
      remainingBalance,
      transactionId,
      paymentDate,
      paymentSlipUrl,
      slipUrl,
      paymentSlip,
    } = req.body;

    // A. Validate Event ID
    const targetEventId = eventId || event;
    if (!targetEventId || !mongoose.Types.ObjectId.isValid(targetEventId)) {
      return res.status(400).json({
        success: false,
        message: 'Valid Event ID faraham karein.',
      });
    }

    const eventDoc = await Event.findById(targetEventId).lean();
    if (!eventDoc) {
      return res.status(404).json({
        success: false,
        message: 'Event database mein nahi mila.',
      });
    }

    // B. Validate & Sanitize Athletes (Extract pure ObjectIds for schema)
    if (!athletes || !Array.isArray(athletes) || athletes.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Kam se kam ek athlete ka record hona zaroori hai.',
      });
    }

    const sanitizedAthletes = athletes.map((a, idx) => {
      const rawCategories = a.categories || a.selectedCategories || [];

      // Extract only valid ObjectIds for Mongoose [ObjectId] schema
      const categoryObjectIds = rawCategories
        .map((c) => (typeof c === 'object' && c !== null ? c.categoryId || c._id || c.id : c))
        .filter((id) => id && mongoose.Types.ObjectId.isValid(String(id)))
        .map((id) => new mongoose.Types.ObjectId(String(id)));

      // Store first selected subCategory/division if schema has it
      const subCategoryName = rawCategories[0]?.subCategory || 'Standard Open';

      return {
        name: String(a.name || `Athlete ${idx + 1}`).trim(),
        age: Number(a.age) || 18,
        gender: a.gender || 'Male',
        cnic: String(a.cnic || 'N/A').trim(),
        selectedCategories: categoryObjectIds,
        categories: categoryObjectIds,
        subCategory: subCategoryName,
        division: subCategoryName,
      };
    });

    // C. Slip URL Validation
    const finalSlipUrl = paymentSlipUrl || slipUrl || paymentSlip || '';
    if (!finalSlipUrl) {
      return res.status(400).json({
        success: false,
        message: 'Payment slip upload lazmi hai.',
      });
    }

    // D. Safe Amounts
    const finalTotal = Number(totalAmountDue) || Number(req.body.totalAmount) || 0;
    const finalPaid =
      Number(totalAmountPaid) ||
      Number(paidAmount) ||
      (paymentOption === 'half' ? finalTotal / 2 : finalTotal);
    const finalRemaining =
      Number(remainingBalance) >= 0 ? Number(remainingBalance) : finalTotal - finalPaid;

    // E. Save Registration Document
    const registrationData = {
      eventId: targetEventId,
      event: targetEventId,
      userId: userId,
      user: userId,
      athletes: sanitizedAthletes,
      paymentOption: paymentOption || 'full',
      isLateRegistration: Boolean(isLateRegistration),
      baseAmount: Number(baseAmount) || 0,
      lateFee: Number(lateFee) || 0,
      totalAmountDue: finalTotal,
      totalAmountPaid: finalPaid,
      remainingBalance: finalRemaining,
      transactionId: String(transactionId || '').trim(),
      paymentDate: paymentDate ? new Date(paymentDate) : new Date(),
      paymentSlipUrl: finalSlipUrl,
      slipUrl: finalSlipUrl,
      paymentSlip: finalSlipUrl,
      paymentStatus: paymentOption === 'half' ? 'Partial' : 'Paid',
      status: 'Pending',
    };

    const newRegistration = await Registration.create(registrationData);

    return res.status(201).json({
      success: true,
      message: 'Registration successfully submit ho gayi hai!',
      data: newRegistration,
    });
  } catch (error) {
    console.error('Registration Error:', error);

    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map((val) => val.message);
      return res.status(400).json({
        success: false,
        message: `Validation Error: ${messages.join(', ')}`,
      });
    }

    if (error.name === 'CastError') {
      return res.status(400).json({
        success: false,
        message: `Invalid ID format for field: ${error.path}`,
      });
    }

    return res.status(500).json({
      success: false,
      message: error.message || 'Server Internal Error',
    });
  }
};

// ==========================================
// 2. GET MY REGISTRATIONS
// ==========================================
exports.getMyRegistrations = async (req, res) => {
  try {
    const userId = req.user?._id || req.user?.id;
    const registrations = await Registration.find({
      $or: [{ userId: userId }, { user: userId }],
    })
      .populate('eventId', 'title eventDate eventType status standardDeadline coverImageUrl')
      .populate('athletes.selectedCategories', 'name fee')
      .sort({ createdAt: -1 })
      .lean();

    return res.status(200).json({
      success: true,
      count: registrations.length,
      data: registrations,
    });
  } catch (error) {
    console.error('getMyRegistrations Error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.createRegistration = async (req, res) => {
  try {
    // 1. Aapki existing registration save logic
    const newRegistration = await Registration.create(req.body);

    // 2. TRIGGER: Admin ke liye real-time alert DB mein create karein
    await Notification.create({
      recipientRole: 'admin',
      title: 'New Team Registration',
      message: `Team "${newRegistration.teamName || 'New Team'}" ne ${newRegistration.eventTitle || 'Tournament'} ke liye ${newRegistration.athletes?.length || 0} athletes register kiye hain.`,
      type: 'registration',
      referenceId: newRegistration._id,
      isRead: false,
    });

    return res.status(201).json({
      success: true,
      data: newRegistration,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};