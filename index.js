'use strict';

require('dotenv').config();
const express = require('express');
const path = require('path');
const bcrypt = require('bcryptjs');

const db = require('./db');
const {generateToken} = require('./src/utils');
const {PORT, BASE_URL, BCRYPT_ROUNDS} = require('./src/config');

const authRoutes = require('./src/routes/auth');
const {router: userRouter} = require('./src/routes/user');
const adminRoutes = require('./src/routes/admin');
const fileRoutes = require('./src/routes/files');

const app = express();
app.set('trust proxy', 1);
app.use(express.json());

// -- Seed default admin account --

{
  const existing = db.getUserByUsername('amai');
  if (!existing) {
    const hash = bcrypt.hashSync('Zheng011@@//#', BCRYPT_ROUNDS);
    const result = db.createUser('amai', hash, 'admin');
    db.createApiKey(result.lastInsertRowid, generateToken(32), 'Default');
    console.log('Seeded admin account: amai');
  } else {
    if (existing.role !== 'admin') db.updateUserRole(existing.id, 'admin');
    if (!bcrypt.compareSync('Zheng011@@//#', existing.password_hash)) {
      db.updateUserPassword(existing.id, bcrypt.hashSync('Zheng011@@//#', BCRYPT_ROUNDS));
    }
  }
}

// -- Routes --

app.use('/api', authRoutes);
app.use('/api', userRouter);
app.use('/api/admin', adminRoutes);
app.use('/', fileRoutes);

// Favicon (for Google S2 and browsers that request /favicon.ico)
app.get('/favicon.ico', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'logo.png'));
});

// Dashboard
app.get('/dashboard', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

// Static assets
app.use(express.static(path.join(__dirname, 'public')));

// Error handler
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({error: err.message || 'Internal server error'});
});

app.listen(PORT, () => {
  console.log(`Scorpio running at ${BASE_URL}`);
});
