const mongoose = require('mongoose');
const Event = require('../models/Event');
const Category = require('../models/Category');
const Registration = require('../models/Registration');
const Notification = require('../models/Notification');

// Safe Dynamic Result Model with strict: false (Prevents StrictModeError)
const resultSchemaFields = {
  eventId: { type: mongoose.Schema.Types.ObjectId, ref: 'Event', required: true },
  categoryId: { type: String, default: '' },
  categoryName: { type: String, default: 'General' },
  subCategory: { type: String, default: 'Open' },
  teamName: { type: String, default: '' },
  playerName: { type: String, required: true },
  position: { type: String, required: true },
  score: { type: String, default: '' },
  isPublished: { type: Boolean, default: false },
};

let Result;
if (mongoose.models.Result) {
  Result = mongoose.models.Result;
  Result.schema.add(resultSchemaFields);
} else {
  Result = mongoose.model('Result', new mongoose.Schema(resultSchemaFields, { timestamps: true, strict: false }));
}

const extractIdStr = (val) => {
  if (!val) return '';
  if (typeof val === 'string') return val.trim();
  if (val instanceof mongoose.Types.ObjectId) return val.toString();
  if (typeof val === 'object') {
    if (val._id) return extractIdStr(val._id);
    if (val.categoryId) return extractIdStr(val.categoryId);
    if (val.id && typeof val.id === 'string') return val.id.trim();
    if (typeof val.toString === 'function') {
      const s = val.toString();
      if (s !== '[object Object]') return s;
    }
  }
  return String(val);
};

// Formatter to unify fields for frontend
const formatRegistrationForAdmin = (reg) => {
  const u = reg.userId || {};
  const ev = reg.eventId || {};

  const teamName =
    reg.teamName ||
    u.teamName ||
    (u.name ? `${u.name}'s Team` : 'Registered Team');
  const coachName = reg.coachName || u.name || 'Head Coach';
  const coachPhone = reg.coachPhone || reg.phone || u.phone || u.phoneNumber || 'N/A';
  const coachEmail = reg.coachEmail || reg.email || u.email || 'N/A';

  const athletesList = Array.isArray(reg.athletes) ? reg.athletes : [];

  const slip =
    reg.paymentSlipUrl ||
    reg.paymentProofUrl ||
    reg.slipUrl ||
    reg.receiptUrl ||
    reg.proofUrl ||
    reg.paymentProof ||
    reg.paymentSlip ||
    '';

  const remainingSlip =
    reg.remainingSlipUrl ||
    reg.remainingPaymentSlipUrl ||
    reg.secondPaymentSlipUrl ||
    reg.finalSlipUrl ||
    '';

  const rawStatus = (reg.registrationStatus || reg.status || 'under_review').toLowerCase();
  const paymentType = (reg.paymentOption || 'full').toLowerCase();

  return {
    ...reg,
    _id: reg._id,
    id: reg._id,
    teamName,
    team: {
      _id: reg.teamId || reg._id,
      id: reg.teamId || reg._id,
      name: teamName,
    },
    headCoach: coachName,
    coachName,
    coach: {
      name: coachName,
      phone: coachPhone,
      email: coachEmail,
    },
    teamHead: {
      name: coachName,
      phone: coachPhone,
      email: coachEmail,
    },
    phone: coachPhone,
    email: coachEmail,
    totalAthletes: athletesList.length,
    athletesCount: athletesList.length,
    athleteCount: athletesList.length,
    athletes: athletesList,
    players: athletesList,
    members: athletesList,
    eventTitle: ev.title || 'Tournament Event',
    event: ev.title || 'Tournament Event',
    totalAmountDue: Number(reg.totalAmountDue) || 0,
    totalAmountPaid: Number(reg.totalAmountPaid) || 0,
    amount: Number(reg.totalAmountPaid) || Number(reg.totalAmountDue) || 0,
    remainingBalance: Number(reg.remainingBalance) || 0,
    paymentOption: paymentType,
    paymentType: paymentType === 'half' ? 'Half Payment' : 'Full Payment',
    paymentStatus: rawStatus === 'approved' ? 'Paid' : 'Pending',
    status: rawStatus,
    registrationStatus: rawStatus,
    transactionId: reg.transactionId || 'N/A',
    paymentDate: reg.paymentDate || reg.createdAt,
    createdAt: reg.createdAt,
    receiptUrl: slip,
    slipUrl: slip,
    paymentSlipUrl: slip,
    proofUrl: slip,
    paymentProof: slip,
    paymentProofUrl: slip,
    paymentSlip: slip,
    remainingSlipUrl: remainingSlip,
    remainingPaymentSlipUrl: remainingSlip,
  };
};

// ==========================================
// 1. DASHBOARD ANALYTICS & STATS
// ==========================================
exports.getAdminDashboard = async (req, res) => {
  try {
    const [events, rawRegistrations, categories, results] = await Promise.all([
      Event.find().sort({ eventDate: 1 }).lean(),
      Registration.find({ registrationStatus: { $ne: 'draft' }, paymentStatus: { $ne: 'unpaid' } })
        .populate('userId', 'name email phone phoneNumber teamName')
        .populate('eventId', 'title eventDate eventType status standardDeadline isResultsPublished')
        .sort({ createdAt: -1 })
        .lean(),
      Category.find().lean(),
      Result.find().sort({ createdAt: -1 }).lean(),
    ]);

    const registrations = rawRegistrations.map(formatRegistrationForAdmin);

    let totalAthletes = 0;
    let totalRevenue = 0;
    let pendingPaymentsCount = 0;
    let halfPaymentsCount = 0;
    let fullPaymentsCount = 0;
    let pendingApprovalsCount = 0;

    registrations.forEach((r) => {
      const athCount = (r.athletes || []).length;
      totalAthletes += athCount;
      totalRevenue += Number(r.totalAmountPaid) || 0;

      const isApproved = r.registrationStatus === 'approved';
      const isPending =
        r.registrationStatus === 'under_review' ||
        r.registrationStatus === 'pending_payment' ||
        r.registrationStatus === 'pending';

      if (r.paymentOption === 'half') {
        halfPaymentsCount++;
      } else if (isApproved && r.paymentOption === 'full') {
        fullPaymentsCount++;
      }

      if (isPending) {
        pendingPaymentsCount++;
        pendingApprovalsCount++;
      }
    });

    const uniqueTeamNames = new Set(registrations.map((r) => r.teamName));
    const totalTeamsCount = uniqueTeamNames.size || registrations.length;

    const metricsData = {
      totalEvents: events.length,
      totalRegistrations: registrations.length,
      totalTeams: totalTeamsCount,
      totalAthletes,
      totalRevenue,
      pendingPayments: pendingPaymentsCount,
      halfPayments: halfPaymentsCount,
      fullPayments: fullPaymentsCount,
      pendingApprovals: pendingApprovalsCount,
      categoriesConfigured: categories.length,
      totalCategories: categories.length,
      activeCategories: categories.length,
      activeDivisions: categories.length,
      categoriesCount: categories.length,
      configuredCategories: categories.length,
    };

    return res.status(200).json({
      success: true,
      data: {
        metrics: metricsData,
        stats: metricsData,
        events,
        registrations,
        categories,
        results,
        recentRegistrations: registrations.slice(0, 10),
      },
    });
  } catch (error) {
    console.error('getAdminDashboard Error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ==========================================
// 2. NOTIFICATIONS
// ==========================================
// Get Notifications (Auto-generates from recent registrations & payments if empty)
exports.getNotifications = async (req, res) => {
  try {
    const Registration = mongoose.models.Registration || mongoose.model('Registration', new mongoose.Schema({}, { strict: false }));
    const recentRegs = await Registration.find({ registrationStatus: { $ne: 'draft' }, paymentStatus: { $ne: 'unpaid' } }).sort({ createdAt: -1 }).limit(10).lean();

    const notifications = recentRegs.map((reg, idx) => ({
      _id: reg._id || idx,
      title: 'New Team Registration',
      message: `${reg.teamName || 'A team'} has registered for tournament with ${reg.athletes?.length || 0} athletes.`,
      type: 'registration',
      createdAt: reg.createdAt || new Date(),
      read: reg.status === 'approved',
    }));

    return res.status(200).json({
      success: true,
      data: notifications,
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ==========================================
// 3. CATEGORIES & LIVE ROSTER COUNTS
// ==========================================
exports.getEventCategories = async (req, res) => {
  try {
    const eventId = req.params.eventId || req.params.id || req.query.eventId;
    let categoryQuery = {};
    if (eventId && mongoose.Types.ObjectId.isValid(String(eventId))) {
      categoryQuery = {
        $or: [
          { eventId: new mongoose.Types.ObjectId(String(eventId)) },
          { event: new mongoose.Types.ObjectId(String(eventId)) },
        ],
      };
    }

    const [categories, registrations] = await Promise.all([
      Category.find(categoryQuery).lean(),
      Registration.find(
        eventId && mongoose.Types.ObjectId.isValid(String(eventId))
          ? {
              $or: [
                { eventId: new mongoose.Types.ObjectId(String(eventId)) },
                { eventId: String(eventId) },
                { event: new mongoose.Types.ObjectId(String(eventId)) },
              ],
              registrationStatus: { $ne: 'draft' },
              paymentStatus: { $ne: 'unpaid' },
              _discard: [
              ],
            }
          : { registrationStatus: { $ne: 'draft' }, paymentStatus: { $ne: 'unpaid' } }
      ).lean(),
    ]);

    const enrichedCategories = categories.map((cat, idx) => {
      const catIdStr = cat._id.toString();
      const catNameLower = (cat.name || '').toLowerCase().trim();

      let matchingAthletes = [];
      const subCounts = {};

      registrations.forEach((reg) => {
        const athletesList = Array.isArray(reg.athletes) ? reg.athletes : [];

        athletesList.forEach((ath) => {
          const rawCats = Array.isArray(ath.selectedCategories)
            ? ath.selectedCategories
            : Array.isArray(ath.categories)
            ? ath.categories
            : ath.category || ath.categoryId
            ? [ath.category || ath.categoryId]
            : [];

          const matchesCategory =
            rawCats.some((c) => {
              const cid = extractIdStr(c);
              return cid && cid === catIdStr;
            }) ||
            (ath.categoryName && ath.categoryName.toLowerCase().trim() === catNameLower) ||
            categories.length === 1 ||
            (rawCats.length === 0 && idx === 0);

          if (matchesCategory) {
            matchingAthletes.push(ath);
            const subKey = String(
              ath.subCategory || ath.division || ath.subDivision || ath.belt || 'white'
            )
              .toLowerCase()
              .trim();
            subCounts[subKey] = (subCounts[subKey] || 0) + 1;
          }
        });
      });

      const totalEnrolled = matchingAthletes.length;
      const rawSubList =
        cat.subcategories || cat.subDivisions || cat.subCategories || cat.divisions || [];

      const formattedSubDivisions = rawSubList.map((sub, sIdx) => {
        const subName = typeof sub === 'string' ? sub.trim() : (sub.name || sub.title || '').trim();
        const sKey = subName.toLowerCase();
        let count = subCounts[sKey] || 0;

        if (count === 0 && totalEnrolled > 0 && sIdx === 0 && Object.keys(subCounts).length === 0) {
          count = totalEnrolled;
        }

        return {
          name: subName,
          title: subName,
          count,
          registeredCount: count,
          enrolledCount: count,
        };
      });

      return {
        ...cat,
        _id: cat._id,
        id: cat._id,
        name: cat.name,
        baseFee: Number(cat.baseFee || cat.fee) || 2000,
        enrolledAthletes: totalEnrolled,
        registeredAthletes: totalEnrolled,
        totalRegistered: totalEnrolled,
        subcategories: formattedSubDivisions,
      };
    });

    return res.status(200).json({
      success: true,
      count: enrichedCategories.length,
      data: enrichedCategories,
      categories: enrichedCategories,
    });
  } catch (error) {
    console.error('getEventCategories Error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ==========================================
// 4. TEAM REGISTRATIONS LIST & DETAILS
// ==========================================
exports.getEventRegistrations = async (req, res) => {
  try {
    const eventId = req.params.eventId || req.params.id || req.query.eventId;
    let query = {};
    if (eventId && mongoose.Types.ObjectId.isValid(String(eventId))) {
      query = {
        $or: [
          { eventId: new mongoose.Types.ObjectId(String(eventId)) },
          { eventId: String(eventId) },
          { event: new mongoose.Types.ObjectId(String(eventId)) },
        ],
      };
    }

    const registrations = await Registration.find({ ...query, registrationStatus: { $ne: 'draft' }, paymentStatus: { $ne: 'unpaid' } })
      .populate('userId', 'name email phone phoneNumber teamName')
      .populate('eventId', 'title eventDate eventType status standardDeadline')
      .sort({ createdAt: -1 })
      .lean();

    const formatted = registrations.map(formatRegistrationForAdmin);

    return res.status(200).json({
      success: true,
      count: formatted.length,
      data: formatted,
      registrations: formatted,
      teams: formatted,
    });
  } catch (error) {
    console.error('getEventRegistrations Error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.getRegistrationById = async (req, res) => {
  try {
    const id = req.params.id || req.params.registrationId;
    if (!id || !mongoose.Types.ObjectId.isValid(String(id))) {
      return res.status(400).json({ success: false, message: 'Invalid ID format.' });
    }

    const reg = await Registration.findById(id)
      .populate('userId', 'name email phone phoneNumber teamName')
      .populate('eventId', 'title eventDate eventType status standardDeadline')
      .populate('athletes.selectedCategories', 'name fee')
      .lean();

    if (!reg) {
      return res.status(404).json({ success: false, message: 'Registration not found.' });
    }

    const formatted = formatRegistrationForAdmin(reg);

    return res.status(200).json({
      success: true,
      data: formatted,
      registration: formatted,
      team: formatted,
    });
  } catch (error) {
    console.error('getRegistrationById Error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ==========================================
// 5. UPDATE STATUS & REMAINING PAYMENT SLIP HANDLER (CASTERROR FIXED)
// ==========================================
exports.updateRegistrationStatus = async (req, res) => {
  try {
    const id =
      req.params.id ||
      req.params.registrationId ||
      req.body.registrationId ||
      req.body._id ||
      req.body.id;

    if (!id || id === 'undefined' || id === 'null' || !mongoose.Types.ObjectId.isValid(String(id))) {
      return res.status(400).json({
        success: false,
        message: 'Valid Registration ID is required.',
      });
    }

    const {
      status,
      registrationStatus,
      paymentOption,
      totalAmountPaid,
      remainingBalance,
      remainingSlipUrl,
      remainingPaymentSlipUrl,
      secondTransactionId,
      remainingPaymentDate,
      athletes,
    } = req.body;

    const existingReg = await Registration.findById(id);
    if (!existingReg) {
      return res.status(404).json({ success: false, message: 'Registration not found.' });
    }

    const updateFields = {};

    if (status || registrationStatus) {
      const targetStatus = (status || registrationStatus).toLowerCase();
      updateFields.registrationStatus = targetStatus;
      updateFields.status = targetStatus;
      updateFields.paymentStatus = targetStatus === 'approved' ? 'Paid' : 'Rejected';
    }

    if (paymentOption) {
      updateFields.paymentOption = paymentOption.toLowerCase();
    }
    if (totalAmountPaid !== undefined && totalAmountPaid !== null) {
      updateFields.totalAmountPaid = Number(totalAmountPaid);
    }
    if (remainingBalance !== undefined && remainingBalance !== null) {
      updateFields.remainingBalance = Number(remainingBalance);
    }

    if (remainingSlipUrl || remainingPaymentSlipUrl) {
      const slip = remainingSlipUrl || remainingPaymentSlipUrl;
      updateFields.remainingSlipUrl = slip;
      updateFields.remainingPaymentSlipUrl = slip;
      updateFields.secondPaymentSlipUrl = slip;
      updateFields.finalSlipUrl = slip;
      updateFields.remainingPaymentStatus = 'submitted';
    }
    if (secondTransactionId) {
      updateFields.secondTransactionId = secondTransactionId.trim();
    }
    if (remainingPaymentDate) {
      updateFields.remainingPaymentDate = remainingPaymentDate;
    }
    if (Array.isArray(athletes)) {
      updateFields.athletes = athletes;
    }

    const updated = await Registration.findByIdAndUpdate(
      id,
      { $set: updateFields },
      { returnDocument: 'after' }
    )
      .populate('userId', 'name email phone teamName')
      .populate('eventId', 'title eventDate eventType status');

    return res.status(200).json({
      success: true,
      message: 'Registration & payment details updated successfully.',
      data: formatRegistrationForAdmin(updated.toObject()),
    });
  } catch (error) {
    console.error('updateRegistrationStatus Error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ==========================================
// 6. PAYMENTS LIST
// ==========================================
exports.getPayments = async (req, res) => {
  try {
    const eventId = req.params.eventId || req.params.id || req.query.eventId;
    let query = {};
    if (eventId && mongoose.Types.ObjectId.isValid(String(eventId))) {
      query = {
        $or: [
          { eventId: new mongoose.Types.ObjectId(String(eventId)) },
          { eventId: String(eventId) },
          { event: new mongoose.Types.ObjectId(String(eventId)) },
        ],
      };
    }

    const registrations = await Registration.find({ ...query, registrationStatus: { $ne: 'draft' }, paymentStatus: { $ne: 'unpaid' } })
      .populate('userId', 'name email phone teamName')
      .populate('eventId', 'title eventDate')
      .sort({ createdAt: -1 })
      .lean();

    const payments = registrations.map(formatRegistrationForAdmin);

    return res.status(200).json({
      success: true,
      count: payments.length,
      data: payments,
      payments: payments,
    });
  } catch (error) {
    console.error('getPayments Error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.updatePaymentStatus = async (req, res) => {
  return exports.updateRegistrationStatus(req, res);
};

// ==========================================
// 7. TOURNAMENT RESULTS & PODIUM MANAGEMENT
// ==========================================
const syncAthleteMedalInRegistration = async (eventId, playerName, position, score, isPublished) => {
  try {
    if (!eventId || !mongoose.Types.ObjectId.isValid(String(eventId))) return;

    const regs = await Registration.find({
      $or: [
        { eventId: new mongoose.Types.ObjectId(String(eventId)) },
        { eventId: String(eventId) },
      ],
    });

    for (const reg of regs) {
      let modified = false;
      const updatedAthletes = (reg.athletes || []).map((ath) => {
        const athObj = ath.toObject ? ath.toObject() : { ...ath };
        if ((athObj.name || '').trim().toLowerCase() === (playerName || '').trim().toLowerCase()) {
          modified = true;
          return {
            ...athObj,
            medal: position,
            position: position,
            result: position,
            score: score || athObj.score || '',
            isResultPublished: Boolean(isPublished),
          };
        }
        return athObj;
      });

      if (modified) {
        await Registration.updateOne(
          { _id: reg._id },
          { $set: { athletes: updatedAthletes } }
        );
      }
    }

    if (isPublished) {
      await Event.findByIdAndUpdate(eventId, {
        $set: { isResultsPublished: true, resultsPublished: true },
      });
    }
  } catch (err) {
    console.warn('syncAthleteMedalInRegistration warning:', err.message);
  }
};

exports.assignResult = async (req, res) => {
  try {
    const {
      eventId,
      categoryId,
      categoryName,
      subCategory,
      teamName,
      playerName,
      position,
      score,
      isPublished,
    } = req.body;

    if (!eventId || !playerName) {
      return res.status(400).json({
        success: false,
        message: 'eventId and playerName are required.',
      });
    }

  const savedResult = await Result.findOneAndUpdate(
      {
        eventId: new mongoose.Types.ObjectId(String(eventId)),
        playerName: playerName.trim(),
        categoryName: categoryName || 'General',
      },
      {
        $set: {
          eventId: new mongoose.Types.ObjectId(String(eventId)),
          categoryId: categoryId ? String(categoryId) : '',
          categoryName: categoryName || 'General',
          subCategory: subCategory || 'Open',
          teamName: teamName || 'Registered Team',
          playerName: playerName.trim(),
          position: position || '1st (Gold 🥇)',
          score: score || '9.85',
          isPublished: Boolean(isPublished),
        },
      },
      { upsert: true, returnDocument: 'after', strict: false }
    );

    await syncAthleteMedalInRegistration(eventId, playerName, position, score, isPublished);

    return res.status(200).json({
      success: true,
      message: 'Result assigned successfully.',
      data: savedResult,
    });
  } catch (error) {
    console.error('assignResult Error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.toggleResultPublish = async (req, res) => {
  try {
    const { id } = req.params;
    if (!id || id === 'undefined' || !mongoose.Types.ObjectId.isValid(String(id))) {
      return res.status(400).json({ success: false, message: 'Valid Result ID is required.' });
    }

    const existing = await Result.findById(id);
    if (!existing) {
      return res.status(404).json({ success: false, message: 'Result not found.' });
    }

    existing.isPublished = !existing.isPublished;
    await existing.save();

    await syncAthleteMedalInRegistration(
      existing.eventId,
      existing.playerName,
      existing.position,
      existing.score,
      existing.isPublished
    );

    return res.status(200).json({
      success: true,
      message: 'Result visibility updated.',
      data: existing,
    });
  } catch (error) {
    console.error('toggleResultPublish Error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.getPublicResults = async (req, res) => {
  try {
    const results = await Result.find({ isPublished: true })
      .populate('eventId', 'title eventDate eventType')
      .sort({ createdAt: -1 })
      .lean();

    return res.status(200).json({
      success: true,
      count: results.length,
      data: results,
      results,
    });
  } catch (error) {
    console.error('getPublicResults Error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};