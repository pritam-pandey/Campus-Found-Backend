const Conversation = require('../models/Conversation');
const Message = require('../models/Message');
const Item = require('../models/Item');
const Notification = require('../models/Notification');
const { asyncHandler, ApiError } = require('../middleware/asyncHandler');

let io = null;
exports.setIO = (ioInstance) => {
  io = ioInstance;
};

const emitTo = (userId, event, payload) => {
  if (io) io.to(`user:${userId}`).emit(event, payload);
};

/**
 * @route POST /api/conversations
 * @body { itemId, receiverId? }
 * Finds an existing conversation for (me, other, item) or creates one.
 */
exports.startConversation = asyncHandler(async (req, res) => {
  const { itemId, receiverId } = req.body;

  const item = await Item.findById(itemId);
  if (!item) throw new ApiError(404, 'Item not found');

  const otherUserId = receiverId || String(item.userId);
  if (String(otherUserId) === String(req.user._id)) {
    throw new ApiError(400, 'You cannot start a conversation about your own item');
  }

  let conversation = await Conversation.findOne({
    itemId: item._id,
    participants: { $all: [req.user._id, otherUserId], $size: 2 },
  });

  if (!conversation) {
    conversation = await Conversation.create({
      participants: [req.user._id, otherUserId],
      itemId: item._id,
      lastMessage: '',
      lastMessageAt: new Date(),
    });
  }

  const populated = await Conversation.findById(conversation._id)
    .populate('participants', 'fullName profileImage studentId')
    .populate('itemId', 'itemName type status images');

  res.status(201).json({ success: true, conversation: populated });
});

/** @route GET /api/conversations — conversation list for the sidebar */
exports.getConversations = asyncHandler(async (req, res) => {
  const conversations = await Conversation.find({ participants: req.user._id })
    .populate('participants', 'fullName profileImage studentId')
    .populate('itemId', 'itemName type status images')
    .sort({ lastMessageAt: -1 });

  /* Attach unread count (messages sent by the other participant, not yet read) */
  const withUnread = await Promise.all(
    conversations.map(async (c) => {
      const unreadCount = await Message.countDocuments({
        conversationId: c._id,
        receiverId: req.user._id,
        readStatus: false,
      });
      return { ...c.toObject(), unreadCount };
    })
  );

  res.json({ success: true, conversations: withUnread });
});

/** @route GET /api/conversations/:id/messages?markRead=true */
exports.getMessages = asyncHandler(async (req, res) => {
  const conversation = await Conversation.findById(req.params.id);
  if (!conversation) throw new ApiError(404, 'Conversation not found');

  /* Private chat authorization: only the two participants may read */
  if (!conversation.participants.some((p) => String(p) === String(req.user._id))) {
    throw new ApiError(403, 'You are not a participant of this conversation');
  }

  const messages = await Message.find({ conversationId: conversation._id }).sort({ createdAt: 1 });

  if (req.query.markRead === 'true') {
    await Message.updateMany(
      { conversationId: conversation._id, receiverId: req.user._id, readStatus: false },
      { readStatus: true }
    );
  }

  res.json({ success: true, messages });
});

/**
 * @route POST /api/messages
 * @body { conversationId, message?, attachment? }
 * Persists the message in MongoDB, updates the conversation's last message,
 * creates a notification and pushes both in real time via Socket.IO.
 */
exports.sendMessage = asyncHandler(async (req, res) => {
  const { conversationId, message, attachment } = req.body;

  if (!message && !attachment) throw new ApiError(400, 'Message text or attachment is required');

  const conversation = await Conversation.findById(conversationId);
  if (!conversation) throw new ApiError(404, 'Conversation not found');

  const isParticipant = conversation.participants.some((p) => String(p) === String(req.user._id));
  if (!isParticipant) throw new ApiError(403, 'You are not a participant of this conversation');

  const receiverId = conversation.participants.find((p) => String(p) !== String(req.user._id));

  const msg = await Message.create({
    conversationId: conversation._id,
    senderId: req.user._id,
    receiverId,
    itemId: conversation.itemId,
    message: message || '',
    attachment: attachment || '',
    readStatus: false,
  });

  const lastMessageText = message || '📎 Attachment';
  await Conversation.updateOne(
    { _id: conversation._id },
    { lastMessage: lastMessageText, lastMessageAt: new Date() }
  );

  const populated = await Message.findById(msg._id).populate('senderId', 'fullName profileImage');

  /* Real-time push */
  emitTo(receiverId, 'message:new', populated);
  emitTo(req.user._id, 'message:sent', populated);

  /* Notification (type: message) */
  const notification = await Notification.create({
    userId: receiverId,
    type: 'message',
    message: `New message from ${req.user.fullName}: ${lastMessageText}`.slice(0, 180),
    relatedItemId: conversation.itemId,
    relatedUserId: req.user._id,
  });
  emitTo(receiverId, 'notification:new', { type: 'message', message: notification.message });

  res.status(201).json({ success: true, message: populated });
});

/** @route PUT /api/messages/read  { conversationId } */
exports.markRead = asyncHandler(async (req, res) => {
  const { conversationId } = req.body;
  const conversation = await Conversation.findById(conversationId);
  if (!conversation) throw new ApiError(404, 'Conversation not found');

  if (!conversation.participants.some((p) => String(p) === String(req.user._id))) {
    throw new ApiError(403, 'You are not a participant of this conversation');
  }

  await Message.updateMany(
    { conversationId, receiverId: req.user._id, readStatus: false },
    { readStatus: true }
  );
  res.json({ success: true });
});

/** @route GET /api/messages/unread-count */
exports.unreadCount = asyncHandler(async (req, res) => {
  const count = await Message.countDocuments({
    receiverId: req.user._id,
    readStatus: false,
  });
  res.json({ success: true, count });
});

/** @route POST /api/messages/attachment (multipart, field "attachment") */
exports.uploadAttachment = asyncHandler(async (req, res) => {
  if (!req.file) throw new ApiError(400, 'No file uploaded');
  res.json({ success: true, url: `/uploads/${req.file.filename}` });
});
