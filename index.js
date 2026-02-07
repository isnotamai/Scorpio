'use strict';

const express = require('express');
const fs = require('fs');
const {formidable} = require('formidable');
const path = require('path');
const {nanoid} = require('nanoid');

const app = express();

/** @const {number} */
const PORT = process.env.PORT || 18412;

/** @const {string} */
const SECRET_KEY = 'i-yInK-iJskYRZDQFLiQqhCHSg9PmcdT9Z8cP2Fu2gMZXuD3jgPFuXKOgxtj-cpALxp9QPpnLR51l3jv';

/** @const {string} */
const BASE_URL = process.env.BASE_URL || `http://scorpio.amai.lol`;

/** @const {string} */
const UPLOADS_DIR = path.join(__dirname, 'uploads');

// Ensure uploads directory exists.
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, {recursive: true});
}

/** @const {!RegExp} */
const ALLOWED_TYPES = /jpeg|jpg|png|gif|webp|bmp|svg/;

/**
 * Validates the API key from request headers or query params.
 * @param {!express.Request} req
 * @param {!express.Response} res
 * @param {!Function} next
 */
function authenticate(req, res, next) {
  const apiKey = req.headers['x-api-key'] || req.query.key;
  if (apiKey !== SECRET_KEY) {
    res.status(401).json({error: 'Unauthorized'});
    return;
  }
  next();
}

/**
 * Resolves a filename to a safe file path within the uploads directory.
 * Returns null if the path escapes the uploads directory.
 * @param {string} filename
 * @return {?string}
 */
function resolveUploadPath(filename) {
  const filePath = path.join(UPLOADS_DIR, filename);
  if (!filePath.startsWith(UPLOADS_DIR)) {
    return null;
  }
  return filePath;
}

// Upload endpoint.
app.post('/upload', authenticate, (req, res, next) => {
  const form = formidable({
    uploadDir: UPLOADS_DIR,
    keepExtensions: true,
    maxFileSize: 50 * 1024 * 1024, // 50 MB
    maxFiles: 1,
    filename(name, ext) {
      return `${nanoid(10)}${ext}`;
    },
    filter({mimetype, originalFilename}) {
      if (!originalFilename || !mimetype) return false;
      const ext = path.extname(originalFilename).toLowerCase().slice(1);
      const mime = mimetype.split('/')[1];
      return ALLOWED_TYPES.test(ext) || ALLOWED_TYPES.test(mime);
    },
  });

  form.parse(req, (err, fields, files) => {
    if (err) {
      next(err);
      return;
    }

    const uploaded = files.file;
    if (!uploaded || uploaded.length === 0) {
      res.status(400).json({error: 'No file uploaded'});
      return;
    }

    const file = Array.isArray(uploaded) ? uploaded[0] : uploaded;
    const filename = path.basename(file.filepath);
    const fileUrl = `${BASE_URL}/i/${filename}`;
    const deleteUrl = `${BASE_URL}/delete/${filename}?key=${SECRET_KEY}`;

    res.json({
      success: true,
      url: fileUrl,
      delete_url: deleteUrl,
      filename,
    });
  });
});

// Serve raw images (used by og:image).
app.get('/raw/:filename', (req, res) => {
  const filePath = resolveUploadPath(req.params.filename);
  if (!filePath) {
    res.status(403).json({error: 'Forbidden'});
    return;
  }
  if (!fs.existsSync(filePath)) {
    res.status(404).json({error: 'File not found'});
    return;
  }
  res.sendFile(filePath);
});

// Serve uploaded images with Discord embed support.
app.get('/i/:filename', (req, res) => {
  const filePath = resolveUploadPath(req.params.filename);
  if (!filePath) {
    res.status(403).json({error: 'Forbidden'});
    return;
  }
  if (!fs.existsSync(filePath)) {
    res.status(404).json({error: 'File not found'});
    return;
  }

  const ua = req.headers['user-agent'] || '';
  if (/Discordbot/i.test(ua)) {
    const imageUrl = `${BASE_URL}/raw/${req.params.filename}`;
    res.setHeader('Content-Type', 'text/html');
    res.send(`<!DOCTYPE html><html>
<head>
<meta property="og:type" content="website">
<meta property="og:url" content="${BASE_URL}/i/${req.params.filename}">
<meta property="og:image" content="${imageUrl}">
<meta property="og:title" content="Scorpio">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:image" content="${imageUrl}">
<meta name="theme-color" content="#0a0a0a">
</head></html>`);
    return;
  }

  res.sendFile(filePath);
});

// Delete uploaded images.
app.get('/delete/:filename', authenticate, (req, res) => {
  const filePath = resolveUploadPath(req.params.filename);
  if (!filePath) {
    res.status(403).json({error: 'Forbidden'});
    return;
  }
  if (!fs.existsSync(filePath)) {
    res.status(404).json({error: 'File not found'});
    return;
  }
  fs.unlinkSync(filePath);
  res.json({success: true, message: 'File deleted'});
});

// Serve static assets (logo, favicon, etc.) from public/.
app.use(express.static(path.join(__dirname, 'public')));

// Error handler.
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({error: err.message || 'Internal server error'});
});

app.listen(PORT, () => {
  console.log(`Scorpio running at ${BASE_URL}`);
});
