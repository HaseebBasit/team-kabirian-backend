const mongoose = require('mongoose');
const Registration = require('../models/Registration');
const Payment = require('../models/Payment');
const Event = require('../models/Event');
const Category = require('../models/Category');
const Team = require('../models/Team');
const VideoSubmission = require('../models/VideoSubmission');
const Result = require('../models/Result');

// 1. Dashboard Data Fetch
exports.getDashboardData = async (req, res) => {
  try {
    const userId = req.user._id;
    let team = await Team.findOne({ teamHeadId: userId });

    if (!team) {
      team = await Team.create({
        teamHeadId: userId,
        teamName: req.user.fullName || req.user.name ? `${req.user.fullName || req.user.name}'s Team` : 'My Team',
        contactPhone: req.user.phone || '0300-0000000',
        city: 'Karachi',
      });
    }

    const registrations = await Registration.find({ teamId: team._id })
      .populate('eventId', 'title eventType eventDate registrationDeadline status bankDetails bankName accountTitle accountNumber iban')
      .sort({ createdAt: -1 });

    const registrationIds = registrations.map((r) => r._id);
    const payments = await Payment.find({ registrationId: {$in: registrationIds } }).sort({ createdAt: -1 });
    const videos = await VideoSubmission.find({ teamId: team._id }).populate('categoryId', 'name');
    const results = await Result.find({ teamId: team._id, isPublished: true })
      .populate('eventId', 'title')
      .populate('categoryId', 'name');

    return res.status(200).json({
      success: true,
      data: {
        team,
        registrations: registrations || [],
        payments: payments || [],
        videos: videos || [],
        results: results || [],
      },
    });
  } catch (error) {
    console.error('getDashboardData Error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// 2. Smart Event Registration (Handles Duplicates & Updates Drafts)
exports.registerForEvent = async (req, res) => {
  try {
    const { eventId, players, paymentOption, totalSlots, totalAmountDue, ratePerSlot } = req.body;
    const userId = req.user._id;

    let team = await Team.findOne({ teamHeadId: userId });
    if (!team) {
      team = await Team.create({
        teamHeadId: userId,
        teamName: req.user.fullName || req.user.name ? `${req.user.fullName || req.user.name}'s Team` : 'My Team',
        contactPhone: req.user.phone || '0300-0000000',
        city: 'Karachi',
      });
    }

    let registration = await Registration.findOne({
      eventId,
      teamId: team._id,
      registrationStatus: 'pending_payment',
    });

    if (registration) {
      registration.players = players || [];
      registration.totalSlots = Number(totalSlots) || 0;
      registration.ratePerSlot = Number(ratePerSlot) || 0;
      registration.totalAmountDue = Number(totalAmountDue) || 0;
      registration.remainingBalance = Number(totalAmountDue) || 0;
      registration.paymentOption = paymentOption || 'full';
      await registration.save();
    } else {
      registration = await Registration.create({
        eventId,
        teamId: team._id,
        teamHeadId: userId,
        players: players || [],
        totalSlots: Number(totalSlots) || 0,
        ratePerSlot: Number(ratePerSlot) || 0,
        totalAmountDue: Number(totalAmountDue) || 0,
        totalAmountPaid: 0,
        remainingBalance: Number(totalAmountDue) || 0,
        paymentOption: paymentOption || 'full',
        registrationStatus: 'pending_payment',
        status: 'pending_payment',
      });
    }

    return res.status(201).json({
      success: true,
      message: 'Registration draft save ho gayi.',
      data: registration,
    });
  } catch (error) {
    console.error('registerForEvent Error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// 3. Submit Payment Proof
exports.submitPaymentProof = async (req, res) => {
  try {
    const {
      registrationId,
      categoryId,
      paymentType,
      amount,
      transactionId,
      paymentDate,
      cloudinaryPublicId,
      cloudinaryUrl,
    } = req.body;

    const registration = await Registration.findById(registrationId);
    if (!registration) {
      return res.status(404).json({ success: false, message: 'Registration record nahi mila' });
    }

    let resolvedCategoryId = categoryId || registration.categoryId || null;
    if (!resolvedCategoryId && registration.players?.[0]?.selectedCategories?.[0]?.categoryId) {
      resolvedCategoryId = registration.players[0].selectedCategories[0].categoryId;
    }

    const payment = await Payment.create({
      registrationId: registration._id,
      teamId: registration.teamId,
      eventId: registration.eventId,
      ...(resolvedCategoryId && { categoryId: resolvedCategoryId }),
      paymentType: paymentType || 'full',
      amount: Number(amount) || 0,
      transactionId: transactionId || `TXN-${Date.now()}`,
      paymentDate: new Date(paymentDate || Date.now()),
      cloudinaryPublicId,
      cloudinaryUrl,
      status: 'pending',
    });

    registration.paymentProofUrl = cloudinaryUrl;
    registration.paymentOption = paymentType || 'full';
    registration.lastPaymentAmount = Number(amount) || 0;
    registration.lastTransactionId = transactionId || `TXN-${Date.now()}`;
    registration.registrationStatus = 'under_review';
    registration.status = 'under_review';
    await registration.save();

    return res.status(201).json({
      success: true,
      message: 'Payment proof submit ho gaya hai.',
      data: payment,
    });
  } catch (error) {
    console.error('submitPaymentProof Error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// 4. Submit Video
exports.submitVideo = async (req, res) => {
  try {
    const { registrationId, categoryId, cloudinaryPublicId, cloudinaryUrl, durationSeconds, fileFormat } = req.body;

    const registration = await Registration.findById(registrationId).populate('eventId');
    if (!registration) {
      return res.status(404).json({ success: false, message: 'Registration nahi mili' });
    }

    const videoSubmission = await VideoSubmission.create({
      registrationId: registration._id,
      eventId: registration.eventId._id,
      categoryId,
      teamId: registration.teamId,
      cloudinaryPublicId,
      cloudinaryUrl,
      durationSeconds,
      fileFormat,
    });

    return res.status(201).json({
      success: true,
      message: 'Video upload kamyabi se save ho gayi.',
      data: videoSubmission,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// 5. Update Team Members
exports.updateTeamMembers = async (req, res) => {
  try {
    const { members } = req.body;
    const team = await Team.findOneAndUpdate(
      { teamHeadId: req.user._id },
      { members },
      { new: true, runValidators: true }
    );
    return res.status(200).json({ success: true, data: team });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// 6. Get Team Head Notifications (Approvals, Results, Slips & Video Unlocks)
exports.getPortalNotifications = async (req, res) => {
  try {
    const userId = req.user._id;
    const team = await Team.findOne({ teamHeadId: userId }).lean();

    // Team head ki tamam registrations fetch karein
    const queryConditions = [{ teamHeadId: userId }, { userId: userId }];
    if (team?._id) queryConditions.push({ teamId: team._id });

    const myRegistrations = await Registration.find({$or: queryConditions })
      .populate('eventId', 'title eventType')
      .sort({ updatedAt: -1 })
      .lean();

    let notifications = [];

    myRegistrations.forEach((reg) => {
      const eventTitle = reg.eventId?.title || reg.eventTitle || 'Championship Tournament';
      const eventType = (reg.eventId?.eventType || reg.eventType || '').toLowerCase();
      const isOnlineEvent = eventType === 'online';

      const regStatus = (reg.registrationStatus || reg.status || '').toLowerCase();
      const isApproved = regStatus === 'approved';
      const isRejected = regStatus === 'rejected';
      const isHalf = (reg.paymentOption || '').toLowerCase() === 'half';
      const hasRemainingSlip = Boolean(reg.remainingSlipUrl || reg.remainingPaymentSlipUrl);
      const isVideoUnlocked = Boolean(reg.isVideoUnlocked || reg.videoUnlocked || isApproved);

      // A. Registration Approval / Rejection Notification
      if (isApproved) {
        notifications.push({
          _id: `${reg._id}-approved`,
          title: 'Registration Approved & Verified',
          message: `Aapki team ki registration "${eventTitle}" ke liye officially approve ho chuki hai. Accreditation pass active hai.`,
          type: 'approval',
          isRead: false,
          createdAt: reg.updatedAt || reg.createdAt,
        });
      } else if (isRejected) {
        notifications.push({
          _id: `${reg._id}-rejected`,
          title: 'Registration Rejected',
          message: `"${eventTitle}" ke liye registration review reject ho gaya hai. Kripya payment slip check karein.`,
          type: 'rejection',
          isRead: false,
          createdAt: reg.updatedAt || reg.createdAt,
        });
      }

      // B. Payment / Slip Verification Notification
      if (reg.paymentProofUrl || reg.paymentSlipUrl) {
        notifications.push({
          _id: `${reg._id}-slip-submitted`,
          title: 'Payment Slip Submitted',
          message: `Batch #TLP-${String(reg._id).slice(-8).toUpperCase()} ki payment slip verification queue mein hai.`,
          type: 'payment',
          isRead: isApproved,
          createdAt: reg.createdAt,
        });
      }

      if (isHalf && hasRemainingSlip) {
        notifications.push({
          _id: `${reg._id}-remaining-slip`,
          title: 'Remaining Balance Slip Verified',
          message: `Batch #TLP-${String(reg._id).slice(-8).toUpperCase()} ki remaining balance slip submit ho chuki hai.`,
          type: 'payment',
          isRead: false,
          createdAt: reg.updatedAt || reg.createdAt,
        });
      }

      // C. Video Submission Portal Unlock Notification
      // SHART: Yeh notification sirf aur sirf ONLINE event hone par hi aayega
      if (isOnlineEvent && isVideoUnlocked) {
        notifications.push({
          _id: `${reg._id}-video-unlocked`,
          title: 'Video Submissions Unlocked 🔓',
          message: `"${eventTitle}" (Online Event) ke liye online video submissions unlock kar di gayi hain. Athletes ke routine videos upload karein.`,
          type: 'video_unlock',
          isRead: false,
          createdAt: reg.updatedAt || reg.createdAt,
        });
      }
    });

    // D. Published Results Notifications (Team-specific + Latest Live)
    let publishedResults = [];
    if (team?._id) {
      publishedResults = await Result.find({ teamId: team._id, isPublished: true })
        .populate('eventId', 'title')
        .sort({ updatedAt: -1 })
        .limit(10)
        .lean();
    }

    if (publishedResults.length === 0) {
      publishedResults = await Result.find({ isPublished: true })
        .populate('eventId', 'title')
        .sort({ updatedAt: -1 })
        .limit(6)
        .lean();
    }

    publishedResults.forEach((resItem) => {
      notifications.push({
        _id: `${resItem._id}-result`,
        title: 'Official Result Announced 🏆',
        message: `Player "${resItem.playerName}" (${resItem.teamName || 'Team'}) ka official result announce ho gaya hai: Position ${resItem.position || 'Medal Awarded'}.`,
        type: 'result',
        isRead: false,
        createdAt: resItem.updatedAt || resItem.createdAt,
      });
    });

    // Newest first sorting
    notifications.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    return res.status(200).json({
      success: true,
      count: notifications.length,
      data: notifications,
    });
  } catch (err) {
    console.error('getPortalNotifications Error:', err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

// 7. Mark All Notifications as Read
exports.markPortalNotificationsRead = async (req, res) => {
  try {
    const Notification = mongoose.models.Notification || null;
    if (Notification) {
      await Notification.updateMany(
        {$or: [{ userId: req.user._id }, { teamHeadId: req.user._id }], isRead: false },
        {$set: { isRead: true } }
      );
    }
    return res.status(200).json({
      success: true,
      message: 'All notifications marked as read',
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};