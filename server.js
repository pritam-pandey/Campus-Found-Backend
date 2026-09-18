require('dotenv').config();

const http = require('http');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const cookieParser = require('cookie-parser');
const mongoSanitize = require('express-mongo-sanitize');
const path = require('path');

const connectDB = require('./config/db');
const initSocket = require('./socket');
const { notFound, errorHandler } = require('./middleware/errorHandler');
const { apiLimiter } = require('./middleware/rateLimiters');

const app = express();

/* ------------------------------------------------------------------ */
/*  Security & parsing middleware                                      */
/* ------------------------------------------------------------------ */
app.set('trust proxy', 1);

app.use(
  helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' }, // allow client origin to load /uploads images
    contentSecurityPolicy: false, // JSON API + static uploads; client CSP handled by Vite
  })
);

const allowedOrigins = (process.env.CLIENT_ORIGIN || 'http://localhost:5173')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

app.use(
  cors({
    origin(origin, callback) {
      // allow server-to-server / same-origin requests with no Origin header
      if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
      return callback(new Error('Not allowed by CORS'));
    },
    credentials: true,
  })
);

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(mongoSanitize()); // strip $ / . operators — MongoDB injection protection
if (process.env.NODE_ENV !== 'test') app.use(morgan('dev'));

/* Static uploads — images stored on disk, URLs stored in MongoDB */
app.use('/uploads', express.static(path.join(__dirname, 'uploads'), { maxAge: '7d' }));

/* Health check */
app.get('/api/health', (_req, res) => {
  const mongoose = require('mongoose');
  res.json({
    success: true,
    message: 'Campus Found API is running',
    db: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
    time: new Date().toISOString(),
  });
});

/* ------------------------------------------------------------------ */
/*  API routes                                                         */
/* ------------------------------------------------------------------ */
app.use('/api', apiLimiter);
app.use('/api/auth', require('./routes/authRoutes'));
app.use('/api/items', require('./routes/itemRoutes'));
app.use('/api/messages', require('./routes/messageRoutes'));
app.use('/api/notifications', require('./routes/notificationRoutes'));
app.use('/api/reports', require('./routes/reportRoutes'));
app.use('/api/admin', require('./routes/adminRoutes'));

/* ------------------------------------------------------------------ */
/*  Errors                                                             */
/* ------------------------------------------------------------------ */
app.use(notFound);
app.use(errorHandler);

/* ------------------------------------------------------------------ */
/*  Boot                                                               */
/* ------------------------------------------------------------------ */
const PORT = process.env.PORT || 5000;

const start = async () => {
  try {
    await connectDB();

    const server = http.createServer(app);
    const io = initSocket(server);

    /* Give controllers access to the socket layer for real-time events */
    require('./controllers/itemController').setIO(io);
    require('./controllers/messageController').setIO(io);

    server.listen(PORT, () => {
      console.log(`[server] Campus Found API listening on http://localhost:${PORT}`);
    });
    return server;
  } catch (err) {
    console.error('[server] Failed to start:', err.message);
    process.exit(1);
  }
};

if (require.main === module) start();

module.exports = { app, start };
