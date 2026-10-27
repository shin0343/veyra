// Production UI + actual API/media/worker/Meta. Real responses throughout;
// one request delay injects a camera-metadata timing fault without fabricating data.
import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";
import AxeBuilder from "@axe-core/playwright";

const [origin, output] = process.argv.slice(2);
assert.match(origin, /^http:\/\/127\.0\.0\.1:\d+$/);
const report = {
  observed_at: new Date().toISOString(),
  mode: "genuine live integration",
  scenarios: {},
  metrics: { live_startup_ms: [], recording_retrieval_ms: [], search_ms: [] },
  page_errors: [],
  failed_http: [],
  accessibility: [],
};
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
  timezoneId: "America/Los_Angeles",
});
const page = await context.newPage();
page.setDefaultTimeout(20000);
page.on("pageerror", (error) => report.page_errors.push(error.message));
page.on("response", (response) => {
  if (response.status() >= 400)
    report.failed_http.push({
      path: new URL(response.url()).pathname,
      status: response.status(),
    });
});
const save = () =>
  writeFile(
    path.join(output, "browser.json"),
    JSON.stringify(report, null, 2) + "\n",
  );
const shot = (name) =>
  page.screenshot({ path: path.join(output, `${name}.png`), fullPage: true });
const go = (route) => page.goto(origin + route, { waitUntil: "networkidle" });
async function api(route, method = "GET", body, headers = {}) {
  return page.evaluate(
    async ({ route, method, body, headers }) => {
      const result = await fetch(`/api/v1${route}`, {
        method,
        headers: { "Content-Type": "application/json", ...headers },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      return {
        status: result.status,
        body: await result.json().catch(() => null),
      };
    },
    { route, method, body, headers },
  );
}
async function frames() {
  await page.waitForFunction(
    () =>
      [...document.querySelectorAll("video")].some(
        (v) => v.readyState >= 2 && v.videoWidth > 0 && !v.error,
      ),
    undefined,
    { timeout: 45000 },
  );
}
async function advancing() {
  await frames();
  const video = page.locator("video").first();
  const before = await video.evaluate(async (v) => {
    v.muted = true;
    await v.play();
    return v.currentTime;
  });
  await page.waitForFunction(
    (before) =>
      (document.querySelector("video")?.currentTime ?? -1) > before + 0.3,
    before,
    { timeout: 15000 },
  );
}
async function audit(name) {
  const result = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  report.accessibility.push({
    name,
    violations: result.violations.map((v) => ({ id: v.id, impact: v.impact })),
  });
}
async function scenario(id, fn) {
  const result = (report.scenarios[id] = { status: "running" });
  const started = Date.now();
  try {
    await fn(result);
    result.status = "passed";
  } catch (error) {
    result.status = "failed";
    result.error = String(error.message).slice(0, 600);
    await shot(`${id}-failure`).catch(() => {});
  }
  result.duration_ms = Date.now() - started;
  await save();
  console.log(`${id}: ${result.status}`);
}
async function ask(message) {
  await page
    .getByRole("button", { name: "Ask Muse", exact: true })
    .first()
    .click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Ask Muse").fill(message);
  const response = page.waitForResponse(
    (r) =>
      r.url().endsWith("/api/v1/agent/messages") &&
      r.request().method() === "POST",
    { timeout: 80000 },
  );
  const started = Date.now();
  await dialog.getByRole("button", { name: "Send message" }).click();
  const actual = await response;
  const body = await actual.json();
  assert.equal(actual.status(), 200);
  const turn = dialog.locator(".muse-turn").last();
  await turn.locator(".assistant-answer, .receipt-failed").first().waitFor();
  return { dialog, turn, body, model_ms: Date.now() - started };
}
let cameras, recording;
try {
  await go("/");
  cameras = (await api("/cameras")).body.items;
  const front = cameras.find((c) => c.name === "Front entrance");
  recording = (await api(`/recordings?camera_id=${front.id}`)).body.items.find(
    (r) => r.available_duration_ms >= 60000,
  );
  assert.ok(recording);
  await scenario("A", async (result) => {
    result.recording_id = recording.id;
    result.available_duration_ms = recording.available_duration_ms;
    for (let i = 0; i < 3; i++) {
      const started = Date.now();
      await page.goto(`${origin}/live?camera_id=${front.id}`, {
        waitUntil: "domcontentloaded",
      });
      await frames();
      report.metrics.live_startup_ms.push(Date.now() - started);
      await advancing();
    }
    await shot("A-live");
    // Timing fault injection: delay actual camera metadata, without fabricating a response.
    // A recording must start one export even when its camera details arrive afterwards.
    const exports = [];
    const countExports = (request) => {
      if (
        request.url().endsWith("/api/v1/playback-sessions") &&
        request.method() === "POST"
      )
        exports.push(request.postDataJSON());
    };
    page.on("request", countExports);
    await page.route("**/api/v1/cameras", async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 600));
      await route.continue();
    });
    const response = page.waitForResponse(
      (r) =>
        r.url().endsWith("/api/v1/playback-sessions") &&
        r.request().method() === "POST",
    );
    await go(`/recordings/${recording.id}?offset_ms=52000`);
    const actual = await response;
    const session = await actual.json();
    assert.equal(actual.status(), 200, JSON.stringify(session));
    await page.unroute("**/api/v1/cameras");
    page.off("request", countExports);
    result.initial_playback_export_requests = exports.length;
    result.camera_metadata_delay_ms = 600;
    assert.equal(
      exports.length,
      1,
      "Late camera metadata duplicated the recording export",
    );
    assert.equal(
      session.actual_start_offset_ms + session.seek_offset_ms,
      52000,
    );
    await frames();
    await page.waitForFunction(
      (seek) =>
        Math.abs(
          (document.querySelector("video")?.currentTime ?? -100) - seek,
        ) < 0.25,
      session.seek_offset_ms / 1000,
    );
    result.initial_seek_error_ms = await page
      .locator("video")
      .evaluate(
        (v, seek) => Math.round(Math.abs(v.currentTime * 1000 - seek)),
        session.seek_offset_ms,
      );
    await advancing();
    await page.getByLabel(/Jump to time/).fill("0:05");
    await page.getByRole("button", { name: "Go", exact: true }).click();
    await page.waitForURL(/offset_ms=5000/);
    await frames();
    await shot("A-recording-seek");
    for (let i = 0; i < 3; i++) {
      const started = Date.now();
      const response = await api("/playback-sessions", "POST", {
        recording_id: recording.id,
        offset_ms: 1000,
        duration_ms: 2000,
      });
      assert.equal(response.status, 200);
      const bytes = await page.evaluate(async (url) => {
        const response = await fetch(url, {
          headers: { Range: "bytes=0-127" },
        });
        return {
          status: response.status,
          bytes: (await response.arrayBuffer()).byteLength,
        };
      }, response.body.url);
      assert.deepEqual(bytes, { status: 206, bytes: 128 });
      report.metrics.recording_retrieval_ms.push(Date.now() - started);
    }
    await audit("recording");
  });
  await scenario("B", async (result) => {
    result.operations = [];
    for (const [prompt, expected] of [
      ["Where can I change a camera's settings?", "/cameras"],
      ["Open the live view of Front entrance.", `/live?camera_id=${front.id}`],
    ]) {
      await go("/");
      const started = Date.now();
      const { turn, body, model_ms } = await ask(prompt);
      assert.equal(body.status, "completed");
      const link = turn.locator(`a[href="${expected}"]`).first();
      await link.waitFor();
      await link.click();
      await page.waitForURL(origin + expected);
      result.operations.push({
        prompt,
        model_ms,
        completion_ms: Date.now() - started,
        route: new URL(page.url()).pathname + new URL(page.url()).search,
        receipts: body.actions.map((a) => ({
          tool: a.tool_name,
          status: a.status,
        })),
      });
    }
    await shot("B-context-navigation");
  });
  await scenario("manual_layout", async (result) => {
    await go("/layouts");
    const name = `QA manual ${Date.now().toString(36)}`;
    const started = Date.now();
    await page.getByRole("button", { name: "Create a view" }).first().click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("View name").fill(name);
    const boxes = dialog.locator(".camera-picker input[type=checkbox]");
    for (let i = 0; i < 4; i++) await boxes.nth(i).check();
    await dialog.getByRole("button", { name: "Review view" }).click();
    await dialog.getByRole("button", { name: "Save view" }).click();
    await dialog.getByRole("link", { name: /Open saved view/ }).click();
    await page.waitForURL(/\/layouts\/[0-9a-f-]{36}$/);
    result.completion_ms = Date.now() - started;
    result.layout_id = new URL(page.url()).pathname.split("/").pop();
    const stored = (await api(`/layouts/${result.layout_id}`)).body;
    assert.equal(stored.cells.length, 4);
    assert.equal(stored.columns, 2);
  });
  await scenario("C", async (result) => {
    await go("/layouts");
    const name = `QA Muse ${Date.now().toString(36)}`;
    const started = Date.now();
    const { turn, body, model_ms } = await ask(
      `Create a 2x2 saved view named "${name}" with Front entrance, Garden, Garage and Trail camera in that order.`,
    );
    result.model_ms = model_ms;
    assert.equal(body.status, "awaiting_confirmation");
    const proposal = turn.locator(".proposal-card");
    await proposal.waitFor();
    const before = (await api("/layouts")).body.items;
    assert.equal(
      before.some((v) => v.name === name),
      false,
    );
    result.absent_before_approval = true;
    await shot("C-proposal");
    await proposal.getByRole("button", { name: "Approve and save" }).click();
    const verified = turn.locator(".receipt", {
      hasText: "Saved and verified",
    });
    await verified.waitFor({ timeout: 30000 });
    await verified.getByRole("link").click();
    await page.waitForURL(/\/layouts\/[0-9a-f-]{36}$/);
    await page.getByRole("heading", { level: 1, name }).waitFor();
    result.completion_ms = Date.now() - started;
    result.layout_id = new URL(page.url()).pathname.split("/").pop();
    const stored = (await api(`/layouts/${result.layout_id}`)).body;
    assert.equal(stored.columns, 2);
    assert.deepEqual(
      stored.cells.map((c) => c.camera_id),
      [
        front.id,
        cameras.find((c) => c.name === "Garden").id,
        cameras.find((c) => c.name === "Garage").id,
        cameras.find((c) => c.name === "Trail camera").id,
      ],
    );
    await page.reload({ waitUntil: "networkidle" });
    await page.getByRole("heading", { level: 1, name }).waitFor();
    assert.equal(await page.locator(".live-tile").count(), 4);
    result.persisted_cells = 4;
    await frames();
    await shot("C-persisted-layout");
    await audit("layout");
  });
  await scenario("D", async (result) => {
    const trail = cameras.find((c) => c.name === "Trail camera");
    const source = (await api(`/recordings?camera_id=${trail.id}`)).body
      .items[0];
    await go(`/recordings/${source.id}?offset_ms=0`);
    const panel = page.locator(".indexing-panel");
    await panel.getByRole("button", { name: /searchable/ }).click();
    const response = page.waitForResponse(
      (r) =>
        r.url().endsWith("/api/v1/analysis-jobs") &&
        r.request().method() === "POST",
    );
    const started = Date.now();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Upload and analyze" })
      .click();
    const job = await (await response).json();
    await panel
      .locator(".job-done, p.camera-error")
      .first()
      .waitFor({ timeout: 240000 });
    const text = await panel
      .locator(".job-done, p.camera-error")
      .first()
      .innerText();
    result.indexing_wall_ms = Date.now() - started;
    result.job = (await api(`/analysis-jobs/${job.id}`)).body;
    assert.equal(result.job.state, "succeeded", text);
    await shot("D-indexed");
    result.queries = [];
    for (const query of [
      "a person riding a bicycle",
      "Find footage with a bicycle.",
      "Find cycling events.",
    ]) {
      await go("/search");
      await page.getByLabel("Describe a video moment").fill(query);
      const response = page.waitForResponse(
        (r) =>
          r.url().endsWith("/api/v1/search") && r.request().method() === "POST",
        { timeout: 65000 },
      );
      const started = Date.now();
      await page.getByRole("button", { name: /Find moments/ }).click();
      const actual = await response;
      const found = await actual.json();
      const elapsed = Date.now() - started;
      report.metrics.search_ms.push(elapsed);
      assert.equal(actual.status(), 200);
      assert.ok(found.items.length > 0);
      assert.ok(
        found.items.every(
          (hit) => hit.camera_id === trail.id && hit.recording_id === source.id,
        ),
      );
      result.queries.push({
        query,
        elapsed_ms: elapsed,
        hits: found.items.length,
        coverage: found.coverage,
      });
      if (result.queries.length === 1) {
        const hit = found.items[0];
        result.grounded_hit = hit;
        const response = page.waitForResponse(
          (r) =>
            r.url().endsWith("/api/v1/playback-sessions") &&
            r.request().method() === "POST",
        );
        await page
          .locator(".search-result")
          .first()
          .getByRole("link", { name: /Open at/ })
          .click();
        await page.waitForURL(/segment_id=/);
        assert.equal(
          new URL(page.url()).searchParams.get("segment_id"),
          hit.segment_id,
        );
        const playbackResponse = await response;
        const requested = playbackResponse.request().postDataJSON();
        assert.equal(requested.segment_id, hit.segment_id);
        const session = await playbackResponse.json();
        assert.equal(
          session.actual_start_offset_ms + session.seek_offset_ms,
          hit.offset_ms,
        );
        await frames();
        await page.waitForFunction(
          (seek) =>
            Math.abs(
              (document.querySelector("video")?.currentTime ?? -100) - seek,
            ) < 0.25,
          session.seek_offset_ms / 1000,
        );
        result.player_seek_error_ms = await page
          .locator("video")
          .evaluate(
            (v, seek) => Math.round(Math.abs(v.currentTime * 1000 - seek)),
            session.seek_offset_ms,
          );
        await advancing();
        await shot("D-grounded-playback");
      }
    }
    await audit("search");
  });
  await scenario("Muse_search", async (result) => {
    assert.equal(report.scenarios.D.status, "passed");
    await go("/");
    const { turn, body, model_ms } = await ask(
      "Find footage with a bicycle on Trail camera.",
    );
    result.response = body;
    assert.equal(body.status, "completed");
    const navigation = body.suggested_actions.find(
      (item) => item.target.kind === "recording",
    );
    assert.ok(
      navigation?.target.segment_id,
      "Muse dropped the grounded segment",
    );
    const target = navigation.target;
    const expected = `/recordings/${target.recording_id}?offset_ms=${target.offset_ms}&segment_id=${target.segment_id}`;
    const response = page.waitForResponse(
      (r) =>
        r.url().endsWith("/api/v1/playback-sessions") &&
        r.request().method() === "POST",
    );
    await turn.locator(`a[href="${expected}"]`).first().click();
    await page.waitForURL(origin + expected);
    const actual = await response;
    assert.equal(actual.request().postDataJSON().segment_id, target.segment_id);
    assert.equal(actual.status(), 200);
    await frames();
    await advancing();
    result.model_ms = model_ms;
    result.target = target;
    result.actual_route =
      new URL(page.url()).pathname + new URL(page.url()).search;
    await shot("Muse-exact-segment-playback");
  });
  await scenario("E", async (result) => {
    const offline = cameras.find((c) => c.name === "Trail camera");
    await go(`/live?camera_id=${offline.id}`);
    await page
      .locator(".player-empty, .player-state[role=alert]")
      .first()
      .waitFor();
    assert.equal(await page.locator("video").count(), 0);
    result.offline_video_count = 0;
    const empty = await api("/search", "POST", { query: "", limit: 10 });
    assert.equal(empty.status, 422);
    result.empty_query_status = empty.status;
    const missing = await api(
      "/recordings/00000000-0000-4000-8000-000000000099",
    );
    assert.equal(missing.status, 404);
    result.missing_recording_status = missing.status;
    const cross = await page.request.get(origin + "/api/v1/cameras", {
      headers: { Origin: "https://untrusted.invalid" },
    });
    assert.equal(cross.status(), 403);
    result.cross_origin_status = cross.status();
    const unknown = await api("/arbitrary-http");
    assert.equal(unknown.status, 404);
    result.unknown_proxy_path_status = unknown.status;
    const noHit = await api("/search", "POST", {
      query: "Find a dog running.",
      limit: 10,
    });
    assert.equal(noHit.status, 200);
    assert.equal(noHit.body.items.length, 0);
    result.no_match = {
      status: noHit.status,
      count: 0,
      coverage: noHit.body.coverage,
    };
    await shot("E-offline");
  });
  await scenario("responsive", async (result) => {
    result.routes = [];
    for (const width of [390, 834]) {
      await page.setViewportSize({ width, height: 900 });
      for (const route of [
        "/",
        "/cameras",
        "/recordings",
        "/search",
        "/layouts",
        "/settings",
      ]) {
        await go(route);
        assert.equal(
          await page.evaluate(
            () => document.documentElement.scrollWidth > innerWidth + 1,
          ),
          false,
        );
        result.routes.push({ width, route });
      }
    }
    await audit("mobile-settings");
  });
} catch (error) {
  report.setup_error = String(error.message).slice(0, 600);
} finally {
  report.status =
    !report.setup_error &&
    !report.page_errors.length &&
    Object.values(report.scenarios).every((s) => s.status === "passed") &&
    report.accessibility.every((a) => !a.violations.length)
      ? "passed"
      : "failed";
  await save();
  await browser.close();
}
process.exitCode = report.status === "passed" ? 0 : 1;
