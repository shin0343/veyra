// Real VIDEO-01 Chromium QA. No mocked media, no paid model requests.
import { chromium } from "playwright";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const runtime = path.resolve(process.argv[2] ?? "runtime/demo");
const out = path.resolve(process.argv[3] ?? "docs/qa/video01");
const connection = JSON.parse(
  await readFile(path.join(runtime, "connection.json"), "utf8"),
);
const state = JSON.parse(
  await readFile(path.join(runtime, "video01-state.json"), "utf8"),
);
const base = state.web_url;
let previous = { checks: [] };
if (process.env.VIDEO01_RESUME === "1")
  previous = JSON.parse(await readFile(path.join(out, "browser.json"), "utf8"));
const report = {
  base,
  started_at: new Date().toISOString(),
  checks: previous.checks,
  page_errors: [],
  failures: [],
};
await mkdir(path.join(out, "screenshots"), { recursive: true });
const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
  timezoneId: "America/Los_Angeles",
});
const page = await context.newPage();
page.on("pageerror", (error) => report.page_errors.push(error.message));
const api = async (route, options = {}) => {
  const response = await fetch(connection.api_url + "/api/v1" + route, {
    ...options,
    headers: {
      Authorization: `Bearer ${connection.operator_token}`,
      ...options.headers,
    },
  });
  if (!response.ok) throw new Error(`API ${route}: ${response.status}`);
  return response.json();
};
const shot = (name) =>
  page.screenshot({
    path: path.join(out, "screenshots", name + ".png"),
    fullPage: true,
  });
const playing = (count = 1) =>
  page.waitForFunction(
    (count) => {
      const videos = [...document.querySelectorAll("video")];
      return (
        videos.length === count &&
        videos.every(
          (video) =>
            video.readyState >= 2 &&
            video.currentTime > 0.3 &&
            video.videoWidth > 0 &&
            !video.error,
        )
      );
    },
    count,
    { timeout: 45000 },
  );
const frames = () =>
  page.locator("video").evaluateAll((videos) =>
    videos.map((video) => ({
      width: video.videoWidth,
      height: video.videoHeight,
      time: video.currentTime,
      ready_state: video.readyState,
      error: video.error?.message ?? null,
      decoded_frames: video.getVideoPlaybackQuality().totalVideoFrames,
    })),
  );
const check = async (name, work) => {
  if (
    report.checks.some((item) => item.name === name && item.status === "passed")
  )
    return;
  try {
    const value = await work();
    report.checks.push({ name, status: "passed", ...value });
    console.log(JSON.stringify({ name, status: "passed" }));
  } catch (error) {
    report.failures.push({ name, message: error.message });
    await shot("failure-" + name.replaceAll(/[^a-z0-9_-]/gi, "-"));
    throw error;
  }
};

try {
  await check("overview", async () => {
    await page.goto(base + "/");
    await playing();
    await page
      .getByText("Demo workspace · Prerecorded footage", { exact: true })
      .waitFor();
    await shot("01-overview");
    return { video: await frames() };
  });
  await check("video-thumbnails", async () => {
    await page.goto(base + "/cameras");
    await page.waitForFunction(
      () =>
        [...document.querySelectorAll(".camera-video-poster")].length >= 6 &&
        [...document.querySelectorAll(".camera-video-poster")].every(
          (img) => img.complete && img.naturalWidth === 960,
        ),
    );
    const posters = await page
      .locator(".camera-video-poster")
      .evaluateAll((items) =>
        items.map((img) => ({
          src: img.getAttribute("src"),
          width: img.naturalWidth,
          height: img.naturalHeight,
        })),
      );
    await shot("02-cameras");
    return { posters };
  });
  let cameras = (await api("/cameras")).items;
  for (const camera of cameras.filter(
    (camera) => camera.enabled && camera.source_media?.kind === "prerecorded",
  )) {
    await check("stream-" + camera.source_id, async () => {
      await page.goto(base + "/live?camera_id=" + camera.id);
      await playing();
      const before = await frames();
      await page.waitForTimeout(900);
      const after = await frames();
      if (after[0].decoded_frames <= before[0].decoded_frames)
        throw new Error("Frames did not advance");
      await page
        .getByText("Demo stream · Prerecorded footage", { exact: true })
        .waitFor();
      await shot("stream-" + camera.source_id);
      return {
        camera_id: camera.id,
        before,
        after,
        sha256: camera.source_media.sha256,
      };
    });
  }
  await check("default-2x2", async () => {
    await page.goto(base + "/live");
    await playing(4);
    await shot("03-default-2x2");
    return {
      videos: await frames(),
      names: await page.locator(".live-tile-heading strong").allTextContents(),
    };
  });
  await check("saved-2x2", async () => {
    await page.goto(base + "/layouts/" + state.layout_id);
    await playing(4);
    await shot("04-saved-2x2");
    return { videos: await frames() };
  });
  const recordings = (await api("/recordings?limit=100")).items;
  for (const camera of cameras.filter(
    (camera) => camera.enabled && camera.source_media?.kind === "prerecorded",
  )) {
    const recording = recordings.find(
      (recording) =>
        recording.camera_id === camera.id &&
        recording.source_media?.sha256 === camera.source_media.sha256,
    );
    if (!recording) throw new Error("No actual recording for " + camera.name);
    await check("recording-" + camera.source_id, async () => {
      let session;
      const listener = async (response) => {
        if (response.url().endsWith("/playback-sessions") && response.ok())
          session = await response.json();
      };
      page.on("response", listener);
      try {
        await page.goto(
          base + "/recordings/" + recording.id + "?offset_ms=2000",
        );
        await playing();
        await page.locator(".source-media-credit").waitFor();
        await page
          .getByRole("textbox", {
            name: "Jump to time in recording (minutes:seconds)",
          })
          .fill("0:05");
        await page.getByRole("button", { name: "Go", exact: true }).click();
        await page.waitForURL(/offset_ms=5000/);
        await playing();
        if (
          !session ||
          session.actual_start_offset_ms + session.seek_offset_ms !== 5000
        )
          throw new Error("Incorrect seek mapping");
        const range = await page.evaluate(async (url) => {
          const response = await fetch(url, {
            headers: { Range: "bytes=0-2047" },
          });
          return {
            status: response.status,
            content_range: response.headers.get("content-range"),
            bytes: (await response.arrayBuffer()).byteLength,
          };
        }, session.url);
        if (range.status !== 206 || range.bytes !== 2048)
          throw new Error("Browser MP4 Range failed");
        const jumpSession = session;
        let timeline = null;
        if (camera.source_id === "demo_community") {
          const track = page.locator(".timeline-track");
          await track.scrollIntoViewIfNeeded();
          const box = await track.boundingBox();
          const span =
            Number(
              await page.locator("#recording-position").getAttribute("max"),
            ) + 1000;
          if (!box) throw new Error("Missing actual recording timeline");
          await track.click({
            position: { x: (box.width * 8000) / span, y: box.height / 2 },
          });
          await page.waitForURL(
            (url) =>
              Math.abs(Number(url.searchParams.get("offset_ms")) - 8000) < 250,
          );
          await playing();
          const requested = Number(
            new URL(page.url()).searchParams.get("offset_ms"),
          );
          if (
            session.actual_start_offset_ms + session.seek_offset_ms !==
            requested
          )
            throw new Error("Timeline seek mapping mismatch");
          timeline = {
            clicked: true,
            requested_offset_ms: requested,
            advancing_video: true,
          };
        }
        await shot("recording-" + camera.source_id);
        return {
          recording_id: recording.id,
          available_duration_ms: recording.available_duration_ms,
          video: await frames(),
          range,
          actual_start_offset_ms: jumpSession.actual_start_offset_ms,
          seek_offset_ms: jumpSession.seek_offset_ms,
          timeline,
        };
      } finally {
        page.off("response", listener);
      }
    });
  }
  for (const route of [
    "/recordings",
    "/events",
    "/search",
    "/layouts",
    "/settings",
  ]) {
    await check("page-" + route.slice(1), async () => {
      await page.goto(base + route);
      await page.locator(".demo-media-notice").waitFor();
      await page.waitForTimeout(700);
      await shot("page-" + route.slice(1));
      return {};
    });
  }
  await check("camera-registration-dialog", async () => {
    await page.goto(base + "/cameras");
    await page
      .getByRole("button", { name: "Connect a camera", exact: true })
      .first()
      .click();
    await page
      .getByLabel("Camera name", { exact: true })
      .fill("Station entrance");
    await page
      .getByRole("dialog")
      .locator("select")
      .selectOption("demo_station");
    await shot("05-connect-prerecorded-source");
    await page.keyboard.press("Escape");
    return {
      source: "demo_station",
      submitted: false,
      note: "Reserved real source remains available for the live presentation.",
    };
  });
  await check("paused-development-source", async () => {
    const paused = cameras.find((camera) => camera.source_id === "sample");
    await page.goto(base + "/live?camera_id=" + paused.id);
    await page.getByText("This camera is paused", { exact: true }).waitFor();
    if (await page.locator("video").count())
      throw new Error("Paused camera pretended to play");
    await shot("06-paused-development-source");
    return { camera_status: paused.status, video_count: 0 };
  });
  await check("phone-layout", async () => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(base + "/cameras");
    await page.locator(".camera-video-poster").first().waitFor();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    );
    if (overflow) throw new Error("Horizontal overflow");
    await shot("07-phone-cameras");
    return { width: 390, horizontal_overflow: false };
  });
  if (report.page_errors.length) throw new Error("Browser page errors");
  report.status = "passed";
} catch (error) {
  report.status = "failed";
  report.error = error.message;
  process.exitCode = 1;
} finally {
  report.completed_at = new Date().toISOString();
  await writeFile(
    path.join(out, "browser.json"),
    JSON.stringify(report, null, 2) + "\n",
  );
  await browser.close();
}
