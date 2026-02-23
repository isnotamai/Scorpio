# Scorpio

A self-hosted file upload server with a built-in developer toolbox. Designed for personal use with ShareX integration, multi-user support, and a sleek cyberpunk-themed web interface.

## Features

### File Upload
- ShareX compatible `POST /upload` endpoint
- API key authentication (`X-API-Key` header)
- Supports JPEG, PNG, GIF, WebP, BMP, SVG, AVIF
- 50 MB file size limit
- nanoid-based unique filenames
- Per-file delete tokens (no API key leakage in delete URLs)
- Discord embed support with rich metadata and oEmbed

### Multi-User System
- Registration & login with bcrypt password hashing
- Session-based auth (64-char hex tokens, 7-day expiry)
- Role-based quotas:
  - **admin** — unlimited uploads
  - **pro** — 50 uploads
  - **user** — 10 uploads
- Admin dashboard for user and role management
- Per-user API key management (create / delete)
- Rate limiting on auth and upload endpoints

### Dashboard
- User profile card with avatar, role badge, and stats
- Real-time quota bar with usage percentage
- API key management with create / delete
- Uploaded file browser with image thumbnails
- Admin panel: view all users, change roles, delete users

### Web Toolbox

| Category | Tools |
|---|---|
| Upload | File Upload (drag & drop, ShareX compatible) |
| Encode / Decode | Base64, URL Encode, JSON Formatter |
| Generators | Password, UUID, Lorem Ipsum |
| Converters | Timezone, Unix Timestamp, Color (HEX/RGB/HSL), Number Base |
| Analysis | Hash (SHA-1/256/512), Word Count, Regex Tester |

## Quick Start

```bash
npm install
npm start
```

The server starts on port `3000` by default. The default admin account `amai` is seeded on first run.

### Environment Variables

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3000` | Server port |
| `BASE_URL` | `http://localhost:PORT` | Public base URL for generated links |

## API Reference

### Upload

```
POST /upload
Header: X-API-Key: <your-key>
Body: multipart/form-data (field: file)
```

```json
{
  "success": true,
  "url": "https://example.com/i/abc123.png",
  "delete_url": "https://example.com/delete/abc123.png?token=...",
  "filename": "abc123.png"
}
```

### Auth

| Method | Endpoint | Body | Auth |
|---|---|---|---|
| POST | `/api/register` | `{ username, password }` | — |
| POST | `/api/login` | `{ username, password }` | — |
| POST | `/api/logout` | — | Bearer token |
| GET | `/api/me` | — | Bearer token |

### API Keys

| Method | Endpoint | Body | Auth |
|---|---|---|---|
| POST | `/api/keys` | `{ label }` | Bearer token |
| DELETE | `/api/keys/:id` | — | Bearer token |

### Admin

| Method | Endpoint | Body | Auth |
|---|---|---|---|
| GET | `/api/admin/users` | — | Admin only |
| PUT | `/api/admin/users/:id/role` | `{ role }` | Admin only |
| DELETE | `/api/admin/users/:id` | — | Admin only |

### Images

| Method | Endpoint | Description |
|---|---|---|
| GET | `/i/:filename` | View uploaded image |
| GET | `/delete/:filename?token=...` | Delete image by token |

## ShareX Configuration

Import `sharex-config.sxcu` or configure manually:

- **Request Method:** POST
- **Request URL:** `https://your-domain/upload`
- **Headers:** `X-API-Key: <your-key>`
- **Body:** MultipartFormData
- **File Form Name:** `file`
- **URL:** `{json:url}`
- **Deletion URL:** `{json:delete_url}`

## Tech Stack

- **Runtime:** Node.js
- **Framework:** [Express](https://expressjs.com/)
- **Database:** [better-sqlite3](https://github.com/WiseLibs/better-sqlite3) (SQLite)
- **File Parsing:** [formidable](https://github.com/node-formidable/formidable)
- **IDs:** [nanoid](https://github.com/ai/nanoid)
- **Auth:** [bcryptjs](https://github.com/dcodeIO/bcrypt.js)
