const Result = require('../models/Result');
const Event = require('../models/Event');
const mongoose = require('mongoose');

const publicEventStatuses = ['upcoming', 'live', 'closed', 'ended'];

const eventSummary = (event) => ({
  _id: event._id,
  title: event.title,
  description: event.description,
  coverImageUrl: event.coverImageUrl,
  eventType: event.eventType,
  eventDate: event.eventDate,
  status: event.status,
});

exports.getPublicResults = async (_req, res) => {
  try {
    const rows = await Result.find({ isPublished: true })
      .select('playerName position score categoryName subCategory teamName eventId')
      .populate({ path: 'eventId', select: 'title eventDate eventType status' })
      .sort({ createdAt: -1 })
      .lean();

    const results = rows
      .filter((row) => row.eventId && publicEventStatuses.includes(row.eventId.status))
      .map((row) => ({
        _id: row._id,
        playerName: row.playerName,
        position: row.position,
        score: row.score,
        categoryName: row.categoryName,
        subCategory: row.subCategory,
        teamName: row.teamName,
        eventId: {
          title: row.eventId.title,
          eventDate: row.eventId.eventDate,
          eventType: row.eventId.eventType,
        },
      }));

    return res.status(200).json({ success: true, count: results.length, data: results });
  } catch (error) {
    console.error('getPublicResults Error:', error);
    return res.status(500).json({ success: false, message: 'Unable to load results.' });
  }
};

exports.getPublicResultEvents = async (_req, res) => {
  try {
    const [events, rows] = await Promise.all([
      Event.find({ status: { $in: publicEventStatuses } })
        .select('title description coverImageUrl eventType eventDate status')
        .sort({ eventDate: -1 })
        .lean(),
      Result.find({ isPublished: true })
        .select('eventId categoryId categoryName')
        .lean(),
    ]);

    const resultsByEvent = new Map();
    for (const row of rows) {
      const eventId = String(row.eventId);
      if (!resultsByEvent.has(eventId)) resultsByEvent.set(eventId, new Map());
      const categoryKey = row.categoryId
        ? `id:${row.categoryId}`
        : `name:${String(row.categoryName || 'General').trim().toLowerCase()}`;
      resultsByEvent.get(eventId).set(categoryKey, row.categoryName || 'General');
    }

    const now = new Date();
    const data = events
      .map((event) => {
        const eventDayEnd = event.eventDate ? new Date(event.eventDate) : null;
        if (eventDayEnd) eventDayEnd.setUTCHours(23, 59, 59, 999);
        const publishedCategories = resultsByEvent.get(String(event._id));
        const hasPublishedResults = Boolean(publishedCategories?.size);
        return {
          ...eventSummary(event),
          categoriesCount: publishedCategories?.size || 0,
          hasPublishedResults,
          eventEnded: event.status === 'ended' || Boolean(eventDayEnd && eventDayEnd < now),
        };
      })
      .filter((event) => event.eventEnded || event.hasPublishedResults);

    return res.status(200).json({ success: true, count: data.length, data });
  } catch (error) {
    console.error('getPublicResultEvents Error:', error);
    return res.status(500).json({ success: false, message: 'Unable to load result events.' });
  }
};

exports.getPublicResultsForEvent = async (req, res) => {
  try {
    const { eventId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(String(eventId))) {
      return res.status(400).json({ success: false, message: 'Invalid event ID.' });
    }

    const event = await Event.findOne({ _id: eventId, status: { $in: publicEventStatuses } })
      .select('title description coverImageUrl eventType eventDate status')
      .lean();
    if (!event) return res.status(404).json({ success: false, message: 'Event not found.' });

    const rows = await Result.find({ eventId, isPublished: true })
      .select('categoryId categoryName subCategory playerName teamName position score createdAt')
      .sort({ createdAt: 1 })
      .lean();

    const categoryMap = new Map();
    for (const row of rows) {
      const name = row.categoryName || 'General';
      const key = row.categoryId
        ? `id:${row.categoryId}`
        : `name:${String(name).trim().toLowerCase()}`;
      if (!categoryMap.has(key)) categoryMap.set(key, { id: String(row.categoryId || key), name, results: [] });
      categoryMap.get(key).results.push({
        _id: row._id,
        playerName: row.playerName,
        teamName: row.teamName,
        position: row.position,
        score: row.score,
        subCategory: row.subCategory,
      });
    }

    return res.status(200).json({
      success: true,
      data: { event: eventSummary(event), categories: Array.from(categoryMap.values()) },
    });
  } catch (error) {
    console.error('getPublicResultsForEvent Error:', error);
    return res.status(500).json({ success: false, message: 'Unable to load published results.' });
  }
};
