const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');

// Models
const Event = require('../models/Event');
const Category = require('../models/Category');
const Registration = require('../models/Registration');
const Notification = require('../models/Notification');
const portalController = require('../controllers/portalController');
const videoController = require('../controllers/videoController');
const videoUpload = require('../middlewares/videoUploadMiddleware');
const { extractYouTubeId } = require('../utils/youtubeService');

// Middlewares
const { protect } = require('../middlewares/authMiddleware');

// Helper to enrich athletes in registrations with human-readable category details
const enrichRegistrationsWithCategories = async (registrations) => {
  if (!Array.isArray(registrations) || registrations.length === 0) return registrations;

  try {
    const allCategories = await Category.find().select('_id name title eventId subcategories subCategories fee').lean();
    const categoryMap = {};
    allCategories.forEach((cat) => {
      const idStr = cat._id ? cat._id.toString() : '';
      if (idStr) {
        categoryMap[idStr] = cat.name || cat.title || '';
      }
    });

    const isHexId = (str) => typeof str === 'string' && /^[0-9a-fA-F]{24}$/.test(str.trim());

    return registrations.map((reg) => {
      if (!Array.isArray(reg.athletes)) return reg;
      const enrichedAthletes = reg.athletes.map((ath) => {
        let catName = ath.categoryName || '';

        const rawCats = Array.isArray(ath.selectedCategories) && ath.selectedCategories.length > 0
          ? ath.selectedCategories
          : Array.isArray(ath.categories) && ath.categories.length > 0
          ? ath.categories
          : [];

        if (!catName || isHexId(catName)) {
          if (catName && isHexId(catName) && categoryMap[catName.trim()]) {
            catName = categoryMap[catName.trim()];
          } else {
            for (const item of rawCats) {
              const id = typeof item === 'object' && item !== null
                ? (item.categoryId || item._id || item.id || '').toString()
                : (item || '').toString();
              if (id && categoryMap[id]) {
                catName = categoryMap[id];
                break;
              }
              if (typeof item === 'object' && item !== null && (item.name || item.categoryName)) {
                const nameCandidate = item.name || item.categoryName;
                if (!isHexId(nameCandidate)) {
                  catName = nameCandidate;
                  break;
                }
              }
            }
          }
        }

        const normalizedCategories = rawCats.map((item) => {
          if (typeof item === 'object' && item !== null) {
            const id = (item.categoryId || item._id || item.id || '').toString();
            const resolvedName = (item.name && !isHexId(item.name))
              ? item.name
              : (item.categoryName && !isHexId(item.categoryName))
              ? item.categoryName
              : (categoryMap[id] || id);
            const resolvedSub = item.subCategory || item.selectedSubcategory || item.division || item.subDivision || ath.subCategory || 'Standard Open';
            return {
              ...item,
              categoryId: id,
              name: resolvedName,
              categoryName: resolvedName,
              subCategory: resolvedSub,
              division: resolvedSub,
            };
          }
          const idStr = String(item || '').trim();
          const resolvedName = categoryMap[idStr] || idStr;
          return {
            categoryId: idStr,
            name: resolvedName,
            categoryName: resolvedName,
            subCategory: ath.subCategory || ath.belt || 'Standard Open',
            division: ath.subCategory || ath.belt || 'Standard Open',
          };
        });

        const fallbackCatName = normalizedCategories[0]?.name && !isHexId(normalizedCategories[0]?.name)
          ? normalizedCategories[0]?.name
          : ath.belt && ath.belt.trim().toUpperCase() !== 'WHITE'
          ? ath.belt
          : 'General Category';

        return {
          ...ath,
          categoryName: (catName && !isHexId(catName)) ? catName : fallbackCatName,
          selectedCategories: normalizedCategories,
          categories: normalizedCategories,
        };
      });

      return {
        ...reg,
        athletes: enrichedAthletes,
      };
    });
  } catch (enrichErr) {
    console.error('Error enriching registrations with categories:', enrichErr);
    return registrations;
  }
};

// ==========================================
// 1. GET PORTAL DASHBOARD DATA
// @route GET /api/v1/portal/dashboard
// ==========================================
router.get('/dashboard', protect, async (req, res) => {
  try {
    const userId = req.user._id || req.user.id;

    const events = await Event.find({
      status: { $in: ['live', 'upcoming'] },
    })
      .sort({ eventDate: 1 })
      .lean();

    const myRegistrations = await Registration.find({
      $or: [
        { userId: userId },
        { user: userId },
        { 'teamId.userId': userId },
        { createdBy: userId },
      ],
    })
      .populate('eventId', 'title eventDate eventType status standardDeadline coverImageUrl')
      .sort({ createdAt: -1 })
      .lean();

    const enrichedMyRegistrations = await enrichRegistrationsWithCategories(myRegistrations);

    const totalRegistrations = enrichedMyRegistrations.length;
    const pendingPayments = enrichedMyRegistrations.filter(
      (r) =>
        r.registrationStatus === 'under_review' ||
        r.registrationStatus === 'pending_payment' ||
        r.paymentOption === 'half'
    ).length;
    const approved = enrichedMyRegistrations.filter(
      (r) => r.registrationStatus === 'approved'
    ).length;
    const upcomingEventsCount = events.length;

    return res.status(200).json({
      success: true,
      data: {
        user: {
          name: req.user.name || req.user.fullName || 'Team Head',
          email: req.user.email,
          role: req.user.role || 'team_head',
        },
        metrics: {
          totalRegistrations,
          pendingPayments,
          approved,
          upcomingEventsCount,
        },
        events,
        myRegistrations: enrichedMyRegistrations,
      },
    });
  } catch (error) {
    console.error('Portal Dashboard Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to load portal dashboard data.',
      error: error.message,
    });
  }
});

// ==========================================
// 2. GET ALL EVENTS WITH CATEGORIES
// @route GET /api/v1/portal/events
// ==========================================
router.get('/events', protect, async (req, res) => {
  try {
    const [events, allCategories] = await Promise.all([
      Event.find({
        status: { $in: ['live', 'upcoming', 'completed'] },
      })
        .sort({ eventDate: 1 })
        .lean(),
      Category.find().lean(),
    ]);

    const populatedEvents = events.map((ev) => {
      const evIdStr = ev._id.toString();

      let matched = allCategories.filter((c) => {
        if (!c.eventId) return false;
        const cEvId = c.eventId._id ? c.eventId._id.toString() : c.eventId.toString();
        return cEvId === evIdStr;
      });

      if (!matched.length && Array.isArray(ev.categories) && ev.categories.length > 0) {
        const idStrings = ev.categories.map((c) => (c._id ? c._id.toString() : c.toString()));
        matched = allCategories.filter((c) => idStrings.includes(c._id.toString()));
      }

      const enrichedCategories = matched.map((c) => ({
        ...c,
        fee: c.fee !== undefined ? c.fee : (c.baseFee !== undefined ? c.baseFee : 1000),
        price: c.price !== undefined ? c.price : (c.baseFee !== undefined ? c.baseFee : 1000),
        entryFee: c.entryFee !== undefined ? c.entryFee : (c.baseFee !== undefined ? c.baseFee : 1000),
        baseFee: c.baseFee !== undefined ? c.baseFee : (c.fee !== undefined ? c.fee : 1000),
        subCategories: c.subcategories || c.subCategories || [],
        subcategories: c.subcategories || c.subCategories || [],
      }));

      const bName = ev.bankName || ev.bankDetails?.bankName || '';
      const aTitle = ev.accountTitle || ev.bankDetails?.accountTitle || '';
      const aNum = ev.accountNumber || ev.bankDetails?.accountNumber || '';
      const ib = ev.iban || ev.bankDetails?.iban || '';

      return {
        ...ev,
        bankName: bName,
        accountTitle: aTitle,
        accountNumber: aNum,
        iban: ib,
        bankDetails: {
          bankName: bName,
          accountTitle: aTitle,
          accountNumber: aNum,
          iban: ib,
          qrCodeUrl: ev.bankDetails?.qrCodeUrl || '',
        },
        categories: enrichedCategories,
      };
    });

    return res.status(200).json({
      success: true,
      data: populatedEvents,
    });
  } catch (error) {
    console.error('Portal Events Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch tournaments.',
      error: error.message,
    });
  }
});

// ==========================================
// 3. GET TEAM HEAD REGISTRATIONS
// @route GET /api/v1/portal/registrations
// ==========================================
router.get('/registrations', protect, async (req, res) => {
  try {
    const userId = req.user._id || req.user.id;
    const registrations = await Registration.find({
      $or: [
        { userId: userId },
        { user: userId },
        { 'teamId.userId': userId },
        { createdBy: userId },
      ],
    })
      .populate('eventId', 'title eventDate eventType status standardDeadline coverImageUrl bankName accountTitle accountNumber iban bankDetails')
      .populate('athletes.selectedCategories', 'name fee')
      .sort({ createdAt: -1 })
      .lean();

    const enrichedRegistrations = await enrichRegistrationsWithCategories(registrations);

    return res.status(200).json({
      success: true,
      count: enrichedRegistrations.length,
      data: enrichedRegistrations,
    });
  } catch (error) {
    console.error('Portal Get Registrations Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch registrations.',
      error: error.message,
    });
  }
});

// ==========================================
// 4. SUBMIT REGISTRATION
// @route POST /api/v1/portal/registrations
// ==========================================
router.post('/registrations', protect, async (req, res) => {
  try {
    const userId = req.user._id || req.user.id;
    const {
      eventId,
      athletes,
      paymentOption,
      transactionId,
      paymentDate,
      paymentSlipUrl,
      slipUrl,
      baseAmount,
      lateFee,
      isLateRegistration,
      totalAmountDue: clientTotalDue,
      totalAmountPaid: clientTotalPaid,
      remainingBalance: clientRemaining,
    } = req.body;

    let parsedAthletes = athletes;
    if (typeof athletes === 'string') {
      try {
        parsedAthletes = JSON.parse(athletes);
      } catch (e) {
        parsedAthletes = [];
      }
    }

    if (!eventId || !parsedAthletes || parsedAthletes.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Event ID and at least one athlete are required.',
      });
    }

    const allCategories = await Category.find().select('_id name title').lean();
    const catMap = {};
    allCategories.forEach((c) => {
      const idStr = c._id ? c._id.toString() : '';
      if (idStr) {
        catMap[idStr] = c.name || c.title || '';
      }
    });

    const isHexId = (str) => typeof str === 'string' && /^[0-9a-fA-F]{24}$/.test(str.trim());

    const sanitizedAthletes = parsedAthletes.map((ath, idx) => {
      const rawCategories = ath.selectedCategories || ath.categories || [];

      const categoryObjectIds = rawCategories
        .map((c) => {
          if (typeof c === 'object' && c !== null) {
            return c.categoryId || c._id || c.id;
          }
          return c;
        })
        .filter((id) => id && mongoose.Types.ObjectId.isValid(String(id)))
        .map((id) => new mongoose.Types.ObjectId(String(id)));

      let catName = ath.categoryName || '';
      if (!catName || isHexId(catName)) {
        if (catName && isHexId(catName) && catMap[catName.trim()]) {
          catName = catMap[catName.trim()];
        } else if (rawCategories[0]) {
          const firstRaw = rawCategories[0];
          if (typeof firstRaw === 'object' && firstRaw !== null) {
            catName = firstRaw.categoryName || firstRaw.name || '';
          }
          if ((!catName || isHexId(catName)) && categoryObjectIds[0]) {
            catName = catMap[categoryObjectIds[0].toString()] || '';
          }
        }
      }

      const subDivisionName =
        rawCategories[0]?.subCategory || rawCategories[0]?.division || ath.belt || 'Standard Open';

      const detailedCategories = rawCategories.map((c) => {
        if (typeof c === 'object' && c !== null) {
          const cIdStr = (c.categoryId || c._id || c.id || '').toString();
          const cName = (c.categoryName && !isHexId(c.categoryName))
            ? c.categoryName
            : (c.name && !isHexId(c.name))
            ? c.name
            : (catMap[cIdStr] || 'Category');
          const cSub = c.subCategory || c.selectedSubcategory || c.division || ath.subCategory || ath.belt || 'Standard Open';
          return {
            categoryId: cIdStr,
            _id: cIdStr,
            id: cIdStr,
            categoryName: cName,
            name: cName,
            subCategory: cSub,
            selectedSubcategory: cSub,
            division: cSub,
            fee: Number(c.fee) || 0,
            lateFee: Number(c.lateFee) || 0,
          };
        }
        const cIdStr = String(c || '').trim();
        const cName = catMap[cIdStr] || 'Category';
        return {
          categoryId: cIdStr,
          _id: cIdStr,
          id: cIdStr,
          categoryName: cName,
          name: cName,
          subCategory: ath.subCategory || ath.belt || 'Standard Open',
          selectedSubcategory: ath.subCategory || ath.belt || 'Standard Open',
          division: ath.subCategory || ath.belt || 'Standard Open',
          fee: 0,
          lateFee: 0,
        };
      });

      return {
        name: String(ath.name || `Athlete ${idx + 1}`).trim(),
        age: Number(ath.age) || 18,
        gender: ath.gender || 'Male',
        cnic: String(ath.cnic || 'N/A').trim(),
        categoryName: catName || (detailedCategories[0]?.categoryName || 'General Category'),
        selectedCategories: detailedCategories.length > 0 ? detailedCategories : categoryObjectIds,
        categories: detailedCategories.length > 0 ? detailedCategories : categoryObjectIds,
        subCategory: subDivisionName,
        division: subDivisionName,
        belt: ath.belt || 'white',
        videoUrl: '',
        submissionVideoUrl: '',
        videoStatus: 'pending',
      };
    });

    const finalTotalDue = Number(clientTotalDue) || Number(req.body.totalAmount) || 0;
    const isFullPayment = paymentOption !== 'half';
    const finalAmountPaid = clientTotalPaid
      ? Number(clientTotalPaid)
      : isFullPayment
      ? finalTotalDue
      : finalTotalDue / 2;
    const finalRemaining =
      clientRemaining !== undefined
        ? Number(clientRemaining)
        : finalTotalDue - finalAmountPaid;

    const isDraft =
      req.body.isDraft === true ||
      req.body.isDraft === 'true' ||
      paymentOption === 'pay_later' ||
      paymentOption === 'draft' ||
      req.body.registrationStatus === 'draft' ||
      req.body.status === 'draft';

    const finalSlip = paymentSlipUrl || slipUrl || req.body.paymentSlip || '';

    const newRegistration = await Registration.create({
      eventId,
      userId,
      teamName: req.user.teamName || req.user.name || `${req.user.name}'s Team`,
      coachName: req.user.name || 'Head Coach',
      coachPhone: req.user.phone || req.user.phoneNumber || '',
      coachEmail: req.user.email || '',
      phone: req.user.phone || req.user.phoneNumber || '',
      email: req.user.email || '',
      totalAthletes: sanitizedAthletes.length,
      athletesCount: sanitizedAthletes.length,
      athletes: sanitizedAthletes,
      paymentOption: isDraft ? 'full' : (paymentOption || 'full'),
      isLateRegistration: Boolean(isLateRegistration),
      baseAmount: Number(baseAmount) || 0,
      lateFee: Number(lateFee) || 0,
      totalAmountDue: finalTotalDue,
      totalAmountPaid: isDraft ? 0 : finalAmountPaid,
      remainingBalance: isDraft ? finalTotalDue : finalRemaining,
      transactionId: transactionId || (isDraft ? 'DRAFT' : 'N/A'),
      paymentDate: paymentDate ? new Date(paymentDate) : new Date(),
      paymentSlipUrl: finalSlip,
      slipUrl: finalSlip,
      receiptUrl: finalSlip,
      proofUrl: finalSlip,
      paymentProof: finalSlip,
      paymentSlip: finalSlip,
      registrationStatus: isDraft ? 'draft' : 'under_review',
      status: isDraft ? 'draft' : 'under_review',
      paymentStatus: isDraft ? 'unpaid' : 'Pending',
    });

    try {
      if (!isDraft) await Notification.create({
        title: 'New Team Registration',
        message: `${req.user.name || 'A team'} has registered ${sanitizedAthletes.length} athletes.`,
        type: 'registration',
        eventId: eventId,
        registrationId: newRegistration._id,
        isRead: false,
        read: false,
      });
    } catch (notifErr) {
      console.warn('Notification log skipped:', notifErr.message);
    }

    return res.status(201).json({
      success: true,
      message: isDraft ? 'Registration draft saved successfully! You can pay later.' : 'Registration submitted successfully!',
      data: newRegistration,
    });
  } catch (error) {
    console.error('Portal Registration Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to submit registration.',
      error: error.message,
    });
  }
});

// ==========================================
// 5. UPDATE ATHLETE VIDEO (SAVES PERMANENTLY TO DB)
// Supports both direct PUT & /portal/ alias paths
// ==========================================
const saveAthleteVideoHandler = async (req, res) => {
  try {
    const { videoUrl, athleteId, athleteIndex, athleteName } = req.body;
    const { regId } = req.params;

    if (!videoUrl) {
      return res.status(400).json({ success: false, message: 'videoUrl lazmi hai' });
    }

    const reg = await Registration.findById(regId);
    if (!reg) {
      return res.status(404).json({ success: false, message: 'Registration nahi mili' });
    }

    const extractedYtId = extractYouTubeId(videoUrl);
    const finalVideoUrl = extractedYtId ? `https://www.youtube.com/watch?v=${extractedYtId}` : videoUrl.trim();
    const finalYoutubeId = extractedYtId || '';

    let updated = false;

    if (Array.isArray(reg.athletes) && reg.athletes.length > 0) {
      // 1. Athlete ID se match karein
      if (athleteId) {
        reg.athletes.forEach((ath) => {
          if (ath._id && String(ath._id) === String(athleteId)) {
            ath.videoUrl = finalVideoUrl;
            ath.submissionVideoUrl = finalVideoUrl;
            ath.youtubeUrl = finalVideoUrl;
            ath.youtubeId = finalYoutubeId;
            ath.videoStatus = 'submitted';
            ath.submissionDate = new Date();
            updated = true;
          }
        });
      }

      // 2. Index se match karein
      if (!updated && athleteIndex !== undefined && reg.athletes[Number(athleteIndex)]) {
        const targetAth = reg.athletes[Number(athleteIndex)];
        targetAth.videoUrl = finalVideoUrl;
        targetAth.submissionVideoUrl = finalVideoUrl;
        targetAth.youtubeUrl = finalVideoUrl;
        targetAth.youtubeId = finalYoutubeId;
        targetAth.videoStatus = 'submitted';
        targetAth.submissionDate = new Date();
        updated = true;
      }

      // 3. Name se match karein
      if (!updated && athleteName) {
        const targetAth = reg.athletes.find(
          (a) => a.name && a.name.trim().toLowerCase() === String(athleteName).trim().toLowerCase()
        );
        if (targetAth) {
          targetAth.videoUrl = finalVideoUrl;
          targetAth.submissionVideoUrl = finalVideoUrl;
          targetAth.youtubeUrl = finalVideoUrl;
          targetAth.youtubeId = finalYoutubeId;
          targetAth.videoStatus = 'submitted';
          targetAth.submissionDate = new Date();
          updated = true;
        }
      }
    }

    // Yahan se reg.videoSubmissionUrl = videoUrl HATA DI HAI taake cross-attach na ho

    reg.markModified('athletes');
    await reg.save();

    return res.status(200).json({
      success: true,
      message: 'Video sirf mutalqa athlete ke liye save ho gayi!',
      videoUrl: finalVideoUrl,
      youtubeId: finalYoutubeId,
      data: reg,
    });
  } catch (err) {
    console.error('Video update error:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
};
// PUT /api/v1/portal/registrations/:regId/payment-status
router.put('/registrations/:regId/payment-status', protect, async (req, res) => {
  try {
    const { regId } = req.params;
    const { status, customAmount } = req.body;

    const reg = await Registration.findById(regId);
    if (!reg) {
      return res.status(404).json({ success: false, message: 'Registration record nahi mila.' });
    }

    // 1. Status update karein
    if (status) {
      reg.registrationStatus = status;
      reg.status = status;
      reg.paymentStatus = status === 'approved' ? 'Paid' : status === 'rejected' ? 'Rejected' : 'Pending';
    }

    // 2. Manual Custom Amount update karein (Agar admin ne amount change ki ho)
    if (customAmount !== undefined && customAmount !== null && !isNaN(customAmount)) {
      const newAmt = Number(customAmount);
      reg.totalAmountPaid = newAmt;
      reg.totalAmountDue = newAmt;
      reg.remainingBalance = 0; // Agar full approve kar rahe hain toh remaining 0
    }

    await reg.save();

    return res.status(200).json({
      success: true,
      message: 'Payment details kamyabi se update ho gayi hain!',
      data: reg,
    });
  } catch (error) {
    console.error('Payment update error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

// ==========================================
// ATTACH PAYMENT TO DRAFT (DYNAMIC LATE FEE RECALCULATION)
// @route POST /api/v1/portal/registrations/:id/pay
// ==========================================
router.post('/registrations/:id/pay', protect, async (req, res) => {
  try {
    const userId = req.user._id || req.user.id;
    const { id } = req.params;
    const {
      transactionId,
      paymentDate,
      paymentSlipUrl,
      slipUrl,
      paymentOption,
    } = req.body;

    const reg = await Registration.findOne({
      _id: id,
      $or: [
        { userId: userId },
        { user: userId },
        { 'teamId.userId': userId },
        { createdBy: userId },
      ],
    });

    if (!reg) {
      return res.status(404).json({ success: false, message: 'Registration record nahi mila.' });
    }

    const event = await Event.findById(reg.eventId);

    // Dynamic Late Fee Calculation Rule:
    // Even if registration was drafted during the standard deadline window,
    // if today (payment time) >= lateFeeStartDate or > standardDeadline,
    // late fee MUST apply!
    let isLateNow = false;
    if (event) {
      if (event.isLateRegistration === true || event.isLateFeeActive === true || event.isLate === true) {
        isLateNow = true;
      }
      const lateStartDateStr = event.lateRegistrationStartDate || event.lateFeeStartDate || event.lateStartDate;
      if (lateStartDateStr) {
        const lateStart = new Date(lateStartDateStr);
        if (!isNaN(lateStart.getTime()) && new Date() >= lateStart) {
          isLateNow = true;
        }
      }
      const standardDeadlineStr = event.standardDeadline || event.regularDeadline || event.registrationDeadline;
      if (standardDeadlineStr) {
        const standardDeadline = new Date(standardDeadlineStr);
        if (!isNaN(standardDeadline.getTime()) && new Date() > standardDeadline) {
          isLateNow = true;
        }
      }
    }

    const isUSD = (reg.currency || reg.paymentCurrency || '').toUpperCase() === 'USD';
    const perCategoryLateRate = isUSD
      ? Number(event?.lateFeeUSD || 5)
      : Number(event?.lateFee || event?.lateRegistrationFee || 500);

    let recalculatedLateFee = 0;
    if (isLateNow) {
      const totalAthletes = Array.isArray(reg.athletes) ? reg.athletes.length : 1;
      let totalCatsCount = 0;
      (reg.athletes || []).forEach((ath) => {
        const cLen = (ath.selectedCategories || ath.categories || []).length;
        totalCatsCount += cLen > 0 ? cLen : 1;
      });
      recalculatedLateFee = (totalCatsCount || totalAthletes) * perCategoryLateRate;
    }

    const baseAmount = Number(reg.baseAmount) || Number(reg.totalAmountDue) || 0;
    const recalculatedTotalDue = baseAmount + recalculatedLateFee;

    const finalSlip = paymentSlipUrl || slipUrl || req.body.paymentSlip || '';
    const finalAmountPaid = recalculatedTotalDue;

    reg.registrationStatus = 'under_review';
    reg.status = 'under_review';
    reg.paymentStatus = 'Pending';
    reg.isLateRegistration = isLateNow;
    reg.lateFee = recalculatedLateFee;
    reg.totalAmountDue = recalculatedTotalDue;
    reg.totalAmountPaid = finalAmountPaid;
    reg.remainingBalance = 0;
    reg.transactionId = transactionId || 'N/A';
    reg.paymentDate = paymentDate ? new Date(paymentDate) : new Date();
    reg.paymentSlipUrl = finalSlip;
    reg.slipUrl = finalSlip;
    reg.receiptUrl = finalSlip;
    reg.proofUrl = finalSlip;
    reg.paymentProof = finalSlip;
    reg.paymentSlip = finalSlip;
    if (paymentOption) reg.paymentOption = paymentOption;

    await reg.save();

    // Now send notification to Admin!
    try {
      await Notification.create({
        title: 'New Team Registration',
        message: `${req.user.name || 'A team'} has attached payment for tournament registration (${(reg.athletes || []).length} athletes).`,
        type: 'registration',
        eventId: reg.eventId,
        registrationId: reg._id,
        isRead: false,
        read: false,
      });
    } catch (notifErr) {
      console.warn('Admin notification skipped:', notifErr.message);
    }

    return res.status(200).json({
      success: true,
      message: 'Payment attached successfully! Sent to admin for verification.',
      data: reg,
    });
  } catch (err) {
    console.error('Attach payment error:', err);
    return res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/v1/portal/profile
router.get('/profile', protect, async (req, res) => {
  try {
    return res.status(200).json({
      success: true,
      data: {
        name: req.user.name || req.user.fullName || 'Team Head',
        email: req.user.email,
        role: req.user.role || 'team_head',
        phone: req.user.phone || req.user.phoneNumber || '',
        teamName: req.user.teamName || ''
      }
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});
// Aliased route handlers
router.put('/registrations/:regId/video', saveAthleteVideoHandler);
router.put('/portal/registrations/:regId/video', saveAthleteVideoHandler);

// Video Upload via YouTube Data API v3 (Unlisted mode)
router.post('/registrations/:regId/video-upload', protect, videoUpload.single('video'), videoController.uploadAthleteVideo);
router.post('/registrations/:regId/athlete-video', protect, videoUpload.single('video'), videoController.uploadAthleteVideo);
router.post('/portal/registrations/:regId/video-upload', protect, videoUpload.single('video'), videoController.uploadAthleteVideo);
router.post('/portal/registrations/:regId/athlete-video', protect, videoUpload.single('video'), videoController.uploadAthleteVideo);

router.get('/notifications', protect, portalController.getPortalNotifications);
router.patch('/notifications/read-all', protect, portalController.markPortalNotificationsRead);

module.exports = router;