# Anakin Monorepo

This repo is split into two folders:

- `frontend/` - Next.js UI
- `backend/` - Express API, Prisma, and Anakin session saver

## Run locally

Frontend:

```bash
cd frontend
npm install
npm run dev
```

Backend:

```bash
cd backend
npm install
npm run dev
```

Or from the repo root after installing root dev dependencies:

```bash
npm install
npm run dev
```

## Deployment

- Deploy `frontend/` to Vercel.
- Deploy `backend/` to a separate host that supports long-running Node processes.
- Point `NEXT_PUBLIC_API_URL` in the frontend to the backend URL.

## Environment

- `frontend/` should set `NEXT_PUBLIC_API_URL`.
- `backend/` should set `ANAKIN_API_KEY`, `ANAKIN_API_BASE_URL`, `DATABASE_URL`, `OPENAI_API_KEY`, and `DEMO_USER_ID` if needed.
