const Item = require('../models/Item');
const User = require('../models/User');
const Notification = require('../models/Notification');
const { asyncHandler, ApiError } = require('../middleware/asyncHandler');

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

/** Tokenize + normalize a free-text field for fuzzy match comparison. */
const tokens = (s) =>
  String(s || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 1);

/** Jaccard similarity between two token sets. */
const jaccard = (a, b) => {
  const A = new Set(a);
  const B = new Set(b);
  if (!A.size || !B.size) return 0;
  let inter = 0;
  A.forEach((t) => {
    if (B.has(t)) inter += 1;
  });
  return inter / (A.size + B.size - inter);
};

const sameDay = (d1, d2) => {
  if (!d1 || !d2) return false;
  const a = new Date(d1);
  const b = new Date(d2);
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
};

const daysBetween = (d1, d2) => Math.abs(new Date(d1) - new Date(d2)) / 86400000;

/**
 * Weighted match score between a lost item and a found item.
 * Weights sum to 1.0.
 */
const computeMatchScore = (lost, found) => {
  const weights = { category: 0.3, itemName: 0.2, color: 0.15, brand: 0.15, location: 0.15, date: 0.05 };
  let score = 0;

  score += String(lost.category).toLowerCase() === String(found.category).toLowerCase() ? weights.category : 0;
  score += jaccard(tokens(lost.itemName), tokens(found.itemName)) * weights.itemName;
  score += jaccard(tokens(lost.color), tokens(found.color)) * weights.color;
  score += jaccard(tokens(lost.brand), tokens(found.brand)) * weights.brand;
  score += jaccard(tokens(lost.location), tokens(found.location)) * weights.location;

  if (sameDay(lost.date, found.date)) score += weights.date;
  else if (daysBetween(lost.date, found.date) <= 7) score += weights.date * 0.5;

  return Math.round(score * 100); // 0 - 100
};

const MATCH_THRESHOLD = parseInt(process.env.MATCH_THRESHOLD || '60', 10);

/**
 * Match a new lost item against found items (and vice versa),
 * flag both sides as possible_match and notify both owners.
 */
const findMatchesForNewItem = async (item) => {
  const oppositeType = item.type === 'lost' ? 'found' : 'lost';

  /* Pre-filter candidates in MongoDB, then score in memory */
  const candidates = await Item.find({
    _id: { $ne: item._id },
    type: oppositeType,
    status: { $in: ['active', 'possible_match'] },
    category: item.category,
  })
    .limit(100)
    .populate('userId', 'fullName mobile email');

  for (const candidate of candidates) {
    const score = computeMatchScore(item, candidate);
    if (score < MATCH_THRESHOLD) continue;

    /* Flag the new item + the counterpart as possible matches */
    await Item.updateOne({ _id: item._id }, { status: 'possible_match' });
    await Item.updateOne(
      { _id: candidate._id, status: { $ne: 'returned' } },
      { status: 'possible_match' }
    );
    item.status = 'possible_match';

    const matchWord = item.type === 'lost' ? 'lost' : 'found';
    await Notification.create([
      {
        userId: item.userId,
        type: 'possible_match',
        message: `We found a possible match for your ${matchWord} "${item.itemName}".`,
        relatedItemId: candidate._id,
        relatedUserId: candidate.userId?._id || candidate.userId,
      },
      {
        userId: candidate.userId?._id || candidate.userId,
        type: 'possible_match',
        message: `A new ${matchWord} report ("${item.itemName}") may match your item "${candidate.itemName}".`,
        relatedItemId: item._id,
        relatedUserId: item.userId,
      },
    ]);

    /* Emit a real-time notification to both users if they are online */
    try {
      const io = req_io;
      if (io) {
        io.to(`user:${item.userId}`).emit('notification:new', { type: 'possible_match', message: `We found a possible match for your ${matchWord} "${item.itemName}".` });
        io.to(`user:${candidate.userId?._id || candidate.userId}`).emit('notification:new', { type: 'possible_match', message: `A new ${matchWord} report may match your "${candidate.itemName}".` });
      }
    } catch (_) { /* socket layer optional */ }
  }
};

/* req_io is set by server.js so controllers can emit socket events */
let req_io = null;
exports.setIO = (io) => { req_io = io; };

/* ------------------------------------------------------------------ */
/*  CRUD                                                               */
/* ------------------------------------------------------------------ */

/** @route POST /api/items/lost (multipart form; images field: "images") */
exports.createItem = (type) =>
  asyncHandler(async (req, res) => {
    const { itemName, category, description, color, brand, location, date, time } = req.body;

    if (!itemName || !category || !description || !location || !date) {
      throw new ApiError(400, 'itemName, category, description, location and date are required');
    }

    const images = (req.files || []).map((f) => `/uploads/${f.filename}`);

    const item = await Item.create({
      userId: req.user._id,
      type,
      itemName,
      category,
      description,
      images,
      color: color || '',
      brand: brand || '',
      location,
      date,
      time: time || '',
      status: 'active',
    });

    await findMatchesForNewItem(item);

    const populated = await Item.findById(item._id).populate('userId', 'fullName email mobile studentId department semester profileImage');
    res.status(201).json({ success: true, item: populated });
  });

/** @route GET /api/items/lost | /api/items/found  (public: only active/possible_match) */
exports.getItems = (type) =>
  asyncHandler(async (req, res) => {
    const { category, location, q, dateFrom, dateTo, page = 1, limit = 12 } = req.query;

    const query = { type, status: { $in: ['active', 'possible_match'] } };
    if (category) query.category = category;
    if (location) query.location = { $regex: location.trim(), $options: 'i' };
    if (dateFrom || dateTo) {
      query.date = {};
      if (dateFrom) query.date.$gte = new Date(dateFrom);
      if (dateTo) query.date.$lte = new Date(dateTo);
    }
    if (q) {
      const rx = { $regex: q.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' };
      query.$or = [{ itemName: rx }, { description: rx }, { color: rx }, { brand: rx }, { location: rx }];
    }

    const items = await Item.find(query)
      .populate('userId', 'fullName studentId profileImage')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(Number(limit));

    const total = await Item.countDocuments(query);
    res.json({ success: true, items, total, page: Number(page), pages: Math.ceil(total / limit) });
  });

/** @route GET /api/items/search?q=...  — cross-type search with filters */
exports.searchItems = asyncHandler(async (req, res) => {
  const { q, type, category, location, status, dateFrom, dateTo, page = 1, limit = 12 } = req.query;

  const query = {};
  if (type === 'lost' || type === 'found') query.type = type;
  if (status && ['active', 'possible_match', 'returned', 'closed'].includes(status)) query.status = status;
  else if (!status) query.status = { $in: ['active', 'possible_match'] };
  if (category) query.category = category;
  if (location) query.location = { $regex: location.trim(), $options: 'i' };
  if (dateFrom || dateTo) {
    query.date = {};
    if (dateFrom) query.date.$gte = new Date(dateFrom);
    if (dateTo) query.date.$lte = new Date(dateTo);
  }
  if (q) {
    const rx = { $regex: q.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' };
    query.$or = [
      { itemName: rx },
      { description: rx },
      { color: rx },
      { brand: rx },
      { location: rx },
      { category: rx },
    ];
  }

  const items = await Item.find(query)
    .populate('userId', 'fullName studentId profileImage')
    .sort({ createdAt: -1 })
    .skip((page - 1) * limit)
    .limit(Number(limit));

  const total = await Item.countDocuments(query);
  res.json({ success: true, items, total, page: Number(page), pages: Math.ceil(total / limit) });
});

/** @route GET /api/items/my-posts */
exports.myPosts = asyncHandler(async (req, res) => {
  const items = await Item.find({ userId: req.user._id }).sort({ createdAt: -1 });
  res.json({ success: true, items });
});

/** @route GET /api/items/:id — owner/admin get contact fields, others a limited view */
exports.getItem = asyncHandler(async (req, res) => {
  const item = await Item.findById(req.params.id).populate('userId');
  if (!item) throw new ApiError(404, 'Item not found');

  const viewer = req.user;
  const isOwner = viewer && String(item.userId?._id) === String(viewer._id);
  const isAdmin = viewer && viewer.role === 'admin';

  const owner = isOwner || isAdmin
    ? item.userId
    : { _id: item.userId._id, fullName: item.userId.fullName, profileImage: item.userId.profileImage };

  res.json({ success: true, item: { ...item.toObject(), userId: owner } });
});

/** @route PUT /api/items/:id  (owner or admin) */
exports.updateItem = asyncHandler(async (req, res) => {
  const item = await Item.findById(req.params.id);
  if (!item) throw new ApiError(404, 'Item not found');

  const isOwner = String(item.userId) === String(req.user._id);
  const isAdmin = req.user.role === 'admin';
  if (!isOwner && !isAdmin) throw new ApiError(403, 'You are not allowed to modify this item');

  const allowed = ['itemName', 'category', 'description', 'color', 'brand', 'location', 'date', 'time', 'status'];
  allowed.forEach((f) => {
    if (req.body[f] !== undefined) item[f] = req.body[f];
  });

  if (req.files && req.files.length) {
    const newImages = req.files.map((f) => `/uploads/${f.filename}`);
    item.images = [...item.images, ...newImages].slice(0, 8);
  }

  await item.save();
  res.json({ success: true, item });
});

/** @route DELETE /api/items/:id  (owner or admin) */
exports.deleteItem = asyncHandler(async (req, res) => {
  const item = await Item.findById(req.params.id);
  if (!item) throw new ApiError(404, 'Item not found');

  const isOwner = String(item.userId) === String(req.user._id);
  const isAdmin = req.user.role === 'admin';
  if (!isOwner && !isAdmin) throw new ApiError(403, 'You are not allowed to delete this item');

  await item.deleteOne();
  res.json({ success: true, message: 'Item deleted' });
});

/** @route PUT /api/items/:id/returned  (owner or admin only) */
exports.markReturned = asyncHandler(async (req, res) => {
  const item = await Item.findById(req.params.id);
  if (!item) throw new ApiError(404, 'Item not found');

  const isOwner = String(item.userId) === String(req.user._id);
  const isAdmin = req.user.role === 'admin';
  if (!isOwner && !isAdmin) throw new ApiError(403, 'Only the item owner or an admin can mark this returned');

  if (item.status === 'returned') {
    return res.json({ success: true, item, message: 'Item already marked as returned' });
  }

  item.status = 'returned';
  await item.save();

  /* Notify the counterpart owner that the item was returned */
  const counterpartType = item.type === 'lost' ? 'found' : 'lost';
  const counterpart = await Item.findOne({
    type: counterpartType,
    category: item.category,
    itemName: { $regex: item.itemName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' },
    status: 'possible_match',
  }).sort({ createdAt: -1 });

  if (counterpart) {
    await Item.updateOne({ _id: counterpart._id }, { status: 'returned' });
    await Notification.create({
      userId: counterpart.userId,
      type: 'item_returned',
      message: `Your ${counterpartType} item "${counterpart.itemName}" has been marked as returned.`,
      relatedItemId: item._id,
      relatedUserId: req.user._id,
    });
    if (req_io) req_io.to(`user:${counterpart.userId}`).emit('notification:new', { type: 'item_returned' });
  }

  res.json({ success: true, item });
});
