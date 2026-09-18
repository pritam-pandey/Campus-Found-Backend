const express = require('express');
const { createReport, myReports } = require('../controllers/reportController');
const { protect } = require('../middleware/auth');

const router = express.Router();

router.use(protect);

router.post('/', createReport);
router.get('/mine', myReports);

module.exports = router;
