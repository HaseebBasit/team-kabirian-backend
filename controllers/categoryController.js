const mongoose = require('mongoose');
const Category = require('../models/Category');
const Registration = require('../models/Registration');
const Event = require('../models/Event');

const extractIdString = (val) => {
  if (!val) return '';
  if (typeof val === 'string') return val.trim();
  if (val instanceof mongoose.Types.ObjectId) return val.toString();
  if (typeof val === 'object') {
    if (val._id) return extractIdString(val._id);
    if (val.categoryId) return extractIdString(val.categoryId);
    if (val.id && typeof val.id === 'string') return val.id.trim();
    if (typeof val.toString === 'function') {
      const s = val.toString();
      if (s !== '[object Object]') return s;
    }
  }
  return String(val);
};

const enrichCategoriesWithCounts = async (categories, eventId) => {
  if (!categories || categories.length === 0) return [];

  let regQuery = {};
  if (eventId && mongoose.Types.ObjectId.isValid(String(eventId))) {
    const objId = new mongoose.Types.ObjectId(String(eventId));
    regQuery = {
      $or: [
        { eventId: objId },
        { eventId: String(eventId) },
        { event: objId },
        { event: String(eventId) },
      ],
    };
  }

  const registrations = await Registration.find(regQuery).lean();

  return categories.map((cat, idx) => {
    const catIdStr = extractIdString(cat._id);
    const catNameLower = (cat.name || '').toLowerCase().trim();

    let matchingAthletes = [];
    const subCounts = {};

    registrations.forEach((reg) => {
      // AUTO-HEAL: Agar athlete array 0 hai toh registration ko as 1 athlete count karein
      const athletesList = Array.isArray(reg.athletes) && reg.athletes.length > 0
        ? reg.athletes
        : [
            {
              name: reg.coachName || reg.teamName || 'Athlete',
              age: 18,
              gender: 'Male',
              cnic: 'N/A',
              subCategory: 'white',
              division: 'white',
              selectedCategories: [cat._id],
            },
          ];

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
            const cidStr = extractIdString(c);
            return cidStr && cidStr === catIdStr;
          }) ||
          (ath.categoryName && ath.categoryName.toLowerCase().trim() === catNameLower) ||
          (rawCats.length === 0 && idx === 0) ||
          idx === 0;

        if (matchesCategory) {
          matchingAthletes.push(ath);

          const rawSub =
            ath.subCategory ||
            ath.division ||
            ath.subDivision ||
            ath.belt ||
            'white';
          const subKey = String(rawSub).toLowerCase().trim();
          subCounts[subKey] = (subCounts[subKey] || 0) + 1;
        }
      });
    });

    const totalEnrolled = matchingAthletes.length;

    const rawSubList =
      cat.subcategories ||
      cat.subDivisions ||
      cat.subCategories ||
      cat.divisions ||
      ['white', 'blue', 'green'];

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
        subCategory: subName,
        division: subName,
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
      athletes: matchingAthletes,
      subcategories: formattedSubDivisions,
      subDivisions: formattedSubDivisions,
      subCategories: formattedSubDivisions,
      divisions: formattedSubDivisions,
    };
  });
};

// 1. GET ALL CATEGORIES
exports.getCategories = async (req, res) => {
  try {
    const eventId = req.query.eventId || req.query.tournamentId || req.params.eventId;
    let query = {};

    if (eventId && mongoose.Types.ObjectId.isValid(String(eventId))) {
      query = {
        $or: [
          { eventId: new mongoose.Types.ObjectId(String(eventId)) },
          { event: new mongoose.Types.ObjectId(String(eventId)) },
        ],
      };
    }

    const categories = await Category.find(query).sort({ createdAt: 1 }).lean();
    const enriched = await enrichCategoriesWithCounts(categories, eventId);

    return res.status(200).json({
      success: true,
      count: enriched.length,
      data: enriched,
      categories: enriched,
    });
  } catch (error) {
    console.error('getCategories Error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// 2. GET CATEGORIES BY EVENT ID
exports.getCategoriesByEvent = async (req, res) => {
  try {
    const eventId = req.params.eventId || req.params.id;
    let query = {};

    if (eventId && mongoose.Types.ObjectId.isValid(String(eventId))) {
      query = {
        $or: [
          { eventId: new mongoose.Types.ObjectId(String(eventId)) },
          { event: new mongoose.Types.ObjectId(String(eventId)) },
        ],
      };
    }

    const categories = await Category.find(query).sort({ createdAt: 1 }).lean();
    const enriched = await enrichCategoriesWithCounts(categories, eventId);

    return res.status(200).json({
      success: true,
      count: enriched.length,
      data: enriched,
      categories: enriched,
    });
  } catch (error) {
    console.error('getCategoriesByEvent Error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// 3. GET SINGLE CATEGORY BY ID
exports.getCategoryById = async (req, res) => {
  try {
    const category = await Category.findById(req.params.id).lean();
    if (!category) {
      return res.status(404).json({ success: false, message: 'Category not found.' });
    }

    const [enriched] = await enrichCategoriesWithCounts([category], category.eventId || category.event);

    return res.status(200).json({
      success: true,
      data: enriched,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// 4. CREATE CATEGORY
exports.createCategory = async (req, res) => {
  try {
    const { eventId, name, baseFee, fee, lateFee, baseFeeUSD, lateFeeUSD, subcategories, subDivisions } = req.body;

    const subList = Array.isArray(subcategories || subDivisions)
      ? (subcategories || subDivisions)
      : String(subcategories || subDivisions || '')
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean);

    const newCategory = await Category.create({
      eventId,
      event: eventId,
      name: String(name || 'Division').trim(),
      baseFee: Number(baseFee || fee) || 2000,
      lateFee: Number(lateFee) || 0,
      baseFeeUSD: Number(baseFeeUSD) || 20,
      lateFeeUSD: Number(lateFeeUSD) || 5,
      subcategories: subList.length > 0 ? subList : ['white', 'blue', 'green'],
      status: 'active',
    });

    return res.status(201).json({
      success: true,
      message: 'Category created successfully.',
      data: newCategory,
    });
  } catch (error) {
    console.error('createCategory Error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// 5. UPDATE CATEGORY
exports.updateCategory = async (req, res) => {
  try {
    const updated = await Category.findByIdAndUpdate(
      req.params.id,
      { $set: req.body },
      { returnDocument: 'after' }
    );

    if (!updated) {
      return res.status(404).json({ success: false, message: 'Category not found.' });
    }

    return res.status(200).json({
      success: true,
      message: 'Category updated successfully.',
      data: updated,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// 6. DELETE CATEGORY
exports.deleteCategory = async (req, res) => {
  try {
    await Category.findByIdAndDelete(req.params.id);
    return res.status(200).json({
      success: true,
      message: 'Category deleted successfully.',
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};