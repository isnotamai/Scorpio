'use strict';

const express = require('express');
const bcrypt = require('bcryptjs');
const rateLimit = require('express-rate-limit');
const db = require('../../db');
const { generateToken, createSession } = require('../utils');
const { authenticateSession } = require('../middleware/auth');
const { BCRYPT_ROUNDS, USERNAME_RE } = require('../config');

const router = express.Router();

const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 3,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many registration attempts. Try again later.' },
});

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many login attempts. Try again later.' },
});

router.post('/register', registerLimiter, (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) {
    res.status(400).json({ error: 'Username and password are required' }); return;
  }
  if (!USERNAME_RE.test(username)) {
    res.status(400).json({ error: 'Username must be 3-32 characters (letters, numbers, _ or -)' }); return;
  }
  if (password.length < 8 || password.length > 128) {
    res.status(400).json({ error: 'Password must be 8-128 characters' }); return;
  }
  if (db.getUserByUsername(username)) {
    res.status(409).json({ error: 'Username already taken' }); return;
  }
  const hash = bcrypt.hashSync(password, BCRYPT_ROUNDS);
  const result = db.createUser(username, hash, 'user');
  const userId = result.lastInsertRowid;
  const apiKey = generateToken(32);
  db.createApiKey(userId, apiKey, 'Default');
  const token = createSession(userId);
  res.json({ success: true, token, user: { id: userId, username, role: 'user' }, api_key: apiKey });
});

router.post('/login', loginLimiter, (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) {
    res.status(400).json({ error: 'Username and password are required' }); return;
  }
  const user = db.getUserByUsername(username);
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    res.status(401).json({ error: 'Invalid username or password' }); return;
  }
  const token = createSession(user.id);
  res.json({ success: true, token, user: { id: user.id, username: user.username, role: user.role } });
});

router.post('/logout', authenticateSession, (req, res) => {
  const token = req.headers['authorization'].slice(7);
  db.deleteSession(token);
  res.json({ success: true });
});

module.exports = router;
