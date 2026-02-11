# Scorpio

Self-hosted image upload server with a built-in developer toolbox.

## Features

**Image Upload**
- ShareX compatible upload endpoint
- API key authentication
- File type filtering (JPEG, PNG, GIF, WebP, BMP, SVG)
- 50 MB file size limit
- nanoid-based filenames
- Per-file delete tokens (no API key leakage)

**Multi-User System**
- User registration & login with bcrypt password hashing
- Session-based auth (64-char hex tokens, 7-day expiry)
- Role system: admin / pro / user with different upload quotas
- Admin dashboard for user management
- Per-user API key management

**Web Toolbox** (`/`)

| Category | Tools |
|---|---|
| Upload | File Upload (drag & drop, ShareX compatible) |
| Encode / Decode | Base64, URL Encode, JSON Formatter |
| Generators | Password, UUID, Lorem Ipsum |
| Converters | Timezone, Timestamp, Color (HEX/RGB/HSL), Number Base (BIN/OCT/DEC/HEX) |
| Analysis | Hash (SHA-1/SHA-256/SHA-512), Word Count, Regex Tester |

## Setup

```bash
npm install
npm start
```

### Environment Variables

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3000` | Server port |
| `BASE_URL` | `http://localhost:PORT` | Public base URL for generated links |

## API

### Upload

```
POST /upload
Header: X-API-Key: <your-key>
Body: multipart/form-data (field: file)
```

Response:
```json
{
  "success": true,
  "url": "https://example.com/i/abc123.png",
  "delete_url": "https://example.com/delete/abc123.png?token=...",
  "filename": "abc123.png"
}
```

### Auth

```
POST /api/register   { username, password }
POST /api/login      { username, password }
POST /api/logout     (Bearer token)
GET  /api/me         (Bearer token)
```

### API Keys

```
POST   /api/keys       { label }    (Bearer token)
DELETE /api/keys/:id                (Bearer token)
```

### Admin

```
GET    /api/admin/users              (admin only)
PUT    /api/admin/users/:id/role     { role }
DELETE /api/admin/users/:id
```

### View Image

```
GET /i/:filename
```

### Delete Image

```
GET /delete/:filename?token=<delete-token>
```

## ShareX Configuration

Import `sharex-config.sxcu` into ShareX, or manually configure:

- **Request Method:** POST
- **Request URL:** `https://your-domain/upload`
- **Headers:** `X-API-Key: <your-key>`
- **Body:** MultipartFormData
- **File Form Name:** `file`
- **URL:** `{json:url}`
- **Deletion URL:** `{json:delete_url}`

## Tech Stack

- [Express](https://expressjs.com/) - Web framework
- [better-sqlite3](https://github.com/WiseLibs/better-sqlite3) - SQLite database
- [formidable](https://github.com/node-formidable/formidable) - Multipart form parsing
- [nanoid](https://github.com/ai/nanoid) - Unique filename generation
- [bcryptjs](https://github.com/dcodeIO/bcrypt.js) - Password hashing
