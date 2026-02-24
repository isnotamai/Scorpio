'use strict';

const express = require('express');
const rateLimit = require('express-rate-limit');
const db = require('../../db');
const { generateToken } = require('../utils');
const { authenticateSession } = require('../middleware/auth');
const { MAX_API_KEYS, ROLE_QUOTAS } = require('../config');

const router = express.Router();

const keysLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many API key requests. Try again later.' },
});

/**
 * Returns the upload quota for a user role.
 * @param {string} role
 * @return {number}
 */
function getQuota(role) {
  return ROLE_QUOTAS[role] !== undefined ? ROLE_QUOTAS[role] : ROLE_QUOTAS.user;
}

router.get('/me', authenticateSession, (req, res) => {
  const { id: userId, role } = req.user;
  const { BASE_URL } = require('../config');
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
    user: { id: userId, username: req.user.username, role },
    quota: { used: fileCount, max: quota },
    api_keys: keys,
    files,
  });
});

router.post('/keys', keysLimiter, authenticateSession, (req, res) => {
  const { id: userId } = req.user;
  const { label } = req.body || {};
  const keyLabel = (label || 'API Key').slice(0, 64);
  const count = db.countApiKeysByUser(userId);
  if (count >= MAX_API_KEYS) {
    res.status(400).json({ error: `Maximum ${MAX_API_KEYS} API keys allowed` }); return;
  }
  const key = generateToken(32);
  db.createApiKey(userId, key, keyLabel);
  res.json({ success: true, key, label: keyLabel });
});

router.delete('/keys/:id', authenticateSession, (req, res) => {
  const keyId = parseInt(req.params.id, 10);
  if (isNaN(keyId)) { res.status(400).json({ error: 'Invalid key ID' }); return; }
  const keyRow = db.getApiKeyById(keyId);
  if (!keyRow || keyRow.user_id !== req.user.id) {
    res.status(404).json({ error: 'API key not found' }); return;
  }
  db.deleteApiKey(keyId, req.user.id);
  res.json({ success: true });
});

module.exports = { router, getQuota };
