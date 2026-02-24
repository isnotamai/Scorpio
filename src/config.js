'use strict';

module.exports = {
  PORT: process.env.PORT,
  BASE_URL: process.env.BASE_URL,
  BCRYPT_ROUNDS: 12,
  SESSION_DAYS: 7,
  MAX_API_KEYS: 5,
  MAX_FILE_SIZE: 500 * 1024 * 1024,

  /** @type {!Object<string, number>} */
  ROLE_QUOTAS: {
    admin: -1, // unlimited
    pro: 50,
    user: 10,
  },

  /** @type {!RegExp} */
  ALLOWED_TYPES: /jpeg|jpg|png|gif|webp|bmp|svg|mp4|webm|mov|avi|mkv|quicktime|x-msvideo|x-matroska/,

  /** @type {!Set<string>} */
  VIDEO_EXTS: new Set(['.mp4', '.webm', '.mov', '.avi', '.mkv']),

  /** @type {!RegExp} */
  USERNAME_RE: /^[a-zA-Z0-9_-]{3,32}$/,
};
