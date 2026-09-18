const multer = require('multer');
const path = require('path');
const fs = require('fs');

const UPLOAD_DIR = path.join(__dirname, '..', 'uploads');
const MAX_UPLOAD_MB = parseInt(process.env.MAX_UPLOAD_MB || '5', 10);

if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const name = `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`;
    cb(null, name);
  },
});

/**
 * Image upload middleware. Validates MIME type + extension and enforces size limit.
 * Files land in server/uploads and are served by express.static; only the URL
 * is stored in MongoDB (never the binary).
 */
const uploadImages = (fieldName, maxCount = 4) =>
  multer({
    storage,
    limits: { fileSize: MAX_UPLOAD_MB * 1024 * 1024, files: maxCount },
    fileFilter: (_req, file, cb) => {
      const okMime = /^image\/(jpe?g|png|webp|gif)$/i.test(file.mimetype);
      const okExt = /\.(jpe?g|png|webp|gif)$/i.test(path.extname(file.originalname).toLowerCase());
      if (!okMime || !okExt) {
        return cb(new Error('Only JPG, PNG, WEBP or GIF images are allowed'));
      }
      cb(null, true);
    },
  }).array(fieldName, maxCount);

module.exports = { uploadImages, UPLOAD_DIR, MAX_UPLOAD_MB };
