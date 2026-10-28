// One controlled LIVE Meta Muse session (real provider, paid) against the disposable stack
// started by `scripts/final_rc.py --live-muse-requests 4 --port 3710`.
// Refuses to run unless the server reports a hard cap of <= 4 admitted model requests and an
// empty ledger. No retries: any unexpected state stops the run. Analysis jobs are blocked.
// Usage: node tests/live-muse-verification.mjs <out-dir>
import assert from "node:assert/strict";
import { mkdir, readdir, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const base = "http://127.0.0.1:3710";
const out = path.resolve(process.argv[2] ?? "live-muse");
await mkdir(out, { recursive: true });
const api = async (route, body, method = body ? "POST" : "GET") => {
  const response = await fetch(base + "/api/v1" + route, {
    method,
    headers: {
      Origin: base,
      "Content-Type": "application/json",
      "Idempotency-Key": crypto.randomUUID(),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return {
    status: response.status,
    body: await response.json().catch(() => null),
  };
};
const report = {
  base,
  live: true,
  started_at: new Date().toISOString(),
  tests: [],
};
const save = () =>
  writeFile(
    path.join(out, "results.json"),
    JSON.stringify(report, null, 2) + "\n",
  );

const before = (await api("/analysis-usage")).body;
report.usage_before = before;
assert.equal(before.requests, 0, "ledger must start empty for this UTC day");
assert(
  before.daily_request_limit <= 4,
  "server-side cap must be <= 4 requests",
);
assert(before.admission_enabled, "admission must be enabled");

const size = { width: 1440, height: 900 };
const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: size,
  timezoneId: "America/Los_Angeles",
  recordVideo: { dir: out, size },
});
const provider = [];
await context.route("**/*", (route) => {
  const request = route.request();
  const url = new URL(request.url());
  if (url.protocol.startsWith("http") && url.origin !== base)
    return route.abort();
  if (
    /\/analysis-jobs|\/index$/.test(url.pathname) &&
    request.method() !== "GET"
  )
    return route.abort();
  if (/\/(agent\/messages|agent\/confirmations\/.+|search)$/.test(url.pathname))
    provider.push({
      method: request.method(),
      path: url.pathname,
      at: Date.now(),
    });
  return route.continue();
});
const page = await context.newPage();
const advancing = async (scope, minimum = 1) => {
  await page.waitForFunction(
    ([s, n]) =>
      [...document.querySelectorAll(`${s} video`)].filter(
        (v) => v.readyState >= 2 && v.currentTime > 0.2 && !v.paused,
      ).length >= n,
    [scope, minimum],
    { timeout: 45000 },
  );
  const t0 = await page.$$eval(`${scope} video`, (v) =>
    v.map((x) => x.currentTime),
  );
  await page.waitForTimeout(800);
  const t1 = await page.$$eval(`${scope} video`, (v) =>
    v.map((x) => x.currentTime),
  );
  const moved = t1.filter((t, i) => t > t0[i]).length;
  assert(moved >= minimum, `${moved} videos advanced`);
  return moved;
};

// Test B first: exactly one search-parse request.
try {
  await page.goto(base + "/explore", { waitUntil: "domcontentloaded" });
  await page.locator("button.ws-result").first().waitFor({ timeout: 30000 });
  const query = "squirrels at the feeder";
  await page.locator("#explore-ask").fill(query);
  const parsed = page.waitForResponse(
    (r) =>
      r.request().method() === "POST" &&
      new URL(r.url()).pathname === "/api/v1/search",
    { timeout: 90000 },
  );
  const started = Date.now();
  await page
    .getByRole("button", { name: "Ask Muse, uses 1 request", exact: true })
    .click();
  const response = await parsed;
  const latency = Date.now() - started;
  const body = await response.json();
  assert.equal(response.status(), 200, JSON.stringify(body).slice(0, 300));
  await page.locator(".ws-understood").waitFor();
  await page.locator("button.ws-result").first().waitFor();
  const understood = await page.locator(".ws-understood").innerText();
  const top = body.items?.[0];
  assert(top, "Muse returned no indexed evidence");
  await page.screenshot({ path: path.join(out, "b1-search-understood.png") });
  const link = page
    .getByRole("link", { name: /^Open in recording at/ })
    .first();
  const href = await link.getAttribute("href");
  await link.click();
  await page.waitForURL(/\/recordings\/.+segment_id=/);
  const moved = await advancing(".recording-main");
  const recordingId = new URL(href, base).pathname.split("/").pop();
  const segmentId = new URL(href, base).searchParams.get("segment_id");
  const recording = (await api(`/recordings/${recordingId}`)).body;
  const segments = (await api(`/recordings/${recordingId}/segments`)).body;
  const camera = (await api(`/cameras/${recording.camera_id}`)).body;
  await page.screenshot({ path: path.join(out, "b2-evidence-playback.png") });
  report.tests.push({
    name: "B · live natural-language video search → evidence playback",
    status: "PASS",
    query,
    http_latency_ms: latency,
    server_latency_ms: body.latency_ms ?? null,
    constraints: body.constraints,
    understood,
    results: body.items.length,
    top_hit: {
      camera: top.camera_name ?? top.camera_id,
      summary: top.summary,
      start: top.start,
    },
    opened: {
      href,
      camera: camera.name,
      segment_in_recording: JSON.stringify(segments).includes(segmentId),
    },
    videos_advanced: moved,
  });
} catch (error) {
  report.tests.push({ name: "B", status: "FAIL", error: error.message });
}
await save();

// Test A: agentic layout creation with approval. No resend on any unexpected outcome.
try {
  await page.goto(base + "/layouts", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1500);
  const name = "Live Muse check";
  assert(!(await api("/layouts")).body.items.some((l) => l.name === name));
  await page
    .getByRole("button", { name: "Ask Muse", exact: true })
    .first()
    .click();
  const dialog = page.getByRole("dialog");
  const text = `Create a 2x2 view named "${name}" with Entrance gate, Street approach, Community space and Bicycle parking.`;
  await dialog.getByLabel("Ask Muse", { exact: true }).fill(text);
  const sent = page.waitForResponse(
    (r) =>
      r.request().method() === "POST" && r.url().endsWith("/agent/messages"),
    { timeout: 120000 },
  );
  const started = Date.now();
  await dialog.getByRole("button", { name: /Send message/ }).click();
  const response = await sent;
  const latency = Date.now() - started;
  const proposal = await response.json();
  report.tests.push({
    name: "A1 · proposal",
    http_status: response.status(),
    http_latency_ms: latency,
    interaction_state: proposal.interaction_state,
    status: proposal.status,
    message: proposal.message,
    actions: proposal.actions?.map((a) => ({
      tool: a.tool_name,
      status: a.status,
    })),
    errors: proposal.errors,
  });
  await save();
  assert.equal(response.status(), 200);
  assert.equal(proposal.interaction_state, "awaiting_confirmation");
  const planned = proposal.confirmation_request.layout;
  const cameras = (await api("/cameras")).body.items;
  const plannedNames = planned.cells.map(
    (c) => cameras.find((x) => x.id === c.camera_id)?.name,
  );
  assert(
    !(await api("/layouts")).body.items.some((l) => l.name === name),
    "saved before approval",
  );
  const turn = dialog.locator(".muse-turn").last();
  await turn
    .getByRole("button", { name: "Approve and save", exact: true })
    .waitFor();
  await page.waitForTimeout(1500);
  await page.screenshot({ path: path.join(out, "a1-proposal.png") });
  const confirmed = page.waitForResponse(
    (r) =>
      r.request().method() === "POST" &&
      /\/agent\/confirmations\//.test(r.url()),
    { timeout: 120000 },
  );
  const approvedAt = Date.now();
  await turn
    .getByRole("button", { name: "Approve and save", exact: true })
    .click();
  const decision = await confirmed;
  const receipt = await decision.json();
  const approveLatency = Date.now() - approvedAt;
  assert.equal(decision.status(), 200, JSON.stringify(receipt).slice(0, 300));
  assert.equal(receipt.interaction_state, "completed_verified");
  await turn.getByText("Saved and verified", { exact: true }).waitFor();
  const layout = receipt.verified_results[0].layout;
  const stored = (await api(`/layouts/${layout.id}`)).body;
  assert.deepEqual(stored, layout);
  assert.equal(
    (await api("/layouts")).body.items.filter((l) => l.name === name).length,
    1,
  );
  const visible = await turn.evaluate((el) => el.innerText);
  const contradictions = [
    "No layout has been created",
    "nothing saved yet",
    "Waiting for your approval",
    "Executing approved change",
  ].filter((s) => visible.includes(s));
  assert.deepEqual(contradictions, []);
  await page.waitForTimeout(1500);
  await page.screenshot({ path: path.join(out, "a2-verified-receipt.png") });
  await turn.getByRole("link", { name: "Open saved layout" }).click();
  const moved = await advancing(".wall", planned.cells.length);
  await page.screenshot({ path: path.join(out, "a3-view-playing.png") });
  report.tests.push({
    name: "A · live agentic layout creation with approval",
    status: "PASS",
    planned_cameras: plannedNames,
    columns: planned.columns,
    approval_latency_ms: approveLatency,
    receipt_state: receipt.interaction_state,
    receipt_message: receipt.message,
    persisted: {
      id: stored.id,
      version: stored.version,
      cells: stored.cells.length,
    },
    independent_get_matches: true,
    contradictions: 0,
    videos_advanced: moved,
  });
} catch (error) {
  report.tests.push({ name: "A", status: "FAIL", error: error.message });
}

const video = page.video();
await context.close();
await browser.close();
await rename(await video.path(), path.join(out, "live-muse-session.webm"));
report.browser_provider_requests = provider;
report.usage_after = (await api("/analysis-usage")).body;
report.finished_at = new Date().toISOString();
await save();
console.log(
  JSON.stringify(
    {
      tests: report.tests.map((t) => [t.name, t.status ?? t.interaction_state]),
      usage: report.usage_after,
    },
    null,
    1,
  ),
);
assert((await readdir(out)).includes("results.json"));
