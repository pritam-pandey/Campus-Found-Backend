const jwt = require('jsonwebtoken');
const User = require('../models/User');

const secret = () => process.env.JWT_SECRET;

/**
 * Requires a valid JWT (Authorization: Bearer <token> or cookie).
 * Attaches the authenticated user document to req.user (passwordHash excluded).
 */
const protect = async (req, res, next) => {
  try {
    let token = null;

    const header = req.headers.authorization;
    if (header && header.startsWith('Bearer ')) {
      token = header.slice(7).trim();
    } else if (req.cookies && req.cookies.token) {
      token = req.cookies.token;
    }

    if (!token) {
      return res.status(401).json({ success: false, message: 'Not authenticated. Please log in.' });
    }

    let decoded;
    try {
      decoded = jwt.verify(token, secret());
    } catch {
      return res.status(401).json({ success: false, message: 'Session expired or invalid. Please log in again.' });
    }

    const user = await User.findById(decoded.id);
    if (!user) {
      return res.status(401).json({ success: false, message: 'Account no longer exists.' });
    }
    if (user.suspended) {
      return res.status(403).json({ success: false, message: 'This account has been suspended.' });
    }

    req.user = user;
    next();
  } catch (err) {
    next(err);
  }
};

/**
 * Attaches req.user when a valid token is present, but never blocks the request.
 * Used for public browse/search endpoints.
 */
const optionalAuth = async (req, _res, next) => {
  try {
    let token = null;
    const header = req.headers.authorization;
    if (header && header.startsWith('Bearer ')) token = header.slice(7).trim();
    else if (req.cookies && req.cookies.token) token = req.cookies.token;

    if (token) {
      try {
        const decoded = jwt.verify(token, secret());
        const user = await User.findById(decoded.id);
        if (user && !user.suspended) req.user = user;
      } catch {
        /* invalid token on a public route → stay anonymous */
      }
    }
    next();
  } catch (err) {
    next(err);
  }
};

module.exports = { protect, optionalAuth };
