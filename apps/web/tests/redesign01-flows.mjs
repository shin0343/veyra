// REDESIGN-01 interaction checks for Home, Explore and Muse against the real stack.
// No model request can leave the browser: POST /agent/messages, /search, confirmations and
// indexing are aborted and counted. One check fulfils POST /search locally with a labelled
// fixture (real index hits + a hand-written constraints object) to prove that refinements,
// reloads and Back reuse Muse's reading without another /search.
// Usage: node tests/redesign01-flows.mjs <base-url> [out-dir]
import { chromium } from "playwright";
import AxeBuilder from "@axe-core/playwright";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const base = process.argv[2] ?? "http://127.0.0.1:3200";
const out = path.resolve(
  process.argv[3] ?? "../../docs/design/redesign-01/checks",
);
await mkdir(out, { recursive: true });
const PAID =
  /\/api\/v1\/(agent\/messages|agent\/confirmations|search$|index-jobs|recordings\/[^/]+\/index)/;
const results = [];
const counts = { aborted: [], fixtureSearch: 0, indexQuery: 0 };
function check(name, pass, detail = "") {
  results.push({ name, pass: !!pass, detail });
  console.log(
    `${pass ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`,
  );
}

const browser = await chromium.launch();
async function open(viewport = { width: 1440, height: 900 }, fixture = null) {
  const context = await browser.newContext({
    viewport,
    timezoneId: "America/Los_Angeles",
  });
  await context.route(PAID, async (route) => {
    const req = route.request();
    if (req.method() === "GET") return route.continue();
    if (fixture && /\/search$/.test(req.url())) {
      counts.fixtureSearch += 1;
      return route.fulfill({ json: await fixture(req) });
    }
    counts.aborted.push(`${req.method()} ${new URL(req.url()).pathname}`);
    return route.abort();
  });
  const page = await context.newPage();
  page.on("request", (req) => {
    if (req.url().endsWith("/index-query")) counts.indexQuery += 1;
  });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  return { context, page, errors };
}
const settle = (page, ms = 4000) => page.waitForTimeout(ms);
const top = (page, selector) =>
  page.evaluate((s) => {
    const n = document.querySelector(s);
    return n
      ? Math.round(n.getBoundingClientRect().top + window.scrollY)
      : null;
  }, selector);

// ---------- Home ----------
{
  const { context, page, errors } = await open();
  await page.goto(base + "/", { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".hm-entry .evidence-frame.is-ready", {
    timeout: 30000,
  });
  await page.waitForSelector(".hm-stage video", { timeout: 30000 });
  await settle(page, 5000);
  const videoTop = await top(page, ".hm-stage video");
  check(
    "Home: live stage above the fold at 1440×900",
    videoTop !== null && videoTop < 400,
    `video top ${videoTop}px`,
  );
  const advancing = await page.evaluate(async () => {
    const v = document.querySelector(".hm-stage video");
    const a = v.currentTime;
    await new Promise((r) => setTimeout(r, 2000));
    return v.currentTime > a;
  });
  check("Home: stage video is playing", advancing);
  const before = await page.locator(".hm-stage-name strong").textContent();
  const tiles = page.locator(".hm-space:not(.is-on-stage)");
  const target = (await tiles.first().locator("strong").textContent())?.trim();
  await tiles.first().click();
  await settle(page, 1500);
  const after = await page.locator(".hm-stage-name strong").textContent();
  check(
    "Home: choosing a space puts it on the stage",
    after?.trim() === target && after !== before,
    `${before} → ${after}`,
  );
  check(
    "Home: credits shown for prerecorded footage",
    (await page.locator(".hm-stage .source-media-credit").count()) > 0,
  );
  const entries = await page.locator(".hm-entry").count();
  check(
    "Home: journal lists real moments with frames",
    entries >= 3,
    `${entries} entries`,
  );
  const field = page.locator("#home-query");
  await field.fill("recordings");
  const go = await page.getByRole("button", { name: /^Go to / }).count();
  check("Home: a page name offers free navigation", go === 1);
  await field.press("Enter");
  await page.waitForURL(/\/recordings/, { timeout: 15000 });
  check(
    "Home: Enter on a page name navigates without Muse",
    page.url().includes("/recordings"),
  );
  await page.goto(base + "/", { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".hm-entry", { timeout: 30000 });
  const camera = (
    await page.locator(".hm-entry strong").first().textContent()
  )?.trim();
  await page.locator(".hm-entry").first().click();
  await page.waitForURL(/\/explore\?moment=/, { timeout: 15000 });
  await page.waitForSelector(".ws-result[aria-current='true']", {
    timeout: 30000,
  });
  const selected = (
    await page.locator(".ws-result[aria-current='true'] strong").textContent()
  )?.trim();
  check(
    "Home → Explore: the chosen moment is selected",
    selected === camera,
    `${camera} / ${selected}`,
  );
  const axe = await new AxeBuilder({
    page: await (async () => {
      await page.goto(base + "/", { waitUntil: "domcontentloaded" });
      await settle(page, 5000);
      return page;
    })(),
  })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
    .analyze();
  check(
    "Home: axe WCAG 2.2 AA",
    axe.violations.length === 0,
    axe.violations.map((v) => `${v.id}×${v.nodes.length}`).join(", "),
  );
  await page.screenshot({ path: path.join(out, "home-1440.png") });
  check("Home: no page errors", errors.length === 0, errors.join(" | "));
  await context.close();
}

// ---------- Explore ----------
{
  const { context, page, errors } = await open();
  await page.goto(base + "/explore", { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".ws-result[aria-current='true']", {
    timeout: 30000,
  });
  await page.waitForSelector(".ws-stage video", { timeout: 30000 });
  await settle(page, 3000);
  const videoTop = await top(page, ".ws-stage video");
  const box = await page.locator(".ws-stage").boundingBox();
  const firstResult = await page
    .locator("button.ws-result")
    .first()
    .boundingBox();
  check(
    "Explore: player above the fold at 1440×900",
    videoTop !== null && box.y + box.height <= 900,
    `stage ${Math.round(box.y)}–${Math.round(box.y + box.height)}px, ${Math.round(box.width)}px wide`,
  );
  check(
    "Explore: first result fully above the fold",
    firstResult.y + firstResult.height < 900,
    `bottom ${Math.round(firstResult.y + firstResult.height)}px`,
  );
  const timeline = await page.locator(".tl").boundingBox();
  check(
    "Explore: timeline directly under the player",
    timeline && Math.abs(timeline.y - (box.y + box.height)) < 70,
    `gap ${Math.round(timeline.y - box.y - box.height)}px`,
  );
  const playing = await page.evaluate(async () => {
    const v = document.querySelector(".ws-stage video");
    const a = v.currentTime;
    await new Promise((r) => setTimeout(r, 2500));
    return v.currentTime > a;
  });
  check("Explore: selected clip plays", playing);
  check(
    "Explore: playhead drawn on the timeline while playing",
    (await page.locator(".tl-playhead").count()) === 1,
  );
  const second = page.locator("button.ws-result").nth(1);
  const secondCamera = (await second.locator("strong").textContent())?.trim();
  await second.click();
  await settle(page, 800);
  check(
    "Explore: selecting a result updates the transport",
    (await page.locator(".ws-transport-what strong").textContent())?.trim() ===
      secondCamera,
  );
  await page.getByRole("button", { name: "Next moment" }).click();
  check(
    "Explore: stepper moves to the next moment",
    (await page.locator(".ws-stepper .ws-tc").textContent())
      ?.trim()
      .startsWith("3 /"),
  );
  // Timeline tick → selection visible in list and transport, within the viewport.
  const tick = page.locator(".tl-moment:not(.is-selected)").first();
  const tickLabel = await tick.getAttribute("aria-label");
  await tick.click();
  await settle(page, 600);
  const current = await page
    .locator(".ws-result[aria-current='true']")
    .boundingBox();
  check(
    "Explore: timeline tick selects a moment visible in the list",
    current && current.y >= 0 && current.y < 900,
    tickLabel?.slice(0, 60),
  );
  const hit = await tick.boundingBox();
  check(
    "Explore: tick hit area ≥ 24px",
    hit && hit.width >= 24 && hit.height >= 24,
    `${hit?.width}×${hit?.height}`,
  );
  // Free topic filter.
  const indexBefore = counts.indexQuery;
  await page.getByRole("radio", { name: /^Animals/ }).click();
  await page.waitForFunction(
    () =>
      document
        .querySelector("#results-title")
        ?.textContent?.includes("Animals"),
    null,
    { timeout: 20000 },
  );
  check(
    "Explore: topic filter reads the free index",
    counts.indexQuery > indexBefore,
  );
  // Drag to focus, Escape to restore.
  const tracks = await page.locator(".tl-tracks").boundingBox();
  await page.mouse.move(tracks.x + tracks.width * 0.6, tracks.y + 10);
  await page.mouse.down();
  await page.mouse.move(tracks.x + tracks.width * 0.98, tracks.y + 10, {
    steps: 6,
  });
  await page.mouse.up();
  await settle(page, 800);
  check(
    "Explore: drag across the timeline focuses a period",
    (await page.getByRole("button", { name: "Full range" }).count()) === 1,
  );
  await page.locator("body").press("Escape");
  await settle(page, 400);
  check(
    "Explore: Escape restores the full range",
    (await page.getByRole("button", { name: "Full range" }).count()) === 0,
  );
  // Contextual Muse action writes, never sends.
  await page.getByRole("radio", { name: /^All/ }).click();
  await page.waitForSelector(".ws-muse-context", { timeout: 20000 });
  await page.locator(".ws-muse-context").click();
  const asked = await page.locator("#explore-ask").inputValue();
  check(
    "Explore: “Find moments like this” fills the field, sends nothing",
    asked.startsWith("Moments like") && counts.aborted.length === 0,
    asked.slice(0, 60),
  );
  await page.locator("#explore-ask").fill("");
  await page.locator("body").press("/");
  check(
    "Explore: / focuses the ask field",
    await page.evaluate(() => document.activeElement?.id === "explore-ask"),
  );
  const axe = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
    .analyze();
  check(
    "Explore: axe WCAG 2.2 AA",
    axe.violations.length === 0,
    axe.violations.map((v) => `${v.id}×${v.nodes.length}`).join(", "),
  );
  check("Explore: no page errors", errors.length === 0, errors.join(" | "));
  await context.close();
}

// ---------- Muse refinement without new requests (local /search fixture) ----------
{
  let real = null;
  const fixture = async (req) => {
    const body = JSON.parse(req.postData() ?? "{}");
    // Real stored hits, wrapped in a hand-written reading. Labelled as a fixture: it never
    // reaches the API or Meta, and the UI must not re-request it.
    real ??= await (
      await fetch(base + "/api/v1/index-query", {
        method: "POST",
        headers: { "content-type": "application/json", origin: base },
        body: JSON.stringify({
          event_types: ["animal_visible"],
          start: body.start,
          end: body.end,
          limit: 24,
        }),
      })
    )
      .json()
      .catch(() => null);
    return {
      query: body.query,
      constraints: {
        camera_names: [],
        camera_ids: [],
        start: null,
        end: null,
        event_types: ["animal_visible"],
        keywords: [],
        limit: 10,
        motion_only: false,
        objects: [],
        unsupported_reason: null,
      },
      items: real?.items ?? [],
      coverage: real?.coverage ?? "partial",
      analyzed_ms: real?.analyzed_ms ?? 0,
      available_ms: real?.available_ms ?? 0,
      explanation: "REDESIGN-01 test fixture",
      latency_ms: 1234,
      retrieval: "postgres_fts",
    };
  };
  const { context, page, errors } = await open(
    { width: 1440, height: 900 },
    fixture,
  );
  await page.goto(base + "/explore", { waitUntil: "domcontentloaded" });
  await page.waitForSelector("button.ws-result", { timeout: 30000 });
  await page.locator("#explore-ask").fill("squirrels at the feeder");
  await page.getByRole("button", { name: /Ask Muse, uses 1 request/ }).click();
  await page.waitForSelector(".ws-understood", { timeout: 20000 });
  check(
    "Muse search: one deliberate Ask → one /search",
    counts.fixtureSearch === 1,
  );
  const cameraSelect = page.locator(".ws-select select");
  const option = await cameraSelect
    .locator("option")
    .nth(1)
    .getAttribute("value");
  const indexBefore = counts.indexQuery;
  await cameraSelect.selectOption(option);
  await page.waitForFunction(
    () =>
      document
        .querySelector(".ws-understood small")
        ?.textContent?.includes("no new request"),
    null,
    { timeout: 20000 },
  );
  check(
    "Muse search: camera refinement uses the index, not /search",
    counts.fixtureSearch === 1 && counts.indexQuery > indexBefore,
  );
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForSelector(".ws-understood", { timeout: 30000 });
  check(
    "Muse search: reload reuses Muse’s reading (0 new /search)",
    counts.fixtureSearch === 1,
  );
  await page
    .locator(".ws-transport a", { hasText: "Open in recording" })
    .click()
    .catch(() => {});
  await page.waitForURL(/\/recordings\//, { timeout: 20000 }).catch(() => {});
  await page.goBack({ waitUntil: "domcontentloaded" });
  await page
    .waitForSelector(".ws-understood", { timeout: 30000 })
    .catch(() => {});
  check(
    "Muse search: Back from a recording costs nothing",
    counts.fixtureSearch === 1,
  );
  check("Muse search: no page errors", errors.length === 0, errors.join(" | "));
  await context.close();
}

// ---------- Muse panel and command palette ----------
{
  const { context, page, errors } = await open();
  await page.goto(base + "/explore", { waitUntil: "domcontentloaded" });
  await settle(page, 3000);
  await page.locator(".ask-muse").click();
  await page.waitForSelector(".muse-prompts button");
  await page.locator(".muse-prompts button").first().click();
  const filled = await page.locator("#muse-query").inputValue();
  check(
    "Muse: starter prompt fills the composer, sends nothing",
    filled.length > 0 && counts.aborted.length === 0,
    filled.slice(0, 60),
  );
  check(
    "Muse: send button states its cost",
    (await page
      .getByRole("button", { name: /Ask Muse, uses 1 request/ })
      .count()) === 1,
  );
  await page.locator("#muse-query").fill("cameras");
  check(
    "Muse: known pages offered for free while typing",
    (await page.locator(".muse-local-row").count()) > 0,
  );
  await page.keyboard.press("Escape");
  for (const route of [
    "/cameras",
    "/layouts",
    "/settings",
    "/live",
    "/recordings",
  ]) {
    await page.goto(base + route, { waitUntil: "domcontentloaded" });
    await settle(page, 2500);
    const museish = page.locator("main button", {
      hasText: /Muse|Connection help|Find a moment|privacy controls/,
    });
    const n = await museish.count();
    for (let i = 0; i < n; i += 1) {
      await museish
        .nth(i)
        .click()
        .catch(() => {});
      await settle(page, 400);
      await page.keyboard.press("Escape");
    }
  }
  check(
    "Muse: Muse-flavoured buttons across screens send 0 requests",
    counts.aborted.length === 0,
    counts.aborted.join(", "),
  );
  await page.keyboard.press("Meta+k");
  await page
    .locator("[aria-label='Search commands']")
    .fill("bicycles at the gate this morning");
  const options = await page.locator(".command-result small").allTextContents();
  check(
    "Palette: Muse options state their cost",
    options.filter((t) => t.includes("1 request")).length === 2,
  );
  check(
    "Muse/palette: no page errors",
    errors.length === 0,
    errors.join(" | "),
  );
  await context.close();
}

// ---------- Responsive ----------
for (const viewport of [
  { width: 1280, height: 800 },
  { width: 1024, height: 768 },
  { width: 768, height: 1024 },
  { width: 390, height: 844 },
]) {
  const { context, page } = await open(viewport);
  for (const route of ["/", "/explore"]) {
    await page.goto(base + route, { waitUntil: "domcontentloaded" });
    await settle(page, 5000);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    check(
      `Responsive ${viewport.width}: ${route} has no horizontal overflow`,
      overflow <= 0,
      `${overflow}px`,
    );
  }
  if (viewport.width === 390) {
    await page.goto(base + "/explore?topic=animals", {
      waitUntil: "domcontentloaded",
    });
    await page.waitForSelector("button.ws-result", { timeout: 30000 });
    const r = await top(page, "button.ws-result");
    check(
      "Phone: first result frame above y=900 after a topic",
      r !== null && r < 900,
      `${r}px`,
    );
    await page.getByRole("button", { name: "Details" }).click();
    check(
      "Phone: Details shows the inspector",
      await page.locator(".ws-detail").isVisible(),
    );
    await page.getByRole("button", { name: "Timeline" }).click();
    check(
      "Phone: Timeline shows the lanes",
      await page.locator(".tl").isVisible(),
    );
  }
  await context.close();
}

await browser.close();
check(
  "No paid request left the browser",
  counts.aborted.length === 0,
  counts.aborted.join(", "),
);
const passed = results.filter((r) => r.pass).length;
await writeFile(
  path.join(out, "flows.json"),
  JSON.stringify(
    {
      base,
      ran_at: new Date().toISOString(),
      passed,
      total: results.length,
      fixture_search_fulfilled_locally: counts.fixtureSearch,
      aborted_paid_requests: counts.aborted,
      results,
    },
    null,
    2,
  ),
);
console.log(`${passed}/${results.length} passed`);
process.exit(passed === results.length ? 0 : 1);
