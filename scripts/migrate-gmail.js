/**
 * One-off migration for the "Gmail-only emails" rule.
 * Existing demo accounts were seeded with @campusfound.edu addresses; the new
 * User schema rejects those on any save(). Rewrites them to Gmail equivalents.
 *
 * Run: node backend/scripts/migrate-gmail.js   (uses MONGODB_URI from backend/.env)
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const mongoose = require('mongoose');

const MAPPING = {
  'admin@campusfound.edu': 'admin.campusfound@gmail.com',
  'rahul@campusfound.edu': 'rahul.campusfound@gmail.com',
  'nusrat@campusfound.edu': 'nusrat.campusfound@gmail.com',
};

(async () => {
  await mongoose.connect(process.env.MONGODB_URI);
  const User = require('../models/User');

  for (const [oldEmail, newEmail] of Object.entries(MAPPING)) {
    const r = await User.updateOne({ email: oldEmail }, { $set: { email: newEmail } });
    console.log(`${oldEmail} -> ${newEmail}: ${r.modifiedCount ? 'updated' : r.matchedCount ? 'already migrated' : 'not found'}`);
  }

  const left = await User.countDocuments({ email: { $not: /@gmail\.com$/i } });
  console.log(`Remaining non-Gmail users: ${left}`);
  if (left > 0) {
    const docs = await User.find({ email: { $not: /@gmail\.com$/i } }).select('email').lean();
    console.log('Still non-Gmail:', docs.map((d) => d.email).join(', '));
  }

  await mongoose.disconnect();
})().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
