const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { asyncHandler, ApiError } = require('../middleware/asyncHandler');

const signToken = (userId) =>
  jwt.sign({ id: userId.toString() }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  });

const sendTokenResponse = (res, user, statusCode = 200) => {
  const token = signToken(user._id);
  res
    .status(statusCode)
    .cookie('token', token, {
      httpOnly: true,
      sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    })
    .json({ success: true, token, user });
};

/** @route POST /api/auth/register */
exports.register = asyncHandler(async (req, res) => {
  const { fullName, email, mobile, studentId, department, semester, password, confirmPassword } = req.body;

  const errors = {};
  if (!fullName || !fullName.trim()) errors.fullName = 'Full name is required';
  if (!email || !/^(?!.*\.\.)[A-Za-z0-9](?:[A-Za-z0-9._%+-]*[A-Za-z0-9])?@gmail\.com$/.test(email)) {
    errors.email = 'Only a valid Gmail address (@gmail.com) is allowed';
  }
  if (!mobile || !/^\+?[0-9]{7,15}$/.test(mobile)) errors.mobile = 'A valid mobile number (7-15 digits) is required';
  if (!studentId || !String(studentId).trim()) errors.studentId = 'Student ID is required';
  if (!department || !department.trim()) errors.department = 'Department is required';
  if (!semester || !semester.trim()) errors.semester = 'Semester is required';
  if (!password || password.length < 6) errors.password = 'Password must be at least 6 characters';
  if (password !== confirmPassword) errors.confirmPassword = 'Passwords do not match';
  if (Object.keys(errors).length) {
    throw new ApiError(400, Object.values(errors).join('. '));
  }

  /* Uniqueness checks — return specific field errors so the UI can show them inline */
  const or = [{ mobile: mobile.trim() }, { email: email.trim().toLowerCase() }, { studentId: String(studentId).trim().toUpperCase() }];
  const existing = await User.findOne({ $or: or }).lean();
  if (existing) {
    if (existing.mobile === mobile.trim()) throw new ApiError(409, 'Mobile number already registered');
    if (existing.email === email.trim().toLowerCase()) throw new ApiError(409, 'Email already registered');
    throw new ApiError(409, 'Student ID already registered');
  }

  const passwordHash = await User.hashPassword(password);

  const user = await User.create({
    fullName: fullName.trim(),
    email: email.trim().toLowerCase(),
    mobile: mobile.trim(),
    studentId: String(studentId).trim().toUpperCase(),
    department: department.trim(),
    semester: semester.trim(),
    passwordHash,
  });

  return sendTokenResponse(res, user, 201);
});

/** @route POST /api/auth/login  (mobile number + password) */
exports.login = asyncHandler(async (req, res) => {
  const { mobile, password } = req.body;

  if (!mobile || !password) {
    throw new ApiError(400, 'Mobile number and password are required');
  }

  const user = await User.findOne({ mobile: String(mobile).trim() }).select('+passwordHash');
  if (!user) {
    throw new ApiError(401, 'Invalid mobile number or password');
  }

  const isMatch = await user.comparePassword(password);
  if (!isMatch) {
    throw new ApiError(401, 'Invalid mobile number or password');
  }

  if (user.suspended) {
    throw new ApiError(403, 'This account has been suspended.');
  }

  return sendTokenResponse(res, user);
});

/** @route GET /api/auth/me */
exports.getMe = asyncHandler(async (req, res) => {
  res.json({ success: true, user: req.user });
});

/** @route PUT /api/auth/profile */
exports.updateProfile = asyncHandler(async (req, res) => {
  const user = req.user;
  const allowed = ['fullName', 'department', 'semester', 'profileImage'];
  const protectedFields = ['email', 'mobile', 'studentId', 'passwordHash', 'role', '_id'];

  protectedFields.forEach((f) => delete req.body[f]); // never allow changing protected fields

  allowed.forEach((f) => {
    if (req.body[f] !== undefined) user[f] = req.body[f];
  });

  await user.save();
  res.json({ success: true, user });
});

/** @route PUT /api/auth/change-password */
exports.changePassword = asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword) throw new ApiError(400, 'Current and new password are required');
  if (String(newPassword).length < 6) throw new ApiError(400, 'New password must be at least 6 characters');

  const user = await User.findById(req.user._id).select('+passwordHash');
  const isMatch = await user.comparePassword(currentPassword);
  if (!isMatch) throw new ApiError(401, 'Current password is incorrect');

  user.passwordHash = await User.hashPassword(newPassword);
  await user.save();

  return sendTokenResponse(res, user);
});

/** @route POST /api/auth/logout */
exports.logout = asyncHandler(async (_req, res) => {
  res.clearCookie('token').json({ success: true, message: 'Logged out' });
});
