const express = require('express');
const {
  createItem,
  getItems,
  getItem,
  updateItem,
  deleteItem,
  markReturned,
  myPosts,
  searchItems,
} = require('../controllers/itemController');
const { protect, optionalAuth } = require('../middleware/auth');
const { uploadImages } = require('../middleware/upload');

const router = express.Router();

/* Public browsing + search (optional auth lets owners see extra info) */
router.get('/search', optionalAuth, searchItems);
router.get('/my-posts', protect, myPosts);

/* Lost items */
router.post('/lost', protect, uploadImages('images'), createItem('lost'));
router.get('/lost', optionalAuth, getItems('lost'));

/* Found items */
router.post('/found', protect, uploadImages('images'), createItem('found'));
router.get('/found', optionalAuth, getItems('found'));

/* Single item operations — keep last so /:id doesn't swallow the above */
router.get('/:id', optionalAuth, getItem);
router.put('/:id', protect, uploadImages('images'), updateItem);
router.delete('/:id', protect, deleteItem);
router.put('/:id/returned', protect, markReturned);

module.exports = router;
