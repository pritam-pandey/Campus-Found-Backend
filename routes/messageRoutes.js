const express = require('express');
const {
  startConversation,
  getConversations,
  getMessages,
  sendMessage,
  markRead,
  unreadCount,
  uploadAttachment,
} = require('../controllers/messageController');
const { protect } = require('../middleware/auth');
const { uploadImages } = require('../middleware/upload');

const router = express.Router();

/* All chat endpoints require authentication */
router.use(protect);

/* Conversations */
router.post('/conversations', startConversation);
router.get('/conversations', getConversations);
router.get('/conversations/:id/messages', getMessages);

/* Messages */
router.get('/unread-count', unreadCount);
router.post('/attachment', uploadImages('attachment', 1), uploadAttachment);
router.post('/', sendMessage);
router.put('/read', markRead);

module.exports = router;
