// Real backend/media integration through the unchanged frontend's same-origin adapter.
import { chromium } from "playwright";
import { readFile, writeFile } from "node:fs/promises";
import { openSync, closeSync } from "node:fs";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { dirname } from "node:path";

const connectionPath = process.argv[2];
const recordingId = process.argv[3];
const config = JSON.parse(await readFile(connectionPath, "utf8"));
if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(config.api_url)) throw new Error("Local probe only");
if (!/^[a-f0-9-]{36}$/.test(recordingId)) throw new Error("Invalid recording ID");
const runtime = dirname(connectionPath);
const temporary = createServer();
await new Promise(resolve => temporary.listen(0, "127.0.0.1", resolve));
const port = temporary.address().port;
await new Promise(resolve => temporary.close(resolve));
const origin = `http://127.0.0.1:${port}`;
const log = openSync(`${runtime}/web.log`, "a");
const web = spawn("node", ["node_modules/next/dist/bin/next", "start", "apps/web", "--hostname", "127.0.0.1", "--port", String(port)], {
  env: { ...process.env, API_INTERNAL_URL: config.api_url, VEYRA_DEV_TOKEN: config.operator_token, WEB_ORIGIN: origin, NEXT_TELEMETRY_DISABLED: "1" },
  stdio: ["ignore", log, log],
});
let browser;
const result = { status: "failed", source: "Unmodified Phase 02 Next.js UI + real Phase 03 API/media" };
try {
  const deadline = Date.now() + 30000;
  while (true) {
    try { if ((await fetch(origin)).ok) break; } catch {}
    if (Date.now() > deadline) throw new Error("Next did not become ready");
    await new Promise(resolve => setTimeout(resolve, 300));
  }
  const layoutResponse = await fetch(`${config.api_url}/api/v1/layouts`, { headers: { Authorization: `Bearer ${config.operator_token}` } });
  const layout = (await layoutResponse.json()).items[0];
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await page.goto(`${origin}/layouts/${layout.id}`);
  await page.getByRole("button", { name: "2 by 2 camera layout", exact: true }).click();
  await page.waitForFunction(() => document.querySelectorAll("video").length === 4);
  await page.locator("video").evaluateAll(async videos => {
    for (const video of videos) { video.muted = true; await video.play(); }
  });
  await page.waitForFunction(() => [...document.querySelectorAll("video")].every(v => v.videoWidth === 640 && v.currentTime > 1 && !v.error), undefined, { timeout: 25000 });
  const before = await page.locator("video").evaluateAll(videos => videos.map(v => v.currentTime));
  await page.waitForTimeout(1000);
  result.live = await page.locator("video").evaluateAll(videos => videos.map(v => ({
    width: v.videoWidth, height: v.videoHeight, time: v.currentTime, readyState: v.readyState, error: v.error?.message ?? null,
  })));
  if (!result.live.every((v, i) => v.time > before[i])) throw new Error("Live video did not advance");
  await page.screenshot({ path: `${runtime}/browser-live.png`, fullPage: true });
  const sessionResponse = page.waitForResponse(r => r.url().endsWith("/api/v1/playback-sessions") && r.request().method() === "POST");
  await page.goto(`${origin}/recordings/${recordingId}?offset_ms=52000`);
  const response = await sessionResponse;
  if (!response.ok()) {
    const failure = await response.json();
    result.playbackFailure = { status: response.status(), code: failure.error?.code ?? "UNKNOWN" };
    throw new Error(`Playback session failed: ${result.playbackFailure.code}`);
  }
  const session = await response.json();
  const expectedTime = session.seek_offset_ms / 1000;
  if (session.actual_start_offset_ms + session.seek_offset_ms !== 52000) throw new Error("Wrong timestamp mapping");
  await page.waitForFunction(expected => { const v = document.querySelector("video"); return v && v.readyState >= 2 && !v.seeking && Math.abs(v.currentTime - expected) < .25; }, expectedTime, { timeout: 25000 });
  result.requestedOffsetMs = 52000;
  result.initialTime = await page.locator("video").evaluate(v => v.currentTime);
  result.actualStartOffsetMs = session.actual_start_offset_ms;
  result.seekOffsetMs = session.seek_offset_ms;
  if (Math.abs(result.initialTime - expectedTime) > .25) throw new Error("Wrong requested moment");
  await page.locator("video").evaluate(async v => { v.muted = true; await v.play(); });
  await page.waitForFunction(expected => document.querySelector("video").currentTime > expected + 1, expectedTime, { timeout: 10000 });
  await page.locator("video").evaluate(v => { v.pause(); v.currentTime = 5; });
  await page.waitForFunction(() => { const v = document.querySelector("video"); return !v.seeking && Math.abs(v.currentTime - 5) < .25 && v.readyState >= 2; }, undefined, { timeout: 10000 });
  result.playback = await page.locator("video").evaluate(v => ({
    width: v.videoWidth, height: v.videoHeight, currentTime: v.currentTime, duration: v.duration,
    seekable: Array.from({ length: v.seekable.length }, (_, i) => [v.seekable.start(i), v.seekable.end(i)]), error: v.error?.message ?? null,
  }));
  await page.screenshot({ path: `${runtime}/browser-playback.png`, fullPage: true });
  result.status = "passed";
} catch (error) {
  result.error = error.message;
  throw error;
} finally {
  if (browser) await browser.close();
  web.kill("SIGTERM");
  await new Promise(resolve => { web.once("exit", resolve); setTimeout(resolve, 5000); });
  if (web.exitCode === null) web.kill("SIGKILL");
  closeSync(log);
  await writeFile(`${runtime}/browser.json`, JSON.stringify(result, null, 2) + "\n");
  console.log(JSON.stringify(result));
}
