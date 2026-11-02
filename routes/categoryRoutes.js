const express = require('express');
const router = express.Router();

const categoryController = require('../controllers/categoryController');
const { protect, authorize } = require('../middlewares/authMiddleware');

// Get categories (Handles /api/v1/categories AND /api/v1/categories?eventId=...)
router.get('/', categoryController.getCategories);

// Handles /api/v1/categories/event/:eventId
router.get('/event/:eventId', categoryController.getCategoriesByEvent);

// Single category
router.get('/:id', categoryController.getCategoryById);

// Admin Mutation routes
router.post('/', protect, categoryController.createCategory);
router.put('/:id', protect, categoryController.updateCategory);
router.patch('/:id', protect, categoryController.updateCategory);
router.delete('/:id', protect, categoryController.deleteCategory);

module.exports = router;