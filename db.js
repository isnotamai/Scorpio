'use strict';

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, {recursive: true});
}

const db = new Database(path.join(DATA_DIR, 'scorpio.db'));

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// -- Schema --

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'user',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS api_keys (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    key TEXT NOT NULL UNIQUE,
    label TEXT NOT NULL DEFAULT 'Default',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS files (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    filename TEXT NOT NULL UNIQUE,
    original_name TEXT,
    size INTEGER NOT NULL DEFAULT 0,
    delete_token TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token TEXT NOT NULL UNIQUE,
    expires_at TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_api_keys_key ON api_keys(key);
  CREATE INDEX IF NOT EXISTS idx_files_filename ON files(filename);
  CREATE INDEX IF NOT EXISTS idx_files_delete_token ON files(delete_token);
  CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(token);
`);

// Migration: add role column if missing (for existing DBs)
try {
  db.exec("ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'user'");
} catch (e) {
  // Column already exists — ignore
}

// -- Users --

const stmtCreateUser = db.prepare(
  'INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)'
);
const stmtGetUserByUsername = db.prepare(
  'SELECT * FROM users WHERE username = ?'
);
const stmtGetUserById = db.prepare(
  'SELECT * FROM users WHERE id = ?'
);
const stmtGetAllUsers = db.prepare(
  'SELECT id, username, role, created_at FROM users ORDER BY id ASC'
);
const stmtUpdateUserRole = db.prepare(
  'UPDATE users SET role = ? WHERE id = ?'
);
const stmtDeleteUser = db.prepare(
  'DELETE FROM users WHERE id = ?'
);
const stmtUpdateUserPassword = db.prepare(
  'UPDATE users SET password_hash = ? WHERE id = ?'
);

// -- API Keys --

const stmtCreateApiKey = db.prepare(
  'INSERT INTO api_keys (user_id, key, label) VALUES (?, ?, ?)'
);
const stmtGetApiKeysByUser = db.prepare(
  'SELECT * FROM api_keys WHERE user_id = ? ORDER BY created_at DESC'
);
const stmtGetApiKeyByKey = db.prepare(
  'SELECT * FROM api_keys WHERE key = ?'
);
const stmtGetApiKeyById = db.prepare(
  'SELECT * FROM api_keys WHERE id = ?'
);
const stmtDeleteApiKey = db.prepare(
  'DELETE FROM api_keys WHERE id = ? AND user_id = ?'
);
const stmtCountApiKeysByUser = db.prepare(
  'SELECT COUNT(*) AS count FROM api_keys WHERE user_id = ?'
);

// -- Files --

const stmtCreateFile = db.prepare(
  'INSERT INTO files (user_id, filename, original_name, size, delete_token) VALUES (?, ?, ?, ?, ?)'
);
const stmtGetFilesByUser = db.prepare(
  'SELECT * FROM files WHERE user_id = ? ORDER BY created_at DESC'
);
const stmtGetFileByFilename = db.prepare(
  'SELECT * FROM files WHERE filename = ?'
);
const stmtGetFileByDeleteToken = db.prepare(
  'SELECT * FROM files WHERE delete_token = ?'
);
const stmtDeleteFile = db.prepare(
  'DELETE FROM files WHERE id = ?'
);
const stmtCountFilesByUser = db.prepare(
  'SELECT COUNT(*) AS count FROM files WHERE user_id = ?'
);
const stmtGetFileById = db.prepare(
  'SELECT * FROM files WHERE id = ?'
);

// -- Sessions --

const stmtCreateSession = db.prepare(
  'INSERT INTO sessions (user_id, token, expires_at) VALUES (?, ?, ?)'
);
const stmtGetSession = db.prepare(
  'SELECT * FROM sessions WHERE token = ? AND expires_at > datetime(\'now\')'
);
const stmtDeleteSession = db.prepare(
  'DELETE FROM sessions WHERE token = ?'
);
const stmtCleanExpiredSessions = db.prepare(
  'DELETE FROM sessions WHERE expires_at <= datetime(\'now\')'
);

// Clean expired sessions on startup
stmtCleanExpiredSessions.run();

module.exports = {
  // Users
  createUser(username, passwordHash, role) {
    return stmtCreateUser.run(username, passwordHash, role || 'user');
  },
  getUserByUsername(username) {
    return stmtGetUserByUsername.get(username);
  },
  getUserById(id) {
    return stmtGetUserById.get(id);
  },
  getAllUsers() {
    return stmtGetAllUsers.all();
  },
  updateUserRole(id, role) {
    return stmtUpdateUserRole.run(role, id);
  },
  deleteUser(id) {
    return stmtDeleteUser.run(id);
  },
  updateUserPassword(id, passwordHash) {
    return stmtUpdateUserPassword.run(passwordHash, id);
  },

  // API Keys
  createApiKey(userId, key, label) {
    return stmtCreateApiKey.run(userId, key, label);
  },
  getApiKeysByUser(userId) {
    return stmtGetApiKeysByUser.all(userId);
  },
  getApiKeyByKey(key) {
    return stmtGetApiKeyByKey.get(key);
  },
  getApiKeyById(id) {
    return stmtGetApiKeyById.get(id);
  },
  deleteApiKey(id, userId) {
    return stmtDeleteApiKey.run(id, userId);
  },
  countApiKeysByUser(userId) {
    return stmtCountApiKeysByUser.get(userId).count;
  },

  // Files
  createFile(userId, filename, originalName, size, deleteToken) {
    return stmtCreateFile.run(userId, filename, originalName, size, deleteToken);
  },
  getFilesByUser(userId) {
    return stmtGetFilesByUser.all(userId);
  },
  getFileByFilename(filename) {
    return stmtGetFileByFilename.get(filename);
  },
  getFileById(id) {
    return stmtGetFileById.get(id);
  },
  getFileByDeleteToken(token) {
    return stmtGetFileByDeleteToken.get(token);
  },
  deleteFile(id) {
    return stmtDeleteFile.run(id);
  },
  countFilesByUser(userId) {
    return stmtCountFilesByUser.get(userId).count;
  },

  // Sessions
  createSession(userId, token, expiresAt) {
    return stmtCreateSession.run(userId, token, expiresAt);
  },
  getSession(token) {
    return stmtGetSession.get(token);
  },
  deleteSession(token) {
    return stmtDeleteSession.run(token);
  },
  cleanExpiredSessions() {
    return stmtCleanExpiredSessions.run();
  },
};
