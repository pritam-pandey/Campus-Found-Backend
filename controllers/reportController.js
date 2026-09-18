const Report = require('../models/Report');
const Notification = require('../models/Notification');
const { asyncHandler, ApiError } = require('../middleware/asyncHandler');

/**
 * @route POST /api/reports
 * @body { reportedUserId?, reportedItemId?, reason, description? }
 */
exports.createReport = asyncHandler(async (req, res) => {
  const { reportedUserId, reportedItemId, reason, description } = req.body;

  if (!reason || !reason.trim()) throw new ApiError(400, 'Reason is required');
  if (!reportedUserId && !reportedItemId) {
    throw new ApiError(400, 'A reported user or item is required');
  }

  const report = await Report.create({
    reporterId: req.user._id,
    reportedUserId: reportedUserId || undefined,
    reportedItemId: reportedItemId || undefined,
    reason: reason.trim(),
    description: description || '',
    status: 'pending',
  });

  /* Notify every admin so the report gets reviewed */
  const User = require('../models/User');
  const admins = await User.find({ role: 'admin' }).select('_id');
  if (admins.length) {
    await Notification.insertMany(
      admins.map((a) => ({
        userId: a._id,
        type: 'report',
        message: `New report submitted: "${report.reason}"`,
        relatedUserId: req.user._id,
      }))
    );
  }

  res.status(201).json({ success: true, report });
});

/** @route GET /api/reports/mine */
exports.myReports = asyncHandler(async (req, res) => {
  const reports = await Report.find({ reporterId: req.user._id })
    .populate('reportedUserId', 'fullName')
    .populate('reportedItemId', 'itemName type')
    .sort({ createdAt: -1 });
  res.json({ success: true, reports });
});
