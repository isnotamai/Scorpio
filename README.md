# Scorpio

A self-hosted file upload server with ShareX integration, multi-user auth, and a built-in developer toolbox.

## Features

**File Hosting**
- ShareX-compatible upload endpoint (`POST /upload`)
- Images: JPEG, PNG, GIF, WebP, BMP, SVG
- Videos: MP4, WebM, MOV, AVI, MKV — up to 500 MB
- Unique nanoid filenames, per-file delete tokens
- Rich Discord embeds via Open Graph + oEmbed
- Browser viewer with file metadata

**Auth & Users**
- Registration and login with bcrypt password hashing
- Session tokens (64-char hex, 7-day expiry)
- API key auth for ShareX (`X-API-Key` header)
- Up to 5 API keys per user

**Role System**

| Role | Upload Quota |
|------|-------------|
| `admin` | Unlimited |
| `pro` | 50 files |
| `user` | 10 files |

**Dashboard**
- Upload quota bar and stats
- API key management (create / delete)
- File browser with image thumbnails and copy/delete actions
- Admin panel: view all users, change roles, delete accounts

**Web Toolbox**

| Category | Tools |
|----------|-------|
| Upload | Drag-and-drop file upload, ShareX compatible |
| Encode / Decode | Base64, URL Encode, JSON Formatter |
| Generators | Password, UUID v4, Lorem Ipsum |
| Converters | Timezone, Unix Timestamp, Color (HEX/RGB/HSL), Number Base |
| Analysis | Hash (SHA-1/256/512), Word Count, Regex Tester |

## Quick Start

```bash
npm install
npm start
```

Create a `.env` file before starting:

```env
PORT=3000
BASE_URL=https://your-domain.com
```

The default admin account (`amai`) is seeded automatically on first run.

## ShareX Configuration

```
Request Method:  POST
Request URL:     https://your-domain.com/upload
Headers:         X-API-Key: <your-key>
Body:            MultipartFormData
File Form Name:  file
URL:             {json:url}
Deletion URL:    {json:delete_url}
```

## API Reference

### Upload

```
POST /upload
X-API-Key: <key>          — ShareX / API clients
Authorization: Bearer <token>  — Web UI
Content-Type: multipart/form-data

Body field: file
```

**Response**
```json
{
  "success": true,
  "url": "https://example.com/i/aBcDeFgHiJ.png",
  "delete_url": "https://example.com/delete/aBcDeFgHiJ.png?token=...",
  "filename": "aBcDeFgHiJ.png"
}
```

### Auth

| Method | Endpoint | Body | Auth |
|--------|----------|------|------|
| `POST` | `/api/register` | `{ username, password }` | — |
| `POST` | `/api/login` | `{ username, password }` | — |
| `POST` | `/api/logout` | — | Bearer |
| `GET` | `/api/me` | — | Bearer |

### API Keys

| Method | Endpoint | Body | Auth |
|--------|----------|------|------|
| `POST` | `/api/keys` | `{ label }` | Bearer |
| `DELETE` | `/api/keys/:id` | — | Bearer |

### Files

| Method | Endpoint | Auth |
|--------|----------|------|
| `GET` | `/i/:filename` | — |
| `GET` | `/raw/:filename` | — |
| `GET` | `/delete/:filename?token=...` | Delete token |
| `DELETE` | `/api/files/:id` | Bearer |

### Admin

| Method | Endpoint | Body | Auth |
|--------|----------|------|------|
| `GET` | `/api/admin/users` | — | Admin |
| `PUT` | `/api/admin/users/:id/role` | `{ role }` | Admin |
| `DELETE` | `/api/admin/users/:id` | — | Admin |

## Rate Limits

| Endpoint | Limit |
|----------|-------|
| Register | 3 / hour |
| Login | 10 / 15 min |
| Upload | 10 / min |
| Key creation | 10 / hour |

## Project Structure

```
scorpio/
├── index.js                  # Entry point
├── db.js                     # SQLite schema + prepared statements
├── src/
│   ├── config.js             # Constants and env vars
│   ├── utils.js              # Token generation, session creation
│   ├── middleware/
│   │   └── auth.js           # Auth middleware (API key, Bearer, admin)
│   └── routes/
│       ├── auth.js           # /api/register, /api/login, /api/logout
│       ├── user.js           # /api/me, /api/keys
│       ├── admin.js          # /api/admin/users
│       └── files.js          # /upload, /i/:file, /raw, /delete
├── public/
│   ├── index.html            # Toolbox
│   ├── dashboard.html        # User dashboard
│   ├── script.js             # Toolbox logic
│   ├── dashboard.js          # Dashboard logic
│   └── style.css             # Shared design system
├── uploads/                  # Stored files (git-ignored)
└── data/                     # SQLite database (git-ignored)
```

## Tech Stack

- **Runtime:** Node.js
- **Framework:** Express
- **Database:** SQLite via [better-sqlite3](https://github.com/WiseLibs/better-sqlite3)
- **File Parsing:** [formidable](https://github.com/node-formidable/formidable)
- **Auth:** bcryptjs, crypto (built-in)
- **IDs:** [nanoid](https://github.com/ai/nanoid)
- **Rate Limiting:** express-rate-limit
