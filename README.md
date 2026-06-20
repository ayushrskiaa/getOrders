# OrderHub

Unified order intelligence for Amazon, Flipkart, and Zepto, powered by Anakin API-backed browser sessions.

## What is implemented

- Next.js dashboard with connect, sync, orders, category spend, AI Q&A, and CSV export.
- Prisma/PostgreSQL schema for users, connected accounts, sync jobs, orders, items, invoices, and product snapshots.
- API routes matching the hackathon plan.
- Anakin adapter that connects saved sessions and pulls order pages through the Anakin API.
- OpenAI adapter that uses deterministic fallback answers when `OPENAI_API_KEY` is missing.

## Local setup

```bash
npm install
copy .env.example .env
docker compose up -d
npm run prisma:push
npm run seed
npm run dev
```

Open `http://localhost:3000`.

## Useful commands

```bash
npm test
npm run build
npm run prisma:generate
npm run save:amazon-session
```

## Environment variables

- `DATABASE_URL`: PostgreSQL connection string.
- `ANAKIN_API_KEY`: required for Anakin session lookup and order sync.
- `ANAKIN_API_BASE_URL`: defaults to `https://api.anakin.io`.
- `OPENAI_API_KEY`: optional for live AI answers.
- `APP_USER_ID`: defaults to `local-user`.
- `AMAZON_EMAIL` / `AMAZON_PASSWORD`: required for the Amazon session saver.
- `AMAZON_SESSION_NAME`: defaults to `orderhub-amazon`.

## Safety model

OrderHub is read-only. It stores Anakin session references, not passwords, and does not place orders, cancel orders, return items, modify accounts, or message support.
