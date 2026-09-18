const User = require('../models/User');
const Item = require('../models/Item');
const Report = require('../models/Report');
const Message = require('../models/Message');
const Conversation = require('../models/Conversation');
const Notification = require('../models/Notification');
const { asyncHandler, ApiError } = require('../middleware/asyncHandler');

/** @route GET /api/admin/users?q=&role= */
exports.getUsers = asyncHandler(async (req, res) => {
  const { q, role, page = 1, limit = 20 } = req.query;
  const query = {};

  if (role === 'student' || role === 'admin') query.role = role;
  if (q) {
    const escaped = String(q).trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const rx = { $regex: escaped, $options: 'i' };
    query.$or = [{ fullName: rx }, { email: rx }, { studentId: rx }, { mobile: rx }, { department: rx }];
  }

  const users = await User.find(query)
    .sort({ createdAt: -1 })
    .skip((page - 1) * limit)
    .limit(Number(limit));

  const total = await User.countDocuments(query);
  res.json({ success: true, users, total, page: Number(page), pages: Math.ceil(total / limit) });
});

/** @route GET /api/admin/items?type=&status=&q= */
exports.getItems = asyncHandler(async (req, res) => {
  const { type, status, q, page = 1, limit = 20 } = req.query;
  const query = {};

  if (type === 'lost' || type === 'found') query.type = type;
  if (status && ['active', 'possible_match', 'returned', 'closed'].includes(status)) query.status = status;
  if (q) {
    const escaped = String(q).trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const rx = { $regex: escaped, $options: 'i' };
    query.$or = [{ itemName: rx }, { description: rx }, { location: rx }, { category: rx }];
  }

  const items = await Item.find(query)
    .populate('userId', 'fullName studentId email')
    .sort({ createdAt: -1 })
    .skip((page - 1) * limit)
    .limit(Number(limit));

  const total = await Item.countDocuments(query);
  res.json({ success: true, items, total, page: Number(page), pages: Math.ceil(total / limit) });
});

/** @route GET /api/admin/reports?status= */
exports.getReports = asyncHandler(async (req, res) => {
  const { status, page = 1, limit = 20 } = req.query;
  const query = {};
  if (status && ['pending', 'reviewed', 'resolved', 'rejected'].includes(status)) query.status = status;

  const reports = await Report.find(query)
    .populate('reporterId', 'fullName studentId email')
    .populate('reportedUserId', 'fullName studentId')
    .populate('reportedItemId', 'itemName type status')
    .sort({ createdAt: -1 })
    .skip((page - 1) * limit)
    .limit(Number(limit));

  const total = await Report.countDocuments(query);
  res.json({ success: true, reports, total, page: Number(page), pages: Math.ceil(total / limit) });
});

/** @route PUT /api/admin/reports/:id  { status } */
exports.updateReport = asyncHandler(async (req, res) => {
  const { status } = req.body;
  if (!['pending', 'reviewed', 'resolved', 'rejected'].includes(status)) {
    throw new ApiError(400, 'Invalid report status');
  }

  const report = await Report.findByIdAndUpdate(req.params.id, { status }, { new: true });
  if (!report) throw new ApiError(404, 'Report not found');

  res.json({ success: true, report });
});

/** @route DELETE /api/admin/items/:id */
exports.deleteItem = asyncHandler(async (req, res) => {
  const item = await Item.findById(req.params.id);
  if (!item) throw new ApiError(404, 'Item not found');

  await item.deleteOne();
  res.json({ success: true, message: 'Item deleted by admin' });
});

/** @route PUT /api/admin/users/:id/suspend  { suspended: true|false } */
exports.suspendUser = asyncHandler(async (req, res) => {
  const { suspended } = req.body;
  if (typeof suspended !== 'boolean') throw new ApiError(400, '`suspended` boolean is required');

  const user = await User.findById(req.params.id);
  if (!user) throw new ApiError(404, 'User not found');
  if (String(user._id) === String(req.user._id)) throw new ApiError(400, 'You cannot suspend yourself');
  if (user.role === 'admin') throw new ApiError(403, 'Admins cannot be suspended');

  user.suspended = suspended;
  await user.save();

  res.json({ success: true, user });
});

/**
 * @route GET /api/admin/statistics
 * Dashboard numbers computed live with MongoDB aggregation — nothing hard-coded.
 */
exports.getStatistics = asyncHandler(async (_req, res) => {
  const [totalStudents, lostByStatus, foundByStatus, totalConversations, totalMessages, pendingReports] =
    await Promise.all([
      User.countDocuments({ role: 'student' }),
      Item.aggregate([
        { $match: { type: 'lost' } },
        { $group: { _id: '$status', count: { $sum: 1 } } },
      ]),
      Item.aggregate([
        { $match: { type: 'found' } },
        { $group: { _id: '$status', count: { $sum: 1 } } },
      ]),
      Conversation.countDocuments(),
      Message.countDocuments(),
      Report.countDocuments({ status: 'pending' }),
    ]);

  const toMap = (rows) => rows.reduce((m, r) => ({ ...m, [r._id]: r.count }), {});

  const lost = toMap(lostByStatus);
  const found = toMap(foundByStatus);

  res.json({
    success: true,
    statistics: {
      totalStudents,
      totalLostItems: Object.values(lost).reduce((a, b) => a + b, 0),
      totalFoundItems: Object.values(found).reduce((a, b) => a + b, 0),
      totalReturnedItems: (lost.returned || 0) + (found.returned || 0),
      activeLostItems: (lost.active || 0) + (lost.possible_match || 0),
      activeFoundItems: (found.active || 0) + (found.possible_match || 0),
      possibleMatches: (lost.possible_match || 0) + (found.possible_match || 0),
      totalConversations,
      totalMessages,
      pendingReports,
    },
  });
});

/** @route GET /api/admin/overview — recent activity feed */
exports.getOverview = asyncHandler(async (_req, res) => {
  const [recentItems, recentReports, recentUsers] = await Promise.all([
    Item.find().sort({ createdAt: -1 }).limit(5).populate('userId', 'fullName'),
    Report.find().sort({ createdAt: -1 }).limit(5).populate('reporterId', 'fullName'),
    User.find({ role: 'student' }).sort({ createdAt: -1 }).limit(5),
  ]);

  res.json({ success: true, recentItems, recentReports, recentUsers });
});
