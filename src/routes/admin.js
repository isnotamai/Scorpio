'use strict';

const express = require('express');
const db = require('../../db');
const { authenticateSession, requireAdmin } = require('../middleware/auth');
const { ROLE_QUOTAS } = require('../config');

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

module.exports = router;
