'use strict';

const db = require('../../db');

/**
 * Authenticates via X-API-Key header or ?key= query param.
 * @param {!express.Request} req
 * @param {!express.Response} res
 * @param {!Function} next
 */
function authenticate(req, res, next) {
  const apiKey = req.headers['x-api-key'] || req.query.key;
  if (!apiKey) { res.status(401).json({ error: 'Unauthorized' }); return; }
  const keyRow = db.getApiKeyByKey(apiKey);
  if (!keyRow) { res.status(401).json({ error: 'Unauthorized' }); return; }
  const user = db.getUserById(keyRow.user_id);
  if (!user) { res.status(401).json({ error: 'Unauthorized' }); return; }
  req.user = user;
  next();
}

/**
 * Authenticates for upload: tries session Bearer first, then API key.
 * @param {!express.Request} req
 * @param {!express.Response} res
 * @param {!Function} next
 */
function authenticateUploadRequest(req, res, next) {
  const auth = req.headers['authorization'];
  if (auth && auth.startsWith('Bearer ')) {
    const token = auth.slice(7);
    const session = db.getSession(token);
    if (session) {
      const user = db.getUserById(session.user_id);
      if (user) { req.user = user; return next(); }
    }
  }
  const apiKey = req.headers['x-api-key'] || req.query.key;
  if (!apiKey) { res.status(401).json({ error: 'Unauthorized' }); return; }
  const keyRow = db.getApiKeyByKey(apiKey);
  if (!keyRow) { res.status(401).json({ error: 'Unauthorized' }); return; }
  const user = db.getUserById(keyRow.user_id);
  if (!user) { res.status(401).json({ error: 'Unauthorized' }); return; }
  req.user = user;
  next();
}

/**
 * Authenticates via Bearer token in Authorization header.
 * @param {!express.Request} req
 * @param {!express.Response} res
 * @param {!Function} next
 */
function authenticateSession(req, res, next) {
  const auth = req.headers['authorization'];
  if (!auth || !auth.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Unauthorized' }); return;
  }
  const token = auth.slice(7);
  const session = db.getSession(token);
  if (!session) { res.status(401).json({ error: 'Session expired or invalid' }); return; }
  const user = db.getUserById(session.user_id);
  if (!user) { res.status(401).json({ error: 'Unauthorized' }); return; }
  req.user = user;
  next();
}

/**
 * Requires admin role. Must be used after authenticateSession.
 * @param {!express.Request} req
 * @param {!express.Response} res
 * @param {!Function} next
 */
function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'admin') {
    res.status(403).json({ error: 'Admin access required' }); return;
  }
  next();
}

module.exports = { authenticate, authenticateUploadRequest, authenticateSession, requireAdmin };
