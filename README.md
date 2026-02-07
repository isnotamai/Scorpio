# Scorpio

Self-hosted image upload server with a built-in developer toolbox.

## Features

**Image Upload**
- ShareX compatible upload endpoint
- API key authentication
- File type filtering (JPEG, PNG, GIF, WebP, BMP, SVG)
- 50 MB file size limit
- nanoid-based filenames

**Web Toolbox** (`/`)
- File Upload (drag & drop)
- Timezone Converter
- Base64 Encoder / Decoder
- JSON Formatter
- URL Encoder / Decoder
- Password Generator
- Hash Generator (SHA-1 / SHA-256 / SHA-512)
- Color Converter (HEX / RGB / HSL)
- Word Counter

## Setup

```bash
npm install
npm start
```

### Environment Variables

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3000` | Server port |
| `SECRET_KEY` | — | API key for authentication |
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
  "delete_url": "https://example.com/delete/abc123.png?key=...",
  "filename": "abc123.png"
}
```

### View Image

```
GET /i/:filename
```

### Delete Image

```
GET /delete/:filename?key=<your-key>
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
- [formidable](https://github.com/node-formidable/formidable) - Multipart form parsing
- [nanoid](https://github.com/ai/nanoid) - Unique filename generation
