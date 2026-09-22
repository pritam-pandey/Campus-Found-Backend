/**
 * Optional seed script — creates sample users, items, and an admin account.
 *
 * Usage:
 *   cd server && node seed.js
 *
 * Seeded accounts (password: Password123):
 *   +8801700000001 (admin)
 *   +8801700000002 (student, Rahul)
 *   +8801700000003 (student, Nusrat)
 */
require('dotenv').config();
const mongoose = require('mongoose');
const connectDB = require('./config/db');
const User = require('./models/User');
const Item = require('./models/Item');

const run = async () => {
  await connectDB();

  console.log('Clearing existing data...');
  await Promise.all([
    User.deleteMany({}),
    Item.deleteMany({}),
    mongoose.connection.collection('messages').deleteMany({}),
    mongoose.connection.collection('conversations').deleteMany({}),
    mongoose.connection.collection('notifications').deleteMany({}),
    mongoose.connection.collection('reports').deleteMany({}),
  ]);

  const passwordHash = await User.hashPassword('Password123');

  const users = await User.create([
    {
      fullName: 'Campus Admin',
      email: 'admin.campusfound@gmail.com',
      mobile: '+8801700000001',
      studentId: 'ADMIN001',
      department: 'Administration',
      semester: 'N/A',
      passwordHash,
      role: 'admin',
    },
    {
      fullName: 'Rahul Ahmed',
      email: 'rahul.campusfound@gmail.com',
      mobile: '+8801700000002',
      studentId: 'CSE2101',
      department: 'CSE',
      semester: 'Spring 2026',
      passwordHash,
    },
    {
      fullName: 'Nusrat Jahan',
      email: 'nusrat.campusfound@gmail.com',
      mobile: '+8801700000003',
      studentId: 'BBA2204',
      department: 'BBA',
      semester: 'Fall 2025',
      passwordHash,
    },
  ]);

  const [admin, rahul, nusrat] = users;

  const daysAgo = (n) => new Date(Date.now() - n * 86400000);

  await Item.create([
    {
      userId: rahul._id,
      type: 'lost',
      itemName: 'Black Wallet',
      category: 'Wallet',
      description: 'Lost my black leather wallet near the library, has my student ID inside.',
      color: 'Black',
      brand: 'Leader',
      location: 'Main Library',
      date: daysAgo(2),
      time: '14:30',
      status: 'active',
    },
    {
      userId: nusrat._id,
      type: 'found',
      itemName: 'Black Wallet',
      category: 'Wallet',
      description: 'Found a black wallet on a bench outside the library. Contains some cards.',
      color: 'Black',
      brand: 'Leader',
      location: 'Main Library',
      date: daysAgo(1),
      time: '10:00',
      status: 'active',
    },
    {
      userId: rahul._id,
      type: 'lost',
      itemName: 'Water Bottle',
      category: 'Bottle',
      description: 'Green steel water bottle left in lecture hall 301.',
      color: 'Green',
      brand: 'Lock&Lock',
      location: 'Building B',
      date: daysAgo(5),
      time: '09:15',
      status: 'active',
    },
    {
      userId: nusrat._id,
      type: 'found',
      itemName: 'Phone Charger',
      category: 'Electronics',
      description: 'Found a white phone charger in the cafeteria.',
      color: 'White',
      brand: 'Samsung',
      location: 'Cafeteria',
      date: daysAgo(3),
      time: '13:00',
      status: 'returned',
    },
    {
      userId: admin._id,
      type: 'found',
      itemName: 'Student ID Card',
      category: 'Documents',
      description: 'Found a student ID card in the engineering building corridor.',
      color: '',
      brand: '',
      location: 'Building A',
      date: daysAgo(1),
      time: '11:45',
      status: 'active',
    },
  ]);

  console.log('Seed complete:');
  console.log('  Admin   → +8801700000001 / Password123');
  console.log('  Student → +8801700000002 / Password123');
  console.log('  Student → +8801700000003 / Password123');

  await mongoose.connection.close();
  process.exit(0);
};

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
