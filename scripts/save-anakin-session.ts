import { chromium, type Browser, type Page } from "playwright-core";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

const DEFAULT_SESSION_NAME = "orderhub-amazon";
const DEFAULT_SAVE_URL = "https://www.amazon.in";
const DEFAULT_LOGIN_URL = "https://www.amazon.in/ap/signin";

async function main() {
  const apiKey = process.env.ANAKIN_API_KEY;
  let email = process.env.AMAZON_EMAIL;
  let password = process.env.AMAZON_PASSWORD;
  const sessionName = process.env.AMAZON_SESSION_NAME ?? DEFAULT_SESSION_NAME;
  const saveUrl = process.env.AMAZON_SAVE_URL ?? DEFAULT_SAVE_URL;
  const loginUrl = process.env.AMAZON_LOGIN_URL ?? new URL("/ap/signin", saveUrl).toString();

  if (!apiKey) {
    throw new Error("ANAKIN_API_KEY is required.");
  }

  // Prompt for missing Amazon credentials
  const rl = createInterface({ input, output });
  try {
    if (!email) {
      email = (await rl.question("Amazon email: ")).trim();
    }
    if (!password) {
      // Visible prompt (do not echo hiding here to keep the script simple).
      password = (await rl.question("Amazon password: ")).trim();
    }
  } finally {
    rl.close();
  }

  if (!email || !password) {
    throw new Error("AMAZON_EMAIL and AMAZON_PASSWORD are required to run the saver.");
  }

  const browser = await chromium.connectOverCDP(buildBrowserEndpoint(sessionName, saveUrl), {
    headers: { "X-API-Key": apiKey }
  });

  try {
    const page = await getActivePage(browser);

    console.log(`Opening ${loginUrl}`);
    await page.goto(loginUrl, { waitUntil: "domcontentloaded", timeout: 60000 });

    let autofillWorked = true;
    try {
      await fillVisible(page, ["#ap_email", "input[name='email']", "input[type='email']", "input#ap_email"], email);
      await clickIfVisible(page, ["#continue", "input[name='continue']", "#continue"]);

      await page.waitForTimeout(1000);
      await fillVisible(page, ["#ap_password", "input[name='password']", "input[type='password']", "#ap_password"], password);
      await clickIfVisible(page, ["#signInSubmit", "input[type='submit']", "#signInSubmit"]);

      await waitForSignedInState(page);
    } catch (err) {
      autofillWorked = false;
      console.warn("Could not autofill login form — falling back to manual login.");
    }

    if (!autofillWorked) {
      console.log("Please complete the Amazon login in the opened Anakin browser window. When signed in, return here and press Enter to continue (session will be saved on disconnect).");
      await waitForEnter();
    }

    if (await looksLikeVerificationStep(page)) {
      console.log("Complete Amazon verification in the browser, then press Enter here.");
      await waitForEnter();
    }

    await waitForSignedInState(page, 120_000);
    console.log(`Saving session as ${sessionName}...`);
  } finally {
    await browser.close();
  }

  console.log(`Saved Amazon session: ${sessionName}`);
}

function buildBrowserEndpoint(sessionName: string, saveUrl: string) {
  const endpoint = new URL("wss://api.anakin.io/v1/browser-connect");
  endpoint.searchParams.set("save_session", sessionName);
  endpoint.searchParams.set("save_url", saveUrl);
  return endpoint.toString();
}

async function getActivePage(browser: Browser): Promise<Page> {
  const context = browser.contexts()[0] ?? (await browser.newContext());
  return context.pages()[0] ?? (await context.newPage());
}

async function fillVisible(page: Page, selectors: string[], value: string) {
  for (const selector of selectors) {
    const locator = page.locator(selector).first();
    if (await locator.count()) {
      await locator.fill(value, { timeout: 10000 });
      return;
    }
  }

  throw new Error(`Could not find a field for: ${selectors.join(", ")}`);
}

async function clickIfVisible(page: Page, selectors: string[]) {
  for (const selector of selectors) {
    const locator = page.locator(selector).first();
    if (await locator.count()) {
      await locator.click({ timeout: 10000 });
      return;
    }
  }
}

async function waitForSignedInState(page: Page, timeout = 30000) {
  await Promise.race([
    page.locator("#nav-link-accountList").waitFor({ state: "visible", timeout }).catch(() => undefined),
    page.waitForURL((url) => !url.pathname.includes("/ap/signin"), { timeout }).catch(() => undefined)
  ]);
}

async function looksLikeVerificationStep(page: Page) {
  const url = page.url();
  if (url.includes("/ap/cvf") || url.includes("/challenge") || url.includes("/auth")) {
    return true;
  }

  const codeFields = await page.locator("input[name='code'], input[name='otp'], #cvf-input-code").count();
  return codeFields > 0;
}

async function waitForEnter() {
  const rl = createInterface({ input, output });
  try {
    await rl.question("");
  } finally {
    rl.close();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});