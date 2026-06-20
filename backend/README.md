Anakin backend server

This lightweight Express server exposes an endpoint used by the frontend to check for saved Anakin sessions.

Environment variables:
- `ANAKIN_API_KEY` (required)
- `ANAKIN_API_BASE_URL` (optional, default: https://api.anakin.io)
- `PORT` (optional, default: 4000)

Run locally:

```bash
cd server
npm install
ANAKIN_API_KEY=your_key node index.js
```

Docker:

```bash
docker build -t anakin-server:latest .
docker run -e ANAKIN_API_KEY=... -p 4000:4000 anakin-server:latest
```
