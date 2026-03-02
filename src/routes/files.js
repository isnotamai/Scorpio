'use strict';

const express = require('express');
const fs = require('fs');
const path = require('path');
const rateLimit = require('express-rate-limit');
const {nanoid} = require('nanoid');
const {formidable} = require('formidable');
const sizeOf = require('image-size');
const db = require('../../db');
const {generateToken, formatBytes} = require('../utils');
const {authenticateSession, authenticateUploadRequest} = require('../middleware/auth');
const {BASE_URL, ALLOWED_TYPES, VIDEO_EXTS, ROLE_QUOTAS} = require('../config');

const DEFAULT_MAX_SIZE = 500 * 1024 * 1024; // 500 MB

const router = express.Router();

/** @const {string} */
const UPLOADS_DIR = path.join(__dirname, '../../uploads');

if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, {recursive: true});
}

const uploadLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {error: 'Too many uploads. Try again later.'},
});

/**
 * Returns the upload quota (file count) for a user role, from DB or config default.
 * @param {string} role
 * @return {number}
 */
function getQuota(role) {
  const stored = db.getSetting('quota_' + role);
  if (stored !== null) return parseInt(stored, 10);
  return ROLE_QUOTAS[role] !== undefined ? ROLE_QUOTAS[role] : ROLE_QUOTAS.user;
}

/**
 * Returns the max file size in bytes for a user role, from DB or default.
 * @param {string} role
 * @return {number}
 */
function getMaxFileSize(role) {
  const stored = db.getSetting('max_size_' + role);
  return stored !== null ? parseInt(stored, 10) : DEFAULT_MAX_SIZE;
}

/**
 * Resolves a filename to a safe file path within the uploads directory.
 * Returns null if the path escapes the uploads directory.
 * @param {string} filename
 * @return {?string}
 */
function resolveUploadPath(filename) {
  const filePath = path.join(UPLOADS_DIR, filename);
  if (!filePath.startsWith(UPLOADS_DIR)) return null;
  return filePath;
}

// -- Authenticated file delete (from dashboard) --

router.delete('/api/files/:id', authenticateSession, (req, res) => {
  const fileId = parseInt(req.params.id, 10);
  if (isNaN(fileId)) { res.status(400).json({error: 'Invalid file ID'}); return; }
  const fileRow = db.getFileById(fileId);
  if (!fileRow || fileRow.user_id !== req.user.id) {
    res.status(404).json({error: 'File not found'}); return;
  }
  const filePath = resolveUploadPath(fileRow.filename);
  if (filePath && fs.existsSync(filePath)) fs.unlinkSync(filePath);
  db.deleteFile(fileRow.id);
  res.json({success: true});
});

// -- Upload --

router.post('/upload', uploadLimiter, authenticateUploadRequest, (req, res, next) => {
  const {id: userId, role} = req.user;
  const quota = getQuota(role);

  if (quota !== -1) {
    const fileCount = db.countFilesByUser(userId);
    if (fileCount >= quota) {
      res.status(403).json({error: `Upload quota exceeded (${quota}/${quota})`}); return;
    }
  }

  const form = formidable({
    uploadDir: UPLOADS_DIR,
    keepExtensions: true,
    maxFileSize: getMaxFileSize(role),
    maxFiles: 1,
    filename(name, ext) { return `${nanoid(10)}${ext}`; },
    filter({mimetype, originalFilename}) {
      if (!originalFilename || !mimetype) return false;
      const ext = path.extname(originalFilename).toLowerCase().slice(1);
      const mime = mimetype.split('/')[1];
      return ALLOWED_TYPES.test(ext) || ALLOWED_TYPES.test(mime);
    },
  });

  form.parse(req, (err, fields, files) => {
    if (err) { next(err); return; }
    const uploaded = files.file;
    if (!uploaded || uploaded.length === 0) {
      res.status(400).json({error: 'No file uploaded'}); return;
    }
    const file = Array.isArray(uploaded) ? uploaded[0] : uploaded;
    const filename = path.basename(file.filepath);
    const deleteToken = generateToken(32);
    db.createFile(userId, filename, file.originalFilename || filename, file.size || 0, deleteToken);
    res.json({
      success: true,
      url: `${BASE_URL}/i/${filename}`,
      delete_url: `${BASE_URL}/delete/${filename}?token=${deleteToken}`,
      filename,
    });
  });
});

// -- Raw file serve --

router.get('/raw/:filename', (req, res) => {
  const filePath = resolveUploadPath(req.params.filename);
  if (!filePath) { res.status(403).json({error: 'Forbidden'}); return; }
  if (!fs.existsSync(filePath)) { res.status(404).json({error: 'File not found'}); return; }
  res.sendFile(filePath);
});

// -- oEmbed --

router.get('/oembed/:filename', (req, res) => {
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

// -- File viewer --

router.get('/i/:filename', (req, res) => {
  const filePath = resolveUploadPath(req.params.filename);
  if (!filePath) { res.status(403).json({error: 'Forbidden'}); return; }
  if (!fs.existsSync(filePath)) { res.status(404).json({error: 'File not found'}); return; }

  const filename = req.params.filename;
  const rawUrl = `${BASE_URL}/raw/${filename}`;
  const ext = path.extname(filename).toLowerCase();
  const isVideoFile = VIDEO_EXTS.has(ext);

  const fileRow = db.getFileByFilename(filename);
  const fileSize = fileRow ? formatBytes(fileRow.size) : formatBytes(fs.statSync(filePath).size);
  const originalName = fileRow?.original_name || filename;
  const uploaderName = fileRow ? (db.getUserById(fileRow.user_id)?.username || 'Unknown') : 'Unknown';
  const uploadDate = fileRow?.created_at || '';

  const ua = req.headers['user-agent'] || '';
  if (/Discordbot/i.test(ua)) {
    const oEmbedUrl = `${BASE_URL}/oembed/${filename}`;
    const description = [fileSize, ext.slice(1).toUpperCase(), 'scorpio.amai.lol'].filter(Boolean).join(' \u2022 ');

    if (isVideoFile) {
      const videoMimeMap = {'.mp4': 'video/mp4', '.webm': 'video/webm', '.mov': 'video/quicktime', '.avi': 'video/x-msvideo', '.mkv': 'video/x-matroska'};
      const videoMime = videoMimeMap[ext] || 'video/mp4';
      res.setHeader('Content-Type', 'text/html');
      res.send(`<!DOCTYPE html><html lang="en"><head>
<meta property="og:type" content="video.other">
<meta property="og:site_name" content="Scorpio">
<meta property="og:url" content="${BASE_URL}/i/${filename}">
<meta property="og:title" content="\u2727 ${originalName}">
<meta property="og:description" content="${description}">
<meta property="og:video" content="${rawUrl}">
<meta property="og:video:secure_url" content="${rawUrl}">
<meta property="og:video:type" content="${videoMime}">
<meta name="theme-color" content="#22d3ee">
<link type="application/json+oembed" href="${oEmbedUrl}">
</head></html>`);
      return;
    }

    let width = 0, height = 0;
    try { const dims = sizeOf(filePath); width = dims.width || 0; height = dims.height || 0; } catch (_) {}
    const dimStr = width && height ? `${width}\u00d7${height}` : '';
    const descriptionImg = [dimStr, fileSize, ext.slice(1).toUpperCase(), 'scorpio.amai.lol'].filter(Boolean).join(' \u2022 ');
    const ogType = ext === '.gif' ? 'video.other' : 'website';

    res.setHeader('Content-Type', 'text/html');
    res.send(`<!DOCTYPE html><html lang="en"><head>
<meta property="og:type" content="${ogType}">
<meta property="og:site_name" content="Scorpio">
<meta property="og:url" content="${BASE_URL}/i/${filename}">
<meta property="og:title" content="\u2727 ${originalName}">
<meta property="og:description" content="${descriptionImg}">
<meta property="og:image" content="${rawUrl}">
${width ? `<meta property="og:image:width" content="${width}">` : ''}
${height ? `<meta property="og:image:height" content="${height}">` : ''}
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:image" content="${rawUrl}">
<meta name="theme-color" content="#22d3ee">
<link type="application/json+oembed" href="${oEmbedUrl}">
</head></html>`);
    return;
  }

  // Browser viewer
  let width = 0, height = 0;
  if (!isVideoFile) {
    try { const dims = sizeOf(filePath); width = dims.width || 0; height = dims.height || 0; } catch (_) {}
  }
  const dimStr = width && height ? `${width} \u00d7 ${height}` : '';
  const mediaHtml = isVideoFile
    ? `<div class="media-wrap"><video controls preload="metadata" src="${rawUrl}"></video></div>`
    : `<a href="${rawUrl}" class="media-wrap"><img src="${rawUrl}" alt="${originalName}"></a>`;

  res.setHeader('Content-Type', 'text/html');
  res.send(`<!DOCTYPE html><html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${originalName} \u2014 Scorpio</title>
${!isVideoFile ? `<meta property="og:image" content="${rawUrl}">` : ''}
<meta name="theme-color" content="#22d3ee">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
<style>
*{box-sizing:border-box;margin:0;padding:0}
:root{--accent:#22d3ee;--accent-glow:rgba(34,211,238,.2);--bg:#07090f;--surface:rgba(255,255,255,.03);--border:rgba(255,255,255,.07);--border-hover:rgba(34,211,238,.3);--text:#8b9ab0;--text-bright:#dde5f0;--text-dim:#3d5166}
body{background:var(--bg);color:var(--text);font-family:'Inter',system-ui,sans-serif;min-height:100vh;display:flex;flex-direction:column;align-items:center;overflow-x:hidden}
body::before{content:'';position:fixed;inset:0;background:linear-gradient(rgba(34,211,238,.018) 1px,transparent 1px),linear-gradient(90deg,rgba(34,211,238,.018) 1px,transparent 1px);background-size:64px 64px;pointer-events:none;z-index:0;animation:grid-drift 25s linear infinite}
@keyframes grid-drift{0%{transform:translate(0,0)}100%{transform:translate(64px,64px)}}
@keyframes fade-up{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}
.topbar{position:sticky;top:0;z-index:100;width:100%;background:rgba(7,9,15,.92);backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px);border-bottom:1px solid var(--border)}
.topbar-inner{max-width:960px;margin:0 auto;padding:14px 24px;display:flex;align-items:center}
.topbar-brand{color:var(--accent);font-size:.8rem;font-weight:600;letter-spacing:.18em;text-transform:uppercase;text-shadow:0 0 24px var(--accent-glow);text-decoration:none}
.viewer{position:relative;z-index:1;width:100%;max-width:960px;padding:32px 24px;flex:1;display:flex;flex-direction:column;align-items:center;gap:16px;animation:fade-up .4s ease-out}
.media-wrap{border-radius:12px;overflow:hidden;border:1px solid var(--border);transition:border-color .25s,box-shadow .25s;max-width:100%;line-height:0}
.media-wrap:hover{border-color:var(--border-hover);box-shadow:0 0 40px rgba(34,211,238,.05),0 20px 60px rgba(0,0,0,.5)}
.media-wrap img{max-width:100%;max-height:80vh;display:block;object-fit:contain}
.media-wrap video{max-width:100%;max-height:80vh;display:block;background:#000;outline:none}
.info{width:100%;background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:18px 22px;backdrop-filter:blur(12px)}
.info-row{display:flex;flex-wrap:wrap;align-items:center;gap:20px}
.info-item{display:flex;flex-direction:column;gap:3px}
.info-label{font-size:.65rem;text-transform:uppercase;letter-spacing:.12em;color:var(--text-dim);font-weight:500}
.info-value{font-size:.8rem;color:var(--text-bright);font-family:'Cascadia Code','Fira Code',Consolas,monospace}
.info-name{font-size:.875rem;color:var(--text-bright);word-break:break-all;font-weight:500}
.actions{display:flex;gap:8px}
.btn{display:inline-flex;align-items:center;gap:7px;padding:9px 18px;border-radius:8px;font-size:.75rem;font-weight:600;letter-spacing:.05em;text-decoration:none;transition:all .2s;cursor:pointer;border:none;font-family:'Inter',system-ui,sans-serif}
.btn-primary{background:linear-gradient(135deg,var(--accent),#0891b2);color:#07090f;text-transform:uppercase}
.btn-primary:hover{box-shadow:0 0 24px var(--accent-glow),0 4px 16px rgba(0,0,0,.4);filter:brightness(1.08)}
.btn-secondary{background:rgba(34,211,238,.06);border:1px solid var(--border);color:var(--accent)}
.btn-secondary:hover{background:rgba(34,211,238,.1);border-color:var(--border-hover)}
.btn svg{width:14px;height:14px;flex-shrink:0}
@media(max-width:600px){.viewer{padding:16px}.info-row{gap:12px}.info-item{min-width:calc(50% - 6px)}}
</style>
</head>
<body>
<div class="topbar"><div class="topbar-inner"><a class="topbar-brand" href="${BASE_URL}">\u2727 Scorpio</a></div></div>
<div class="viewer">
  ${mediaHtml}
  <div class="info"><div class="info-row">
    <div class="info-item" style="flex:1;min-width:160px"><span class="info-label">File</span><span class="info-name">${originalName}</span></div>
    ${dimStr ? `<div class="info-item"><span class="info-label">Dimensions</span><span class="info-value">${dimStr}</span></div>` : ''}
    <div class="info-item"><span class="info-label">Size</span><span class="info-value">${fileSize}</span></div>
    <div class="info-item"><span class="info-label">Type</span><span class="info-value">${ext.slice(1).toUpperCase()}</span></div>
    <div class="info-item"><span class="info-label">Uploaded by</span><span class="info-value">${uploaderName}</span></div>
    ${uploadDate ? `<div class="info-item"><span class="info-label">Date</span><span class="info-value">${uploadDate}</span></div>` : ''}
  </div></div>
  <div class="actions">
    <a href="${rawUrl}" class="btn btn-primary" ${isVideoFile ? '' : 'target="_blank" rel="noopener"'}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/></svg>${isVideoFile ? 'Open' : 'Open Raw'}</a>
    <a href="${rawUrl}" download="${originalName}" class="btn btn-secondary"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>Download</a>
  </div>
</div>
</body></html>`);
});

// -- Token/key-based delete --

router.get('/delete/:filename', (req, res) => {
  const filePath = resolveUploadPath(req.params.filename);
  if (!filePath) { res.status(403).json({error: 'Forbidden'}); return; }

  const filename = req.params.filename;
  const fileRow = db.getFileByFilename(filename);

  const token = req.query.token;
  if (token) {
    if (!fileRow || fileRow.delete_token !== token) {
      res.status(403).json({error: 'Invalid delete token'}); return;
    }
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    db.deleteFile(fileRow.id);
    res.json({success: true, message: 'File deleted'});
    return;
  }

  const apiKey = req.headers['x-api-key'] || req.query.key;
  if (apiKey) {
    const keyRow = db.getApiKeyByKey(apiKey);
    if (!keyRow) { res.status(401).json({error: 'Unauthorized'}); return; }
    if (!fileRow || fileRow.user_id !== keyRow.user_id) {
      res.status(403).json({error: 'You do not own this file'}); return;
    }
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    db.deleteFile(fileRow.id);
    res.json({success: true, message: 'File deleted'});
    return;
  }

  res.status(401).json({error: 'Delete token or API key required'});
});

module.exports = router;
