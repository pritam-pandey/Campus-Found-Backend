const mongoose = require('mongoose');

const reportSchema = new mongoose.Schema(
  {
    reporterId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    reportedUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    reportedItemId: { type: mongoose.Schema.Types.ObjectId, ref: 'Item' },
    reason: {
      type: String,
      required: [true, 'Reason is required'],
      trim: true,
      maxlength: 200,
    },
    description: { type: String, trim: true, default: '', maxlength: 2000 },
    status: {
      type: String,
      enum: ['pending', 'reviewed', 'resolved', 'rejected'],
      default: 'pending',
      index: true,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Report', reportSchema);
