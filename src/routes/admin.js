'use strict';

const express = require('express');
const db = require('../../db');
const { authenticateSession, requireAdmin } = require('../middleware/auth');
const { ROLE_QUOTAS } = require('../config');

const DEFAULT_MAX_SIZE = 500 * 1024 * 1024; // 500 MB

const router = express.Router();

router.get('/users', authenticateSession, requireAdmin, (req, res) => {
  const users = db.getAllUsers().map((u) => ({
    id: u.id,
    username: u.username,
    role: u.role,
    files: db.countFilesByUser(u.id),
    api_keys: db.countApiKeysByUser(u.id),
    created_at: u.created_at,
  }));
  res.json({ users, roles: Object.keys(ROLE_QUOTAS) });
});

router.put('/users/:id/role', authenticateSession, requireAdmin, (req, res) => {
  const userId = parseInt(req.params.id, 10);
  if (isNaN(userId)) { res.status(400).json({ error: 'Invalid user ID' }); return; }
  const { role } = req.body || {};
  if (!role || !Object.prototype.hasOwnProperty.call(ROLE_QUOTAS, role)) {
    res.status(400).json({ error: 'Invalid role. Must be one of: ' + Object.keys(ROLE_QUOTAS).join(', ') }); return;
  }
  const target = db.getUserById(userId);
  if (!target) { res.status(404).json({ error: 'User not found' }); return; }
  if (userId === req.user.id && role !== 'admin') {
    res.status(400).json({ error: 'Cannot change your own role' }); return;
  }
  db.updateUserRole(userId, role);
  res.json({ success: true, id: userId, role });
});

router.delete('/users/:id', authenticateSession, requireAdmin, (req, res) => {
  const userId = parseInt(req.params.id, 10);
  if (isNaN(userId)) { res.status(400).json({ error: 'Invalid user ID' }); return; }
  if (userId === req.user.id) {
    res.status(400).json({ error: 'Cannot delete your own account' }); return;
  }
  const target = db.getUserById(userId);
  if (!target) { res.status(404).json({ error: 'User not found' }); return; }
  db.deleteUser(userId);
  res.json({ success: true });
});

// -- Role Settings --

router.get('/settings', authenticateSession, requireAdmin, (req, res) => {
  const roles = Object.keys(ROLE_QUOTAS);
  const quotas = {};
  const max_sizes = {};
  for (const role of roles) {
    const q = db.getSetting('quota_' + role);
    quotas[role] = q !== null ? parseInt(q, 10) : ROLE_QUOTAS[role];
    const s = db.getSetting('max_size_' + role);
    max_sizes[role] = s !== null ? parseInt(s, 10) : DEFAULT_MAX_SIZE;
  }
  res.json({ roles, quotas, max_sizes });
});

router.put('/settings', authenticateSession, requireAdmin, (req, res) => {
  const { role, quota, max_size } = req.body || {};
  if (!role || !Object.prototype.hasOwnProperty.call(ROLE_QUOTAS, role)) {
    res.status(400).json({ error: 'Invalid role' }); return;
  }
  if (quota !== undefined) {
    const q = parseInt(quota, 10);
    if (isNaN(q) || (q !== -1 && q < 0)) {
      res.status(400).json({ error: 'quota must be -1 (unlimited) or a positive integer' }); return;
    }
    db.setSetting('quota_' + role, q);
  }
  if (max_size !== undefined) {
    const s = parseInt(max_size, 10);
    if (isNaN(s) || s < 1) {
      res.status(400).json({ error: 'max_size must be a positive integer (bytes)' }); return;
    }
    db.setSetting('max_size_' + role, s);
  }
  res.json({ success: true });
});

module.exports = router;
