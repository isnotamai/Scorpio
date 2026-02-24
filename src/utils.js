'use strict';

const crypto = require('crypto');
const db = require('../db');
const { SESSION_DAYS } = require('./config');

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

module.exports = { generateToken, createSession, formatBytes };
