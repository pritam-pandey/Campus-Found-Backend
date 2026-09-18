const express = require('express');
const {
  getUsers,
  getItems,
  getReports,
  updateReport,
  deleteItem,
  suspendUser,
  getStatistics,
  getOverview,
} = require('../controllers/adminController');
const { protect } = require('../middleware/auth');
const { adminOnly } = require('../middleware/admin');

const router = express.Router();

/* Every admin route requires authentication + role: "admin" */
router.use(protect, adminOnly);

router.get('/users', getUsers);
router.get('/items', getItems);
router.get('/reports', getReports);
router.get('/statistics', getStatistics);
router.get('/overview', getOverview);
router.put('/users/:id/suspend', suspendUser);
router.put('/reports/:id', updateReport);
router.delete('/items/:id', deleteItem);

module.exports = router;
