// Records the ~2 minute hackathon demo against the isolated release stack started by
// `scripts/final_rc.py --qa-provider` (disposable DB copy, real media and stored index).
// Muse responses on :3701 come from the scripted test provider; every Muse moment is
// captioned as such on screen. No live Meta call is made and the curated demo DB is untouched.
// Usage: node tests/final-demo-recording.mjs <out-dir>   (then encode the .webm with ffmpeg)
import assert from "node:assert/strict";
import { mkdir, readdir, rename } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const base = "http://127.0.0.1:3701";
const out = path.resolve(process.argv[2] ?? "demo-recording");
await mkdir(out, { recursive: true });
const size = { width: 1440, height: 900 };
const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: size,
  timezoneId: "America/Los_Angeles",
  recordVideo: { dir: out, size },
});
// Belt and braces: nothing leaves the local release stack; no analysis job can be queued.
await context.route("**/*", (route) => {
  const url = new URL(route.request().url());
  if (url.protocol.startsWith("http") && url.origin !== base)
    return route.abort();
  if (
    /\/analysis-jobs$/.test(url.pathname) &&
    route.request().method() !== "GET"
  )
    return route.abort();
  return route.continue();
});
const page = await context.newPage();
const wait = (ms) => page.waitForTimeout(ms);

// Lower-third caption, drawn by the recorder (not part of the product UI).
async function caption(text, tag = "") {
  await page.evaluate(
    ([text, tag]) => {
      let box = document.getElementById("demo-caption");
      if (!box) {
        box = document.createElement("div");
        box.id = "demo-caption";
        box.style.cssText =
          "position:fixed;left:50%;bottom:28px;transform:translateX(-50%);z-index:2147483647;" +
          "max-width:980px;padding:14px 22px;border-radius:10px;background:rgba(18,21,19,.88);" +
          "color:#F5F3EE;font:500 19px/1.45 Manrope,system-ui,sans-serif;text-align:center;" +
          "box-shadow:0 8px 30px rgba(0,0,0,.25);pointer-events:none";
        document.body.append(box);
      }
      box.innerHTML = "";
      if (tag) {
        const badge = document.createElement("div");
        badge.textContent = tag;
        badge.style.cssText =
          "font:700 12px/1 Manrope,system-ui,sans-serif;letter-spacing:.08em;color:#F2C94C;" +
          "margin-bottom:6px;text-transform:uppercase";
        box.append(badge);
      }
      box.append(document.createTextNode(text));
    },
    [text, tag],
  );
}
async function go(route, text, tag) {
  await page.goto(base + route, { waitUntil: "domcontentloaded" });
  await wait(1200);
  await caption(text, tag);
}
const playing = (scope, minimum = 1) =>
  page.waitForFunction(
    ([s, n]) =>
      [...document.querySelectorAll(`${s} video`)].filter(
        (v) => v.readyState >= 2 && v.currentTime > 0.2 && !v.paused,
      ).length >= n,
    [scope, minimum],
    { timeout: 45000 },
  );
const SCRIPTED =
  "Recorded with a scripted Muse provider · not a live Meta call";

// 1. Workspace.
await go(
  "/",
  "Veyra is a video workspace built on Meta Muse. Six licensed films replay here as real camera streams.",
);
await page.waitForSelector("main img", { timeout: 30000 });
await wait(9000);

// 2. Camera management.
await go(
  "/cameras",
  "Every camera shows its live video, recordings, saved views and the licence of its footage.",
);
await page.locator(".cam-item", { hasText: "Entrance gate" }).click();
await playing(".cam-panel-stage");
await wait(9000);
await go(
  "/live",
  "The live wall streams every camera through the local media server.",
);
await playing(".wall", 4);
await wait(8000);

// 3. Muse proposes and executes a multi-camera layout, with approval.
await go(
  "/layouts",
  "Ask Muse for a view in plain language. Muse may only call allowlisted, typed tools.",
  SCRIPTED,
);
await wait(1500);
await page
  .getByRole("button", { name: "Ask Muse", exact: true })
  .first()
  .click();
const dialog = page.getByRole("dialog");
const prompt =
  'Create a 2x2 view named "Front of house" with Entrance gate, Street approach, Community space, Bicycle parking.';
await dialog
  .getByLabel("Ask Muse", { exact: true })
  .pressSequentially(prompt, { delay: 18 });
await wait(600);
await dialog.getByRole("button", { name: /Send message/ }).click();
const turn = dialog.locator(".muse-turn").last();
await turn
  .getByRole("button", { name: "Approve and save", exact: true })
  .waitFor();
await caption(
  "Nothing is saved yet: the change waits for your approval.",
  SCRIPTED,
);
await wait(9000);
await turn
  .getByRole("button", { name: "Approve and save", exact: true })
  .click();
await turn.getByText("Saved and verified", { exact: true }).waitFor();
await caption(
  "After approval the server saves the view and re-reads it before saying it is done.",
  SCRIPTED,
);
await wait(9000);
await turn.getByRole("link", { name: "Open saved layout" }).click();
await playing(".wall", 4);
await caption("The new view is real: four cameras, saved in the database.");
await wait(8000);

// 4. Natural-language search over the stored video index.
await go(
  "/explore",
  "Search reads Muse's stored descriptions of every analysed clip.",
  "Query interpretation scripted · results come from the real stored index",
);
await page.locator("button.ws-result").first().waitFor({ timeout: 30000 });
await page
  .locator("#explore-ask")
  .pressSequentially("people walking", { delay: 45 });
await page
  .getByRole("button", { name: "Ask Muse, uses 1 request", exact: true })
  .click();
await page.locator(".ws-understood").waitFor();
await page.locator("button.ws-result").first().waitFor();
await playing(".ws-stage");
await wait(9000);
await page.locator("button.ws-result").nth(1).click();
await caption(
  "Each result plays the exact clip Muse described, with its timestamp on the timeline.",
  "Query interpretation scripted · results come from the real stored index",
);
await wait(8000);

// 5. Open the matching recording and inspect its evidence.
await page
  .getByRole("link", { name: /^Open in recording at/ })
  .first()
  .click();
await page.waitForURL(/\/recordings\/.+segment_id=/);
await playing(".recording-main");
await caption(
  "Open the full recording at that moment, with its other analysed moments.",
);
await wait(9000);

// 6. Activity and architecture.
await go(
  "/events",
  "Activity lists every moment by time; watch any of them in place.",
);
await page.locator(".log-play").first().click();
await playing(".log-player");
await wait(9000);
await caption(
  "Next.js · FastAPI · PostgreSQL · MediaMTX + FFmpeg · Meta Muse through typed tools with server-bound approvals.",
);
await wait(9000);
await go(
  "/",
  "Veyra: real video, evidence you can watch, and an agent that asks before it changes anything.",
);
await wait(9000);

const video = page.video();
await context.close();
await browser.close();
const raw = await video.path();
await rename(raw, path.join(out, "veyra-demo.webm"));
assert((await readdir(out)).includes("veyra-demo.webm"));
console.log(path.join(out, "veyra-demo.webm"));
