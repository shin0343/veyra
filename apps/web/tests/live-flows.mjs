// Real-stack acceptance: drives the production web build against the actual API, media,
// indexing worker and Meta Muse. Nothing here is mocked; failures are reported as failures.
// Usage: VEYRA_QA_URL=http://127.0.0.1:3000 FLOWS=2,3,4 node tests/live-flows.mjs
import { chromium } from "playwright";
import AxeBuilder from "@axe-core/playwright";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import path from "node:path";

const base = process.env.VEYRA_QA_URL ?? "http://127.0.0.1:3000";
const flows = new Set(
  (process.env.FLOWS ?? "2,3,4,5,6i,6,7,8").split(",").map((v) => v.trim()),
);
const out = path.resolve("../../docs/design/verification/phase06");
await mkdir(out, { recursive: true });
const reportPath = path.join(out, "report.json");
const report = JSON.parse(
  await readFile(reportPath, "utf8").catch(() => '{"flows":{}}'),
);
report.observed_at = new Date().toISOString();
report.accessibility = {};
report.mode =
  "real stack: Next production build, FastAPI, PostgreSQL, MediaMTX, worker, Meta Muse";
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
});
const page = await context.newPage();
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
page.on("console", (message) => {
  if (message.type() === "error") errors.push(message.text().slice(0, 600));
});
const shot = (name) => page.screenshot({ path: path.join(out, `${name}.png`) });
const api = async (route, init) => {
  if (!page.url().startsWith(base)) await page.goto(`${base}/settings`);
  return page.evaluate(
    async ([route, init]) => {
      const response = await fetch(`/api/v1${route}`, {
        ...init,
        headers: {
          "Content-Type": "application/json",
          ...(init?.headers ?? {}),
        },
      });
      return {
        status: response.status,
        body: await response.json().catch(() => null),
      };
    },
    [route, init],
  );
};
async function playing(timeout = 45000, minimum = 0.5) {
  const started = Date.now();
  await page.waitForFunction(
    (minimum) =>
      [...document.querySelectorAll("video")].some(
        (video) => video.readyState >= 2 && video.currentTime > minimum,
      ),
    minimum,
    { timeout },
  );
  return Date.now() - started;
}
async function askMuse(message) {
  await page
    .getByRole("button", { name: "Ask Muse", exact: true })
    .first()
    .click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Ask Muse").fill(message);
  const started = Date.now();
  await dialog.getByRole("button", { name: "Send message" }).click();
  const turn = dialog.locator(".muse-turn").last();
  await turn
    .locator(".assistant-answer, .receipt-failed")
    .first()
    .waitFor({ timeout: 80000 });
  return { dialog, turn, ms: Date.now() - started };
}
async function audit(name) {
  const result = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  report.accessibility ??= {};
  report.accessibility[name] = result.violations.map((v) => ({
    id: v.id,
    impact: v.impact,
    nodes: v.nodes.map((node) => ({
      target: node.target.join(" "),
      summary: node.failureSummary
        ?.split("\n")
        .slice(1)
        .join(" ")
        .slice(0, 200),
    })),
  }));
}
async function run(id, title, body) {
  if (!flows.has(id)) return;
  const entry = { title, status: "running", observations: {} };
  report.flows[id] = entry;
  const started = Date.now();
  try {
    await body(entry.observations);
    entry.status = "passed";
  } catch (error) {
    entry.status = "failed";
    entry.error = String(error?.message ?? error).slice(0, 800);
    await shot(`flow${id}-failure`).catch(() => undefined);
  }
  entry.duration_ms = Date.now() - started;
  console.log(
    `flow ${id} ${entry.status}`,
    JSON.stringify(entry.observations),
    entry.error ?? "",
  );
}

await run(
  "2",
  "Open actual recorded media and navigate by timestamp",
  async (o) => {
    await page.goto(`${base}/recordings`, { waitUntil: "networkidle" });
    await page.locator(".library-row").first().waitFor();
    o.library_rows = await page.locator(".library-row").count();
    await page.locator(".library-row").first().click();
    await page.waitForURL(/\/recordings\/[0-9a-f-]{36}\?offset_ms=0/);
    o.first_frames_ms = await playing(45000, 0.2);
    await page.getByRole("button", { name: "Forward 10 seconds" }).click();
    await page.waitForURL(/offset_ms=(9|1\d)\d{3}/);
    o.seek_url = new URL(page.url()).search;
    await playing(45000, 0.2);
    o.position_label = await page
      .locator(".playback-position strong")
      .innerText();
    await page
      .locator(".histogram-bin:not(.bin-empty)")
      .first()
      .waitFor({ timeout: 15000 });
    o.histogram_bins = await page.locator(".histogram-bin").count();
    o.histogram_recorded_bins = await page
      .locator(".histogram-bin:not(.bin-empty)")
      .count();
    await shot("flow2-recording");
    const before = page.url();
    const bins = page.locator(".histogram-bin:not(.bin-empty)");
    await bins.nth(Math.min(2, (await bins.count()) - 1)).click();
    await page.waitForURL((url) => url.href !== before, { timeout: 10000 });
    o.histogram_navigated_to =
      new URL(page.url()).pathname + new URL(page.url()).search;
    o.after_histogram_frames_ms = await playing(45000, 0.2);
    await page.getByLabel(/Jump to time/).fill("0:05");
    await page.getByRole("button", { name: "Go", exact: true }).click();
    await page.waitForURL(/offset_ms=5000/);
    o.jump_to = new URL(page.url()).search;
    await audit("recording");
  },
);

await run("3", "Create, open and persist a layout", async (o) => {
  const name = `Everyday four ${Date.now().toString(36)}`;
  await page.goto(`${base}/layouts`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Create a view" }).first().click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("View name").fill(name);
  const boxes = dialog.locator(".camera-picker input[type=checkbox]");
  for (let i = 0; i < 4; i++) await boxes.nth(i).check();
  await dialog.getByRole("button", { name: "Review view" }).click();
  await dialog.getByRole("button", { name: "Save view" }).click();
  await dialog.getByText("Your view is ready").waitFor({ timeout: 15000 });
  await dialog.getByRole("link", { name: /Open saved view/ }).click();
  await page.waitForURL(/\/layouts\/[0-9a-f-]{36}$/);
  o.layout_id = page.url().split("/").pop();
  await page.getByRole("heading", { level: 1, name }).waitFor();
  o.tiles = await page.locator(".live-tile").count();
  o.first_frames_ms = await playing();
  await page.reload({ waitUntil: "networkidle" });
  await page.getByRole("heading", { level: 1, name }).waitFor();
  const stored = await api(`/layouts/${o.layout_id}`);
  o.persisted = stored.status === 200 && stored.body.name === name;
  o.persisted_cells = stored.body?.cells?.length;
  if (!o.persisted || o.persisted_cells !== 4)
    throw new Error("Layout not persisted");
  await playing();
  await shot("flow3-layout");
  await audit("layout");
});

await run("4", "Ask Muse to find a feature and navigate", async (o) => {
  await page.goto(`${base}/`, { waitUntil: "networkidle" });
  const { dialog, turn, ms } = await askMuse(
    "Where can I change a camera's settings?",
  );
  o.muse_ms = ms;
  o.status = await turn.locator(".badge").first().innerText();
  o.message = (
    await turn.locator(".assistant-answer > p").first().innerText()
  ).slice(0, 200);
  o.steps = await turn
    .locator(".muse-trace li")
    .allInnerTexts()
    .catch(() => []);
  await shot("flow4-muse-feature");
  await audit("muse-response");
  const action = turn
    .locator(".muse-action-card a, .muse-nav-row")
    .filter({ hasText: /camera/i })
    .first();
  await action.waitFor({ timeout: 5000 });
  o.action_label = await action.innerText();
  await action.click();
  await page.waitForURL(/\/cameras/);
  await dialog.waitFor({ state: "hidden" });
  o.navigated_to = new URL(page.url()).pathname;
});

await run(
  "5",
  "Ask Muse to create a layout, approve, and verify it exists",
  async (o) => {
    await page.goto(`${base}/layouts`, { waitUntil: "networkidle" });
    const name = `Muse quad ${Date.now().toString(36)}`;
    const { turn, ms } = await askMuse(
      `Create a 2x2 saved view named "${name}" with Front entrance, Garden, Garage and Trail camera.`,
    );
    o.muse_ms = ms;
    const proposal = turn.locator(".proposal-card");
    await proposal.waitFor({ timeout: 5000 });
    o.proposal_cells = await proposal
      .locator(".proposal-grid > span")
      .allInnerTexts();
    const before = await api("/layouts");
    o.exists_before_approval = before.body.items.some(
      (item) => item.name === name,
    );
    if (o.exists_before_approval)
      throw new Error("Layout existed before approval");
    await shot("flow5-proposal");
    await proposal.getByRole("button", { name: "Approve and save" }).click();
    const verified = turn.locator(".receipt", {
      hasText: "Saved and verified",
    });
    await verified.waitFor({ timeout: 30000 });
    o.receipt = (await verified.innerText()).replace(/\s+/g, " ").slice(0, 220);
    await shot("flow5-verified");
    await verified.getByRole("link").click();
    await page.waitForURL(/\/layouts\/[0-9a-f-]{36}$/);
    o.layout_id = page.url().split("/").pop();
    await page.getByRole("heading", { level: 1, name }).waitFor();
    o.tiles = await page.locator(".live-tile").count();
    const stored = await api(`/layouts/${o.layout_id}`);
    o.api_columns = stored.body.columns;
    o.api_cells = stored.body.cells.length;
    o.first_frames_ms = await playing();
    await page.goto(`${base}/layouts`, { waitUntil: "networkidle" });
    o.listed_in_saved_views = await page
      .getByRole("heading", { name })
      .isVisible();
    if (!o.listed_in_saved_views || o.api_cells !== 4)
      throw new Error("Muse layout not visible");
  },
);

await run(
  "6i",
  "Make a consented recording searchable through the UI",
  async (o) => {
    const cameras = await api("/cameras");
    const camera = cameras.body.items.find(
      (item) => item.cloud_analysis_allowed,
    );
    if (!camera) throw new Error("No camera has cloud analysis consent");
    const recordings = await api(`/recordings?camera_id=${camera.id}`);
    const recording = recordings.body.items[0];
    o.camera = camera.name;
    o.recording_id = recording.id;
    await page.goto(`${base}/recordings/${recording.id}?offset_ms=0`, {
      waitUntil: "networkidle",
    });
    const panel = page.locator(".indexing-panel");
    const dialog = page.getByRole("dialog");
    o.attempts = [];
    // A user retries a failed job from the same panel; each attempt is recorded as observed.
    for (let attempt = 0; attempt < 3; attempt++) {
      const trigger = panel.getByRole("button", { name: /searchable/ });
      if (!(await trigger.count())) break;
      await trigger.click();
      if (!attempt) await shot("flow6-consent-dialog");
      await dialog.getByRole("button", { name: "Upload and analyze" }).click();
      await panel.locator(".job-progress").waitFor({ timeout: 15000 });
      if (!attempt) await shot("flow6-indexing-progress");
      const started = Date.now();
      await panel
        .locator(".job-done, p.camera-error")
        .first()
        .waitFor({ timeout: 900000 });
      const result = await panel
        .locator(".job-done, p.camera-error")
        .first()
        .innerText();
      o.attempts.push({
        wall_ms: Date.now() - started,
        result: result.replace(/\s+/g, " "),
      });
      await page.waitForTimeout(1500);
      if (/finished/.test(result)) break;
    }
    o.status_line = await panel.locator(".indexing-heading p").innerText();
    await shot("flow6-indexed");
    if (!/finished/.test(o.attempts.at(-1)?.result ?? ""))
      throw new Error("Indexing did not finish");
  },
);

await run(
  "6",
  "Search indexed video and open the corresponding recording",
  async (o) => {
    // VIDEO-02: search lives in Explore; Ask Muse spends one search parse.
    await page.goto(`${base}/explore`, { waitUntil: "networkidle" });
    await page.locator(".result-card").first().waitFor({ timeout: 30000 });
    await page
      .locator("#explore-ask")
      .fill(process.env.SEARCH_QUERY ?? "a person riding a bicycle");
    const started = Date.now();
    await page.locator(".ask-bar button[type=submit]").click();
    await page
      .locator(".muse-understanding, .explore-results .state-panel")
      .first()
      .waitFor({ timeout: 70000 });
    o.search_ms = Date.now() - started;
    o.heading = await page.locator("#results-title").innerText();
    o.coverage = await page
      .locator(".coverage-note")
      .innerText()
      .catch(() => null);
    o.chips = await page
      .locator(".muse-understanding li")
      .allInnerTexts()
      .catch(() => []);
    const results = page.locator(".result-card");
    o.results = await results.count();
    await shot("flow6-results");
    if (!o.results) throw new Error(`No results: ${o.heading}`);
    o.first_caption = await results
      .first()
      .locator(".result-card-summary")
      .innerText();
    o.first_time = await page.locator(".inspector-when").innerText();
    await page.getByRole("link", { name: /Open in recording at/ }).click();
    await page.waitForURL(
      /\/recordings\/[0-9a-f-]{36}\?offset_ms=\d+&segment_id=/,
    );
    o.opened = new URL(page.url()).pathname + new URL(page.url()).search;
    o.first_frames_ms = await playing(45000, 0.05);
    o.player_position = await page
      .locator(".playback-position strong")
      .innerText();
    await page.waitForTimeout(1500);
    await shot("flow6-evidence-playback");
  },
);

await run(
  "7",
  "Unavailable camera, empty search, and tool failures",
  async (o) => {
    // 7a: a camera whose publisher was stopped by the operator script.
    const cameras = await api("/cameras");
    const offline = cameras.body.items.find(
      (camera) => camera.status !== "online",
    );
    o.offline_camera = offline ? `${offline.name}:${offline.status}` : null;
    if (offline) {
      await page.goto(`${base}/live?camera_id=${offline.id}`, {
        waitUntil: "networkidle",
      });
      await page
        .locator(".player-empty, .player-state[role=alert]")
        .first()
        .waitFor();
      o.offline_message = await page
        .locator(".player-empty, .player-state")
        .first()
        .innerText();
      o.offline_has_video = await page.locator("video").count();
      await shot("flow7-offline-camera");
    }
    // 7b: an empty search shows coverage instead of implying absence.
    await page.goto(`${base}/explore`, { waitUntil: "networkidle" });
    await page.locator("#explore-ask").fill("a dog running");
    await page.locator(".ask-bar button[type=submit]").click();
    await page
      .locator(".muse-understanding, .explore-results .state-panel")
      .first()
      .waitFor({ timeout: 70000 });
    o.empty_search = (
      await page.locator(".explore-results").first().innerText()
    )
      .replace(/\s+/g, " ")
      .slice(0, 240);
    o.empty_search_results = await page.locator(".result-card").count();
    await shot("flow7-empty-search");
    // 7b': a request the server can't express as a supported search.
    await page.locator("#explore-ask").fill("a red truck parked at night");
    await page.locator(".ask-bar button[type=submit]").click();
    await page.locator(".state-panel").first().waitFor({ timeout: 70000 });
    o.unsupported_search = (
      await page.locator(".state-panel").first().innerText()
    )
      .replace(/\s+/g, " ")
      .slice(0, 240);
    await shot("flow7-unsupported-search");
    // 7c: Muse tool failure — a camera that doesn't exist.
    const notFound = await askMuse(
      "Open the live view of the Basement camera.",
    );
    o.not_found_ms = notFound.ms;
    o.not_found = (await notFound.turn.innerText())
      .replace(/\s+/g, " ")
      .slice(0, 400);
    o.not_found_failure_receipts = await notFound.turn
      .locator(".receipt-failed")
      .count();
    await shot("flow7-camera-not-found");
    await page.keyboard.press("Escape");
    // 7c': a layout request naming missing cameras must not produce a proposal.
    const missing = await askMuse(
      "Create a 2x2 view with Basement, Attic, Roof and Pool cameras.",
    );
    o.missing_camera_ms = missing.ms;
    o.missing_camera = (await missing.turn.innerText())
      .replace(/\s+/g, " ")
      .slice(0, 400);
    o.missing_camera_proposal = await missing.turn
      .locator(".proposal-card")
      .count();
    await shot("flow7-tool-failure");
    // 7d: unsupported capability.
    await page.keyboard.press("Escape");
    const unsupported = await askMuse(
      "Recognize everyone who enters the front door.",
    );
    o.unsupported = (await unsupported.turn.innerText())
      .replace(/\s+/g, " ")
      .slice(0, 300);
    await shot("flow7-unsupported");
    if (o.missing_camera_proposal)
      throw new Error("Proposal created for missing cameras");
  },
);

await run("8", "Responsive, accessible real-data pages", async (o) => {
  const recordings = await api("/recordings?limit=1");
  const recording = recordings.body.items[0];
  o.pages = [];
  for (const [label, viewport] of Object.entries({
    mobile: { width: 390, height: 844 },
    tablet: { width: 834, height: 1112 },
  })) {
    await page.setViewportSize(viewport);
    for (const route of [
      "/",
      "/cameras",
      "/live",
      `/recordings/${recording.id}?offset_ms=0`,
      "/explore",
      "/events",
      "/layouts",
      "/settings",
    ]) {
      await page.goto(`${base}${route}`, { waitUntil: "networkidle" });
      await page.locator("#main-content h1").waitFor();
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth + 1,
      );
      o.pages.push(`${label} ${route.split("?")[0]} overflow=${overflow}`);
      if (overflow) throw new Error(`Horizontal overflow: ${label} ${route}`);
      if (label === "mobile") await audit(`mobile ${route.split("?")[0]}`);
    }
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${base}/events`, { waitUntil: "networkidle" });
  await page.locator(".histogram-plot").waitFor();
  await shot("flow8-mobile-activity");
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`${base}/events`, { waitUntil: "networkidle" });
  await page.locator(".histogram-bin").first().focus();
  await page.keyboard.press("End");
  o.histogram_keyboard_focus = await page.evaluate(() =>
    document.activeElement?.getAttribute("aria-label")?.slice(0, 120),
  );
  await shot("flow8-activity");
  const violations = Object.entries(report.accessibility ?? {}).filter(
    ([, list]) => list.length,
  );
  if (violations.length)
    throw new Error(`Accessibility: ${JSON.stringify(violations)}`);
});

report.page_errors = errors;
await writeFile(reportPath, JSON.stringify(report, null, 2) + "\n");
await browser.close();
const failed = Object.values(report.flows).filter(
  (flow) => flow.status !== "passed",
);
if (failed.length) process.exitCode = 1;
