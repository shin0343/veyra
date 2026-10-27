// REDESIGN-02 capture: every route at 1440×900, 1024×768 and 390×844 against the running real
// stack, plus the Muse panel and ⌘K palette. Paid or mutating endpoints are aborted and counted.
// Usage: node tests/redesign02-capture.mjs <out-dir> [base-url]
import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const out = path.resolve(
  process.argv[2] ?? "../../docs/design/redesign-02/screenshots/before",
);
const base = process.argv[3] ?? "http://127.0.0.1:3600";
const viewports = (process.env.WIDTHS ?? "1440,1024,390")
  .split(",")
  .map((w) => ({
    width: Number(w),
    height: { 1440: 900, 1024: 768, 390: 844 }[w] ?? 900,
  }));
const PAID =
  /\/api\/v1\/(agent\/messages|agent\/confirmations|search$|analysis-jobs$|index-jobs|recordings\/[^/]+\/index$)/;
const MUTATION = /\/api\/v1\/(cameras|layouts)(\/[^/]+)?$/;

async function detailRoutes() {
  const get = (p) =>
    fetch(base + "/api/v1" + p, { headers: { origin: base } }).then((r) =>
      r.json(),
    );
  const layouts = await get("/layouts");
  const recordings = await get("/recordings?limit=100");
  const cameras = await get("/cameras");
  const real = new Set(
    cameras.items
      .filter((c) => c.source_media?.kind === "prerecorded")
      .map((c) => c.id),
  );
  const layout = layouts.items.find((l) =>
    l.cells.every((c) => real.has(c.camera_id)),
  );
  const recording = recordings.items.find(
    (r) => r.source_media?.kind === "prerecorded",
  );
  return [
    layout && { name: "layout-detail", route: `/layouts/${layout.id}` },
    recording && {
      name: "recording-detail",
      route: `/recordings/${recording.id}`,
    },
  ].filter(Boolean);
}

const routes = [
  { name: "home", route: "/" },
  { name: "explore", route: "/explore" },
  { name: "cameras", route: "/cameras" },
  { name: "live", route: "/live" },
  { name: "recordings", route: "/recordings" },
  { name: "events", route: "/events" },
  { name: "layouts", route: "/layouts" },
  { name: "settings", route: "/settings" },
  ...(await detailRoutes()),
  { name: "muse-panel", route: "/cameras", action: "muse" },
  { name: "palette", route: "/cameras", action: "palette" },
].filter(
  (r) => !process.env.ONLY || process.env.ONLY.split(",").includes(r.name),
);

await mkdir(out, { recursive: true });
const browser = await chromium.launch();
const report = {
  base,
  captured_at: new Date().toISOString(),
  blocked: [],
  pages: [],
};
for (const viewport of viewports) {
  const context = await browser.newContext({
    viewport,
    timezoneId: "America/Los_Angeles",
  });
  await context.route(PAID, (route) => {
    if (route.request().method() === "GET") return route.continue();
    report.blocked.push(
      `${route.request().method()} ${new URL(route.request().url()).pathname}`,
    );
    return route.abort();
  });
  await context.route(MUTATION, (route) => {
    if (route.request().method() === "GET") return route.continue();
    report.blocked.push(
      `${route.request().method()} ${new URL(route.request().url()).pathname}`,
    );
    return route.abort();
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  for (const { name, route, action } of routes) {
    const response = await page.goto(base + route, {
      waitUntil: "domcontentloaded",
    });
    await page.waitForTimeout(Number(process.env.SETTLE ?? 6000));
    if (action === "muse") {
      await page
        .getByRole("button", { name: "Ask Muse", exact: true })
        .first()
        .click();
      await page.waitForTimeout(800);
    }
    if (action === "palette") {
      await page.keyboard.press("Meta+k");
      await page.locator("[aria-label='Search commands']").fill("garden");
      await page.waitForTimeout(600);
    }
    const metrics = await page.evaluate(() => ({
      overflow: document.documentElement.scrollWidth - window.innerWidth,
      height: document.documentElement.scrollHeight,
      videos: document.querySelectorAll("main video").length,
      first_media_top: (() => {
        const n = document.querySelector("main video, main img");
        return n
          ? Math.round(n.getBoundingClientRect().top + window.scrollY)
          : null;
      })(),
    }));
    const file = `${name}-${viewport.width}`;
    await page.screenshot({ path: path.join(out, file + ".png") });
    if (!action && process.env.FULL !== "0")
      await page.screenshot({
        path: path.join(out, file + "-full.png"),
        fullPage: true,
      });
    report.pages.push({
      name,
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
for (const p of report.pages)
  console.log(
    p.name.padEnd(17),
    p.viewport.width,
    "overflow",
    p.overflow,
    "h",
    p.height,
    "videos",
    p.videos,
    "media",
    p.first_media_top,
    p.page_errors.length ? p.page_errors : "",
  );
console.log("blocked", report.blocked);
