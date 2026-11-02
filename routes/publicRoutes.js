const express = require('express');
const router = express.Router();
const {
  getPublicResults,
  getPublicResultEvents,
  getPublicResultsForEvent,
} = require('../controllers/publicController');

router.get('/results', getPublicResults);
router.get('/results/events', getPublicResultEvents);
router.get('/results/:eventId', getPublicResultsForEvent);

module.exports = router;
