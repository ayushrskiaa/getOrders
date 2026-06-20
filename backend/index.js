const path = require("path");
require("dotenv").config({ path: path.join(__dirname, ".env") });

const cors = require("cors");
const express = require("express");
const OpenAI = require("openai");
const { AccountStatus, Category, Platform, Prisma, PrismaClient, SyncStatus } = require("@prisma/client");

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

app.get("/api/accounts", async (_req, res) => {
  const user = await ensureAppUser();
  const accounts = await prisma.connectedAccount.findMany({ where: { userId: user.id }, orderBy: { platform: "asc" } });
  res.json({ accounts: accounts.map(serializeAccount) });
});

app.post("/api/accounts/connect", async (req, res) => {
  try {
    const platform = normalizePlatform(req.body?.platform);
    if (!platform) {
      return res.status(400).json({ error: "platform is required" });
    }

    const user = await ensureAppUser();
    const connection = await connectAnakinAccount(platform);

    const account = await prisma.connectedAccount.upsert({
      where: { userId_platform: { userId: user.id, platform } },
      create: {
        userId: user.id,
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

app.post("/api/accounts/:id/sync", async (req, res) => {
  try {
    const account = await prisma.connectedAccount.findUniqueOrThrow({ where: { id: req.params.id } });
    const job = await createSyncJob(account.id);

    await prisma.syncJob.update({
      where: { id: job.id },
      data: { status: SyncStatus.RUNNING, startedAt: new Date() }
    });

    const result = await syncOrdersFromAnakin(account.platform, account.anakinSessionId);
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

app.get("/api/orders", async (req, res) => {
  const platform = normalizeEnum(Platform, req.query.platform);
  const category = normalizeEnum(Category, req.query.category);
  const status = typeof req.query.status === "string" ? req.query.status : undefined;
  const invoiceOnly = req.query.invoiceOnly === "true";

  const orders = await getOrders({ platform, category, status, invoiceOnly });
  res.json({ orders: orders.map(serializeOrder) });
});

app.get("/api/analytics/summary", async (_req, res) => {
  res.json(await getAnalyticsSummary());
});

app.get("/api/export/orders.csv", async (_req, res) => {
  const orders = await getOrders({});
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

app.post("/api/ask", async (req, res) => {
  try {
    const question = typeof req.body?.question === "string" ? req.body.question : "";
    if (question.trim().length < 3) {
      return res.status(400).json({ error: "question is required" });
    }

    const answer = await answerOrderQuestion(question);
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
        raw: sanitizeJson(extracted.raw ?? extracted),
        items: {
          create: extracted.items.map((item) => ({
            name: item.name,
            quantity: item.quantity,
            unitPrice: new Prisma.Decimal(item.unitPrice),
            category: item.category ?? inferCategory(item.name),
            productUrl: item.productUrl,
            raw: sanitizeJson(item.raw ?? item)
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
        raw: sanitizeJson(extracted.raw ?? extracted),
        items: {
          deleteMany: {},
          create: extracted.items.map((item) => ({
            name: item.name,
            quantity: item.quantity,
            unitPrice: new Prisma.Decimal(item.unitPrice),
            category: item.category ?? inferCategory(item.name),
            productUrl: item.productUrl,
            raw: sanitizeJson(item.raw ?? item)
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

async function getOrders(filters) {
  return prisma.order.findMany({
    where: {
      userId: appUserId,
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

async function getAnalyticsSummary() {
  const orders = await prisma.order.findMany({
    where: { userId: appUserId },
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

async function connectAnakinAccount(platform) {
  if (!hasAnakinKey()) {
    throw new Error("ANAKIN_API_KEY is required to connect an Anakin session.");
  }

  const sessions = await listAnakinSessions();
  const matched = findPlatformSession(platform, sessions);

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

  const sessionName = getDefaultSessionName(platform);

  return {
    sessionId: sessionName,
    status: AccountStatus.NEEDS_LOGIN,
    displayName: sessionName,
    message: `Create a saved Anakin browser session named "${sessionName}" for ${platformOrderUrls[platform]}, then connect again.`
  };
}

async function syncOrdersFromAnakin(platform, sessionId) {
  if (!hasAnakinKey()) {
    throw new Error("ANAKIN_API_KEY is required to sync orders from Anakin.");
  }

  const scrapeResult = await scrapeUrlWithAnakin(platformOrderUrls[platform], sessionId);
  const sourceText = scrapeResult.markdown ?? stripHtml(scrapeResult.cleanedHtml ?? scrapeResult.html ?? "");

  if (looksLikeLoginPage(sourceText, scrapeResult.html ?? "")) {
    throw new Error("Saved Anakin session is not logged in. Recreate or refresh the saved session.");
  }

  const orders = extractOrdersFromText(platform, sourceText, scrapeResult.html ?? "");

  return {
    orders,
    recordingUrl: scrapeResult.recordingUrl
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

function findPlatformSession(platform, sessions) {
  const expectedName = getDefaultSessionName(platform).toLowerCase();
  const domains = platformDomains[platform];

  return sessions.find((session) => {
    const name = `${session.name ?? ""} ${session.session_name ?? ""}`.toLowerCase();
    const url = `${session.url ?? ""} ${session.save_url ?? ""}`.toLowerCase();
    return name.includes(expectedName) || domains.some((domain) => name.includes(domain) || url.includes(domain));
  });
}

function getDefaultSessionName(platform) {
  return `orderhub-${platform.toLowerCase()}`;
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

async function answerOrderQuestion(question) {
  const orders = await getOrders({});
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
    const parsed = parseOrderBlock(block, html);
    return normalizeOrder(platform, parsed, index);
  });
}

function splitIntoOrderBlocks(text, platform) {
  const normalized = text.replace(/\r/g, "");
  const markerPatterns = {
    AMAZON: /(?:order\s*id|order details|delivery estimate|invoice|return by)/i,
    FLIPKART: /(?:order id|delivery by|shipment|track order|invoice)/i,
    ZEPTO: /(?:order id|delivered|invoice|items|delivery address)/i
  };

  const lines = normalized.split(/\n+/).map((line) => line.trim()).filter(Boolean);
  const markers = lines.filter((line) => markerPatterns[platform].test(line));

  if (markers.length >= 2) {
    return markers.map((line) => line);
  }

  return normalized
    .split(/(?=\b(?:Order|OD|ZEP)[#:\s-]*[A-Z0-9-]{5,}\b)/i)
    .map((block) => block.trim())
    .filter((block) => block.length > 40);
}

function parseOrderBlock(block, html) {
  const orderId = block.match(/(?:Order(?:\s*ID)?|OD|ZEP)[#:\s-]*([A-Z0-9-]{5,})/i)?.[1] ?? `ORDER-${Date.now()}`;
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
  return (
    haystack.includes("sign in") ||
    haystack.includes("log in") ||
    haystack.includes("enter mobile number") ||
    haystack.includes("verify your account") ||
    haystack.includes("login")
  );
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

function getAnakinRestBaseUrl() {
  const base = process.env.ANAKIN_API_BASE_URL ?? "https://api.anakin.io";
  return base.endsWith("/v1") ? base : `${base.replace(/\/$/, "")}/v1`;
}

function normalizePlatform(value) {
  return normalizeEnum(Platform, value);
}

function normalizeEnum(values, value) {
  return Object.values(values).includes(value) ? value : undefined;
}

function sum(values) {
  return values.reduce((total, value) => total + value, 0);
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
