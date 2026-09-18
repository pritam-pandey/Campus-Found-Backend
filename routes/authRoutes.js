const express = require('express');
const {
  register,
  login,
  getMe,
  updateProfile,
  changePassword,
  logout,
} = require('../controllers/authController');
const { protect } = require('../middleware/auth');
const { authLimiter } = require('../middleware/rateLimiters');
const { uploadImages } = require('../middleware/upload');
const { uploadSingle } = require('../controllers/uploadController');

const router = express.Router();

/* Public */
router.post('/register', authLimiter, register);
router.post('/login', authLimiter, login);

/* Authenticated */
router.get('/me', protect, getMe);
router.put('/profile', protect, uploadImages('profileImage', 1), (req, res, next) => {
  if (req.files && req.files.length) {
    req.body.profileImage = `/uploads/${req.files[0].filename}`;
  }
  next();
}, updateProfile);
router.put('/change-password', protect, changePassword);
router.post('/logout', protect, logout);

/* Standalone image upload (profile picture etc.) */
router.post('/upload', protect, uploadImages('image', 1), uploadSingle);

module.exports = router;
