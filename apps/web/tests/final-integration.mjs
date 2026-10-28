// Real production UI + real FastAPI/PostgreSQL/media. Provider/interpretation is SCRIPTED
// only on final_rc.py's dedicated :3701 server. No browser API response is mocked here.
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";
import AxeBuilder from "@axe-core/playwright";

const base = process.env.VEYRA_QA_URL ?? "http://127.0.0.1:3701";
assert.equal(new URL(base).hostname, "127.0.0.1");
assert.equal(new URL(base).port, "3701", "Mutations are restricted to the disposable release QA UI");
const stamp = new Date().toISOString().replaceAll(/[:.]/g, "-");
const out = path.resolve(process.argv[2] ?? `../../docs/qa/final/e2e/${stamp}`);
await mkdir(out, { recursive: true });
const report = { base, started_at: new Date().toISOString(), provider: "scripted HTTP and scripted interpretation; NOT live Muse", database: "real isolated snapshot", media: "real licensed replay and finalized recordings", tests: [], network: [], page_errors: [], paid_calls: 0 };
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, timezoneId: "America/Los_Angeles" });
await context.route("**/*", (route) => {
  const url = new URL(route.request().url());
  if (url.protocol.startsWith("http") && url.origin !== base) throw new Error(`External browser request refused: ${url.origin}`);
  if (/\/analysis-jobs$/.test(url.pathname) && route.request().method() === "POST") return route.abort();
  return route.continue();
});
const page = await context.newPage();
page.on("pageerror", (e) => report.page_errors.push(e.message));
page.on("request", (req) => {
  const url = new URL(req.url());
  if (url.pathname.startsWith("/api/v1/")) report.network.push({ method: req.method(), path: url.pathname });
});
const shot = (name) => page.screenshot({ path: path.join(out, `${name}.png`) });
const api = async (route, body, method = body ? "POST" : "GET", key = crypto.randomUUID()) => {
  const response = await fetch(base + "/api/v1" + route, { method, headers: { Origin: base, "Content-Type": "application/json", "Idempotency-Key": key }, body: body ? JSON.stringify(body) : undefined });
  return { status: response.status, body: await response.json().catch(() => null) };
};
const playing = async (minimum = 1) => {
  await page.waitForFunction((n) => [...document.querySelectorAll("video")].filter(v => v.readyState >= 2 && v.currentTime > 0.1).length >= n, minimum, { timeout: 45000 });
  const before = await page.locator("video").first().evaluate(v => v.currentTime);
  await page.waitForTimeout(650);
  assert((await page.locator("video").first().evaluate(v => v.currentTime)) > before);
};
const count = (expression) => report.network.filter(r => r.method === "POST" && expression.test(r.path)).length;
async function test(name, fn) {
  const start = Date.now();
  try { const evidence = await fn(); report.tests.push({ name, status: "PASS", elapsed_ms: Date.now() - start, evidence }); console.log("PASS " + name); }
  catch (error) { await shot("failure-" + report.tests.length).catch(() => {}); report.tests.push({ name, status: "FAIL", error: error.message }); console.log("FAIL " + name + ": " + error.message); }
  await writeFile(path.join(out, "results.json"), JSON.stringify(report, null, 2) + "\n");
}
const cameras = (await api("/cameras")).body.items;
const real = cameras.filter(c => c.source_media?.kind === "prerecorded");
const ids = real.slice(0, 4).map(c => c.id);
let saved;
const name = "Final PUT " + stamp.slice(11, 19);
await test("Camera registration persists and its licensed stream plays", async () => {
  await page.goto(base + "/cameras");
  await page.getByRole("button", { name: "Connect a camera", exact: true }).first().click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Camera name", { exact: true }).fill("Release QA platform");
  const sources = (await api("/camera-sources")).body.items;
  const source = sources.find(s => s.source_media?.kind === "prerecorded" && !cameras.some(c => c.source_id === s.id));
  assert(source, "A dedicated unregistered licensed source must be available");
  await dialog.getByLabel("Approved source", { exact: true }).selectOption(source.id);
  const persisted = page.waitForResponse(r => r.request().method() === "POST" && new URL(r.url()).pathname === "/api/v1/cameras");
  await dialog.getByRole("button", { name: "Connect camera", exact: true }).click();
  const response = await persisted;
  assert.equal(response.status(), 201);
  const camera = await response.json();
  assert.equal((await api(`/cameras/${camera.id}`)).body.name, "Release QA platform");
  await dialog.getByRole("link", { name: /Open live view/ }).click();
  await playing(); await shot("01-registered-stream");
  return { camera_id: camera.id, source: source.source_media.title, frames_advanced: true };
});
await test("Real layout POST and UI PUT persist exact assignments and version after reload", async () => {
  const created = await api("/layouts", { name, columns: 2, cells: ids.slice(0, 2).map((camera_id, position) => ({ camera_id, position })) });
  assert.equal(created.status, 201); saved = created.body;
  const original = (await api(`/layouts/${saved.id}`)).body;
  await page.goto(base + `/layouts/${saved.id}`);
  await page.getByRole("button", { name: "Edit view", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("View name", { exact: true }).fill(name + " updated");
  await dialog.locator(".view-picker button").filter({ hasText: real[2].name }).click();
  await dialog.getByRole("button", { name: "Review view", exact: true }).click();
  const put = page.waitForResponse(r => r.request().method() === "PUT" && r.url().includes(saved.id));
  await dialog.getByRole("button", { name: "Replace view", exact: true }).click();
  const response = await put; assert.equal(response.status(), 200);
  saved = await response.json();
  assert.equal(saved.version, original.version + 1);
  assert.deepEqual(saved.cells.map(c => c.camera_id), ids.slice(0, 3));
  assert.deepEqual((await api(`/layouts/${saved.id}`)).body, saved);
  await dialog.getByRole("link", { name: "Open view", exact: false }).click();
  await page.reload(); await playing(3);
  assert.equal(await page.locator(".live-tile").count(), 3);
  await shot("02-real-put-reloaded");
  const stale = await api(`/layouts/${saved.id}`, { name: "Must not persist", columns: 1, cells: saved.cells, expected_version: original.version }, "PUT");
  assert.equal(stale.status, 409); assert.equal(stale.body.error.code, "VERSION_CONFLICT");
  assert.deepEqual((await api(`/layouts/${saved.id}`)).body, saved);
  return { layout_id: saved.id, version: saved.version, stale_status: stale.status, persisted_cells: saved.cells };
});
async function ask(text) {
  if (!await page.getByRole("dialog").count()) await page.getByRole("button", { name: "Ask Muse", exact: true }).first().click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Ask Muse", { exact: true }).fill(text);
  const response = page.waitForResponse(r => r.request().method() === "POST" && r.url().endsWith("/agent/messages"));
  await dialog.getByRole("button", { name: /Send message/ }).click();
  const result = await response;
  assert.equal(result.status(), 200);
  await dialog.locator(".assistant-answer").last().waitFor();
  return { dialog, turn: dialog.locator(".muse-turn").last(), response: await result.json() };
}
await test("Muse clarification and camera choice fill the composer without another request", async () => {
  await page.goto(base + "/layouts");
  const result = await ask("Create a view with my cameras.");
  assert.equal(result.response.interaction_state, "clarification_required");
  assert.equal(result.response.confirmation_request, null);
  const before = count(/\/agent\/messages$/);
  await result.turn.locator(".muse-candidates button").first().click();
  await page.waitForTimeout(500);
  assert.equal(count(/\/agent\/messages$/), before);
  assert((await result.dialog.getByLabel("Ask Muse", { exact: true }).inputValue()).includes(real[0].name));
  await shot("03-clarification-prefill");
  return { choices: result.response.camera_candidates.length, additional_requests_on_choice: 0 };
});
await test("Muse proposal → approval → real tool write → independent verification → one final receipt", async () => {
  const layoutName = "Final Muse " + stamp.slice(11, 19);
  const result = await ask(`Create a 2x2 view named "${layoutName}" with ${real.slice(0, 4).map(c => c.name).join(", ")}.`);
  assert.equal(result.response.interaction_state, "awaiting_confirmation");
  assert(!(await api("/layouts")).body.items.some(l => l.name === layoutName));
  await shot("04-proposal-before-save");
  const confirmation = page.waitForResponse(r => r.request().method() === "POST" && /\/agent\/confirmations\//.test(r.url()));
  await result.turn.getByRole("button", { name: "Approve and save", exact: true }).dblclick({ delay: 5 }).catch(() => {});
  const response = await confirmation; assert.equal(response.status(), 200);
  const receipt = await response.json();
  await result.turn.getByText("Saved and verified", { exact: true }).waitFor();
  assert.equal(receipt.interaction_state, "completed_verified");
  const layout = receipt.verified_results[0].layout;
  assert.deepEqual((await api(`/layouts/${layout.id}`)).body, layout);
  const visibleText = await result.turn.evaluate(el => el.innerText);
  for (const old of ["No layout has been created", "nothing saved yet", "Waiting for your approval"]) assert(!visibleText.includes(old), old);
  assert.equal((await api("/layouts")).body.items.filter(l => l.name === layoutName).length, 1);
  await shot("05-verified-receipt");
  await result.turn.getByRole("link", { name: "Open saved layout" }).click();
  await playing(4); await shot("06-agent-created-view");
  return { layout_id: layout.id, independent_get_matches: true, persisted_count: 1, provider: "scripted; current live provider NOT tested" };
});
await test("Muse decline and missing camera are honest, nonmutating terminal outcomes", async () => {
  await page.goto(base + "/layouts");
  const before = (await api("/layouts")).body.items.length;
  const result = await ask(`Create a view named "Final declined" with ${real[0].name}, ${real[1].name}.`);
  const response = page.waitForResponse(r => /\/agent\/confirmations\//.test(r.url()) && r.request().method() === "POST");
  await result.turn.getByRole("button", { name: "Decline", exact: true }).click();
  assert.equal((await (await response).json()).interaction_state, "rejected");
  await result.turn.getByText("Declined · nothing changed", { exact: true }).waitFor();
  assert.equal((await api("/layouts")).body.items.length, before);
  const missing = await ask("Open Basement camera");
  assert(missing.response.errors.some(e => e.code === "CAMERA_NOT_FOUND"));
  await shot("07-declined-and-missing");
  return { declined_without_write: true, missing_camera: "CAMERA_NOT_FOUND" };
});
await test("Natural-language parse is submitted once; camera/time/Back/reload reuse exact stored criteria", async () => {
  await page.goto(base + "/explore");
  await page.locator(".ws-result").first().waitFor();
  const before = count(/\/search$/);
  await page.locator("#explore-ask").fill("people walking");
  await page.getByRole("button", { name: "Ask Muse, uses 1 request", exact: true }).click();
  await page.locator(".ws-understood").waitFor();
  await page.locator(".ws-result").first().waitFor();
  assert.equal(count(/\/search$/), before + 1);
  assert(!page.url().includes("people") && !page.url().includes("q="));
  const scope = await page.locator(".ws-result").first().getAttribute("data-camera");
  const select = page.locator(".ws-filters select").first();
  const options = await select.locator("option").evaluateAll(opts => opts.map(o => ({ value: o.value, label: o.textContent })));
  const personCamera = options.find(o => o.label.includes("Community"));
  if (personCamera) await select.selectOption(personCamera.value);
  await page.waitForTimeout(1200);
  await select.selectOption("all"); await page.waitForTimeout(1200);
  const fit = page.getByRole("button", { name: /Fit to moments|^Fit$/ });
  if (await fit.count()) { await fit.first().click(); await page.waitForTimeout(700); }
  await page.locator(".ws-result").first().waitFor();
  await playing(); await shot("08-search-evidence");
  const link = page.getByRole("link", { name: /^Open in recording at/ }).first();
  const href = await link.getAttribute("href");
  assert(href.includes("segment_id="));
  await link.click(); await playing();
  assert(page.url().includes("segment_id=")); await shot("09-exact-playback");
  await page.goBack(); await page.locator(".ws-understood").waitFor();
  await page.reload(); await page.locator(".ws-understood").waitFor();
  assert.equal(count(/\/search$/), before + 1);
  return { submitted_parses: 1, additional_parses_after_refinements_back_reload: 0, playback_href: href, scope };
});
await test("Unknown legacy footage stays accessible explicitly and outside curated search", async () => {
  const historic = "05636b39-cb53-59a1-aa49-4a117421ea4d";
  const recording = await api(`/recordings/${historic}`);
  assert.equal(recording.status, 200); assert.equal(recording.body.source_media, null);
  const results = await api("/index-query", { start: "2026-10-27T00:00:00Z", end: "2026-10-28T00:00:00Z", curated_only: true, limit: 50 });
  assert.equal(results.status, 200);
  assert(results.body.items.length > 0);
  assert(results.body.items.every(h => h.recording_id !== historic));
  return { legacy_preserved: true, curated_results: results.body.items.length, coverage: results.body.coverage, analyzed_ms: results.body.analyzed_ms, available_ms: results.body.available_ms };
});
await test("Suggestion chips, contextual actions and local palette navigation spend no requests", async () => {
  const before = count(/\/agent\/messages$|\/search$/);
  for (const route of ["/", "/cameras", "/recordings", "/live", "/layouts", "/settings"]) {
    await page.goto(base + route); await page.waitForTimeout(400);
    await page.getByRole("button", { name: "Ask Muse", exact: true }).first().click();
    const dialog = page.getByRole("dialog");
    await dialog.locator(".muse-prompts button").first().click();
    assert((await dialog.getByLabel("Ask Muse", { exact: true }).inputValue()).length > 0);
    await page.keyboard.press("Escape");
  }
  await page.keyboard.press("Meta+k");
  await page.getByLabel("Search commands").fill("garden");
  const local = page.getByRole("option").filter({ hasText: "No request" }).first();
  await local.click(); await page.waitForTimeout(600);
  assert.equal(count(/\/agent\/messages$|\/search$/), before);
  return { checked_routes: 6, additional_paid_entry_requests: 0 };
});
await test("No-match and timeline evidence are honest", async () => {
  await page.goto(base + "/explore");
  await page.locator("#explore-ask").fill("a dog running");
  await page.getByRole("button", { name: "Ask Muse, uses 1 request", exact: true }).click();
  await page.getByText(/doesn’t prove it didn’t happen/).waitFor();
  assert.equal(await page.locator(".ws-result").count(), 0);
  await page.goto(base + "/events");
  await page.locator(".log-row").first().waitFor();
  await page.locator(".log-row").first().getByRole("button", { name: "Watch", exact: true }).click();
  await playing(); await shot("10-timeline-event-playback");
  return { no_match_without_fabrication: true, selected_event_video_advanced: true };
});
await test("Current essential dialog accessibility", async () => {
  await page.goto(base + "/layouts");
  await page.getByRole("button", { name: "Ask Muse", exact: true }).first().click();
  const axe = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
  assert.deepEqual(axe.violations.map(v => ({ id: v.id, impact: v.impact })), []);
  await page.keyboard.press("Tab");
  assert(await page.getByRole("dialog").evaluate(el => el.contains(document.activeElement)));
  await page.keyboard.press("Escape");
  return { axe_violations: 0, keyboard_focus_contained: true };
});
report.finished_at = new Date().toISOString();
report.status = report.tests.every(t => t.status === "PASS") && !report.page_errors.length ? "PASS" : "FAIL";
await writeFile(path.join(out, "results.json"), JSON.stringify(report, null, 2) + "\n");
await browser.close();
console.log(JSON.stringify({ out, status: report.status, passed: report.tests.filter(t => t.status === "PASS").length, failed: report.tests.filter(t => t.status === "FAIL").length, page_errors: report.page_errors }));
process.exitCode = report.status === "PASS" ? 0 : 1;
