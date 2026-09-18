# Campus Found — Backend 🛠️

Express + MongoDB (Mongoose) + Socket.IO API for the **Campus Found** campus lost & found
platform. This repository contains **only the backend** — the React frontend lives in a
separate repository ([Campus-found-Frontend](https://github.com/pritam-pandey/Campus-found-Frontend)).

## Features

- Auth: register / login (**mobile number + password**), bcrypt hashing, JWT (httpOnly cookie + bearer token)
- Lost & found items: CRUD, photo uploads (files on disk, **URLs only in MongoDB**), mark-returned cascade
- MongoDB search with filters + text index on frequently searched fields
- Automatic **possible-match** scoring between lost and found items + notifications
- Private chat: conversations, messages, read status, unread counts, Socket.IO real-time events
- Notifications, user reports, admin APIs (users / items / reports / statistics via aggregation)
- Security: helmet, CORS allowlist, rate limiting, mongo-sanitize, upload validation, admin gate

## Getting started

```bash
npm install
cp .env.example .env    # then edit values
npm run dev             # API on http://localhost:5000
```

### Environment (`.env`)

| Variable | Description |
|---|---|
| `PORT` | API port (default 5000) |
| `MONGODB_URI` | MongoDB connection string — use **MongoDB Atlas** in production |
| `JWT_SECRET` | Long random string (change it!) |
| `JWT_EXPIRES_IN` | Token lifetime (default `7d`) |
| `CLIENT_ORIGIN` | Frontend URL(s) allowed by CORS + Socket.IO, comma separated |
| `MAX_UPLOAD_MB` | Max image size (default 5) |

The MongoDB URI and JWT secret live **only** in `.env` — it is gitignored and never exposed
to the frontend.

## Deploy

Any Node host works (Render, Railway, Fly.io…):

- Build/start command: `npm start` (Node 18+)
- Set all env vars from the table above in the host's dashboard
- `CLIENT_ORIGIN` must include your frontend's URL (e.g. the Vercel domain) or CORS will block it

> Note: uploaded images are stored on local disk (`uploads/`), which is **ephemeral on most
> hosts** — for production, plug in cloud storage (S3/Cloudinary) and keep only the URLs in
> MongoDB, as the schema already does.

## Testing

End-to-end smoke test against an **in-memory MongoDB** (no database install needed):

```bash
npm run smoke
```

Covers register → login → items with uploads → matching → notifications → private chat over
Socket.IO → mark-returned → admin authorization.

## Seed demo data

```bash
node seed.js
```

> ⚠️ Wipes all collections — never run against production.

Seeded accounts (password `Password123`): admin `+8801700000001`, students `+8801700000002`,
`+8801700000003`. Login uses mobile number + password.
