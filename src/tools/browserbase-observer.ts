import { z } from "zod";
import { publicResearchUrl } from "./live-research";
import { readResponseText } from "./response-body";

export type BrowserObservation =
  | { status: "ok"; requests: 1; title: string; excerpt: string }
  | { status: "blocked" | "error"; requests: number; warning: string };

const SessionSchema = z.object({
  id: z.string().min(1),
  connectUrl: z.string().url(),
});

let activeSessions = 0;
const MAX_BROWSER_SESSIONS = 1;

/** Browserbase cloud session with Playwright CDP; observation ONLY.
 * No account logins, form submissions, clicks or external writes.
 * The browser session is owned and released in this invocation.
 */
export class BrowserbaseObserver {
  constructor(
    private readonly key: string,
    private readonly projectId: string,
    private readonly transport: typeof fetch = fetch,
  ) {}

  async observe(rawUrl: string): Promise<BrowserObservation> {
    const url = publicResearchUrl(rawUrl);
    if (!url || /(^|\.)google\.com$/i.test(new URL(url).hostname) &&
      new URL(url).pathname.startsWith("/goto")) {
      return { status: "blocked", requests: 0, warning: "Unsafe or indirect browser target." };
    }
    if (!this.key) {
      return { status: "blocked", requests: 0, warning: "Browserbase API key is not configured." };
    }
    if (activeSessions >= MAX_BROWSER_SESSIONS) {
      return { status: "blocked", requests: 0, warning: "Browser session concurrency limit reached." };
    }

    activeSessions++;
    let sessionId: string | undefined;
    let browser: Awaited<ReturnType<(typeof import("@playwright/test"))["chromium"]["connectOverCDP"]>> | undefined;
    try {
      const response = await this.transport("https://api.browserbase.com/v1/sessions", {
        method: "POST", redirect: "error", signal: AbortSignal.timeout(12000),
        headers: { "X-BB-API-Key": this.key, "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(this.projectId ? { projectId: this.projectId } : {}),
          timeout: 90, keepAlive: false,
          browserSettings: { solveCaptchas: false, recordSession: false },
        }),
      });
      if (!response.ok) {
        return { status: "error", requests: 1, warning: "Browserbase session creation was rejected." };
      }
      const session = SessionSchema.parse(JSON.parse(await readResponseText(response, 30000)));
      sessionId = session.id;
      const connect = new URL(session.connectUrl);
      if (connect.protocol !== "wss:" || !(
        connect.hostname === "browserbase.com" ||
        connect.hostname.endsWith(".browserbase.com")
      )) {
        throw new Error("Unexpected Browserbase connection origin.");
      }
      // Playwright is already a locked repository dependency. This stays server-only.
      const { chromium } = await import("@playwright/test");
      browser = await chromium.connectOverCDP(session.connectUrl, { timeout: 12000 });
      const context = browser.contexts()[0] ?? await browser.newContext();
      const page = context.pages()[0] ?? await context.newPage();
      await page.route("**/*", async (route) => {
        const requestUrl = route.request().url();
        if ((requestUrl.startsWith("http:") || requestUrl.startsWith("https:")) &&
          !publicResearchUrl(requestUrl)) {
          await route.abort();
        } else {
          await route.continue();
        }
      });
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 15000 });
      if (!publicResearchUrl(page.url())) {
        throw new Error("Browser navigated to an unsafe destination.");
      }
      const title = (await page.title()).slice(0, 200);
      const excerpt = (await page.locator("body").innerText({ timeout: 7000 }))
        .slice(0, 6000);
      if (!excerpt.trim()) {
        return { status: "error", requests: 1, warning: "Browser returned no readable page content." };
      }
      return { status: "ok", requests: 1, title, excerpt };
    } catch {
      return { status: "error", requests: sessionId ? 1 : 0,
        warning: "Browser observation failed; no page content was verified." };
    } finally {
      try { await browser?.close(); } catch { /* session still released below */ }
      if (sessionId) {
        try {
          await this.transport(`https://api.browserbase.com/v1/sessions/${encodeURIComponent(sessionId)}`, {
            method: "POST", redirect: "error", signal: AbortSignal.timeout(5000),
            headers: { "X-BB-API-Key": this.key, "Content-Type": "application/json" },
            body: JSON.stringify({ status: "REQUEST_RELEASE" }),
          });
        } catch { /* session has a separate short expiry */ }
      }
      activeSessions--;
    }
  }
}

export function runtimeBrowserbaseObserver() {
  return new BrowserbaseObserver(
    process.env.BROWSERBASE_API_KEY ?? "",
    process.env.BROWSERBASE_PROJECT_ID ?? "",
  );
}
