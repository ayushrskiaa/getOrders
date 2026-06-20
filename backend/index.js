const path = require("path");
require("dotenv").config({ path: path.join(__dirname, ".env") });

const cors = require("cors");
const express = require("express");
const OpenAI = require("openai");
const { Prisma, PrismaClient } = require("@prisma/client");

const Platform = {
  AMAZON: "AMAZON",
  FLIPKART: "FLIPKART",
  ZEPTO: "ZEPTO"
};

const Category = {
  GROCERIES: "GROCERIES",
  ELECTRONICS: "ELECTRONICS",
  FASHION: "FASHION",
  HOUSEHOLD: "HOUSEHOLD",
  FOOD: "FOOD",
  SUBSCRIPTIONS: "SUBSCRIPTIONS",
  OTHER: "OTHER"
};

const AccountStatus = {
  CONNECTED: "CONNECTED",
  NEEDS_LOGIN: "NEEDS_LOGIN",
  FAILED: "FAILED"
};

const SyncStatus = {
  PENDING: "PENDING",
  RUNNING: "RUNNING",
  COMPLETED: "COMPLETED",
  FAILED: "FAILED",
  NEEDS_LOGIN: "NEEDS_LOGIN"
};
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const JWT_SECRET = process.env.JWT_SECRET || "orderhub-super-secret-key-123456";

const app = express();
app.use(cors());
app.use(express.json({ limit: "1mb" }));

const prisma =
  global.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"]
  });

if (process.env.NODE_ENV !== "production") {
  global.prisma = prisma;
}

const appUserId = process.env.DEMO_USER_ID || "demo-user";
const anakinRestBase = getAnakinRestBaseUrl();

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.pbkdf2Sync(password, salt, 1000, 64, "sha512").toString("hex");
  return `${salt}:${hash}`;
}

function verifyPassword(password, storedValue) {
  if (!storedValue || !storedValue.includes(":")) return false;
  const [salt, originalHash] = storedValue.split(":");
  const hash = crypto.pbkdf2Sync(password, salt, 1000, 64, "sha512").toString("hex");
  return hash === originalHash;
}

async function authenticateToken(req, res, next) {
  let token = null;
  const authHeader = req.headers["authorization"];
  if (authHeader && authHeader.startsWith("Bearer ")) {
    token = authHeader.substring(7);
  } else if (req.query.token) {
    token = req.query.token;
  }

  if (!token) {
    return res.status(401).json({ error: "Access token is required" });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.userId = decoded.userId;

    const user = await prisma.user.findUnique({ where: { id: req.userId } });
    if (!user) {
      return res.status(401).json({ error: "User not found or deleted" });
    }
    req.user = user;
    next();
  } catch (err) {
    return res.status(403).json({ error: "Invalid or expired token" });
  }
}

const platformOrderUrls = {
  AMAZON: "https://www.amazon.in/gp/your-account/order-history",
  FLIPKART: "https://www.flipkart.com/account/orders",
  ZEPTO: "https://www.zeptonow.com/account/orders"
};

const platformDomains = {
  AMAZON: ["amazon.in", "amazon.com"],
  FLIPKART: ["flipkart.com"],
  ZEPTO: ["zeptonow.com", "zepto.com"]
};

const categoryKeywords = {
  GROCERIES: ["milk", "egg", "bread", "coffee", "rice", "paneer", "banana", "grocery", "vegetable"],
  ELECTRONICS: ["charger", "usb", "cable", "laptop", "phone", "adapter", "earbuds", "sleeve"],
  FASHION: ["shoe", "shirt", "jeans", "dress", "jacket", "sneaker"],
  HOUSEHOLD: ["cleaning", "cloth", "dishwash", "detergent", "mop", "home"],
  FOOD: ["pizza", "burger", "meal", "restaurant", "snack"],
  SUBSCRIPTIONS: ["prime", "subscription", "membership", "renewal"],
  OTHER: []
};

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

// Auth Routes
app.post("/api/auth/signup", async (req, res) => {
  try {
    const { email, password, name } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: "Email and password are required" });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: "Password must be at least 6 characters long" });
    }

    const existingUser = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
    if (existingUser) {
      return res.status(400).json({ error: "Email is already registered" });
    }

    const passwordHash = hashPassword(password);
    const user = await prisma.user.create({
      data: {
        email: email.toLowerCase(),
        passwordHash,
        name: name || null
      }
    });

    const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: "30d" });

    res.status(201).json({
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/auth/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: "Email and password are required" });
    }

    const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
    if (!user || !verifyPassword(password, user.passwordHash)) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: "30d" });

    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get("/api/auth/me", authenticateToken, (req, res) => {
  res.json({
    user: {
      id: req.user.id,
      email: req.user.email,
      name: req.user.name
    }
  });
});

// Authenticated Business Logic Routes
app.get("/api/accounts", authenticateToken, async (req, res) => {
  const accounts = await prisma.connectedAccount.findMany({ where: { userId: req.userId }, orderBy: { platform: "asc" } });
  res.json({ accounts: accounts.map(serializeAccount) });
});

app.post("/api/accounts/connect", authenticateToken, async (req, res) => {
  try {
    const platform = normalizePlatform(req.body?.platform);
    if (!platform) {
      return res.status(400).json({ error: "platform is required" });
    }

    const connection = await connectAnakinAccount(req.userId, platform);

    const account = await prisma.connectedAccount.upsert({
      where: { userId_platform: { userId: req.userId, platform } },
      create: {
        userId: req.userId,
        platform,
        anakinSessionId: connection.sessionId,
        status: connection.status,
        displayName: connection.displayName,
        lastError: connection.status === AccountStatus.NEEDS_LOGIN ? connection.message : null
      },
      update: {
        anakinSessionId: connection.sessionId,
        status: connection.status,
        displayName: connection.displayName,
        lastError: connection.status === AccountStatus.NEEDS_LOGIN ? connection.message : null
      }
    });

    res.json({ account: serializeAccount(account), message: connection.message });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown connect error";
    const status = message.includes("ANAKIN_API_KEY") ? 400 : 500;
    res.status(status).json({ error: message });
  }
});

app.post("/api/accounts/:id/sync", authenticateToken, async (req, res) => {
  try {
    const account = await prisma.connectedAccount.findUniqueOrThrow({ where: { id: req.params.id } });
    if (account.userId !== req.userId) {
      return res.status(403).json({ error: "Forbidden: Account does not belong to this user" });
    }

    const job = await createSyncJob(account.id);

    await prisma.syncJob.update({
      where: { id: job.id },
      data: { status: SyncStatus.RUNNING, startedAt: new Date() }
    });

    const range = req.query.range || "lifetime";
    const result = await syncOrdersFromAnakin(account.platform, account.anakinSessionId, range);
    const ordersFound = await upsertExtractedOrders(account.userId, result.orders);

    await prisma.$transaction([
      prisma.syncJob.update({
        where: { id: job.id },
        data: {
          status: SyncStatus.COMPLETED,
          ordersFound,
          recordingUrl: result.recordingUrl,
          finishedAt: new Date()
        }
      }),
      prisma.connectedAccount.update({
        where: { id: account.id },
        data: { lastSyncedAt: new Date(), lastError: null }
      })
    ]);

    res.json({ jobId: job.id, status: SyncStatus.COMPLETED, ordersFound });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown sync error";
    const status = message.includes("ANAKIN_API_KEY") || message.includes("logged in") || message.includes("session") ? 400 : 500;

    try {
      const account = await prisma.connectedAccount.findUnique({ where: { id: req.params.id } });
      if (account) {
        const existingJob = await prisma.syncJob.findFirst({ where: { accountId: account.id }, orderBy: { createdAt: "desc" } });
        if (existingJob) {
          await prisma.syncJob.update({
            where: { id: existingJob.id },
            data: { status: SyncStatus.FAILED, error: message, finishedAt: new Date() }
          });
        }
        await prisma.connectedAccount.update({ where: { id: account.id }, data: { lastError: message } });
      }
    } catch {
      // ignore secondary persistence failures
    }

    res.status(status).json({ error: message });
  }
});

app.get("/api/orders", authenticateToken, async (req, res) => {
  const platform = normalizeEnum(Platform, req.query.platform);
  const category = normalizeEnum(Category, req.query.category);
  const status = typeof req.query.status === "string" ? req.query.status : undefined;
  const invoiceOnly = req.query.invoiceOnly === "true";

  const orders = await getOrders(req.userId, { platform, category, status, invoiceOnly });
  res.json({ orders: orders.map(serializeOrder) });
});

app.get("/api/analytics/summary", authenticateToken, async (req, res) => {
  res.json(await getAnalyticsSummary(req.userId));
});

app.get("/api/export/orders.csv", authenticateToken, async (req, res) => {
  const orders = await getOrders(req.userId, {});
  const header = ["Platform", "Order ID", "Date", "Status", "Category", "Total", "Currency", "Items", "Invoice URL"];
  const rows = orders.map((order) => [
    order.platform,
    order.externalOrderId,
    order.orderedAt.toISOString().slice(0, 10),
    order.status,
    order.category,
    Number(order.totalAmount).toFixed(2),
    order.currency,
    order.items.map((item) => `${item.name} x${item.quantity}`).join("; "),
    order.invoiceUrl ?? ""
  ]);

  const csv = [header, ...rows].map((row) => row.map(escapeCsv).join(",")).join("\n");

  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", "attachment; filename=orderhub-orders.csv");
  res.send(csv);
});

app.post("/api/ask", authenticateToken, async (req, res) => {
  try {
    const question = typeof req.body?.question === "string" ? req.body.question : "";
    if (question.trim().length < 3) {
      return res.status(400).json({ error: "question is required" });
    }

    const answer = await answerOrderQuestion(req.userId, question);
    res.json({ answer });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown ask error";
    res.status(500).json({ error: message });
  }
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`Backend listening on ${PORT}`));

async function ensureAppUser() {
  return prisma.user.upsert({
    where: { id: appUserId },
    create: { id: appUserId, email: "local@orderhub.local", name: "Local User" },
    update: {}
  });
}

async function upsertExtractedOrders(userId, orders) {
  let count = 0;

  for (const extracted of orders) {
    const itemText = extracted.items.map((item) => item.name).join(" ");
    const category = extracted.category ?? inferCategory(itemText);

    await prisma.order.upsert({
      where: {
        userId_platform_externalOrderId: {
          userId,
          platform: extracted.platform,
          externalOrderId: extracted.externalOrderId
        }
      },
      create: {
        userId,
        platform: extracted.platform,
        externalOrderId: extracted.externalOrderId,
        orderedAt: extracted.orderedAt,
        totalAmount: new Prisma.Decimal(extracted.totalAmount),
        currency: extracted.currency,
        status: extracted.status,
        category,
        invoiceUrl: extracted.invoiceUrl,
        returnBy: extracted.returnBy,
        raw: JSON.stringify(extracted.raw ?? extracted),
        items: {
          create: extracted.items.map((item) => ({
            name: item.name,
            quantity: item.quantity,
            unitPrice: new Prisma.Decimal(item.unitPrice),
            category: item.category ?? inferCategory(item.name),
            productUrl: item.productUrl,
            raw: JSON.stringify(item.raw ?? item)
          }))
        },
        invoices: extracted.invoiceUrl ? { create: { url: extracted.invoiceUrl, label: `${extracted.platform} invoice` } } : undefined
      },
      update: {
        orderedAt: extracted.orderedAt,
        totalAmount: new Prisma.Decimal(extracted.totalAmount),
        currency: extracted.currency,
        status: extracted.status,
        category,
        invoiceUrl: extracted.invoiceUrl,
        returnBy: extracted.returnBy,
        raw: JSON.stringify(extracted.raw ?? extracted),
        items: {
          deleteMany: {},
          create: extracted.items.map((item) => ({
            name: item.name,
            quantity: item.quantity,
            unitPrice: new Prisma.Decimal(item.unitPrice),
            category: item.category ?? inferCategory(item.name),
            productUrl: item.productUrl,
            raw: JSON.stringify(item.raw ?? item)
          }))
        },
        invoices: extracted.invoiceUrl
          ? {
              deleteMany: {},
              create: { url: extracted.invoiceUrl, label: `${extracted.platform} invoice` }
            }
          : { deleteMany: {} }
      }
    });
    count += 1;
  }

  return count;
}

async function getOrders(userId, filters) {
  return prisma.order.findMany({
    where: {
      userId: userId,
      platform: filters.platform,
      category: filters.category,
      status: filters.status,
      invoiceUrl: filters.invoiceOnly ? { not: null } : undefined
    },
    include: { items: true, invoices: true },
    orderBy: { orderedAt: "desc" }
  });
}

async function createSyncJob(accountId) {
  const account = await prisma.connectedAccount.findUniqueOrThrow({ where: { id: accountId } });

  return prisma.syncJob.create({
    data: {
      userId: account.userId,
      accountId: account.id,
      platform: account.platform,
      status: SyncStatus.PENDING
    }
  });
}

async function getAnalyticsSummary(userId) {
  const orders = await prisma.order.findMany({
    where: { userId: userId },
    include: { items: true },
    orderBy: { orderedAt: "desc" }
  });

  const now = new Date();
  const currentMonth = now.getMonth();
  const currentYear = now.getFullYear();

  const totalSpend = sum(orders.map((order) => Number(order.totalAmount)));
  const monthSpend = sum(
    orders
      .filter((order) => order.orderedAt.getMonth() === currentMonth && order.orderedAt.getFullYear() === currentYear)
      .map((order) => Number(order.totalAmount))
  );

  const byPlatform = Object.fromEntries(
    Object.values(Platform).map((platform) => [
      platform,
      sum(orders.filter((order) => order.platform === platform).map((order) => Number(order.totalAmount)))
    ])
  );

  const byCategory = Object.fromEntries(
    Object.values(Category).map((category) => [
      category,
      sum(orders.filter((order) => order.category === category).map((order) => Number(order.totalAmount)))
    ])
  );

  const upcomingReturns = orders.filter((order) => {
    if (!order.returnBy) return false;
    const days = (order.returnBy.getTime() - now.getTime()) / 86_400_000;
    return days >= 0 && days <= 14;
  });

  return {
    totalOrders: orders.length,
    totalSpend,
    monthSpend,
    byPlatform,
    byCategory,
    upcomingReturns: upcomingReturns.length,
    latestOrderAt: orders[0]?.orderedAt ?? null
  };
}

async function connectAnakinAccount(userId, platform) {
  if (!hasAnakinKey()) {
    throw new Error("ANAKIN_API_KEY is required to connect an Anakin session.");
  }

  const sessions = await listAnakinSessions();
  const matched = findPlatformSession(userId, platform, sessions);

  if (matched) {
    const sessionId = matched.id ?? matched.session_id ?? matched.name ?? matched.session_name;

    if (!sessionId) {
      throw new Error("Matched Anakin session did not include an id or name.");
    }

    return {
      sessionId,
      status: AccountStatus.CONNECTED,
      displayName: matched.name ?? matched.session_name ?? `${platform.toLowerCase()} saved session`,
      message: "Saved Anakin session found."
    };
  }

  const sessionName = getDefaultSessionName(userId, platform);

  return {
    sessionId: sessionName,
    status: AccountStatus.NEEDS_LOGIN,
    displayName: sessionName,
    message: `Create a saved Anakin browser session named "${sessionName}" for ${platformOrderUrls[platform]}, then connect again.`
  };
}

async function syncOrdersFromAnakin(platform, sessionId, range = "lifetime") {
  if (!hasAnakinKey()) {
    throw new Error("ANAKIN_API_KEY is required to sync orders from Anakin.");
  }

  let urls = [platformOrderUrls[platform]];
  if (platform === "AMAZON") {
    const currentYear = new Date().getFullYear();
    if (range === "3months") {
      urls = [`https://www.amazon.in/gp/your-account/order-history?orderFilter=months-3`];
    } else if (range === "lifetime" || range === "all") {
      urls = [];
      for (let year = currentYear; year >= currentYear - 5; year--) {
        urls.push(`https://www.amazon.in/gp/your-account/order-history?orderFilter=year-${year}`);
      }
    } else if (/^\d{4}$/.test(range)) {
      urls = [`https://www.amazon.in/gp/your-account/order-history?orderFilter=year-${range}`];
    }
  }

  let allOrders = [];
  let recordingUrl = undefined;

  for (const url of urls) {
    try {
      console.log(`Scraping URL: ${url}`);
      const scrapeResult = await scrapeUrlWithAnakin(url, sessionId);
      const sourceText = scrapeResult.markdown ?? stripHtml(scrapeResult.cleanedHtml ?? scrapeResult.html ?? "");

      if (looksLikeLoginPage(sourceText, scrapeResult.html ?? "")) {
        throw new Error("Saved Anakin session is not logged in. Recreate or refresh the saved session.");
      }

      const orders = extractOrdersFromText(platform, sourceText, scrapeResult.html ?? "");
      allOrders = allOrders.concat(orders);
      if (scrapeResult.recordingUrl) {
        recordingUrl = scrapeResult.recordingUrl;
      }
      
      await delay(1000);
    } catch (err) {
      console.warn(`Failed to sync URL ${url}: ${err.message}`);
      if (urls.length === 1 || err.message.includes("logged in")) {
        throw err;
      }
    }
  }

  // Deduplicate orders by externalOrderId
  const seenIds = new Set();
  const uniqueOrders = allOrders.filter(order => {
    if (seenIds.has(order.externalOrderId)) return false;
    seenIds.add(order.externalOrderId);
    return true;
  });

  return {
    orders: uniqueOrders,
    recordingUrl
  };
}

async function listAnakinSessions() {
  const response = await fetch(`${anakinRestBase}/sessions`, {
    headers: getAnakinHeaders(),
    cache: "no-store"
  });

  if (!response.ok) {
    throw new Error(`Could not list Anakin sessions: ${response.status}`);
  }

  const data = await response.json();
  return Array.isArray(data) ? data : data.sessions ?? [];
}

function findPlatformSession(userId, platform, sessions) {
  const expectedName = getDefaultSessionName(userId, platform).toLowerCase();
  const fallbackName = `orderhub-${platform.toLowerCase()}`;
  const domains = platformDomains[platform];

  return sessions.find((session) => {
    const name = `${session.name ?? ""} ${session.session_name ?? ""}`.toLowerCase();
    const url = `${session.url ?? ""} ${session.save_url ?? ""}`.toLowerCase();
    return name.includes(expectedName) || name.includes(fallbackName) || domains.some((domain) => name.includes(domain) || url.includes(domain));
  });
}

function getDefaultSessionName(userId, platform) {
  return `orderhub-${userId}-${platform.toLowerCase()}`;
}

function getAnakinRestBaseUrl() {
  const base = process.env.ANAKIN_API_BASE_URL ?? "https://api.anakin.io";
  return base.endsWith("/v1") ? base : `${base.replace(/\/$/, "")}/v1`;
}

function getAnakinHeaders() {
  return {
    "Content-Type": "application/json",
    "X-API-Key": process.env.ANAKIN_API_KEY ?? ""
  };
}

function hasAnakinKey() {
  return Boolean(process.env.ANAKIN_API_KEY);
}

function normalizePlatform(value) {
  return normalizeEnum(Platform, value);
}

function normalizeEnum(values, value) {
  return Object.values(values).includes(value) ? value : undefined;
}

function inferCategory(text) {
  const normalized = String(text || "").toLowerCase();

  for (const [category, keywords] of Object.entries(categoryKeywords)) {
    if (category !== "OTHER" && keywords.some((keyword) => normalized.includes(keyword))) {
      return category;
    }
  }

  return "OTHER";
}

function escapeCsv(value) {
  const cell = String(value ?? "");
  return /[",\n]/.test(cell) ? `"${cell.replace(/"/g, '""')}"` : cell;
}

function sanitizeJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function serializeAccount(account) {
  return {
    ...account,
    lastSyncedAt: account.lastSyncedAt ? account.lastSyncedAt.toISOString() : null,
    createdAt: account.createdAt.toISOString(),
    updatedAt: account.updatedAt.toISOString()
  };
}

function serializeOrder(order) {
  return {
    id: order.id,
    platform: order.platform,
    externalOrderId: order.externalOrderId,
    orderedAt: order.orderedAt.toISOString(),
    totalAmount: Number(order.totalAmount),
    status: order.status,
    category: order.category,
    invoiceUrl: order.invoiceUrl,
    returnBy: order.returnBy ? order.returnBy.toISOString() : null,
    items: order.items.map((item) => ({ name: item.name, quantity: item.quantity }))
  };
}

async function answerOrderQuestion(userId, question) {
  const orders = await getOrders(userId, {});
  const compactOrders = orders.map((order) => ({
    platform: order.platform,
    date: order.orderedAt.toISOString().slice(0, 10),
    total: Number(order.totalAmount),
    category: order.category,
    status: order.status,
    items: order.items.map((item) => item.name)
  }));

  if (!process.env.OPENAI_API_KEY) {
    return answerWithRules(question, compactOrders);
  }

  const OpenAIClient = OpenAI.default ?? OpenAI;
  const openai = new OpenAIClient({ apiKey: process.env.OPENAI_API_KEY });
  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      {
        role: "system",
        content:
          "Answer only from the provided order JSON. If the data is missing, say what is missing. Keep answers short and include INR totals."
      },
      { role: "user", content: `Question: ${question}\nOrders: ${JSON.stringify(compactOrders)}` }
    ],
    temperature: 0.1
  });

  return response.choices[0]?.message.content ?? "I could not answer that from your order data.";
}

function answerWithRules(question, orders) {
  const normalized = question.toLowerCase();
  const now = new Date();
  const monthOrders = orders.filter((order) => {
    const date = new Date(order.date);
    return date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear();
  });

  if (normalized.includes("grocery") || normalized.includes("groceries")) {
    const total = orders.filter((order) => order.category === "GROCERIES").reduce((amount, order) => amount + order.total, 0);
    return `You spent ${formatInr(total)} on groceries across your synced orders.`;
  }

  if (normalized.includes("this month") || normalized.includes("month")) {
    const total = monthOrders.reduce((amount, order) => amount + order.total, 0);
    return `You spent ${formatInr(total)} this month across ${monthOrders.length} synced orders.`;
  }

  if (normalized.includes("flipkart")) {
    const flipkartOrders = orders.filter((order) => order.platform === "FLIPKART");
    return `You have ${flipkartOrders.length} Flipkart orders totaling ${formatInr(
      flipkartOrders.reduce((amount, order) => amount + order.total, 0)
    )}.`;
  }

  if (normalized.includes("return")) {
    return "Open the Returns tab to see orders with visible return windows. Return dates are captured when platforms expose them.";
  }

  return `I found ${orders.length} synced orders totaling ${formatInr(
    orders.reduce((amount, order) => amount + order.total, 0)
  )}. Try asking about monthly spend, groceries, Flipkart, or returns.`;
}

function formatInr(value) {
  const amount = typeof value === "string" ? Number(value) : value;
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(amount);
}

async function scrapeUrlWithAnakin(url, sessionId) {
  const response = await fetch(`${anakinRestBase}/url-scraper`, {
    method: "POST",
    headers: getAnakinHeaders(),
    cache: "no-store",
    body: JSON.stringify({
      url,
      sessionId,
      useBrowser: true,
      generateJson: true
    })
  });

  if (!response.ok) {
    throw new Error(`Could not submit Anakin scrape job: ${response.status}`);
  }

  const submitted = await response.json();
  if (!submitted.jobId) {
    throw new Error("Anakin scrape job did not return a jobId.");
  }

  for (let attempt = 0; attempt < 40; attempt += 1) {
    const jobResponse = await fetch(`${anakinRestBase}/url-scraper/${submitted.jobId}`, {
      headers: getAnakinHeaders(),
      cache: "no-store"
    });

    if (!jobResponse.ok) {
      await delay(1500);
      continue;
    }

    const job = await jobResponse.json();

    if (job.status === "completed") {
      return {
        html: job.html,
        cleanedHtml: job.cleanedHtml,
        markdown: job.markdown,
        recordingUrl: undefined,
        generatedJson: job.generatedJson?.data
      };
    }

    if (job.status === "failed") {
      throw new Error(job.error ?? "Anakin scrape job failed.");
    }

    await delay(1500);
  }

  throw new Error("Anakin scrape job timed out.");
}

function extractOrdersFromText(platform, text, html) {
  const blocks = splitIntoOrderBlocks(text, platform);

  return blocks.map((block, index) => {
    const parsed = parseOrderBlock(block, html, platform);
    return normalizeOrder(platform, parsed, index);
  });
}

function splitIntoOrderBlocks(text, platform) {
  const normalized = text.replace(/\r/g, "");
  
  if (platform === "AMAZON") {
    // Amazon orders typically start with "Order placed" or "Order #"
    const blocks = normalized.split(/(?=Order placed|Order\s*#|Order\s*placed|ORDER\s*#\d)/i)
      .map(b => b.trim())
      .filter(b => b.length > 30 && (b.includes("Order") || b.includes("Total")));
    if (blocks.length > 0) return blocks;
  }
  
  if (platform === "FLIPKART") {
    // Flipkart orders are usually separated by "OD" order ID
    const blocks = normalized.split(/(?=OD\d{15})/i)
      .map(b => b.trim())
      .filter(b => b.length > 30);
    if (blocks.length > 0) return blocks;
  }
  
  if (platform === "ZEPTO") {
    // Zepto orders are usually separated by "ZEP" order ID or "Order ID"
    const blocks = normalized.split(/(?=Order\s*ID\s*:\s*ZEP|ZEP\d{10})/i)
      .map(b => b.trim())
      .filter(b => b.length > 30);
    if (blocks.length > 0) return blocks;
  }

  // Fallback lookahead regex split
  return normalized
    .split(/(?=\b(?:Order|OD|ZEP)[#:\s-]*[A-Z0-9-]{5,}\b)/i)
    .map((block) => block.trim())
    .filter((block) => block.length > 40);
}

function parseOrderBlock(block, html, platform) {
  let orderId = null;
  if (platform === "AMAZON") {
    const match = block.match(/\b\d{3}-\d{7}-\d{7}\b/);
    if (match) orderId = match[0];
  } else if (platform === "FLIPKART") {
    const match = block.match(/\bOD\d{15}\b/i);
    if (match) orderId = match[0];
  } else if (platform === "ZEPTO") {
    const match = block.match(/\bZEP\d{10}\b/i);
    if (match) orderId = match[0];
  }

  // Fallback to original regex but supporting backslash and excluding common words
  if (!orderId) {
    const fallbackMatch = block.match(/(?:Order(?:\s*ID)?|OD|ZEP)[\\#:\s-]*([A-Z0-9-]{5,})/i)?.[1];
    if (fallbackMatch && !/placed|details|history|status/i.test(fallbackMatch)) {
      orderId = fallbackMatch;
    }
  }

  if (!orderId) {
    orderId = `ORDER-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  }

  const amount = block.match(/(?:₹|Rs\.?)\s*([0-9,]+(?:\.[0-9]{1,2})?)/i)?.[1] ?? "0";
  const dates = block.match(/\b(?:\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{4})\b/gi) ?? [];
  const title =
    block
      .split(/\n+/)
      .map((line) => line.trim())
      .find((line) => line.length > 6 && !/order|invoice|return|delivery|track/i.test(line)) ??
    block.slice(0, 90);

  const invoiceUrl = html.match(/href=["']([^"']*(?:invoice|receipt|bill)[^"']*)["']/i)?.[1];
  const productUrl = html.match(/href=["']([^"']*(?!.*(?:invoice|receipt|return|track)).*?)["']/i)?.[1];

  return {
    orderId,
    text: block,
    amount,
    invoiceUrl,
    productUrl,
    title,
    orderedAtHint: dates[0]
  };
}

function normalizeOrder(platform, raw, index) {
  const amount = Number((raw.amount ?? "0").replace(/,/g, ""));
  const categoryText = `${raw.title ?? ""} ${raw.text}`;

  return {
    platform,
    externalOrderId: raw.orderId || `${platform}-${Date.now()}-${index}`,
    orderedAt: extractDate(raw.text) ?? new Date(),
    totalAmount: amount,
    currency: "INR",
    status: extractStatus(raw.text),
    invoiceUrl: raw.invoiceUrl,
    items: [
      {
        name: cleanTitle(raw.title ?? "Unknown item"),
        quantity: 1,
        unitPrice: amount,
        productUrl: raw.productUrl
      }
    ],
    raw: { ...raw, categoryText }
  };
}

function extractDate(text) {
  const match = text.match(/\b(\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{4})\b/i);
  return match ? new Date(match[1]) : undefined;
}

function extractStatus(text) {
  return text.match(/Delivered|Cancelled|Canceled|In transit|Returned|Refunded|Arriving|Out for delivery/i)?.[0] ?? "Unknown";
}

function cleanTitle(title) {
  return title.replace(/\s+/g, " ").trim().slice(0, 140) || "Unknown item";
}

function stripHtml(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/\s+/g, " ")
    .trim();
}

function looksLikeLoginPage(text, html) {
  const haystack = `${text} ${html}`.toLowerCase();
  
  // Specific indicators of Amazon Sign-In pages (such as email input, password input, sign-in submit button)
  const isAmazonLogin = 
    html.includes('id="ap_email"') || 
    html.includes('id="ap_password"') || 
    html.includes('id="signInSubmit"') || 
    html.includes('createAccountSubmit') ||
    haystack.includes("amazon sign-in");
    
  // Flipkart sign-in indicators
  const isFlipkartLogin = 
    (haystack.includes("login") && (html.includes("enter email/mobile number") || html.includes("otp")));
    
  // Zepto sign-in indicators  
  const isZeptoLogin = 
    haystack.includes("enter mobile number") && html.includes("otp");

  return isAmazonLogin || isFlipkartLogin || isZeptoLogin;
}



function sum(values) {
  return values.reduce((total, value) => total + value, 0);
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
