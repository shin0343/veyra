// VIDEO-02 visual capture against the running real stack. No paid model requests:
// It only opens pages; pages read the stored index (POST /index-query), never Muse.
// Usage: node tests/video02-capture.mjs <out-dir> [base-url]
import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const out = path.resolve(process.argv[2] ?? "../../docs/qa/video02/before");
const base = process.argv[3] ?? "http://127.0.0.1:3200";
const widths = (process.env.WIDTHS ?? "1440").split(",").map(Number);
const routes = (
  process.env.ROUTES ??
  "/,/explore,/cameras,/live,/recordings,/events,/layouts,/settings"
).split(",");
await mkdir(out, { recursive: true });
const browser = await chromium.launch();
const report = { base, captured_at: new Date().toISOString(), pages: [] };
for (const width of widths) {
  const context = await browser.newContext({
    viewport: { width, height: width < 600 ? 844 : 960 },
    timezoneId: "America/Los_Angeles",
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  for (const route of routes) {
    const response = await page.goto(base + route, {
      waitUntil: "domcontentloaded",
    });
    await page.waitForTimeout(Number(process.env.SETTLE ?? 4500));
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    const name = `${route === "/" ? "home" : route.slice(1).replace(/[/?=&]/g, "_")}-${width}`;
    await page.screenshot({
      path: path.join(out, name + ".png"),
      fullPage: process.env.FULL !== "0",
    });
    report.pages.push({
      route,
      width,
      status: response?.status(),
      horizontal_overflow_px: overflow,
      page_errors: [...errors],
    });
    errors.length = 0;
  }
  await context.close();
}
await browser.close();
await writeFile(path.join(out, "report.json"), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report.pages));
