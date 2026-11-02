const express = require('express');
const router = express.Router();

const {
  getEvents,
  getPublicEvents,
  getEventById,
  createEvent,
  updateEvent,
  updateEventStatus,
  deleteEvent,
} = require('../controllers/eventController');

const adminController = require('../controllers/adminController');
const { protect, authorize } = require('../middlewares/authMiddleware');

// 1. STANDARD EVENT ROUTES
router.get('/', getEvents);
router.get('/public', getPublicEvents);
router.get('/:id', getEventById);
router.post('/', protect, authorize('admin'), createEvent);
router.put('/:id', protect, authorize('admin'), updateEvent);
router.put('/:id/status', protect, authorize('admin'), updateEventStatus);
router.delete('/:id', protect, authorize('admin'), deleteEvent);

// 2. ADMIN PORTAL DIRECT EVENT SUB-ROUTES
// (Admin pages call /api/v1/events/:id/categories, :id/teams, :id/payments)
router.get('/:id/categories', protect, adminController.getEventCategories);
router.get('/:id/divisions', protect, adminController.getEventCategories);

router.get('/:id/teams', protect, adminController.getEventRegistrations);
router.get('/:id/registrations', protect, adminController.getEventRegistrations);

router.get('/:id/payments', protect, adminController.getPayments);

module.exports = router;
