# OrderHub Monorepo

OrderHub is a unified order intelligence ledger that synchronizes your receipts, orders, and returns from major e-commerce platforms (Amazon, Flipkart, Zepto) using Anakin's CDP browser automation and displays them in a modern Neo-Brutalist dashboard.

This repository is organized as a clean monorepo:
* [/frontend](file:///C:/Users/ayush/Desktop/coding/Hackathon/Anakin/frontend) - Next.js UI dashboard with Client-Side JWT Route Security.
* [/backend](file:///C:/Users/ayush/Desktop/coding/Hackathon/Anakin/backend) - Express API Backend, local SQLite Database, and automated CDP session saver.

---

## 🛠️ Key Architectural Enhancements

1. **Zero-Dependency Database (SQLite)**: Switched the Prisma data layer from PostgreSQL to a local SQLite instance (`dev.db`), removing any local Docker requirements. Handled native JSON and Enum limitations via string serialization in the application code.
2. **Secure Multi-User Auth (JWT + PBKDF2)**: Implemented complete user isolation. Signup, Login, and Profile endpoints secure the Express API. Passwords are securely hashed using Node's native `crypto` module (PBKDF2 with custom salts).
3. **Anakin Session Isolation**: Anakin browser sessions are isolated per user as `orderhub-<userId>-<platform>`. A fallback matches generic `orderhub-<platform>` sessions for ease of testing.
4. **Flexible Sync Range**: Select between **Lifetime (Last 6 Years)**, **Last 3 Months**, or **specific calendar years** directly from the UI connection card.
5. **Port Clash Prevention**: Shifted the backend API server port to `3001` (to prevent collision with Docker backend services on `3000`/`4000`).

---

## 🚀 Local Development Setup

### 1. Database Initialization
Ensure database dependencies are generated and the local database is migrated:
```bash
cd backend
npm run prisma:generate
npm run prisma:push
```

### 2. Environment Configurations
Configure the local environment variables.

Create [/backend/.env](file:///C:/Users/ayush/Desktop/coding/Hackathon/Anakin/backend/.env):
```env
DATABASE_URL="file:./dev.db"
ANAKIN_API_KEY="your_anakin_api_key"
ANAKIN_API_BASE_URL="https://api.anakin.io"
OPENAI_API_KEY="optional_openai_key_for_ai_chat"
PORT=3001
AMAZON_EMAIL="your_amazon_email_for_automation"
AMAZON_PASSWORD="your_amazon_password_for_automation"
```

Create [/frontend/.env.local](file:///C:/Users/ayush/Desktop/coding/Hackathon/Anakin/frontend/.env.local):
```env
NEXT_PUBLIC_API_URL="http://localhost:3001"
```

### 3. Run the Servers
Open two terminal tabs:

**Start Backend (Port 3001):**
```bash
cd backend
npm run dev
```

**Start Frontend (Port 3000):**
```bash
cd frontend
npm run dev
```

Visit `http://localhost:3000` to register an account and view the dashboard!

---

## 🔑 Saving Anakin Browser Sessions
To allow the backend to sync orders, Anakin needs an active logged-in browser session. Run the automated CDP login script from the `backend` directory:
```bash
cd backend
npm run save:amazon-session
```
* The script connects to the Anakin remote browser, opens Amazon Sign-In, and auto-fills your `.env` credentials.
* Complete any OTP/CAPTCHA challenges in the browser window, then press `Enter` in the terminal to save your session.

---

## 🌐 Deployment Guidelines

### Backend Deployment (e.g., Render, Railway, or VPS)
1. Set the build command: `npm run prisma:generate`
2. Set the start command: `node index.js` (or `npm start`)
3. Expose the server port (default `3001`).
4. Configure these Environment Variables in your host dashboard:
   * `DATABASE_URL` (For persistent cloud hosting, configure a PostgreSQL database URL and update the `provider` in `schema.prisma` to `postgresql`).
   * `ANAKIN_API_KEY` (Required)
   * `ANAKIN_API_BASE_URL` (Required)
   * `JWT_SECRET` (Define a secure string to sign user sessions)
   * `OPENAI_API_KEY` (Optional)

### Frontend Deployment (e.g., Vercel or Netlify)
1. Deploy the Next.js code located inside `/frontend`.
2. Vercel will automatically detect the Next.js setup.
3. Configure the following Environment Variable in your Vercel project:
   * `NEXT_PUBLIC_API_URL`: Point this to your live **Backend API URL** (e.g., `https://your-backend.railway.app`).
