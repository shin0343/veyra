// VIDEO-02 real-stack browser checks for Explore, Overview and Activity.
// Default run: no model requests. Real footage, real index queries, real playback.
// Failure states marked `simulated` intercept one browser response to exercise the UI
// (budget exhausted, service down, empty, slow); they are not claims about the backend.
// PAID=1 additionally runs genuine Muse: one search parse plus one layout proposal.
// SAVE=1 saves one review view through the direct (non-model) dialog.
// Usage: node tests/video02-flows.mjs <base-url> <out-dir>
import { chromium } from "playwright";
import AxeBuilder from "@axe-core/playwright";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const base = process.argv[2] ?? "http://127.0.0.1:3200";
const out = path.resolve(process.argv[3] ?? "../../docs/qa/video02");
await mkdir(path.join(out, "after"), { recursive: true });
const report = {
  base,
  started_at: new Date().toISOString(),
  paid: process.env.PAID === "1",
  checks: [],
  failures: [],
  page_errors: [],
  accessibility: {},
};
const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 1440, height: 960 },
  timezoneId: "America/Los_Angeles",
});
const page = await context.newPage();
page.on("pageerror", (error) =>
  report.page_errors.push({ url: page.url(), message: error.message }),
);
const shot = (name, full = false) =>
  page.screenshot({
    path: path.join(out, "after", `${name}.png`),
    fullPage: full,
  });
async function check(name, run) {
  const started = Date.now();
  try {
    const detail = (await run()) ?? {};
    report.checks.push({ name, ok: true, ms: Date.now() - started, ...detail });
    console.log("ok  ", name, JSON.stringify(detail).slice(0, 160));
  } catch (error) {
    report.failures.push({
      name,
      error: String(error.message ?? error).slice(0, 400),
    });
    console.log("FAIL", name, String(error.message ?? error).slice(0, 300));
    await shot(`failure-${name}`).catch(() => {});
  }
}
async function audit(name) {
  const result = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  report.accessibility[name] = result.violations.map((v) => ({
    id: v.id,
    impact: v.impact,
    nodes: v.nodes.slice(0, 4).map((n) => n.target.join(" ")),
  }));
  return result.violations.length;
}
const playing = (scope = "") =>
  page.waitForFunction(
    (scope) => {
      const video = document.querySelector(`${scope} video`);
      return (
        video &&
        video.readyState >= 2 &&
        video.currentTime > 0.3 &&
        video.videoWidth > 0
      );
    },
    scope,
    { timeout: 45000 },
  );
const framesLoaded = () =>
  page.evaluate(
    () =>
      [...document.querySelectorAll(".evidence-frame img")].filter(
        (img) => img.complete && img.naturalWidth > 0,
      ).length,
  );
const exploreReady = async () => {
  await page.waitForSelector("button.ws-result", {
    timeout: 30000,
  });
  await page.waitForSelector(".tl-bars", { timeout: 30000 });
};

await check("explore_loads_real_index", async () => {
  await page.goto(base + "/explore", { waitUntil: "domcontentloaded" });
  await exploreReady();
  await page.waitForFunction(
    () => document.querySelectorAll(".evidence-frame.is-ready").length >= 4,
    null,
    { timeout: 30000 },
  );
  const coverage = await page.locator(".ws-facts").innerText();
  const lanes = await page.locator(".tl-lane").count();
  const cards = await page.locator("button.ws-result").count();
  await playing(".ws-stage");
  await page.waitForTimeout(1500);
  await shot("explore-1440");
  if (lanes < 6 || cards < 4) throw new Error(`lanes ${lanes}, cards ${cards}`);
  return { coverage, lanes, cards, frames: await framesLoaded() };
});

await check("topic_animals_plays_real_squirrels", async () => {
  await page.getByRole("radio", { name: /^Animals/ }).click();
  await page.waitForFunction(
    () =>
      document.querySelectorAll("button.ws-result").length === 1 &&
      document
        .querySelector("#results-title")
        ?.textContent?.startsWith("1 moment"),
    null,
    { timeout: 20000 },
  );
  const camera = await page
    .locator(".ws-result-meta strong")
    .first()
    .innerText();
  if (camera !== "Garden wildlife") throw new Error(camera);
  await playing(".ws-stage");
  await page.waitForTimeout(1200);
  await shot("explore-animals");
  return {
    camera,
    url: page.url().replace(base, ""),
    summary: await page.locator(".ws-detail-title").innerText(),
  };
});

await check("camera_filter_and_lane_tick_selection", async () => {
  await page.getByRole("radio", { name: /^All/ }).click();
  await page.waitForURL((url) => !url.search.includes("topic="));
  await exploreReady();
  const bike = page.locator(".ws-select select");
  const value = await bike
    .locator("option", { hasText: "Bicycle parking" })
    .getAttribute("value");
  await bike.selectOption(value);
  await page.waitForFunction(
    () =>
      [...document.querySelectorAll(".ws-result-meta strong")].length > 0 &&
      [...document.querySelectorAll(".ws-result-meta strong")].every(
        (el) => el.textContent === "Bicycle parking",
      ),
    null,
    { timeout: 20000 },
  );
  // Three moments within seconds share one clustered tick; each press advances.
  const tick = page.locator(".tl-moment").first();
  const seen = new Set();
  for (let i = 0; i < 3; i++) {
    await tick.click();
    seen.add(
      await page
        .locator(".ws-result.is-selected .ws-result-summary")
        .innerText(),
    );
  }
  const pressed = await tick.getAttribute("aria-pressed");
  const count = await page.locator(".tl-count").first().innerText();
  const selected = [...seen];
  if (pressed !== "true" || seen.size < 2)
    throw new Error("cluster did not step");
  await bike.selectOption("all");
  return {
    results: await page.locator("button.ws-result").count(),
    cluster: count,
    selected,
  };
});

await check("drag_time_range_and_reset", async () => {
  await exploreReady();
  const box = await page.locator(".tl-tracks").boundingBox();
  const y = box.y + 20;
  await page.mouse.move(box.x + box.width * 0.9, y);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.97, y, { steps: 6 });
  await page.mouse.move(box.x + box.width * 0.995, y, { steps: 4 });
  await page.mouse.up();
  await page
    .getByRole("button", { name: "Full range" })
    .waitFor({ timeout: 5000 });
  await exploreReady();
  const focused = await page.locator(".tl-window").innerText();
  await page.waitForTimeout(1200);
  await shot("explore-focused-range");
  await page.getByRole("button", { name: "Full range" }).click();
  await page
    .getByRole("button", { name: "Full range" })
    .waitFor({ state: "detached" });
  return { focused };
});

await check("keyboard_slash_and_arrow_results", async () => {
  await exploreReady();
  await page.locator("body").click({ position: { x: 5, y: 300 } });
  await page.keyboard.press("/");
  const focused = await page.evaluate(() => document.activeElement?.id);
  if (focused !== "explore-ask") throw new Error(`focus ${focused}`);
  await page.locator("button.ws-result").first().focus();
  await page.keyboard.press("ArrowDown");
  const current = await page.evaluate(() =>
    document.activeElement?.getAttribute("aria-current"),
  );
  if (current !== "true") throw new Error("arrow did not select next result");
  return { focused };
});

await check("open_in_recording_seeks_evidence", async () => {
  await exploreReady();
  const link = page.getByRole("link", { name: /Open in recording/ });
  const href = await link.getAttribute("href");
  await link.click();
  await page.waitForURL(/\/recordings\/.+offset_ms=\d+.*segment_id=/);
  await playing();
  await page.waitForTimeout(1500);
  await shot("evidence-recording");
  return { href };
});

await check("review_dialog_plan", async () => {
  await page.goto(base + "/explore?topic=people", {
    waitUntil: "domcontentloaded",
  });
  await exploreReady();
  await page.getByRole("button", { name: "Watch together" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.waitFor();
  const plan = await dialog.locator(".review-plan p").innerText();
  await shot("review-dialog");
  let saved = null;
  if (process.env.SAVE === "1") {
    await dialog.getByLabel("View name").fill("Review · People (VIDEO-02 QA)");
    await dialog.getByRole("button", { name: "Save view" }).click();
    await dialog.locator(".review-receipt").waitFor({ timeout: 15000 });
    saved = await dialog.locator(".review-receipt strong").innerText();
    await shot("review-saved");
    await dialog.getByRole("link", { name: /Open view/ }).click();
    await page.waitForURL(/\/layouts\//);
    await page.waitForFunction(
      () =>
        [...document.querySelectorAll("video")].filter((v) => v.readyState >= 2)
          .length >= 2,
      null,
      { timeout: 45000 },
    );
    await page.waitForTimeout(2000);
    await shot("review-view-playing");
  } else await page.keyboard.press("Escape");
  return { plan, saved };
});

// Simulated responses: exercise honest UI states without spending or breaking anything.
async function simulated(name, route, response, expectText, fresh = false) {
  await check(`simulated_${name}`, async () => {
    // A fresh context has an empty HTTP cache, so cached frames can't bypass the route.
    const ctx = fresh
      ? await browser.newContext({
          viewport: { width: 1440, height: 960 },
          timezoneId: "America/Los_Angeles",
        })
      : context;
    const p = fresh ? await ctx.newPage() : page;
    await p.route(route, response);
    try {
      await p.goto(base + "/explore", { waitUntil: "domcontentloaded" });
      if (name === "budget_exhausted") {
        await p.waitForSelector("button.ws-result", {
          timeout: 30000,
        });
        await p
          .locator("#explore-ask")
          .fill("find the squirrels at the feeder");
        await p.locator(".ws-ask button[type=submit]").click();
      }
      await p.getByText(expectText).first().waitFor({ timeout: 20000 });
      await p.waitForTimeout(600);
      await p.screenshot({
        path: path.join(out, "after", `state-${name}.png`),
      });
      return { simulated: true, shown: expectText };
    } finally {
      await p.unroute(route);
      if (fresh) await ctx.close();
    }
  });
}
await simulated(
  "budget_exhausted",
  "**/api/v1/search",
  (route) =>
    route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({
        request_id: "00000000-0000-4000-8000-0000000000aa",
        error: {
          code: "MODEL_BUDGET_EXHAUSTED",
          message: "The configured daily model budget has been reached.",
          retryable: false,
          fields: [],
        },
      }),
    }),
  "Muse has reached today’s request limit",
);
await check("budget_fallback_offers_index_filter", async () => {
  const offer = page.getByRole("button", {
    name: /Show the “Animals” filter instead/,
  });
  if (!(await offer.count())) throw new Error("no fallback offered");
  return {};
});
await simulated(
  "no_match",
  "**/api/v1/index-query",
  async (route) => {
    const real = await route.fetch();
    const body = await real.json();
    route.fulfill({ response: real, json: { ...body, items: [] } });
  },
  "No matching moments",
);
await simulated(
  "index_unavailable",
  "**/api/v1/index-query",
  (route) =>
    route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({
        request_id: "00000000-0000-4000-8000-0000000000bb",
        error: {
          code: "DEPENDENCY_UNAVAILABLE",
          message: "Your workspace service couldn’t be reached.",
          retryable: true,
          fields: [],
        },
      }),
    }),
  "Stored analysis couldn’t be read",
);
await simulated(
  "searching",
  "**/api/v1/index-query",
  async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 8000));
    route.continue().catch(() => {});
  },
  "Reading stored analysis…",
);
await simulated(
  "frame_unavailable",
  "**/frame?*",
  (route) =>
    route.fulfill({ status: 409, contentType: "application/json", body: "{}" }),
  "Preview frame unavailable",
  true,
);

await check("overview_video_first", async () => {
  await page.goto(base + "/", { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".hm-entry .evidence-frame.is-ready", {
    timeout: 30000,
  });
  await playing(".hm-stage");
  await page.waitForTimeout(1200);
  await shot("overview-1440");
  return {
    status: await page.locator(".hm-status").innerText(),
    found: await page.locator(".hm-entry").count(),
    look_for: await page.locator(".hm-lookfor a").allInnerTexts(),
  };
});

await check("activity_anchored_with_frames", async () => {
  await page.goto(base + "/events", { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".log-row .evidence-frame.is-ready", {
    timeout: 30000,
  });
  await page.waitForTimeout(1000);
  await shot("activity-1440");
  return {
    cards: await page.locator(".log-row").count(),
    first: await page.locator(".log-row time").first().innerText(),
  };
});

for (const [name, url] of [
  ["explore", "/explore"],
  ["overview", "/"],
  ["activity", "/events"],
]) {
  await check(`axe_${name}`, async () => {
    await page.goto(base + url, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(6000);
    const violations = await audit(name);
    if (violations) throw new Error(`${violations} axe violations`);
    return { violations };
  });
}

// Responsive: every primary route, five widths, no horizontal page scroll.
const routes = [
  "/",
  "/explore",
  "/cameras",
  "/live",
  "/recordings",
  "/events",
  "/layouts",
  "/settings",
];
for (const width of [1440, 1280, 1024, 768, 390]) {
  await check(`responsive_${width}`, async () => {
    const ctx = await browser.newContext({
      viewport: { width, height: width < 600 ? 844 : 900 },
      timezoneId: "America/Los_Angeles",
    });
    const p = await ctx.newPage();
    const overflow = {};
    for (const route of routes) {
      await p.goto(base + route, { waitUntil: "domcontentloaded" });
      await p.waitForTimeout(3500);
      overflow[route] = await p.evaluate(
        () => document.documentElement.scrollWidth - window.innerWidth,
      );
      if (route === "/explore" || route === "/")
        await p.screenshot({
          path: path.join(
            out,
            "after",
            `${route === "/" ? "overview" : "explore"}-${width}.png`,
          ),
        });
    }
    await ctx.close();
    const bad = Object.entries(overflow).filter(([, px]) => px > 0);
    if (bad.length) throw new Error(`overflow ${JSON.stringify(bad)}`);
    return { overflow };
  });
}

if (process.env.PAID === "1") {
  await check("genuine_muse_search", async () => {
    await page.goto(base + "/explore", { waitUntil: "domcontentloaded" });
    await exploreReady();
    const query = process.env.QUERY ?? "squirrels at the feeder";
    await page.locator("#explore-ask").fill(query);
    const started = Date.now();
    await page.locator(".ws-ask button[type=submit]").click();
    await page
      .locator(".ws-understood, .ws-state")
      .first()
      .waitFor({ timeout: 70000 });
    const ms = Date.now() - started;
    await page.waitForTimeout(2500);
    await shot("muse-search");
    return {
      query,
      ms,
      title: await page.locator("#results-title").innerText(),
      understood: await page.locator(".ws-understood li").allInnerTexts(),
      cameras: await page.locator(".ws-result-meta strong").allInnerTexts(),
      state: await page.locator(".ws-state h3").allInnerTexts(),
    };
  });
  await check("genuine_muse_review_view", async () => {
    await page.getByRole("button", { name: "Watch together" }).click();
    const dialog = page.getByRole("dialog");
    await dialog
      .getByLabel("View name")
      .fill(process.env.VIEW ?? "Garden review");
    // REDESIGN-01: this writes the request into Muse; sending it is a separate, labelled step.
    await dialog
      .getByRole("button", { name: /Write it for Muse instead/ })
      .click();
    await page.getByRole("button", { name: /Send message/ }).click();
    await page.waitForFunction(
      () =>
        document.querySelectorAll(".muse-turn .assistant-answer").length >= 1,
      null,
      { timeout: 90000 },
    );
    await page.waitForTimeout(800);
    await shot("muse-proposal");
    const approve = page.getByRole("button", { name: "Approve and save" });
    if (!(await approve.count()))
      return {
        proposal: false,
        text: (await page.locator(".muse-scroll").innerText()).slice(0, 400),
      };
    await approve.click();
    await page.waitForSelector(".receipt", { timeout: 40000 });
    await page.waitForTimeout(800);
    await shot("muse-verified");
    const verified = await page.getByText("Saved and verified").count();
    await page.getByRole("link", { name: /Open saved layout/ }).click();
    await page.waitForURL(/\/layouts\//);
    await playing();
    await page.waitForTimeout(2000);
    await shot("muse-view-playing");
    return { proposal: true, verified, url: page.url().replace(base, "") };
  });
}

report.finished_at = new Date().toISOString();
await writeFile(
  path.join(out, "flows.json"),
  JSON.stringify(report, null, 2) + "\n",
);
await browser.close();
console.log(
  `\n${report.checks.length} passed, ${report.failures.length} failed, ${report.page_errors.length} page errors`,
);
process.exit(report.failures.length ? 1 : 0);
