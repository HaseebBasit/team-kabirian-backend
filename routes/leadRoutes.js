const express = require('express');
const router = express.Router();
const { submitFreeClassLead, submitContactMessage } = require('../controllers/leadController');

router.post('/free-class', submitFreeClassLead);
router.post('/contact', submitContactMessage);

module.exports = router;
