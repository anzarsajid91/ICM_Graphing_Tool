// Actual synthetic lag/volume/DWF calculations and scoped review/select controls.
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { chromium, firefox } from "playwright";
import {
  browserLaunchOptions,
  browserContextOptions,
} from "./browser-environment.mjs";
import { installPrivacyGuard } from "./privacy-network.mjs";
import { writeEvidence } from "./evidence-output.mjs";
const base = process.env.ICM_BASE_URL || "http://127.0.0.1:8008/",
  name = process.env.ICM_BROWSER || "chromium",
  outcomes = [];
const browser = await { chromium, firefox }[name].launch(
  browserLaunchOptions(),
);
const record = (route, control, expected, observed) => {
  outcomes.push({
    route,
    control: "#" + control,
    status: "PASS",
    expected,
    observed,
  });
  console.log("VERIFICATION_INPUT_PASS " + name + " " + control);
};
try {
  const context = await browser.newContext({
      ...browserContextOptions(),
      viewport: { width: 1440, height: 1000 },
      acceptDownloads: true,
    }),
    guard = installPrivacyGuard(context, base),
    page = await context.newPage(),
    errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await guard.navigate(page, base);
  await page.waitForFunction(
    () => window.__ICM_PRECISION_WORKBENCH__?.navigate,
  );
  assert.equal(
    await page.locator('meta[name="icm-build-sha"]').getAttribute("content"),
    process.env.GITHUB_SHA,
  );
  const nav = async (route) =>
    page.evaluate(
      (route) =>
        window.__ICM_PRECISION_WORKBENCH__.navigate(...route.split("/"), false),
      route,
    );
  const option = async (selector, name) =>
    page
      .locator(selector + " option")
      .evaluateAll(
        (options, name) =>
          options.find((option) => option.textContent.includes(name))?.value,
        name,
      );
  await nav("data/time-series");
  const series = (name, delay, factor) => ({
    name,
    mimeType: "text/csv",
    buffer: Buffer.from(
      "timestamp,Flow (m3/s)\n" +
        Array.from(
          { length: 4 },
          (_, i) =>
            new Date(Date.UTC(2026, 0, 1, 0, delay + i * 5))
              .toISOString()
              .slice(0, 19) +
            "," +
            ((i + 1) * 0.1 * factor).toFixed(3),
        ).join("\n") +
        "\n",
    ),
  });
  await page.setInputFiles("#fileInput", [
    series("Observed-input.csv", 0, 1),
    series("ModelA-input.csv", 5, 1),
    series("ModelB-input.csv", 5, 2),
  ]);
  await page.waitForFunction(
    () =>
      state.files.size === 3 &&
      [...state.files.values()].every((file) => file.status === "ready") &&
      !document.body.classList.contains("operation-busy"),
    null,
    { timeout: 120000 },
  );
  const obs = await option("#observedSelect", "Observed-input"),
    a = await option("#modelSelect", "ModelA-input"),
    b = await option("#modelSelect", "ModelB-input");
  await page.selectOption("#observedSelect", obs);
  await page.selectOption("#modelSelect", [a, b]);
  await page.selectOption("#rainSelect", "");
  await page.locator("#timeBasisConfirmed").check();
  await page.locator("#applyMappingBtn").click();
  await nav("graphs/comparison");
  const inspector = page.locator("#pwInspectorToggle");
  if ((await inspector.getAttribute("aria-expanded")) !== "true")
    await inspector.click();
  await page.locator("#runCompareBtn").click();
  await page.waitForFunction(
    () =>
      state.comparisons.length === 2 &&
      state.comparisonSnapshot?.signature === analysisSignature() &&
      !document.body.classList.contains("operation-busy"),
    null,
    { timeout: 120000 },
  );
  const initial = await page.evaluate(
    () => state.comparisons[0].result.metrics.mae,
  );
  assert.ok(initial > 0.09);
  await page.locator("#offsetInput").fill("-5");
  await page.locator("#offsetInput").press("Tab");
  await page.locator("#runCompareBtn").click();
  await page.waitForFunction(
    () =>
      state.comparisonSnapshot?.signature === analysisSignature() &&
      state.comparisons[0]?.result?.metrics?.mae < 1e-12 &&
      !document.body.classList.contains("operation-busy"),
    null,
    { timeout: 120000 },
  );
  const aligned = await page.evaluate(() =>
    state.comparisons.map((item) => ({
      name: item.model.item.displayName,
      metrics: item.result.metrics,
    })),
  );
  assert.ok(
    Math.abs(
      aligned.find((item) => item.name === "ModelA-input.csv").metrics.nse - 1,
    ) < 1e-12,
  );
  assert.ok(
    Math.abs(
      aligned.find((item) => item.name === "ModelB-input.csv").metrics.mae -
        0.25,
    ) < 1e-12,
  );
  record(
    "graphs/comparison",
    "offsetInput",
    "Apply −5min to the delayed model clocks and recompute known agreement",
    { beforeMae: initial, modelAMae: 0, modelANse: 1, modelBMae: 0.25 },
  );
  await nav("graphs/overview");
  const reviewB = await option("#verificationReviewScenario", "ModelB-input"),
    reviewA = await option("#verificationReviewScenario", "ModelA-input");
  assert.ok(reviewA && reviewB && reviewA !== reviewB);
  await page.selectOption("#verificationReviewScenario", reviewB);
  await page
    .locator("#verificationReviewDecision")
    .selectOption("Requires investigation");
  await page
    .locator("#verificationReviewComments")
    .fill("Synthetic selected-scenario review");
  await page
    .locator("#verificationReviewReferences")
    .fill("Synthetic reference ID 01");
  await page.locator("#verificationReviewSave").click();
  const reviews = await page.evaluate(
    () => workspaceObject().verification_reviews,
  );
  assert.equal(reviews.length, 1);
  assert.equal(reviews[0].references, "Synthetic reference ID 01");
  assert.ok(JSON.stringify(reviews[0]).includes("ModelB-input"));
  await page.selectOption("#verificationReviewScenario", reviewA);
  assert.equal(
    await page.locator("#verificationReviewReferences").inputValue(),
    "",
  );
  assert.equal(
    await page.evaluate(() => workspaceObject().verification_reviews.length),
    1,
  );
  record(
    "graphs/overview",
    "verificationReviewScenario",
    "Scope selected scenario edits without leaking another scenario’s reference",
    "ModelB saved; selecting ModelA shows empty references and preserves exactly one ModelB record",
  );
  await nav("reports/report-generation");
  await page.locator("#reportIncludeSpillsStorage").uncheck();
  await page.locator("#reportIncludeSurvey").uncheck();
  const download = page.waitForEvent("download");
  await page.locator("#downloadReportBtn").click();
  const html = await fs.readFile(await (await download).path(), "utf8");
  assert.ok(html.includes("Synthetic reference ID 01"));
  record(
    "graphs/overview",
    "verificationReviewReferences",
    "Persist edited reference in the selected review and actual local HTML export",
    "Exact reference saved for ModelB only and included in exported report",
  );
  await page.evaluate(() => {
    state.rainEvents = [
      {
        event: 1,
        start: "2026-01-01T00:00:00",
        end: "2026-01-01T00:05:00",
        total_depth_mm: 1,
      },
      {
        event: 2,
        start: "2026-01-01T00:05:00",
        end: "2026-01-01T00:10:00",
        total_depth_mm: 1,
      },
    ];
    state.rainEventResult = { count: 2 };
    state.rainEventSignature = rainEventInputSignature();
  });
  await nav("graphs/events");
  await page.locator("#verificationEventSelect").selectOption("1");
  await page.selectOption("#verificationEventModel", b);
  await page
    .getByRole("button", { name: "Compare selected event", exact: true })
    .click();
  await page.waitForFunction(
    () =>
      document
        .getElementById("verificationEventResult")
        .textContent.includes("Observed volume"),
    null,
    { timeout: 120000 },
  );
  const event = await page.locator("#verificationEventResult").innerText();
  assert.match(event, /75(?:\.0+)? m³[\s\S]*Observed volume/);
  assert.match(event, /150(?:\.0+)? m³[\s\S]*Modelled volume/);
  for (const control of ["verificationEventSelect", "verificationEventModel"])
    record(
      "graphs/events",
      control,
      "Compare explicit event2 with explicit ModelB and respect the existing clock offset",
      "Synthetic qualified window injected for selection only; real hydraulic engine volumes are 75m³ observed and 150m³ ModelB over 5min",
    );
  await nav("data/time-series");
  await page.locator("#clearPoolBtn").click();
  await page.waitForFunction(
    () =>
      state.files.size === 0 &&
      !document.body.classList.contains("operation-busy"),
  );
  const count = 9 * 288 + 1,
    flow = {
      name: "DWF-input.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(
        "timestamp,Flow (m3/s)\n" +
          Array.from(
            { length: count },
            (_, i) =>
              new Date(Date.UTC(2026, 0, 1) + i * 300000)
                .toISOString()
                .slice(0, 19) + ",0.1",
          ).join("\n") +
          "\n",
      ),
    },
    rain = {
      name: "DWF-input.R",
      mimeType: "text/plain",
      buffer: Buffer.from(
        "**FIELD: 1,RAINFALL\n**UNITS: 1,mm/h\n*CSTART\n2601010000 2601100005 5\n*CEND\n" +
          Array(count).fill("0").join(" ") +
          "\n",
      ),
    };
  await page.setInputFiles("#fileInput", [flow, rain]);
  await page.waitForFunction(
    () =>
      state.files.size === 2 &&
      [...state.files.values()].every((file) => file.status === "ready") &&
      !document.body.classList.contains("operation-busy"),
    null,
    { timeout: 120000 },
  );
  await page.selectOption(
    "#observedSelect",
    await option("#observedSelect", "DWF-input.csv"),
  );
  await page.selectOption("#modelSelect", []);
  await page.selectOption(
    "#rainSelect",
    await option("#rainSelect", "DWF-input.R"),
  );
  await page.locator("#applyMappingBtn").click();
  await nav("graphs/dwf");
  await page.selectOption(
    "#dwfFlowSelect",
    await option("#dwfFlowSelect", "DWF-input.csv"),
  );
  await page.selectOption("#dwfFlowUnit", "m3/s");
  await page.locator("#dwfBaselineDays").fill("7");
  await page.locator("#dwfAdpHours").fill("8");
  await page.locator("#dwfDryDay").fill("1");
  await page.locator("#runDwfBtn").click();
  await page.waitForFunction(
    () =>
      dwfFresh() &&
      state.dwfResult?.calculation_status === "complete" &&
      !document.body.classList.contains("operation-busy"),
    null,
    { timeout: 120000 },
  );
  const dwf = await page.evaluate(() => state.dwfResult);
  assert.equal(dwf.baseline_days, 7);
  assert.equal(dwf.adp_hours, 8);
  assert.ok(dwf.dry_days_used >= 5);
  assert.ok(Math.abs(dwf.average_dwf - 0.1) < 1e-12);
  assert.equal(dwf.flow_unit, "m³/s");
  for (const control of ["dwfBaselineDays", "dwfAdpHours"])
    record(
      "graphs/dwf",
      control,
      "Use edited baseline7days / ADP8hours and calculate constant dry-weather flow from supported zero-rain observations",
      {
        baselineDays: dwf.baseline_days,
        adpHours: dwf.adp_hours,
        dryDays: dwf.dry_days_used,
        averageDwf: dwf.average_dwf,
        unit: dwf.flow_unit,
      },
    );
  guard.assertClean();
  assert.deepEqual(errors, []);
} finally {
  console.log(
    "EVIDENCE " +
      (await writeEvidence(
        (process.env.ICM_EVIDENCE_DIR || "/tmp/hydra-verification-inputs") +
          "/outcomes.json",
        JSON.stringify(
          { browser: name, candidate: process.env.GITHUB_SHA, outcomes },
          null,
          2,
        ),
      )),
  );
  await browser.close();
}
