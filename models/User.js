const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const BCRYPT_ROUNDS = parseInt(process.env.BCRYPT_ROUNDS || '12', 10);

const userSchema = new mongoose.Schema(
  {
    fullName: {
      type: String,
      required: [true, 'Full name is required'],
      trim: true,
      maxlength: [80, 'Full name is too long'],
    },
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      lowercase: true,
      trim: true,
      match: [
        /^(?!.*\.\.)[a-z0-9](?:[a-z0-9._%+-]*[a-z0-9])?@gmail\.com$/,
        'Only a valid Gmail address (@gmail.com) is allowed',
      ],
    },
    mobile: {
      type: String,
      required: [true, 'Mobile number is required'],
      unique: true,
      trim: true,
      match: [/^\+?[0-9]{7,15}$/, 'Please provide a valid mobile number (7-15 digits)'],
    },
    studentId: {
      type: String,
      required: [true, 'Student ID is required'],
      unique: true,
      uppercase: true,
      trim: true,
    },
    passwordHash: {
      type: String,
      required: true,
      select: false,
    },
    department: {
      type: String,
      required: [true, 'Department is required'],
      trim: true,
    },
    semester: {
      type: String,
      required: [true, 'Semester is required'],
      trim: true,
    },
    profileImage: { type: String, default: '' },
    role: {
      type: String,
      enum: ['student', 'admin'],
      default: 'student',
    },
    suspended: { type: Boolean, default: false },
  },
  {
    timestamps: true,
    toJSON: {
      transform(_doc, ret) {
        delete ret.passwordHash;
        delete ret.__v;
        return ret;
      },
    },
    toObject: {
      transform(_doc, ret) {
        delete ret.passwordHash;
        delete ret.__v;
        return ret;
      },
    },
  }
);

/** Compare a plain-text candidate password with the stored bcrypt hash. */
userSchema.methods.comparePassword = function (candidate) {
  return bcrypt.compare(candidate, this.passwordHash);
};

/** Hash a plain-text password (static helper used by auth controller). */
userSchema.statics.hashPassword = function (plain) {
  return bcrypt.hash(plain, BCRYPT_ROUNDS);
};

module.exports = mongoose.model('User', userSchema);
