// REDESIGN-01 capture: Home and Explore at 1440×900, 1024×768 and 390×844 against the
// running real stack. Paid or mutating endpoints are aborted at the network layer and
// counted, so a capture can never spend a Muse request or start indexing.
// Usage: node tests/redesign01-capture.mjs <out-dir> [base-url]
import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const out = path.resolve(process.argv[2] ?? "../../docs/design/redesign-01/screenshots/before");
const base = process.argv[3] ?? "http://127.0.0.1:3200";
const viewports = [
  { width: 1440, height: 900 },
  { width: 1024, height: 768 },
  { width: 390, height: 844 },
];
const routes = (process.env.ROUTES ?? "/,/explore,/explore?topic=animals").split(",");
const PAID = /\/api\/v1\/(agent\/messages|search|confirmations|index-jobs|recordings\/[^/]+\/index)/;

await mkdir(out, { recursive: true });
const browser = await chromium.launch();
const report = { base, captured_at: new Date().toISOString(), blocked: [], pages: [] };
for (const viewport of viewports) {
  const context = await browser.newContext({
    viewport,
    timezoneId: "America/Los_Angeles",
  });
  await context.route(PAID, (route) => {
    if (route.request().method() === "GET") return route.continue();
    report.blocked.push(`${route.request().method()} ${route.request().url()}`);
    return route.abort();
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  for (const route of routes) {
    const response = await page.goto(base + route, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(Number(process.env.SETTLE ?? 5000));
    const metrics = await page.evaluate(() => {
      const top = (selector) => {
        const node = document.querySelector(selector);
        return node ? Math.round(node.getBoundingClientRect().top + window.scrollY) : null;
      };
      return {
        overflow: document.documentElement.scrollWidth - window.innerWidth,
        height: document.documentElement.scrollHeight,
        first_video_top: top("main video"),
        first_result_top: top("[data-result], .result-card:not(.is-skeleton)"),
      };
    });
    const name = `${route === "/" ? "home" : route.slice(1).replace(/[/?=&]/g, "_")}-${viewport.width}`;
    await page.screenshot({ path: path.join(out, name + ".png") });
    if (process.env.FULL !== "0")
      await page.screenshot({ path: path.join(out, name + "-full.png"), fullPage: true });
    report.pages.push({
      route,
      viewport,
      status: response?.status(),
      ...metrics,
      page_errors: [...errors],
    });
    errors.length = 0;
  }
  await context.close();
}
await browser.close();
await writeFile(path.join(out, "report.json"), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 1));
