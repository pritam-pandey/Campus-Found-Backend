/** Central error handling — always returns { success, message } JSON. */

const notFound = (req, res) => {
  res.status(404).json({ success: false, message: `Route not found: ${req.method} ${req.originalUrl}` });
};

// eslint-disable-next-line no-unused-vars
const errorHandler = (err, _req, res, _next) => {
  let status = err.statusCode || 500;
  let message = err.message || 'Internal server error';

  /* Mongoose: invalid ObjectId */
  if (err.name === 'CastError') {
    status = 404;
    message = 'Resource not found';
  }

  /* Mongoose: schema validation */
  if (err.name === 'ValidationError') {
    status = 400;
    message = Object.values(err.errors)
      .map((e) => e.message)
      .join('. ');
  }

  /* MongoDB duplicate keys (email / mobile / studentId …) */
  if (err.code === 11000) {
    status = 409;
    const field = Object.keys(err.keyValue || {})[0];
    const friendly = {
      email: 'Email already registered',
      mobile: 'Mobile number already registered',
      studentId: 'Student ID already registered',
    };
    message = friendly[field] || `${field || 'Value'} already exists`;
  }

  /* Multer upload errors */
  if (err.code === 'LIMIT_FILE_SIZE') {
    status = 400;
    message = 'File is too large';
  }
  if (err.code === 'LIMIT_FILE_COUNT') {
    status = 400;
    message = 'Too many files uploaded';
  }

  if (status >= 500) console.error('[error]', err);

  res.status(status).json({ success: status < 500 ? false : false, message });
};

module.exports = { notFound, errorHandler };
