import { chromium } from "playwright";
import AxeBuilder from "@axe-core/playwright";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const base = process.env.VEYRA_QA_URL ?? "http://127.0.0.1:3100";
const out = path.resolve("../../docs/design/verification");
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext();
const page = await context.newPage();
const report = {
  observed_at: new Date().toISOString(),
  mode: "explicit development fixtures",
  routes: [],
  interactions: [],
  accessibility: [],
  errors: [],
};
const consoleErrors = [];
page.on("pageerror", (error) => consoleErrors.push(error.message));
async function screenshot(name) {
  await page.screenshot({
    path: path.join(out, `${name}.png`),
    fullPage: true,
  });
}
async function audit(name) {
  const result = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  const violations = result.violations.map((issue) => ({
    id: issue.id,
    impact: issue.impact,
    description: issue.description,
    nodes: issue.nodes.map((node) => ({
      target: node.target,
      summary: node.failureSummary,
    })),
  }));
  report.accessibility.push({ screen: name, violations });
}
async function go(route, preview = true) {
  await page.goto(
    `${base}${route}${route.includes("?") ? "&" : "?"}${preview ? "preview=1" : ""}`,
    { waitUntil: "networkidle" },
  );
  await page.locator("#main-content h1").waitFor({ state: "attached" });
  await page.evaluate(() => document.fonts.ready);
}
function check(value, message) {
  if (!value) throw new Error(message);
  report.interactions.push(message);
}
try {
  for (const [size, viewport] of Object.entries({
    desktop: { width: 1440, height: 1000 },
    tablet: { width: 834, height: 1112 },
    mobile: { width: 390, height: 844 },
  })) {
    await page.setViewportSize(viewport);
    for (const route of [
      "/",
      "/cameras",
      "/live",
      "/recordings",
      "/explore",
      "/events",
      "/layouts",
      "/settings",
    ]) {
      await go(route);
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth + 1,
      );
      const h1 = await page.locator("#main-content h1").count();
      report.routes.push({
        viewport: size,
        route,
        horizontal_overflow: overflow,
        headings: h1,
      });
      if (overflow || h1 !== 1)
        throw new Error(`Layout failed: ${size} ${route}`);
      await audit(`${size}${route}`);
      if (size === "desktop" || route === "/" || route === "/recordings")
        await screenshot(`${size}-${route === "/" ? "home" : route.slice(1)}`);
    }
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await go("/");
  await page
    .getByRole("button", { name: "Go to, find or ask Muse", exact: true })
    .click();
  await page
    .getByRole("combobox", { name: "Search commands" })
    .fill("recording settings");
  for (let step = 0; step < 12; step++) await page.keyboard.press("Tab");
  check(
    await page.evaluate(() =>
      document
        .querySelector('[role="dialog"]')
        ?.contains(document.activeElement),
    ),
    "Dialog keeps keyboard Tab navigation within the active dialog",
  );
  await page.keyboard.press("Escape");
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  await page.waitForFunction(
    () => document.activeElement === document.querySelector(".topbar-command"),
    undefined,
    { timeout: 2000 },
  );
  check(
    await page
      .getByRole("button", { name: "Go to, find or ask Muse", exact: true })
      .evaluate((e) => e === document.activeElement),
    "Command palette restores trigger focus",
  );
  await page.keyboard.press("Control+k");
  await page
    .getByRole("combobox", { name: "Search commands" })
    .fill("settings");
  await page.keyboard.press("Enter");
  await page.waitForURL(/\/settings\?preview=1/);
  check(true, "Ctrl+K, filtering and Enter navigate to typed settings route");
  await go("/");
  // REDESIGN-01: Home's find field navigates or searches; Muse is opened deliberately.
  await page
    .locator(".topbar")
    .getByRole("button", { name: "Ask Muse", exact: true })
    .click();
  await page.getByRole("dialog").waitFor();
  await page
    .getByRole("textbox", { name: "Ask Muse", exact: true })
    .fill("Where can I adjust recording settings?");
  await page.getByRole("button", { name: "Send message" }).click();
  await screenshot("desktop-muse-settings");
  await audit("Muse side panel");
  check(
    await page
      .getByText("Feature guide preview. This is not a Muse response.")
      .isVisible(),
    "Feature guidance never impersonates a model response",
  );
  await page.getByRole("link", { name: "Open settings", exact: true }).click();
  await page.waitForURL(/#recording$/);
  check(
    true,
    "Muse settings action navigates to actual recording settings section",
  );
  await go("/cameras");
  await page.getByRole("button", { name: "Home", exact: true }).click();
  check(
    (await page.locator(".cam-item").count()) === 2,
    "Camera space filter updates visible cards",
  );
  await page.getByRole("button", { name: "All", exact: true }).click();
  // REDESIGN-02: open the camera, then its settings from the camera panel.
  await page.locator(".cam-item", { hasText: "Garden studio" }).click();
  await page.getByRole("button", { name: "Camera settings" }).click();
  await page
    .getByRole("switch", { name: "Allow cloud video analysis" })
    .check();
  await page.getByRole("button", { name: "Review changes" }).click();
  await screenshot("desktop-privacy-confirmation");
  await audit("Privacy confirmation");
  check(
    await page
      .getByRole("heading", { name: "Allow cloud video analysis?" })
      .isVisible(),
    "Consequential privacy change requires a review step",
  );
  await page.getByRole("button", { name: "Finish preview" }).click();
  check(
    await page
      .getByText(
        "This was an interaction preview. No device setting or server data changed.",
      )
      .isVisible(),
    "Privacy preview result makes no device-change claim",
  );
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await go("/layouts");
  await page.getByRole("button", { name: "New view", exact: true }).click();
  await page.getByLabel("View name").fill("Morning spaces");
  await page
    .locator(".view-picker button")
    .filter({ hasText: "Front entrance" })
    .click();
  await page
    .locator(".view-picker button")
    .filter({ hasText: "Garden studio" })
    .click();
  await page.getByRole("button", { name: "Review view", exact: true }).click();
  await page
    .getByRole("button", { name: "Create preview view", exact: true })
    .click();
  check(
    await page
      .getByRole("heading", { name: "Preview view created", exact: true })
      .isVisible(),
    "Layout creation is labeled as a local preview result",
  );
  await page.getByRole("link", { name: "Open view" }).click();
  await page.waitForURL(/\/layouts\/[0-9a-f-]+\?preview=1/);
  check(
    (await page.locator("#main-content h1").innerText()) === "Morning spaces",
    "New local layout opens its actual detail route",
  );
  await page
    .locator(".sidebar")
    .getByRole("link", { name: "Saved views", exact: true })
    .click();
  await page.getByRole("button", { name: "New view", exact: true }).click();
  check(
    (await page.getByLabel("View name").inputValue()) === "",
    "A second layout starts with a fresh draft rather than a previous success state",
  );
  await page.keyboard.press("Escape");
  await go("/live");
  await page.getByRole("button", { name: "Single camera layout" }).click();
  check(
    (await page.locator(".wall-tile").count()) === 1,
    "Single camera selection changes the layout",
  );
  await page.getByRole("button", { name: "2 by 2 camera layout" }).click();
  check(
    (await page.locator(".wall-tile").count()) === 4,
    "2 by 2 camera selection displays four labeled preview tiles",
  );
  check(
    (await page.locator("video").count()) === 0,
    "Preview mode never fabricates a playing video element",
  );
  await go("/explore");
  await page.locator("button.ws-result").first().waitFor();
  await screenshot("desktop-explore-preview");
  await audit("Explore preview with authored results");
  check(
    (await page.locator(".evidence-frame-label").first().innerText()) ===
      "Illustration · no video",
    "Preview results are labelled as illustrations, never as footage",
  );
  await page.getByRole("link", { name: "Open in recording at 12:00" }).click();
  await page.waitForURL(/offset_ms=720000/);
  await page.locator(".playback-position strong").waitFor();
  check(
    (await page.locator(".playback-position strong").innerText()) === "12:00",
    "Explore result opens recording at the exact 720000ms offset",
  );
  await go("/explore?state=empty");
  check(
    await page
      .getByRole("heading", { name: "No matching moments" })
      .isVisible(),
    "Empty preview explore shows a truthful no-match state",
  );
  for (const state of ["loading", "empty", "error"]) {
    await go(`/recordings?state=${state}`);
    await screenshot(`desktop-recordings-${state}`);
    check(
      (await page.locator("video").count()) === 0,
      `${state} state shows no fabricated media`,
    );
  }
  await go("/explore?state=indexing");
  check(
    (await page
      .getByRole("progressbar", { name: "Sample indexing progress" })
      .getAttribute("aria-valuenow")) === "64",
    "Indexing fixture exposes labeled accessible progress",
  );
  await screenshot("desktop-indexing");
  await go("/", false);
  await page.getByRole("alert").first().waitFor();
  check(
    (await page.locator(".cam-item, .log-row, .hm-space").count()) === 0,
    "Connected mode never falls back to fixture cameras or events",
  );
  await screenshot("desktop-service-unavailable");
  await audit("Real unavailable workspace");
  await page
    .locator(".topbar")
    .getByRole("button", { name: "Ask Muse", exact: true })
    .click();
  await page
    .getByRole("textbox", { name: "Ask Muse", exact: true })
    .fill("Find my recordings");
  await page.getByRole("button", { name: "Send message" }).click();
  await page
    .getByText(
      "No completed action receipt was received, so no change is assumed.",
    )
    .waitFor();
  check(
    true,
    "Unavailable Muse request reports missing execution evidence instead of claiming success or rollback",
  );
  await screenshot("desktop-muse-unavailable");
  await page.keyboard.press("Escape");
  const denied = await page.request.get(`${base}/api/v1/cameras`, {
    headers: { Origin: "http://untrusted.example" },
  });
  check(
    denied.status() === 403,
    "Frontend adapter rejects cross-origin access",
  );
  const unknown = await page.request.get(`${base}/api/v1/arbitrary-url`, {
    headers: { Origin: base },
  });
  check(
    unknown.status() === 404,
    "Frontend adapter rejects unknown upstream paths",
  );
  // Isolated wire-contract rendering fixtures. The displayed strings explicitly disclaim execution.
  const fixtureId = "00000000-0000-4000-8000-000000000099";
  let decision = null;
  await page.route("**/api/v1/agent/messages", (route) =>
    route.fulfill({
      json: {
        conversation_id: fixtureId,
        run_id: fixtureId,
        status: "awaiting_confirmation",
        message:
          "Contract test fixture. This is not a Muse response and no action was executed.",
        actions: [
          {
            status: "confirmation_required",
            tool_call_id: "fixture-call",
            tool_name: "layouts.create",
            confirmation: {
              id: fixtureId,
              summary:
                "Contract fixture: review the sample layout action only.",
              expires_at: new Date(Date.now() + 60000).toISOString(),
            },
          },
        ],
      },
    }),
  );
  await page.route(
    `**/api/v1/agent/confirmations/${fixtureId}`,
    async (route) => {
      decision = route.request().postDataJSON().approved;
      await route.fulfill({
        json: {
          conversation_id: fixtureId,
          run_id: fixtureId,
          status: "failed",
          message:
            "Contract fixture decision received. No real operation occurred.",
          actions: [
            {
              status: "failed",
              tool_call_id: "fixture-call",
              tool_name: "layouts.create",
              error: {
                code: "USER_DECLINED",
                message: "Contract fixture: the action was declined.",
                retryable: false,
                fields: [],
              },
            },
          ],
        },
      });
    },
  );
  await page
    .locator(".topbar")
    .getByRole("button", { name: "Ask Muse", exact: true })
    .click();
  await page
    .getByRole("textbox", { name: "Ask Muse", exact: true })
    .fill("Contract rendering fixture");
  await page.getByRole("button", { name: "Send message" }).click();
  await page.getByRole("button", { name: "Approve action" }).waitFor();
  await screenshot("contract-fixture-confirmation");
  await audit("Contract fixture confirmation receipt");
  await page.getByRole("button", { name: "Decline", exact: true }).click();
  await page.getByText("Contract fixture: the action was declined.").waitFor();
  check(
    decision === false,
    "Declining a server-bound confirmation sends approved:false and renders the actual failed receipt",
  );
  await page.keyboard.press("Escape");
  await page.unroute("**/api/v1/agent/messages");
  await page.route("**/api/v1/agent/messages", (route) =>
    route.fulfill({
      json: {
        conversation_id: fixtureId,
        run_id: fixtureId,
        status: "awaiting_confirmation",
        message:
          "Contract test fixture for expired approval; no action was executed.",
        actions: [
          {
            status: "confirmation_required",
            tool_call_id: "expired-fixture",
            tool_name: "layouts.create",
            confirmation: {
              id: fixtureId,
              summary: "Expired contract fixture.",
              expires_at: "2000-01-01T00:00:00Z",
            },
          },
        ],
      },
    }),
  );
  await page
    .locator(".topbar")
    .getByRole("button", { name: "Ask Muse", exact: true })
    .click();
  await page
    .getByRole("textbox", { name: "Ask Muse", exact: true })
    .fill("Expired contract fixture");
  await page.getByRole("button", { name: "Send message" }).click();
  await page.getByRole("button", { name: "Approve action" }).waitFor();
  check(
    await page.getByRole("button", { name: "Approve action" }).isDisabled(),
    "Expired server confirmation cannot be approved",
  );
  await page.keyboard.press("Escape");
  await page.unroute("**/api/v1/agent/messages");
  await page.route("**/api/v1/agent/messages", (route) =>
    route.fulfill({
      json: {
        conversation_id: fixtureId,
        run_id: fixtureId,
        status: "completed",
        message: "Contract rendering fixture; no real operation occurred.",
        actions: [
          {
            status: "succeeded",
            tool_call_id: "navigation-fixture",
            tool_name: "recordings.open",
            message:
              "Contract fixture: navigation is ready; no resource was created.",
            resource_id: null,
            navigation: {
              kind: "navigate",
              label: "Open contract fixture recording",
              target: {
                kind: "recording",
                recording_id: "00000000-0000-4000-8000-000000000020",
                offset_ms: 720000,
              },
            },
          },
          {
            status: "succeeded",
            tool_call_id: "untrusted-fixture",
            tool_name: "features.navigate",
            message:
              "Defensive rendering fixture for an invalid navigation kind.",
            resource_id: null,
            navigation: {
              kind: "navigate",
              label: "Unsafe destination fixture",
              target: { kind: "external", url: "https://untrusted.example" },
            },
          },
        ],
      },
    }),
  );
  await page
    .locator(".topbar")
    .getByRole("button", { name: "Ask Muse", exact: true })
    .click();
  await page
    .getByRole("textbox", { name: "Ask Muse", exact: true })
    .fill("Contract navigation fixture");
  await page.getByRole("button", { name: "Send message" }).click();
  await page
    .getByRole("link", { name: "Open contract fixture recording" })
    .waitFor();
  check(
    (await page
      .getByRole("link", { name: "Open contract fixture recording" })
      .getAttribute("href")) ===
      "/recordings/00000000-0000-4000-8000-000000000020?offset_ms=720000",
    "Successful action receipt maps to the typed recording route and exact timestamp",
  );
  check(
    (await page
      .getByRole("link", { name: "Unsafe destination fixture" })
      .count()) === 0,
    "Unknown action navigation kinds never create a URL link",
  );
  await page.keyboard.press("Escape");
  await page.unroute("**/api/v1/agent/messages");
  await go("/settings");
  await page.getByRole("switch", { name: "Reduce interface motion" }).check();
  await page
    .locator(".sidebar")
    .getByRole("link", { name: "Cameras", exact: true })
    .click();
  await page
    .locator(".sidebar")
    .getByRole("link", { name: "Settings", exact: true })
    .click();
  check(
    await page
      .getByRole("switch", { name: "Reduce interface motion" })
      .isChecked(),
    "Tab-local appearance preference remains consistent across navigation",
  );
  await go("/recordings/00000000-0000-4000-8000-000000000020?offset_ms=-1");
  check(
    await page
      .getByRole("heading", { name: "This timestamp isn’t valid" })
      .isVisible(),
    "Invalid offsets are rejected instead of silently playing the beginning",
  );
  report.errors = consoleErrors;
  if (consoleErrors.length)
    throw new Error(`Browser errors: ${consoleErrors.join("; ")}`);
  if (report.accessibility.some((screen) => screen.violations.length))
    throw new Error("Accessibility violations found; see report");
  report.status = "passed";
} catch (error) {
  report.status = "failed";
  report.failure = error.message;
  throw error;
} finally {
  await writeFile(
    path.join(out, "report.json"),
    JSON.stringify(report, null, 2) + "\n",
  );
  await browser.close();
  console.log(
    JSON.stringify({
      status: report.status,
      routes: report.routes.length,
      interactions: report.interactions.length,
      axe_scans: report.accessibility.length,
      violations: report.accessibility.reduce(
        (sum, screen) => sum + screen.violations.length,
        0,
      ),
      failure: report.failure,
    }),
  );
}
