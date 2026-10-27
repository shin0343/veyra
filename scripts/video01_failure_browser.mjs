// Real browser network outage + actual owned publisher disconnect. No provider requests.
import { chromium } from "playwright";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const runtime = path.resolve(process.argv[2] ?? "runtime/demo");
const out = path.resolve(process.argv[3] ?? "docs/qa/video01");
const state = JSON.parse(
  await readFile(path.join(runtime, "video01-state.json"), "utf8"),
);
const connection = JSON.parse(
  await readFile(path.join(runtime, "connection.json"), "utf8"),
);
const recovery = process.env.VIDEO01_RECOVERY === "1";
const target = path.join(out, "failures.json");
const report = recovery
  ? JSON.parse(await readFile(target, "utf8"))
  : { started_at: new Date().toISOString(), page_errors: [] };
const api = async (route) => {
  const response = await fetch(connection.api_url + "/api/v1" + route, {
    headers: { Authorization: `Bearer ${connection.operator_token}` },
  });
  if (!response.ok) throw new Error(`Status read failed: ${response.status}`);
  return response.json();
};
const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
  timezoneId: "America/Los_Angeles",
});
const page = await context.newPage();
page.on("pageerror", (error) => report.page_errors.push(error.message));
const playing = () =>
  page.waitForFunction(
    () => {
      const v = document.querySelector("video");
      return v && v.readyState >= 2 && v.currentTime > 0.3 && !v.error;
    },
    null,
    { timeout: 45000 },
  );
const shot = (name) =>
  page.screenshot({
    path: path.join(out, "screenshots", name + ".png"),
    fullPage: true,
  });
try {
  if (recovery) {
    await page.goto(
      state.web_url + "/live?camera_id=" + state.camera_ids.demo_entrance,
    );
    await playing();
    const camera = (await api("/cameras")).items.find(
      (c) => c.source_id === "demo_entrance",
    );
    if (camera.status !== "online")
      throw new Error("Publisher did not recover");
    report.publisher_recovery = {
      status: camera.status,
      video_width: await page.locator("video").evaluate((v) => v.videoWidth),
      after_restart: true,
    };
    await shot("10-publisher-recovered");
    report.status = "passed";
  } else {
    await page.goto(
      state.web_url + "/live?camera_id=" + state.camera_ids.demo_street,
    );
    await playing();
    await context.setOffline(true);
    await page
      .locator(".player-buffering")
      .waitFor({ state: "visible", timeout: 30000 });
    await page
      .getByText("Not checked", { exact: true })
      .first()
      .waitFor({ timeout: 20000 });
    report.browser_network_outage = {
      buffering_visible: true,
      camera_status_label: "Not checked",
      mechanism:
        "Chromium context offline; backend and publisher remain running.",
    };
    await shot("08-network-buffering");
    await context.setOffline(false);
    const before = await page
      .locator("video")
      .evaluate((v) => v.getVideoPlaybackQuality().totalVideoFrames);
    await page.waitForFunction(
      (before) => {
        const v = document.querySelector("video");
        return (
          v &&
          !v.error &&
          v.readyState >= 2 &&
          v.getVideoPlaybackQuality().totalVideoFrames > before + 3
        );
      },
      before,
      { timeout: 45000 },
    );
    await page
      .getByText("Connected", { exact: true })
      .first()
      .waitFor({ timeout: 15000 });
    report.browser_network_recovery = {
      advancing_frames: true,
      camera_status_label: "Connected",
    };
    await page.goto(
      state.web_url + "/live?camera_id=" + state.camera_ids.demo_entrance,
    );
    await playing();
    process.kill(state.publisher_pids.demo_entrance, "SIGINT");
    let camera;
    const deadline = Date.now() + 30000;
    do {
      camera = (await api("/cameras")).items.find(
        (c) => c.source_id === "demo_entrance",
      );
      if (camera.status === "offline") break;
      await page.waitForTimeout(500);
    } while (Date.now() < deadline);
    if (
      camera.status !== "offline" ||
      camera.connection_error?.code !== "SOURCE_OFFLINE"
    )
      throw new Error("Disconnect was not observed accurately");
    await page
      .getByText("This camera is offline", { exact: true })
      .waitFor({ timeout: 15000 });
    if (await page.locator("video").count())
      throw new Error("Disconnected source still pretended to play");
    report.publisher_disconnect = {
      source_id: "demo_entrance",
      actual_publisher_stopped: true,
      camera_status: camera.status,
      error_code: camera.connection_error.code,
      video_count: 0,
    };
    await shot("09-publisher-offline");
    report.status = "faults_verified_awaiting_owned_stack_restart";
  }
} catch (error) {
  report.status = "failed";
  report.error = error.message;
  process.exitCode = 1;
} finally {
  report.updated_at = new Date().toISOString();
  await writeFile(target, JSON.stringify(report, null, 2) + "\n");
  await browser.close();
  console.log(JSON.stringify(report));
}
