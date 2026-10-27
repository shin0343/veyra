// Continuous genuine demo walkthrough on the real stack; saves submission screenshots and timings.
// Usage (from apps/web, real stack running): VEYRA_QA_URL=http://127.0.0.1:3000 node tests/demo-walkthrough.mjs [outdir]
// Spends genuine Muse requests and saves one new layout; pick an unused LAYOUT name per run.
import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const base = process.env.VEYRA_QA_URL ?? "http://127.0.0.1:3000";
const out = path.resolve(process.argv[2] ?? "../../docs/demo/screenshots");
await mkdir(out, { recursive: true });
const report = {
  base,
  started_at: new Date().toISOString(),
  steps: [],
  page_errors: [],
};
const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  timezoneId: "America/Los_Angeles",
  deviceScaleFactor: 2,
});
const page = await context.newPage();
page.on("pageerror", (e) => report.page_errors.push(e.message));
const shot = (name) => page.screenshot({ path: path.join(out, `${name}.png`) });
const t0 = Date.now();
const step = (name, data = {}) => {
  const entry = { name, at_s: +((Date.now() - t0) / 1000).toFixed(1), ...data };
  report.steps.push(entry);
  console.log(JSON.stringify(entry));
};
const playing = () =>
  page.waitForFunction(
    () =>
      [...document.querySelectorAll("video")].some(
        (v) => v.readyState >= 2 && v.currentTime > 0.3,
      ),
    null,
    { timeout: 45000 },
  );
const answers = (n) =>
  page.waitForFunction(
    (n) =>
      document.querySelectorAll(".muse-turn .assistant-answer").length >= n,
    n,
    { timeout: 90000 },
  );

// 1. Welcoming overview with a real live feed.
await page.goto(base + "/", { waitUntil: "networkidle" });
await playing();
await page.waitForTimeout(1500);
await shot("01-overview");
step("overview", { video_playing: true });

// 2. Cameras and the approved-source connect dialog (not submitted: sample_3 stays free for the live demo).
await page.goto(base + "/cameras", { waitUntil: "networkidle" });
await page.waitForTimeout(800);
await shot("02-cameras");
await page.getByRole("button", { name: "Connect a camera" }).first().click();
await page.getByLabel("Camera name").first().fill("Garage");
await page.waitForTimeout(500);
await shot("03-connect-camera");
await page.keyboard.press("Escape");
step("cameras");

// 3. Live grid.
await page.goto(base + "/live", { waitUntil: "networkidle" });
await playing();
await page.waitForTimeout(2500);
await shot("04-live");
step("live", { tiles: await page.locator(".live-tile").count() });

// 4. Universal command → Muse proposes a real layout → human approval → verified.
const layoutPrompt =
  process.env.LAYOUT ??
  "Create a two-column saved view named “Family room” with Front entrance, Garden and Trail camera";
await page.keyboard.press("Meta+k");
await page.keyboard.type(layoutPrompt);
await page.waitForTimeout(400);
await shot("05-command");
await page.keyboard.press("Enter");
let started = Date.now();
await answers(1);
step("muse_layout_answer", { ms: Date.now() - started });
await page.waitForTimeout(800);
await shot("06-muse-proposal");
const approve = page.getByRole("button", { name: "Approve and save" });
if (await approve.count()) {
  started = Date.now();
  await approve.click();
  await page.waitForSelector(".receipt", { timeout: 40000 });
  step("muse_layout_approved", {
    ms: Date.now() - started,
    verified: await page.getByText("Saved and verified").count(),
  });
  await page.waitForTimeout(800);
  await shot("07-muse-verified");
  await page.getByRole("link", { name: /Open saved layout/ }).click();
  await page.waitForURL(/\/layouts\//);
  await playing();
  await page.waitForTimeout(2500);
  await shot("08-saved-view");
  step("saved_view_open", {
    url: page.url().replace(base, ""),
    tiles: await page.locator(".live-tile").count(),
  });
} else
  step("muse_layout_no_proposal", {
    text: (await page.locator(".muse-scroll").innerText()).slice(0, 400),
  });

// 5. Muse searches indexed video; open the grounded moment.
await page.getByRole("button", { name: "Ask Muse", exact: true }).click();
const newConversation = page.getByRole("button", { name: "New conversation" });
if (await newConversation.count()) await newConversation.click();
await page
  .locator("#muse-query")
  .fill(
    process.env.SEARCH ??
      "Find footage with a person riding a bicycle on Trail camera.",
  );
started = Date.now();
await page.locator("#muse-query").press("Enter");
await answers(1);
step("muse_search_answer", {
  ms: Date.now() - started,
  moments: await page.locator(".muse-turn .muse-nav-row").count(),
});
await page.waitForTimeout(800);
await shot("09-muse-search");
const moment = page
  .locator(".muse-turn a.muse-nav-row[href*='/recordings/']")
  .first();
if (await moment.count()) {
  await moment.click();
  await page.waitForURL(/\/recordings\//);
  await playing();
  await page.waitForTimeout(1500);
  await shot("10-evidence-playback");
  step("evidence_playback", { url: page.url().replace(base, "") });
}

// 6. Explore: Muse-parsed constraints, coverage, frames, inspector playback.
await page.goto(base + "/explore", { waitUntil: "networkidle" });
await page.locator(".result-card").first().waitFor({ timeout: 30000 });
await page
  .locator("#explore-ask")
  .fill(process.env.QUERY ?? "a person riding a bicycle");
started = Date.now();
await page.keyboard.press("Enter");
await page
  .locator(".muse-understanding, .explore-results [role=alert]")
  .first()
  .waitFor({ timeout: 70000 });
step("search", {
  ms: Date.now() - started,
  results: await page.locator(".result-card").count(),
});
await page.waitForTimeout(1500);
await shot("11-search-results");

// 7. Context: recording histogram + indexing panel, activity, privacy.
if (report.steps.find((s) => s.name === "evidence_playback")) {
  await page.goto(
    base + report.steps.find((s) => s.name === "evidence_playback").url,
    { waitUntil: "networkidle" },
  );
  await page.locator(".indexing-panel").scrollIntoViewIfNeeded();
  await page.waitForTimeout(2000);
  await shot("12-recording-context");
}
await page.goto(base + "/events", { waitUntil: "networkidle" });
await page.waitForTimeout(2000);
await shot("13-activity");
await page.goto(base + "/settings#privacy", { waitUntil: "networkidle" });
await page.waitForTimeout(1500);
await shot("14-privacy");
step("context_pages");

report.finished_at = new Date().toISOString();
await writeFile(
  path.join(out, "walkthrough.json"),
  JSON.stringify(report, null, 2),
);
console.log(
  report.page_errors.length ? report.page_errors.join("\n") : "no page errors",
);
await browser.close();
