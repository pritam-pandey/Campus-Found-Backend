const mongoose = require('mongoose');

const itemSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    type: {
      type: String,
      enum: ['lost', 'found'],
      required: true,
      index: true,
    },
    itemName: {
      type: String,
      required: [true, 'Item name is required'],
      trim: true,
      maxlength: 120,
    },
    category: {
      type: String,
      required: [true, 'Category is required'],
      trim: true,
      index: true,
    },
    description: {
      type: String,
      required: [true, 'Description is required'],
      trim: true,
      maxlength: 2000,
    },
    images: [{ type: String }],
    color: { type: String, trim: true, default: '' },
    brand: { type: String, trim: true, default: '' },
    location: {
      type: String,
      required: [true, 'Location is required'],
      trim: true,
      index: true,
    },
    date: { type: Date, required: [true, 'Date is required'] },
    time: { type: String, trim: true, default: '' },
    status: {
      type: String,
      enum: ['active', 'possible_match', 'returned', 'closed'],
      default: 'active',
      index: true,
    },
  },
  {
    timestamps: true,
    toJSON: {
      transform(_doc, ret) {
        delete ret.__v;
        return ret;
      },
    },
  }
);

/* Frequently searched / filtered fields */
itemSchema.index({ type: 1, status: 1, createdAt: -1 });
itemSchema.index({ itemName: 'text', description: 'text', brand: 'text' });
itemSchema.index({ color: 1 });
itemSchema.index({ date: -1 });

module.exports = mongoose.model('Item', itemSchema);
