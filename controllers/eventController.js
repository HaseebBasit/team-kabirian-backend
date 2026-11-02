const mongoose = require('mongoose');
const Event = require('../models/Event');
const Category = require('../models/Category');
const Registration = require('../models/Registration');
const Result = require('../models/Result');

// Public listing deliberately exposes only editorial event fields. The regular
// event feed remains unchanged for the existing portals.
exports.getPublicEvents = async (_req, res) => {
  try {
    const events = await Event.find({ status: { $in: ['upcoming', 'live', 'closed', 'ended'] } })
      .select('title slug description coverImageUrl ruleBookPdfUrl ruleBookText eventType eventDate standardDeadline lateFeeStartDate registrationDeadline status categories createdAt')
      .sort({ eventDate: 1 })
      .lean();

    const ids = events.map((event) => event._id);
    const categoryRows = ids.length
      ? await Category.find({ eventId: { $in: ids } })
          .select('_id eventId event')
          .lean()
      : [];
    const categoryIdsByEvent = new Map();
    const addCategory = (eventId, categoryId) => {
      if (!eventId || !categoryId) return;
      const key = String(eventId);
      if (!categoryIdsByEvent.has(key)) categoryIdsByEvent.set(key, new Set());
      categoryIdsByEvent.get(key).add(String(categoryId));
    };

    for (const category of categoryRows) {
      addCategory(category.eventId, category._id);
      addCategory(category.event, category._id);
    }
    for (const event of events) {
      for (const category of event.categories || []) {
        addCategory(event._id, category?._id || category);
      }
    }

    const data = events.map((event) => {
      // The Admin Portal's explicit status is authoritative. A past event date
      // must not silently turn an administrator's live/open event into closed.
      const eventEnded = event.status === 'ended';

      return {
        _id: event._id,
        title: event.title,
        slug: event.slug,
        description: event.description,
        coverImageUrl: event.coverImageUrl,
        ruleBookPdfUrl: event.ruleBookPdfUrl,
        ruleBookText: event.ruleBookText,
        eventType: event.eventType,
        eventDate: event.eventDate,
        standardDeadline: event.standardDeadline,
        lateFeeStartDate: event.lateFeeStartDate,
        registrationDeadline: event.registrationDeadline,
        status: event.status,
        categoriesCount: categoryIdsByEvent.get(String(event._id))?.size || 0,
        eventEnded,
        registrationOpen: event.status === 'live' && !eventEnded,
      };
    });

    return res.status(200).json({ success: true, count: data.length, data });
  } catch (error) {
    console.error('getPublicEvents Error:', error);
    return res.status(500).json({ success: false, message: 'Unable to load events.' });
  }
};

// Helper: Safely extract 24-character hex ID string
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

// Helper: Dynamically enrich categories with live athlete & belt counts (with Auto-Heal)
const enrichEventCategories = (categories, registrations) => {
  if (!categories || categories.length === 0) return [];

  return categories.map((cat, idx) => {
    const catIdStr = extractIdStr(cat._id);
    const catNameLower = (cat.name || '').toLowerCase().trim();

    let totalEnrolled = 0;
    const subCounts = {};

    registrations.forEach((reg) => {
      // AUTO-HEAL: Agar purana record empty hai toh 1 default athlete assign karein
      const rawAthletes = Array.isArray(reg.athletes) && reg.athletes.length > 0
        ? reg.athletes
        : [
            {
              name: reg.coachName || reg.teamName || 'Registered Athlete',
              age: 18,
              gender: 'Male',
              cnic: 'N/A',
              subCategory: 'white',
              division: 'white',
              selectedCategories: [cat._id],
            },
          ];

      rawAthletes.forEach((ath) => {
        const rawCats = Array.isArray(ath.selectedCategories)
          ? ath.selectedCategories
          : Array.isArray(ath.categories)
          ? ath.categories
          : ath.category || ath.categoryId
          ? [ath.category || ath.categoryId]
          : [];

        const matches =
          rawCats.some((c) => {
            const cid = extractIdStr(c);
            return cid && cid === catIdStr;
          }) ||
          (ath.categoryName && ath.categoryName.toLowerCase().trim() === catNameLower) ||
          (rawCats.length === 0 && idx === 0) ||
          idx === 0;

        if (matches) {
          totalEnrolled++;
          const subKey = String(
            ath.subCategory || ath.division || ath.subDivision || ath.belt || 'white'
          )
            .toLowerCase()
            .trim();
          subCounts[subKey] = (subCounts[subKey] || 0) + 1;
        }
      });
    });

    const rawSubs =
      cat.subcategories ||
      cat.subDivisions ||
      cat.subCategories ||
      cat.divisions ||
      ['white', 'blue', 'green'];

    const formattedSubDivisions = rawSubs.map((sub, sIdx) => {
      const sName = typeof sub === 'string' ? sub.trim() : (sub.name || sub.title || '').trim();
      const sKey = sName.toLowerCase();
      let count = subCounts[sKey] || 0;

      // Agar sub-division match na mila ho lekin category mein enrolled hon, pehli belt ko assign karein
      if (count === 0 && totalEnrolled > 0 && sIdx === 0 && Object.keys(subCounts).length === 0) {
        count = totalEnrolled;
      }

      return {
        name: sName,
        title: sName,
        subCategory: sName,
        division: sName,
        count: count,
        registeredCount: count,
        enrolledCount: count,
        registered: count,
        enrolledAthletes: count,
      };
    });

    return {
      ...cat,
      _id: cat._id,
      id: cat._id,
      name: cat.name,
      baseFee: Number(cat.baseFee || cat.fee) || 2000,
      fee: Number(cat.baseFee || cat.fee) || 2000,
      enrolledAthletes: totalEnrolled,
      registeredAthletes: totalEnrolled,
      totalRegistered: totalEnrolled,
      enrolledCount: totalEnrolled,
      registeredCount: totalEnrolled,
      athletesCount: totalEnrolled,
      count: totalEnrolled,
      subcategories: formattedSubDivisions,
      subDivisions: formattedSubDivisions,
      subCategories: formattedSubDivisions,
      divisions: formattedSubDivisions,
    };
  });
};

// ==========================================
// 1. GET ALL EVENTS (With Populated Counts)
// ==========================================
exports.getEvents = async (req, res) => {
  try {
    const [events, allCategories, allRegistrations] = await Promise.all([
      Event.find().sort({ createdAt: -1 }).lean(),
      Category.find().lean(),
      Registration.find().lean(),
    ]);

    const now = new Date();

    const populatedEvents = events.map((ev) => {
      const evIdStr = ev._id.toString();

      const matchedCategories = allCategories.filter((cat) => {
        const catEventId =
          cat.eventId?._id?.toString() ||
          cat.eventId?.toString() ||
          cat.event?._id?.toString() ||
          cat.event?.toString() ||
          cat.tournamentId?.toString() ||
          null;

        if (catEventId && catEventId === evIdStr) return true;

        if (Array.isArray(ev.categories) && ev.categories.length > 0) {
          const idStrings = ev.categories.map((c) =>
            c && c._id ? c._id.toString() : String(c)
          );
          if (idStrings.includes(cat._id.toString())) return true;
        }

        return false;
      });

      const eventRegs = allRegistrations.filter((reg) => {
        const regEvId =
          reg.eventId?._id?.toString() ||
          reg.eventId?.toString() ||
          reg.event?.toString() ||
          '';
        return regEvId === evIdStr;
      });

      let totalAthletesForEvent = 0;
      eventRegs.forEach((reg) => {
        const athList = Array.isArray(reg.athletes) && reg.athletes.length > 0
          ? reg.athletes
          : [1];
        totalAthletesForEvent += athList.length;
      });

      const enrichedCats = enrichEventCategories(matchedCategories, eventRegs);
      const lateCutoff = ev.lateFeeStartDate || ev.standardDeadline;
      const isLateFeeActive = lateCutoff ? now > new Date(lateCutoff) : false;
      const count = enrichedCats.length;

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
        categories: enrichedCats,
        categoriesConfigured: count,
        categoriesCount: count,
        totalCategories: count,
        configuredCategories: count,
        configuredCategoriesCount: count,
        athletesCount: totalAthletesForEvent,
        totalAthletes: totalAthletesForEvent,
        enrolledAthletes: totalAthletesForEvent,
        registeredAthletes: totalAthletesForEvent,
        athleteCount: totalAthletesForEvent,
        isLateFeeActive,
      };
    });

    return res.status(200).json({
      success: true,
      count: populatedEvents.length,
      data: populatedEvents,
      events: populatedEvents,
    });
  } catch (error) {
    console.error('getEvents Error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ==========================================
// 2. GET SINGLE EVENT BY ID (Powers Categories & Divisions Page)
// ==========================================
exports.getEventById = async (req, res) => {
  try {
    const event = await Event.findById(req.params.id).lean();
    if (!event) {
      return res.status(404).json({ success: false, message: 'Tournament not found.' });
    }

    const eventIdStr = event._id.toString();

    const [allCategories, eventRegistrations] = await Promise.all([
      Category.find().lean(),
      Registration.find({
        $or: [
          { eventId: event._id },
          { eventId: eventIdStr },
          { event: event._id },
        ],
      }).lean(),
    ]);

    const eventCategories = allCategories.filter((cat) => {
      const cId =
        cat.eventId?._id?.toString() ||
        cat.eventId?.toString() ||
        cat.event?._id?.toString() ||
        cat.event?.toString() ||
        cat.tournamentId?.toString();
      return cId === eventIdStr;
    });

    // Enrich categories with live enrolled athletes & sub-divisions
    const enrichedCategories = enrichEventCategories(eventCategories, eventRegistrations);

    let totalAthletesForEvent = 0;
    eventRegistrations.forEach((reg) => {
      const athList = Array.isArray(reg.athletes) && reg.athletes.length > 0
        ? reg.athletes
        : [1];
      totalAthletesForEvent += athList.length;
    });

    const now = new Date();
    const lateCutoff = event.lateFeeStartDate || event.standardDeadline;
    const isLateFeeActive = lateCutoff ? now > new Date(lateCutoff) : false;

    const formattedCategories = enrichedCategories.map((cat) => {
      const baseFee = Number(cat.baseFee || cat.fee) || 2000;
      const lateFee = Number(cat.lateFee) || Number(event.lateFee) || 0;
      return {
        ...cat,
        effectiveFee: isLateFeeActive ? baseFee + lateFee : baseFee,
        isLateFeeApplied: isLateFeeActive,
      };
    });

    const bName = event.bankName || event.bankDetails?.bankName || '';
    const aTitle = event.accountTitle || event.bankDetails?.accountTitle || '';
    const aNum = event.accountNumber || event.bankDetails?.accountNumber || '';
    const ib = event.iban || event.bankDetails?.iban || '';

    return res.status(200).json({
      success: true,
      data: {
        ...event,
        bankName: bName,
        accountTitle: aTitle,
        accountNumber: aNum,
        iban: ib,
        bankDetails: {
          bankName: bName,
          accountTitle: aTitle,
          accountNumber: aNum,
          iban: ib,
          qrCodeUrl: event.bankDetails?.qrCodeUrl || '',
        },
        categories: formattedCategories,
        categoriesConfigured: formattedCategories.length,
        categoriesCount: formattedCategories.length,
        totalCategories: formattedCategories.length,
        athletesCount: totalAthletesForEvent,
        totalAthletes: totalAthletesForEvent,
        enrolledAthletes: totalAthletesForEvent,
        registeredAthletes: totalAthletesForEvent,
        isLateFeeActive,
      },
    });
  } catch (error) {
    console.error('getEventById Error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ==========================================
// 3. CREATE EVENT
// ==========================================
exports.createEvent = async (req, res) => {
  try {
    const {
      title,
      description,
      coverImageUrl,
      ruleBookPdfUrl,
      ruleBookText,
      eventType,
      eventDate,
      standardDeadline,
      lateFeeStartDate,
      registrationDeadline,
      lateFee,
      bankName,
      accountTitle,
      accountNumber,
      iban,
      bankDetails,
      categories,
    } = req.body;

    if (!title || !eventDate) {
      return res.status(400).json({
        success: false,
        message: 'Tournament title and date are required.',
      });
    }

    const finalStandardDeadline = standardDeadline || registrationDeadline || eventDate;
    const finalLateFeeStartDate = lateFeeStartDate || finalStandardDeadline;
    const finalDeadline = registrationDeadline || finalStandardDeadline;

    const cleanTitle = String(title)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)+/g, '');
    const uniqueSlug = `${cleanTitle || 'event'}-${Date.now()}`;

    const resolvedBankName = String(bankName || bankDetails?.bankName || '').trim();
    const resolvedAccountTitle = String(accountTitle || bankDetails?.accountTitle || '').trim();
    const resolvedAccountNumber = String(accountNumber || bankDetails?.accountNumber || '').trim();
    const resolvedIban = String(iban || bankDetails?.iban || '').trim();
    const resolvedQrCode = String(bankDetails?.qrCodeUrl || '').trim();

    const event = await Event.create({
      title: title.trim(),
      slug: uniqueSlug,
      description: description || '',
      coverImageUrl: coverImageUrl || '',
      ruleBookPdfUrl: ruleBookPdfUrl || '',
      ruleBookText: ruleBookText || '',
      eventType: eventType || 'online',
      eventDate,
      standardDeadline: finalStandardDeadline,
      lateFeeStartDate: finalLateFeeStartDate,
      registrationDeadline: finalDeadline,
      lateFee: Number(lateFee) || 0,
      bankName: resolvedBankName,
      accountTitle: resolvedAccountTitle,
      accountNumber: resolvedAccountNumber,
      iban: resolvedIban,
      bankDetails: {
        bankName: resolvedBankName,
        accountTitle: resolvedAccountTitle,
        accountNumber: resolvedAccountNumber,
        iban: resolvedIban,
        qrCodeUrl: resolvedQrCode,
      },
      status: 'upcoming',
      categories: [],
    });

    const categoryList = Array.isArray(categories) ? categories : [];
    let createdCategoryIds = [];

    if (categoryList.length > 0) {
      for (const cat of categoryList) {
        const subcats = Array.isArray(cat.subcategories)
          ? cat.subcategories
          : (cat.subcategories || '')
              .split(',')
              .map((s) => s.trim())
              .filter(Boolean);

        const newCat = await Category.create({
          eventId: event._id,
          event: event._id,
          name: (cat.name || 'Category').trim(),
          baseFee: Number(cat.baseFee || cat.fee) || 2000,
          lateFee: Number(cat.lateFee) || Number(lateFee) || 0,
          lateFeeStartDate: finalLateFeeStartDate,
          subcategories: subcats.length > 0 ? subcats : ['white', 'blue', 'green'],
          status: 'active',
        });

        createdCategoryIds.push(newCat._id);
      }

      event.categories = createdCategoryIds;
      await event.save();
    }

    const allCategoriesForEvent = await Category.find({
      $or: [{ eventId: event._id }, { event: event._id }],
    }).lean();

    return res.status(201).json({
      success: true,
      message: 'Tournament published successfully.',
      data: {
        ...event.toObject(),
        bankName: resolvedBankName,
        accountTitle: resolvedAccountTitle,
        accountNumber: resolvedAccountNumber,
        iban: resolvedIban,
        bankDetails: {
          bankName: resolvedBankName,
          accountTitle: resolvedAccountTitle,
          accountNumber: resolvedAccountNumber,
          iban: resolvedIban,
          qrCodeUrl: resolvedQrCode,
        },
        categories: allCategoriesForEvent,
        categoriesConfigured: allCategoriesForEvent.length,
        categoriesCount: allCategoriesForEvent.length,
      },
    });
  } catch (error) {
    console.error('createEvent Error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ==========================================
// 4. UPDATE EVENT
// ==========================================
exports.updateEvent = async (req, res) => {
  try {
    const {
      title,
      description,
      coverImageUrl,
      ruleBookPdfUrl,
      ruleBookText,
      eventType,
      eventDate,
      standardDeadline,
      lateFeeStartDate,
      registrationDeadline,
      lateFee,
      bankName,
      accountTitle,
      accountNumber,
      iban,
      bankDetails,
      status,
      categories,
    } = req.body;

    const event = await Event.findById(req.params.id);
    if (!event) {
      return res.status(404).json({ success: false, message: 'Tournament not found.' });
    }

    if (title !== undefined) event.title = title.trim();
    if (description !== undefined) event.description = description;
    if (coverImageUrl) event.coverImageUrl = coverImageUrl;
    if (ruleBookPdfUrl !== undefined) event.ruleBookPdfUrl = ruleBookPdfUrl;
    if (ruleBookText !== undefined) event.ruleBookText = ruleBookText;
    if (eventType !== undefined) event.eventType = eventType;
    if (eventDate !== undefined) event.eventDate = eventDate;
    if (standardDeadline !== undefined) event.standardDeadline = standardDeadline;
    if (lateFeeStartDate !== undefined) event.lateFeeStartDate = lateFeeStartDate;
    if (registrationDeadline !== undefined) event.registrationDeadline = registrationDeadline;
    if (lateFee !== undefined) event.lateFee = Number(lateFee);
    if (status !== undefined) event.status = status;

    if (bankName !== undefined || bankDetails?.bankName !== undefined) {
      const bVal = String(bankName !== undefined ? bankName : bankDetails?.bankName || '').trim();
      event.bankName = bVal;
      if (!event.bankDetails) event.bankDetails = {};
      event.bankDetails.bankName = bVal;
    }
    if (accountTitle !== undefined || bankDetails?.accountTitle !== undefined) {
      const aVal = String(accountTitle !== undefined ? accountTitle : bankDetails?.accountTitle || '').trim();
      event.accountTitle = aVal;
      if (!event.bankDetails) event.bankDetails = {};
      event.bankDetails.accountTitle = aVal;
    }
    if (accountNumber !== undefined || bankDetails?.accountNumber !== undefined) {
      const numVal = String(accountNumber !== undefined ? accountNumber : bankDetails?.accountNumber || '').trim();
      event.accountNumber = numVal;
      if (!event.bankDetails) event.bankDetails = {};
      event.bankDetails.accountNumber = numVal;
    }
    if (iban !== undefined || bankDetails?.iban !== undefined) {
      const ibVal = String(iban !== undefined ? iban : bankDetails?.iban || '').trim();
      event.iban = ibVal;
      if (!event.bankDetails) event.bankDetails = {};
      event.bankDetails.iban = ibVal;
    }
    if (bankDetails?.qrCodeUrl !== undefined) {
      if (!event.bankDetails) event.bankDetails = {};
      event.bankDetails.qrCodeUrl = String(bankDetails.qrCodeUrl || '').trim();
    }

    if (Array.isArray(categories)) {
      const finalLateCutoff = event.lateFeeStartDate || event.standardDeadline;
      const updatedCatIds = [];

      const existingDbCategories = await Category.find({
        $or: [{ eventId: event._id }, { event: event._id }],
      });
      const incomingCategoryIds = categories.filter((c) => c._id).map((c) => c._id.toString());

      for (const oldCat of existingDbCategories) {
        if (!incomingCategoryIds.includes(oldCat._id.toString())) {
          await Category.findByIdAndDelete(oldCat._id);
        }
      }

      for (const cat of categories) {
        const subcats = Array.isArray(cat.subcategories)
          ? cat.subcategories
          : (cat.subcategories || '')
              .split(',')
              .map((s) => s.trim())
              .filter(Boolean);

        if (cat._id) {
          const updatedCat = await Category.findByIdAndUpdate(
            cat._id,
            {
              name: (cat.name || 'Category').trim(),
              baseFee: Number(cat.baseFee || cat.fee) || 2000,
              lateFee: Number(cat.lateFee) || Number(event.lateFee) || 0,
              baseFeeUSD: Number(cat.baseFeeUSD) || 20,
              lateFeeUSD: Number(cat.lateFeeUSD) || 5,
              lateFeeStartDate: finalLateCutoff,
              subcategories: subcats.length > 0 ? subcats : ['white', 'blue', 'green'],
            },
            { returnDocument: 'after' }
          );
          if (updatedCat) updatedCatIds.push(updatedCat._id);
        } else {
          const newCat = await Category.create({
            eventId: event._id,
            event: event._id,
            name: (cat.name || 'Category').trim(),
            baseFee: Number(cat.baseFee || cat.fee) || 2000,
            lateFee: Number(cat.lateFee) || Number(event.lateFee) || 0,
            baseFeeUSD: Number(cat.baseFeeUSD) || 20,
            lateFeeUSD: Number(cat.lateFeeUSD) || 5,
            lateFeeStartDate: finalLateCutoff,
            subcategories: subcats.length > 0 ? subcats : ['white', 'blue', 'green'],
            status: 'active',
          });
          updatedCatIds.push(newCat._id);
        }
      }

      event.categories = updatedCatIds;
    }

    await event.save();

    const refreshedCategories = await Category.find({
      $or: [{ eventId: event._id }, { event: event._id }],
    }).lean();

    return res.status(200).json({
      success: true,
      message: 'Tournament and categories updated successfully.',
      data: {
        ...event.toObject(),
        categories: refreshedCategories,
        categoriesConfigured: refreshedCategories.length,
        categoriesCount: refreshedCategories.length,
      },
    });
  } catch (error) {
    console.error('updateEvent Error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ==========================================
// 5. UPDATE EVENT STATUS
// ==========================================
exports.updateEventStatus = async (req, res) => {
  try {
    const event = await Event.findByIdAndUpdate(
      req.params.id,
      { status: req.body.status },
      { returnDocument: 'after' }
    );
    if (!event) {
      return res.status(404).json({ success: false, message: 'Tournament not found.' });
    }
    return res.status(200).json({ success: true, data: event });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ==========================================
// 6. DELETE EVENT
// ==========================================
exports.deleteEvent = async (req, res) => {
  try {
    const eventId = req.params.id;
    await Event.findByIdAndDelete(eventId);
    await Category.deleteMany({ $or: [{ eventId }, { event: eventId }] });
    await Registration.deleteMany({ eventId });
    await Result.deleteMany({ eventId });
    return res.status(200).json({
      success: true,
      message: 'Tournament and linked records deleted successfully.',
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};
