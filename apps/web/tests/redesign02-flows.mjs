// REDESIGN-02 interaction checks across the product against the real stack.
// Paid model calls and every workspace mutation (POST/PUT/PATCH/DELETE on cameras and
// layouts, analysis jobs) are aborted and counted, so the run changes no data and spends nothing.
// Usage: node tests/redesign02-flows.mjs <base-url> [out-dir]
import { chromium } from "playwright";
import AxeBuilder from "@axe-core/playwright";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const base = process.argv[2] ?? "http://127.0.0.1:3600";
const out = path.resolve(
  process.argv[3] ?? "../../docs/design/redesign-02/checks",
);
await mkdir(out, { recursive: true });
const GUARDED =
  /\/api\/v1\/(agent\/messages|agent\/confirmations|search$|analysis-jobs|cameras(\/[^/]+)?$|layouts(\/[^/]+)?$)/;
const results = [];
const blocked = [];
function check(name, pass, detail = "") {
  results.push({ name, pass: !!pass, detail });
  console.log(
    `${pass ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`,
  );
}
const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  timezoneId: "America/Los_Angeles",
});
await context.route(GUARDED, (route) => {
  const req = route.request();
  if (req.method() === "GET") return route.continue();
  if (/\/(cameras\/[^/]+\/live-session)$/.test(new URL(req.url()).pathname))
    return route.continue();
  blocked.push(`${req.method()} ${new URL(req.url()).pathname}`);
  return route.abort();
});
const page = await context.newPage();
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
const settle = (ms = 3000) => page.waitForTimeout(ms);
const playing = (scope) =>
  page
    .waitForFunction(
      (s) => {
        const v = document.querySelector(`${s} video`);
        return (
          v && v.readyState >= 2 && v.currentTime > 0.3 && v.videoWidth > 0
        );
      },
      scope,
      { timeout: 45000 },
    )
    .then(() => true)
    .catch(() => false);
async function axe(name) {
  const result = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
    .analyze();
  check(
    `axe WCAG 2.2 AA: ${name}`,
    result.violations.length === 0,
    result.violations.map((v) => `${v.id}×${v.nodes.length}`).join(", "),
  );
}
const shot = (name) => page.screenshot({ path: path.join(out, `${name}.png`) });

// Cameras: open a camera.
await page.goto(base + "/cameras", { waitUntil: "domcontentloaded" });
await page.waitForSelector(".cam-item img", { timeout: 30000 });
await settle(1500);
const visible = await page.locator(".cam-item").count();
check(
  "Cameras: test sources hidden by default",
  visible === 6,
  `${visible} cameras shown`,
);
await axe("Cameras");
await page.locator(".cam-item", { hasText: "Entrance gate" }).click();
await page.waitForURL(/camera=/);
check(
  "Cameras: opening a camera shows its panel",
  await page.locator(".cam-panel h2").isVisible(),
);
check(
  "Cameras: the opened camera plays live",
  await playing(".cam-panel-stage"),
);
check(
  "Cameras: panel names the footage credit",
  (await page.locator(".cam-panel .source-media-credit").count()) === 1,
);
await shot("cameras-open");
await axe("Cameras with a camera open");
await page.locator(".cam-panel a", { hasText: "Live view" }).click();
await page.waitForURL(/\/live\?camera_id=/);
check("Cameras → Live: single camera plays", await playing(".wall-tile"));
check(
  "Live: one tile in single mode",
  (await page.locator(".wall-tile").count()) === 1,
);

// Live wall.
await page.goto(base + "/live", { waitUntil: "domcontentloaded" });
await page.waitForSelector(".wall-tile video", { timeout: 30000 });
check(
  "Live: 2×2 wall shows four tiles",
  (await page.locator(".wall-tile").count()) === 4,
);
check("Live: wall video plays", await playing(".wall-tile"));
await page.getByRole("button", { name: "3 by 3 camera layout" }).click();
await settle(800);
check(
  "Live: 3×3 shows all six cameras",
  (await page.locator(".wall-tile").count()) === 6,
);
await shot("live-3x3");
await axe("Live view");

// Saved views: open and edit (no save).
await page.goto(base + "/layouts", { waitUntil: "domcontentloaded" });
await page.waitForSelector(".views-item img", { timeout: 30000 });
const views = await page.locator(".views-item").count();
check(
  "Saved views: views with test sources hidden by default",
  views === 4,
  `${views} shown`,
);
const frames = await page.locator(".views-item .view-mosaic img").count();
check(
  "Saved views: previews use real camera frames",
  frames >= 10,
  `${frames} frames`,
);
await axe("Saved views");
await page.locator(".views-open").first().click();
await page.waitForURL(/\/layouts\//);
check("Saved view: opens and plays", await playing(".wall-tile"));
await page.getByRole("button", { name: "Edit view" }).click();
await page.getByRole("dialog").waitFor();
await settle(400);
const chosen = await page.locator(".view-picker button.is-chosen").count();
check(
  "Saved view: editor opens with its cameras chosen",
  chosen >= 1,
  `${chosen} chosen`,
);
await shot("view-editor");
await axe("Saved view editor");
await page.keyboard.press("Escape");

// Recordings: play, moments, strip.
await page.goto(base + "/recordings", { waitUntil: "domcontentloaded" });
await page.waitForSelector(".recording-main video", { timeout: 40000 });
const moments = await page.locator(".moment-row").count();
check(
  "Recordings: opens on a recording with moments",
  moments >= 1,
  `${moments} moments`,
);
check("Recordings: recording plays", await playing(".recording-main"));
const strip = await page.locator(".recording-main .timeline").boundingBox();
const player = await page
  .locator(".recording-main .media-player")
  .boundingBox();
check(
  "Recordings: time strip sits under the player",
  strip &&
    player &&
    strip.y > player.y &&
    strip.y - (player.y + player.height) < 140,
);
const before = page.url();
await page.locator(".moment-row").last().click();
await page
  .waitForFunction((u) => location.href !== u, before, { timeout: 10000 })
  .catch(() => {});
check(
  "Recordings: choosing a moment seeks",
  page.url().includes("offset_ms="),
  page.url().split("?")[1],
);
await axe("Recordings");

// Explore → playback.
await page.goto(base + "/explore", { waitUntil: "domcontentloaded" });
await page.waitForSelector("button.ws-result", { timeout: 30000 });
await page.getByRole("link", { name: /Open in recording at/ }).click();
await page.waitForURL(/\/recordings\/.+segment_id=/);
check(
  "Explore result → recording plays at the evidence",
  await playing(".recording-main"),
);

// Activity.
await page.goto(base + "/events", { waitUntil: "domcontentloaded" });
await page.waitForSelector(".log-row .evidence-frame", { timeout: 30000 });
await page.locator(".log-play").first().click();
check(
  "Activity: Watch plays the evidence clip in place",
  await playing(".log-player"),
);
await shot("activity-watch");
await page.getByRole("button", { name: /^Movement/ }).click();
await settle(500);
check(
  "Activity: Movement filter shows movement rows",
  (await page.locator(".log-row.is-motion").count()) > 0,
);
await axe("Activity");

// Settings.
await page.goto(base + "/settings", { waitUntil: "domcontentloaded" });
await page.waitForSelector(".settings-table tbody tr", { timeout: 30000 });
check(
  "Settings: privacy table lists cameras",
  (await page.locator(".settings-table tbody tr").count()) === 6,
);
check(
  "Settings: usage today is read",
  await page.getByText("Usage today (UTC)").isVisible(),
);
await axe("Settings");
await page
  .getByRole("switch", { name: "Show development test sources" })
  .check();
await page.goto(base + "/cameras", { waitUntil: "domcontentloaded" });
await page.waitForSelector(".cam-item", { timeout: 30000 });
await settle(800);
check(
  "Settings → Cameras: showing test sources reveals them",
  (await page.locator(".cam-item").count()) === 8,
);
await page.goto(base + "/settings", { waitUntil: "domcontentloaded" });
await page
  .getByRole("switch", { name: "Show development test sources" })
  .uncheck();

// Muse suggestions and palette.
await page.goto(base + "/cameras", { waitUntil: "domcontentloaded" });
await settle(2000);
await page.getByRole("button", { name: "Ask Muse", exact: true }).click();
await page.waitForSelector(".muse-prompts button");
const prompts = await page
  .locator(".muse-prompts button span")
  .allTextContents();
check(
  "Muse: suggestions fit the page",
  prompts.some((p) => /cloud analysis/i.test(p)),
  prompts.join(" | "),
);
check(
  "Muse: each suggestion says whether it changes anything",
  (await page.locator(".muse-prompts small").count()) === prompts.length,
);
await page.locator(".muse-prompts button").first().click();
check(
  "Muse: suggestion fills the composer only",
  (await page.locator("#muse-query").inputValue()).length > 0 &&
    blocked.length === 0,
);
await shot("muse-suggestions");
await axe("Muse panel");
await page.keyboard.press("Escape");
await page.keyboard.press("Meta+k");
await page.locator("[aria-label='Search commands']").fill("garden");
await settle(300);
const free = await page
  .locator(".command-result small", { hasText: "No request" })
  .count();
check(
  "Palette: real cameras and views match for free",
  free >= 2,
  `${free} free matches`,
);
await page.keyboard.press("Enter");
await page.waitForURL(/\/cameras\?camera=/, { timeout: 10000 }).catch(() => {});
check(
  "Palette: first match opens that camera",
  page.url().includes("/cameras?camera="),
);

await browser.close();
check(
  "No paid or mutating request left the browser",
  blocked.length === 0,
  blocked.join(", "),
);
check("No page errors", errors.length === 0, errors.join(" | "));
const passed = results.filter((r) => r.pass).length;
await writeFile(
  path.join(out, "flows.json"),
  JSON.stringify(
    {
      base,
      ran_at: new Date().toISOString(),
      passed,
      total: results.length,
      blocked,
      results,
    },
    null,
    2,
  ),
);
console.log(`${passed}/${results.length} passed`);
process.exit(passed === results.length ? 0 : 1);
