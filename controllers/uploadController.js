/**
 * Generic image upload endpoint (e.g. profile picture, chat attachment).
 * Files are stored on disk under server/uploads and served statically;
 * MongoDB only ever stores the URL path.
 */
exports.uploadSingle = (req, res) => {
  if (!req.file) {
    return res.status(400).json({ success: false, message: 'No file uploaded' });
  }
  res.status(201).json({ success: true, url: `/uploads/${req.file.filename}` });
};
