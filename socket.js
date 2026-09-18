const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const User = require('./models/User');

/**
 * Socket.IO layer — real-time chat + notifications.
 * MongoDB remains the permanent store; sockets only push live events.
 */
const initSocket = (httpServer) => {
  const origins = (process.env.CLIENT_ORIGIN || 'http://localhost:5173')
    .split(',')
    .map((o) => o.trim());

  const io = new Server(httpServer, {
    cors: { origin: origins, credentials: true },
  });

  /* JWT handshake authentication */
  io.use(async (socket, next) => {
    try {
      const cookieToken = (socket.handshake.headers?.cookie || '')
        .split(';')
        .map((c) => c.trim())
        .find((c) => c.startsWith('token='))
        ?.slice(6);
      const token =
        socket.handshake.auth?.token ||
        (socket.handshake.headers?.authorization || '').replace(/^Bearer\s+/i, '') ||
        cookieToken;
      if (!token) return next(new Error('Authentication required'));
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const user = await User.findById(decoded.id);
      if (!user || user.suspended) return next(new Error('Authentication failed'));
      socket.userId = String(user._id);
      next();
    } catch {
      next(new Error('Authentication failed'));
    }
  });

  io.on('connection', (socket) => {
    /* Personal room for targeted pushes */
    socket.join(`user:${socket.userId}`);

    /* Join/leave a chat room so both participants receive live messages */
    socket.on('chat:join', (conversationId) => {
      if (typeof conversationId === 'string') {
        socket.join(`conversation:${conversationId}`);
      }
    });

    socket.on('chat:leave', (conversationId) => {
      if (typeof conversationId === 'string') {
        socket.leave(`conversation:${conversationId}`);
      }
    });

    socket.on('typing', ({ conversationId, isTyping }) => {
      if (!conversationId) return;
      socket.to(`conversation:${conversationId}`).emit('typing', {
        conversationId,
        userId: socket.userId,
        isTyping: !!isTyping,
      });
    });

    socket.on('disconnect', () => {
      socket.leave(`user:${socket.userId}`);
    });
  });

  return io;
};

module.exports = initSocket;
