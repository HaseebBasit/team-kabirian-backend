const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const { protect } = require('../middlewares/authMiddleware');

// 1. DASHBOARD
router.get('/dashboard', protect, adminController.getAdminDashboard);
router.get('/', protect, adminController.getAdminDashboard);

// 2. NOTIFICATIONS
router.get('/notifications', protect, (req, res, next) => {
  if (typeof adminController.getNotifications === 'function') {
    return adminController.getNotifications(req, res, next);
  }
  return res.status(200).json({ success: true, data: [] });
});
router.patch('/notifications/read-all', protect, (req, res, next) => {
  if (typeof adminController.markAllNotificationsAsRead === 'function') {
    return adminController.markAllNotificationsAsRead(req, res, next);
  }
  return res.status(200).json({ success: true, message: 'All read' });
});

// 3. CATEGORIES
router.get('/events/:eventId/categories', protect, adminController.getEventCategories);
router.get('/categories', protect, adminController.getEventCategories);

// 4. TEAMS & REGISTRATIONS
router.get('/events/:eventId/registrations', protect, adminController.getEventRegistrations);
router.get('/events/:eventId/teams', protect, adminController.getEventRegistrations);
router.get('/registrations', protect, adminController.getEventRegistrations);
router.get('/teams', protect, adminController.getEventRegistrations);
router.get('/registrations/:id', protect, adminController.getRegistrationById);
router.get('/teams/:id', protect, adminController.getRegistrationById);

// VERIFY PAYMENT & STATUS MUTATIONS
router.all('/registrations/:id/verify-payment', protect, adminController.updateRegistrationStatus);
router.all('/registrations/:id/status', protect, adminController.updateRegistrationStatus);
router.all('/payments/:id/verify-payment', protect, adminController.updateRegistrationStatus);
router.all('/payments/:id/status', protect, adminController.updateRegistrationStatus);

router.post('/registrations/:id/approve', protect, (req, res) => {
  req.body.status = 'approved';
  return adminController.updateRegistrationStatus(req, res);
});
router.post('/registrations/:id/reject', protect, (req, res) => {
  req.body.status = 'rejected';
  return adminController.updateRegistrationStatus(req, res);
});

// 5. RESULTS MANAGEMENT ROUTES
router.get('/results', adminController.getPublicResults);
router.post('/results', protect, adminController.assignResult);
router.put('/results/:id/toggle-publish', protect, adminController.toggleResultPublish);
router.get('/admin/results', adminController.getPublicResults);
router.post('/admin/results', protect, adminController.assignResult);
router.put('/admin/results/:id/toggle-publish', protect, adminController.toggleResultPublish);

// 6. PAYMENTS LIST
router.get('/events/:eventId/payments', protect, adminController.getPayments);
router.get('/payments', protect, adminController.getPayments);

module.exports = router;