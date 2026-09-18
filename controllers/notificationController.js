const Notification = require('../models/Notification');
const { asyncHandler, ApiError } = require('../middleware/asyncHandler');

/** @route GET /api/notifications */
exports.getNotifications = asyncHandler(async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page || '1', 10));
  const limit = Math.min(50, parseInt(req.query.limit || '20', 10));

  const query = { userId: req.user._id };

  const notifications = await Notification.find(query)
    .sort({ createdAt: -1 })
    .skip((page - 1) * limit)
    .limit(limit)
    .populate('relatedItemId', 'itemName type')
    .populate('relatedUserId', 'fullName profileImage');

  const total = await Notification.countDocuments(query);
  const unreadCount = await Notification.countDocuments({ userId: req.user._id, isRead: false });

  res.json({ success: true, notifications, total, unreadCount, page, pages: Math.ceil(total / limit) });
});

/** @route GET /api/notifications/unread-count */
exports.unreadCount = asyncHandler(async (req, res) => {
  const count = await Notification.countDocuments({ userId: req.user._id, isRead: false });
  res.json({ success: true, count });
});

/** @route PUT /api/notifications/:id/read */
exports.markRead = asyncHandler(async (req, res) => {
  const notification = await Notification.findOne({ _id: req.params.id, userId: req.user._id });
  if (!notification) throw new ApiError(404, 'Notification not found');

  notification.isRead = true;
  await notification.save();
  res.json({ success: true, notification });
});

/** @route PUT /api/notifications/read-all */
exports.markAllRead = asyncHandler(async (req, res) => {
  await Notification.updateMany({ userId: req.user._id, isRead: false }, { isRead: true });
  res.json({ success: true, message: 'All notifications marked as read' });
});
