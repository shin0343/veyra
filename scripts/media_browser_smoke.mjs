// Technical feasibility probe, outside the product UI. Uses MediaMTX's own HLS page.
import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";

const mode = process.argv[2] ?? "live";
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
try {
  if (mode === "live") {
    await page.goto("http://127.0.0.1:18888/pull-probe", { waitUntil: "domcontentloaded" });
  } else if (mode === "playback-direct") {
    const mediaUrl = process.argv[3];
    if (!mediaUrl?.startsWith("http://127.0.0.1:19996/get?")) throw new Error("Local probe only");
    await page.goto("http://127.0.0.1:18888/pull-probe", { waitUntil: "domcontentloaded" });
    // Move to the playback origin to avoid an unrelated CORS policy in this standalone probe.
    await page.goto("http://127.0.0.1:19996/list?path=pull-probe");
    await page.setContent('<video id="probe" controls muted></video>');
    await page.locator("video").evaluate((video, url) => { video.src = url; }, mediaUrl);
  } else {
    await page.goto("http://127.0.0.1:19995", { waitUntil: "domcontentloaded" });
  }
  await page.locator("video").evaluate(async (video) => {
    video.muted = true;
    await video.play();
  });
  await page.waitForFunction(() => {
    const v = document.querySelector("video");
    return v && v.readyState >= 2 && v.videoWidth > 0 && v.currentTime > 1;
  }, undefined, { timeout: 20000 });
  const before = await page.locator("video").evaluate(v => v.currentTime);
  await page.waitForTimeout(1200);
  const result = await page.locator("video").evaluate(v => ({
    currentTime: v.currentTime, width: v.videoWidth, height: v.videoHeight,
    readyState: v.readyState, error: v.error?.message ?? null,
    duration: Number.isFinite(v.duration) ? v.duration : String(v.duration),
    seekable: Array.from({length: v.seekable.length}, (_,i) => [v.seekable.start(i), v.seekable.end(i)]),
  }));
  if (result.currentTime <= before || result.error) throw new Error("Video did not advance");
  if (mode.startsWith("playback")) {
    await page.locator("video").evaluate(v => { v.pause(); v.currentTime = 2; });
    await page.waitForFunction(() => {
      const v = document.querySelector("video");
      return v && !v.seeking && Math.abs(v.currentTime - 2) < 0.25 && v.readyState >= 2;
    }, undefined, { timeout: 10000 });
    result.seekToSeconds = 2;
    result.actualSeekSeconds = await page.locator("video").evaluate(v => v.currentTime);
  }
  await mkdir("runtime/feasibility/media", { recursive: true });
  await writeFile(`runtime/feasibility/media/browser-${mode}.json`, JSON.stringify(result, null, 2));
  console.log(JSON.stringify({ mode, status: "passed", ...result }));
} catch (error) {
  const diagnostic = await page.locator("video").evaluate(v => ({
    currentTime: v.currentTime, readyState: v.readyState, seeking: v.seeking,
    duration: String(v.duration), error: v.error?.message ?? null,
    buffered: Array.from({length:v.buffered.length}, (_,i) => [v.buffered.start(i), v.buffered.end(i)]),
    seekable: Array.from({length:v.seekable.length}, (_,i) => [v.seekable.start(i), v.seekable.end(i)]),
  })).catch(() => null);
  console.error(JSON.stringify({ mode, status: "failed", diagnostic }));
  throw error;
} finally {
  await browser.close();
}
