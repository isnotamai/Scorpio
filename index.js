'use strict';

require('dotenv').config();
const express = require('express');
const fs = require('fs');
const {formidable} = require('formidable');
const path = require('path');
const {nanoid} = require('nanoid');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const rateLimit = require('express-rate-limit');
const sizeOf = require('image-size');
const db = require('./db');

const app = express();
app.set('trust proxy', 1);
app.use(express.json());

/** @const {number} */
const PORT = process.env.PORT;

/** @const {string} */
const BASE_URL = process.env.BASE_URL;

/** @const {string} */
const UPLOADS_DIR = path.join(__dirname, 'uploads');

/** @const {!Object<string, number>} */
const ROLE_QUOTAS = {
  admin: -1,  // unlimited
  pro: 50,
  user: 10,
};

/** @const {number} */
const MAX_API_KEYS = 5;

/** @const {number} */
const SESSION_DAYS = 7;

/** @const {number} */
const BCRYPT_ROUNDS = 12;

// Ensure uploads directory exists.
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, {recursive: true});
}

/** @const {!RegExp} */
const ALLOWED_TYPES = /jpeg|jpg|png|gif|webp|bmp|svg/;

/** @const {!RegExp} */
const USERNAME_RE = /^[a-zA-Z0-9_-]{3,32}$/;

// -- Rate Limiters --

const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 3,
  standardHeaders: true,
  legacyHeaders: false,
  message: {error: 'Too many registration attempts. Try again later.'},
});

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {error: 'Too many login attempts. Try again later.'},
});

const uploadLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {error: 'Too many uploads. Try again later.'},
});

const keysLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {error: 'Too many API key requests. Try again later.'},
});

// -- Auth Middleware --

/**
 * Authenticates via X-API-Key header or ?key= query param.
 * Attaches req.user from DB.
 */
function authenticate(req, res, next) {
  const apiKey = req.headers['x-api-key'] || req.query.key;
  if (!apiKey) {
    res.status(401).json({error: 'Unauthorized'});
    return;
  }
  const keyRow = db.getApiKeyByKey(apiKey);
  if (!keyRow) {
    res.status(401).json({error: 'Unauthorized'});
    return;
  }
  const user = db.getUserById(keyRow.user_id);
  if (!user) {
    res.status(401).json({error: 'Unauthorized'});
    return;
  }
  req.user = user;
  next();
}

/**
 * Authenticates via Bearer token in Authorization header.
 * Attaches req.user from DB.
 */
function authenticateSession(req, res, next) {
  const auth = req.headers['authorization'];
  if (!auth || !auth.startsWith('Bearer ')) {
    res.status(401).json({error: 'Unauthorized'});
    return;
  }
  const token = auth.slice(7);
  const session = db.getSession(token);
  if (!session) {
    res.status(401).json({error: 'Session expired or invalid'});
    return;
  }
  const user = db.getUserById(session.user_id);
  if (!user) {
    res.status(401).json({error: 'Unauthorized'});
    return;
  }
  req.user = user;
  next();
}

/**
 * Requires admin role. Must be used after authenticateSession.
 */
function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'admin') {
    res.status(403).json({error: 'Admin access required'});
    return;
  }
  next();
}

/**
 * Returns the upload quota for a user role.
 * @param {string} role
 * @return {number}
 */
function getQuota(role) {
  return ROLE_QUOTAS[role] !== undefined ? ROLE_QUOTAS[role] : ROLE_QUOTAS.user;
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

/**
 * Generates a crypto-random hex string.
 * @param {number} bytes
 * @return {string}
 */
function generateToken(bytes) {
  return crypto.randomBytes(bytes).toString('hex');
}

/**
 * Creates a session for a user and returns the token.
 * @param {number} userId
 * @return {string}
 */
function createSession(userId) {
  const token = generateToken(32);
  const expires = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  db.createSession(userId, token, expires.toISOString());
  return token;
}

// -- Seed default admin account --

{
  const existingAdmin = db.getUserByUsername('amai');
  if (!existingAdmin) {
    const hash = bcrypt.hashSync('Zheng011@@//#', BCRYPT_ROUNDS);
    const result = db.createUser('amai', hash, 'admin');
    const userId = result.lastInsertRowid;
    const apiKey = generateToken(32);
    db.createApiKey(userId, apiKey, 'Default');
    console.log('Seeded admin account: amai');
  } else {
    // Ensure amai is always admin with the correct password
    if (existingAdmin.role !== 'admin') {
      db.updateUserRole(existingAdmin.id, 'admin');
    }
    if (!bcrypt.compareSync('Zheng011@@//#', existingAdmin.password_hash)) {
      db.updateUserPassword(existingAdmin.id, bcrypt.hashSync('Zheng011@@//#', BCRYPT_ROUNDS));
    }
  }
}

// -- Auth Routes --

app.post('/api/register', registerLimiter, (req, res) => {
  const {username, password} = req.body || {};
  if (!username || !password) {
    res.status(400).json({error: 'Username and password are required'});
    return;
  }
  if (!USERNAME_RE.test(username)) {
    res.status(400).json({error: 'Username must be 3-32 characters (letters, numbers, _ or -)'});
    return;
  }
  if (password.length < 8 || password.length > 128) {
    res.status(400).json({error: 'Password must be 8-128 characters'});
    return;
  }
  if (db.getUserByUsername(username)) {
    res.status(409).json({error: 'Username already taken'});
    return;
  }

  const hash = bcrypt.hashSync(password, BCRYPT_ROUNDS);
  const result = db.createUser(username, hash, 'user');
  const userId = result.lastInsertRowid;

  // Auto-generate first API key
  const apiKey = generateToken(32);
  db.createApiKey(userId, apiKey, 'Default');

  const token = createSession(userId);

  res.json({
    success: true,
    token,
    user: {id: userId, username, role: 'user'},
    api_key: apiKey,
  });
});

app.post('/api/login', loginLimiter, (req, res) => {
  const {username, password} = req.body || {};
  if (!username || !password) {
    res.status(400).json({error: 'Username and password are required'});
    return;
  }
  const user = db.getUserByUsername(username);
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    res.status(401).json({error: 'Invalid username or password'});
    return;
  }

  const token = createSession(user.id);

  res.json({
    success: true,
    token,
    user: {id: user.id, username: user.username, role: user.role},
  });
});

app.post('/api/logout', authenticateSession, (req, res) => {
  const token = req.headers['authorization'].slice(7);
  db.deleteSession(token);
  res.json({success: true});
});

// -- User Info --

app.get('/api/me', authenticateSession, (req, res) => {
  const userId = req.user.id;
  const role = req.user.role;
  const quota = getQuota(role);
  const fileCount = db.countFilesByUser(userId);
  const keys = db.getApiKeysByUser(userId).map((k) => ({
    id: k.id,
    label: k.label,
    key_preview: k.key.slice(0, 8) + '...' + k.key.slice(-4),
    created_at: k.created_at,
  }));
  const files = db.getFilesByUser(userId).map((f) => ({
    id: f.id,
    filename: f.filename,
    original_name: f.original_name,
    size: f.size,
    url: `${BASE_URL}/i/${f.filename}`,
    created_at: f.created_at,
  }));

  res.json({
    user: {id: userId, username: req.user.username, role},
    quota: {used: fileCount, max: quota},
    api_keys: keys,
    files,
  });
});

// -- API Key Management --

app.post('/api/keys', keysLimiter, authenticateSession, (req, res) => {
  const userId = req.user.id;
  const {label} = req.body || {};
  const keyLabel = (label || 'API Key').slice(0, 64);

  const count = db.countApiKeysByUser(userId);
  if (count >= MAX_API_KEYS) {
    res.status(400).json({error: `Maximum ${MAX_API_KEYS} API keys allowed`});
    return;
  }

  const key = generateToken(32);
  db.createApiKey(userId, key, keyLabel);

  res.json({success: true, key, label: keyLabel});
});

app.delete('/api/keys/:id', authenticateSession, (req, res) => {
  const keyId = parseInt(req.params.id, 10);
  if (isNaN(keyId)) {
    res.status(400).json({error: 'Invalid key ID'});
    return;
  }

  const keyRow = db.getApiKeyById(keyId);
  if (!keyRow || keyRow.user_id !== req.user.id) {
    res.status(404).json({error: 'API key not found'});
    return;
  }

  db.deleteApiKey(keyId, req.user.id);
  res.json({success: true});
});

// -- Admin Routes --

app.get('/api/admin/users', authenticateSession, requireAdmin, (req, res) => {
  const users = db.getAllUsers().map((u) => {
    const fileCount = db.countFilesByUser(u.id);
    const keyCount = db.countApiKeysByUser(u.id);
    return {
      id: u.id,
      username: u.username,
      role: u.role,
      files: fileCount,
      api_keys: keyCount,
      created_at: u.created_at,
    };
  });
  res.json({users, roles: Object.keys(ROLE_QUOTAS)});
});

app.put('/api/admin/users/:id/role', authenticateSession, requireAdmin, (req, res) => {
  const userId = parseInt(req.params.id, 10);
  if (isNaN(userId)) {
    res.status(400).json({error: 'Invalid user ID'});
    return;
  }
  const {role} = req.body || {};
  if (!role || !ROLE_QUOTAS.hasOwnProperty(role)) {
    res.status(400).json({error: 'Invalid role. Must be one of: ' + Object.keys(ROLE_QUOTAS).join(', ')});
    return;
  }
  const target = db.getUserById(userId);
  if (!target) {
    res.status(404).json({error: 'User not found'});
    return;
  }
  // Prevent demoting yourself
  if (userId === req.user.id && role !== 'admin') {
    res.status(400).json({error: 'Cannot change your own role'});
    return;
  }
  db.updateUserRole(userId, role);
  res.json({success: true, id: userId, role});
});

app.delete('/api/admin/users/:id', authenticateSession, requireAdmin, (req, res) => {
  const userId = parseInt(req.params.id, 10);
  if (isNaN(userId)) {
    res.status(400).json({error: 'Invalid user ID'});
    return;
  }
  if (userId === req.user.id) {
    res.status(400).json({error: 'Cannot delete your own account'});
    return;
  }
  const target = db.getUserById(userId);
  if (!target) {
    res.status(404).json({error: 'User not found'});
    return;
  }
  db.deleteUser(userId);
  res.json({success: true});
});

// -- Upload --

app.post('/upload', uploadLimiter, authenticate, (req, res, next) => {
  const userId = req.user.id;
  const quota = getQuota(req.user.role);

  // Check quota before accepting file (-1 = unlimited)
  if (quota !== -1) {
    const fileCount = db.countFilesByUser(userId);
    if (fileCount >= quota) {
      res.status(403).json({error: `Upload quota exceeded (${quota}/${quota})`});
      return;
    }
  }

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
    const deleteToken = generateToken(32);

    // Record in DB
    db.createFile(userId, filename, file.originalFilename || filename, file.size || 0, deleteToken);

    const fileUrl = `${BASE_URL}/i/${filename}`;
    const deleteUrl = `${BASE_URL}/delete/${filename}?token=${deleteToken}`;

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

// oEmbed endpoint for rich Discord embeds.
app.get('/oembed/:filename', (req, res) => {
  const filename = req.params.filename;
  const fileRow = db.getFileByFilename(filename);
  const uploaderName = fileRow ? (db.getUserById(fileRow.user_id)?.username || 'Unknown') : 'Unknown';

  res.json({
    version: '1.0',
    type: 'photo',
    provider_name: `\u2727 Scorpio \u2014 Uploaded by ${uploaderName}`,
    provider_url: BASE_URL,
  });
});

/**
 * Format bytes into a human-readable string.
 * @param {number} bytes
 * @return {string}
 */
function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(i > 0 ? 2 : 0)} ${units[i]}`;
}

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
    const filename = req.params.filename;
    const imageUrl = `${BASE_URL}/raw/${filename}`;
    const oEmbedUrl = `${BASE_URL}/oembed/${filename}`;
    const ext = path.extname(filename).toLowerCase();
    const isGif = ext === '.gif';

    // Get image dimensions for proper embed sizing.
    let width = 0;
    let height = 0;
    try {
      const dims = sizeOf(filePath);
      width = dims.width || 0;
      height = dims.height || 0;
    } catch (_) { /* ignore */ }

    // Get file metadata for description.
    const fileRow = db.getFileByFilename(filename);
    const fileSize = fileRow ? formatBytes(fileRow.size) : formatBytes(fs.statSync(filePath).size);
    const dimStr = width && height ? `${width}\u00d7${height}` : '';
    const description = [dimStr, fileSize, ext.slice(1).toUpperCase(), 'scorpio.amai.lol'].filter(Boolean).join(' \u2022 ');

    // GIFs: use video.other trick so Discord plays them inline at full size.
    const ogType = isGif ? 'video.other' : 'website';

    res.setHeader('Content-Type', 'text/html');
    res.send(`<!DOCTYPE html><html>
<head>
<meta property="og:type" content="${ogType}">
<meta property="og:site_name" content="Scorpio">
<meta property="og:url" content="${BASE_URL}/i/${filename}">
<meta property="og:title" content="\u2727 ${fileRow?.original_name || filename}">
<meta property="og:description" content="${description}">
<meta property="og:image" content="${imageUrl}">
${width ? `<meta property="og:image:width" content="${width}">` : ''}
${height ? `<meta property="og:image:height" content="${height}">` : ''}
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:image" content="${imageUrl}">
<meta name="theme-color" content="#00f0ff">
<link type="application/json+oembed" href="${oEmbedUrl}">
</head></html>`);
    return;
  }

  // Styled image viewer for browsers
  const filename = req.params.filename;
  const rawUrl = `${BASE_URL}/raw/${filename}`;
  const ext = path.extname(filename).toLowerCase();

  let width = 0;
  let height = 0;
  try {
    const dims = sizeOf(filePath);
    width = dims.width || 0;
    height = dims.height || 0;
  } catch (_) { /* ignore */ }

  const fileRow = db.getFileByFilename(filename);
  const fileSize = fileRow ? formatBytes(fileRow.size) : formatBytes(fs.statSync(filePath).size);
  const originalName = fileRow?.original_name || filename;
  const uploaderName = fileRow ? (db.getUserById(fileRow.user_id)?.username || 'Unknown') : 'Unknown';
  const uploadDate = fileRow?.created_at || '';
  const dimStr = width && height ? `${width} \u00d7 ${height}` : '';

  res.setHeader('Content-Type', 'text/html');
  res.send(`<!DOCTYPE html><html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${originalName} \u2014 Scorpio</title>
<meta property="og:image" content="${rawUrl}">
<meta name="theme-color" content="#00f0ff">
<style>
*{box-sizing:border-box;margin:0;padding:0}
:root{--accent:#00f0ff;--accent-glow:rgba(0,240,255,.3);--bg:#050a0e;--border:rgba(0,240,255,.08);--border-hover:rgba(0,240,255,.25);--text:#c0d8e8;--text-dim:#4a6a7a;--text-bright:#e8f4ff}
body{background:var(--bg);color:var(--text);font-family:'Segoe UI',-apple-system,BlinkMacSystemFont,sans-serif;min-height:100vh;display:flex;flex-direction:column;align-items:center;overflow-x:hidden}
body::before{content:'';position:fixed;inset:0;background:linear-gradient(rgba(0,240,255,.03) 1px,transparent 1px),linear-gradient(90deg,rgba(0,240,255,.03) 1px,transparent 1px);background-size:60px 60px;pointer-events:none;z-index:0;animation:grid-drift 20s linear infinite}
@keyframes grid-drift{0%{transform:translate(0,0)}100%{transform:translate(60px,60px)}}
@keyframes fade-in{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:translateY(0)}}

.topbar{position:sticky;top:0;z-index:100;width:100%;background:rgba(5,10,14,.85);backdrop-filter:blur(16px);border-bottom:1px solid var(--border)}
.topbar::after{content:'';position:absolute;bottom:0;left:0;right:0;height:1px;background:linear-gradient(90deg,transparent,var(--accent),transparent);opacity:.3}
.topbar-inner{max-width:900px;margin:0 auto;padding:12px 24px;display:flex;align-items:center;gap:10px}
.topbar-brand{color:var(--accent);font-size:1rem;font-weight:600;letter-spacing:2px;text-transform:uppercase;text-shadow:0 0 10px var(--accent-glow);text-decoration:none}

.viewer{position:relative;z-index:1;width:100%;max-width:900px;padding:24px;flex:1;display:flex;flex-direction:column;align-items:center;animation:fade-in .5s ease-out}

.image-wrap{position:relative;border-radius:10px;overflow:hidden;border:1px solid var(--border);transition:border-color .3s,box-shadow .3s;line-height:0;max-width:100%}
.image-wrap:hover{border-color:var(--border-hover);box-shadow:0 0 30px rgba(0,240,255,.08),0 8px 32px rgba(0,0,0,.5)}
.image-wrap img{max-width:100%;max-height:80vh;display:block;object-fit:contain}

.info{width:100%;margin-top:16px;background:rgba(8,18,27,.85);border:1px solid var(--border);border-radius:10px;padding:16px 20px;backdrop-filter:blur(10px);position:relative;animation:fade-in .5s ease-out .15s both}
.info::before{content:'';position:absolute;top:0;left:10%;right:10%;height:1px;background:linear-gradient(90deg,transparent,var(--accent),transparent);opacity:.3}
.info-row{display:flex;flex-wrap:wrap;align-items:center;gap:16px;justify-content:space-between}
.info-item{display:flex;flex-direction:column;gap:2px}
.info-label{font-size:10px;text-transform:uppercase;letter-spacing:1.5px;color:var(--text-dim);font-weight:500}
.info-value{font-size:13px;color:var(--text-bright);font-family:'Cascadia Code','Fira Code',Consolas,monospace}
.info-name{font-size:14px;color:var(--text-bright);word-break:break-all;font-weight:500}

.actions{display:flex;gap:8px;margin-top:16px;animation:fade-in .5s ease-out .25s both}
.btn{display:inline-flex;align-items:center;gap:6px;padding:8px 18px;border-radius:8px;font-size:12px;font-weight:500;letter-spacing:.5px;text-decoration:none;transition:all .3s;cursor:pointer;border:none;font-family:inherit}
.btn-primary{background:linear-gradient(135deg,var(--accent),#00b8d4);color:#050a0e;font-weight:600;text-transform:uppercase}
.btn-primary:hover{box-shadow:0 0 20px var(--accent-glow);filter:brightness(1.1)}
.btn-secondary{background:rgba(0,240,255,.06);border:1px solid var(--border);color:var(--accent)}
.btn-secondary:hover{background:rgba(0,240,255,.12);border-color:var(--border-hover);box-shadow:0 0 12px rgba(0,240,255,.08)}
.btn svg{width:14px;height:14px}

@media(max-width:540px){.viewer{padding:12px}.info-row{gap:10px}.info-item{min-width:45%}}
</style>
</head>
<body>
<div class="topbar"><div class="topbar-inner"><a class="topbar-brand" href="${BASE_URL}">\u2727 Scorpio</a></div></div>
<div class="viewer">
  <a href="${rawUrl}" class="image-wrap"><img src="${rawUrl}" alt="${originalName}"></a>
  <div class="info"><div class="info-row">
    <div class="info-item"><span class="info-label">File</span><span class="info-name">${originalName}</span></div>
    ${dimStr ? `<div class="info-item"><span class="info-label">Dimensions</span><span class="info-value">${dimStr}</span></div>` : ''}
    <div class="info-item"><span class="info-label">Size</span><span class="info-value">${fileSize}</span></div>
    <div class="info-item"><span class="info-label">Type</span><span class="info-value">${ext.slice(1).toUpperCase()}</span></div>
    <div class="info-item"><span class="info-label">Uploaded by</span><span class="info-value">${uploaderName}</span></div>
    ${uploadDate ? `<div class="info-item"><span class="info-label">Date</span><span class="info-value">${uploadDate}</span></div>` : ''}
  </div></div>
  <div class="actions">
    <a href="${rawUrl}" class="btn btn-primary"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/></svg>Open Raw</a>
    <a href="${rawUrl}" download="${originalName}" class="btn btn-secondary"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>Download</a>
  </div>
</div>
</body></html>`);
});

// Delete uploaded images - supports delete_token or API key with ownership check.
app.get('/delete/:filename', (req, res) => {
  const filePath = resolveUploadPath(req.params.filename);
  if (!filePath) {
    res.status(403).json({error: 'Forbidden'});
    return;
  }

  const filename = req.params.filename;
  const fileRow = db.getFileByFilename(filename);

  // Try delete by token
  const token = req.query.token;
  if (token) {
    if (!fileRow || fileRow.delete_token !== token) {
      res.status(403).json({error: 'Invalid delete token'});
      return;
    }
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    db.deleteFile(fileRow.id);
    res.json({success: true, message: 'File deleted'});
    return;
  }

  // Try delete by API key (owner check)
  const apiKey = req.headers['x-api-key'] || req.query.key;
  if (apiKey) {
    const keyRow = db.getApiKeyByKey(apiKey);
    if (!keyRow) {
      res.status(401).json({error: 'Unauthorized'});
      return;
    }
    if (!fileRow || fileRow.user_id !== keyRow.user_id) {
      res.status(403).json({error: 'You do not own this file'});
      return;
    }
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    db.deleteFile(fileRow.id);
    res.json({success: true, message: 'File deleted'});
    return;
  }

  res.status(401).json({error: 'Delete token or API key required'});
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
