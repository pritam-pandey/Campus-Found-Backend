/**
 * MongoDB connection via Mongoose.
 * Uses MONGODB_URI from environment (Atlas in production, local for dev).
 */
const mongoose = require('mongoose');

const connectDB = async () => {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error(
      'MONGODB_URI is not defined. Copy server/.env.example to server/.env and set your MongoDB Atlas connection string.'
    );
  }

  mongoose.set('strictQuery', true);

  mongoose.connection.on('connected', () => {
    console.log(`[db] MongoDB connected → ${mongoose.connection.name}`);
  });

  mongoose.connection.on('error', (err) => {
    console.error('[db] MongoDB connection error:', err.message);
  });

  mongoose.connection.on('disconnected', () => {
    console.warn('[db] MongoDB disconnected');
  });

  await mongoose.connect(uri, {
    serverSelectionTimeoutMS: 10000,
  });

  return mongoose.connection;
};

module.exports = connectDB;
