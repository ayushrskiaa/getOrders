import { AccountStatus, Platform } from "@prisma/client";
import type { ExtractedOrder } from "./types";

const platformOrderUrls: Record<Platform, string> = {
  AMAZON: "https://www.amazon.in/gp/your-account/order-history",
  FLIPKART: "https://www.flipkart.com/account/orders",
  ZEPTO: "https://www.zeptonow.com/account/orders"
};

const platformDomains: Record<Platform, string[]> = {
  AMAZON: ["amazon.in", "amazon.com"],
  FLIPKART: ["flipkart.com"],
  ZEPTO: ["zeptonow.com", "zepto.com"]
};

type ConnectAccountResult = {
  sessionId: string;
  status: AccountStatus;
  displayName: string;
  message?: string;
};

type SyncResult = {
  orders: ExtractedOrder[];
  recordingUrl?: string;
};

type AnakinSession = {
  id?: string;
  session_id?: string;
  name?: string;
  session_name?: string;
  url?: string;
  save_url?: string;
  createdAt?: string;
  created_at?: string;
};

export async function connectAnakinAccount(platform: Platform): Promise<ConnectAccountResult> {
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

export async function syncOrdersFromAnakin(platform: Platform, sessionId: string): Promise<SyncResult> {
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
  const response = await fetch(`${getAnakinRestBaseUrl()}/sessions`, {
    headers: getAnakinHeaders(),
    cache: "no-store"
  });

  if (!response.ok) {
    throw new Error(`Could not list Anakin sessions: ${response.status}`);
  }

  const data = (await response.json()) as { sessions?: AnakinSession[] } | AnakinSession[];
  return Array.isArray(data) ? data : data.sessions ?? [];
}

function findPlatformSession(platform: Platform, sessions: AnakinSession[]) {
  const expectedName = getDefaultSessionName(platform).toLowerCase();
  const domains = platformDomains[platform];

  return sessions.find((session) => {
    const name = `${session.name ?? ""} ${session.session_name ?? ""}`.toLowerCase();
    const url = `${session.url ?? ""} ${session.save_url ?? ""}`.toLowerCase();
    return name.includes(expectedName) || domains.some((domain) => name.includes(domain) || url.includes(domain));
  });
}

function getDefaultSessionName(platform: Platform) {
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

function normalizeOrder(
  platform: Platform,
  raw: { orderId?: string; text: string; amount?: string; invoiceUrl?: string; productUrl?: string; title?: string },
  index: number
): ExtractedOrder {
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

function extractDate(text: string) {
  const match = text.match(/\b(\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{4})\b/i);
  return match ? new Date(match[1]) : undefined;
}

function extractStatus(text: string) {
  return text.match(/Delivered|Cancelled|Canceled|In transit|Returned|Refunded|Arriving|Out for delivery/i)?.[0] ?? "Unknown";
}

function cleanTitle(title: string) {
  return title.replace(/\s+/g, " ").trim().slice(0, 140) || "Unknown item";
}

async function scrapeUrlWithAnakin(url: string, sessionId: string) {
  const response = await fetch(`${getAnakinRestBaseUrl()}/url-scraper`, {
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

  const submitted = (await response.json()) as { jobId?: string };
  if (!submitted.jobId) {
    throw new Error("Anakin scrape job did not return a jobId.");
  }

  for (let attempt = 0; attempt < 40; attempt += 1) {
    const jobResponse = await fetch(`${getAnakinRestBaseUrl()}/url-scraper/${submitted.jobId}`, {
      headers: getAnakinHeaders(),
      cache: "no-store"
    });

    if (!jobResponse.ok) {
      await delay(1500);
      continue;
    }

    const job = (await jobResponse.json()) as {
      status?: string;
      html?: string;
      cleanedHtml?: string;
      markdown?: string;
      generatedJson?: { data?: unknown };
      error?: string;
    };

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

function extractOrdersFromText(
  platform: Platform,
  text: string,
  html: string
): ExtractedOrder[] {
  const blocks = splitIntoOrderBlocks(text, platform);

  return blocks.map((block, index) => {
    const parsed = parseOrderBlock(block, html);
    return normalizeOrder(platform, parsed, index);
  });
}

function splitIntoOrderBlocks(text: string, platform: Platform) {
  const normalized = text.replace(/\r/g, "");
  const markerPatterns: Record<Platform, RegExp> = {
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

function parseOrderBlock(block: string, html: string) {
  const orderId = block.match(/(?:Order(?:\s*ID)?|OD|ZEP)[#:\s-]*([A-Z0-9-]{5,})/i)?.[1] ?? `ORDER-${Date.now()}`;
  const amount = block.match(/(?:₹|Rs\.?)\s*([0-9,]+(?:\.[0-9]{1,2})?)/i)?.[1] ?? "0";
  const dates = block.match(/\b(?:\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{4})\b/gi) ?? [];
  const title = block.split(/\n+/).map((line) => line.trim()).find((line) => line.length > 6 && !/order|invoice|return|delivery|track/i.test(line))
    ?? block.slice(0, 90);

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

function stripHtml(html: string) {
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

function looksLikeLoginPage(text: string, html: string) {
  const haystack = `${text} ${html}`.toLowerCase();
  return (
    haystack.includes("sign in") ||
    haystack.includes("log in") ||
    haystack.includes("enter mobile number") ||
    haystack.includes("verify your account") ||
    haystack.includes("login")
  );
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
