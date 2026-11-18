// Real browser-local imports/calculations with generated synthetic traces.
// A single real import reply is held to make preview-only controls deterministic.
import assert from "node:assert/strict";
import { chromium, firefox } from "playwright";
import {
  browserLaunchOptions,
  browserContextOptions,
} from "./browser-environment.mjs";
import { installPrivacyGuard } from "./privacy-network.mjs";
import { writeEvidence } from "./evidence-output.mjs";
const base = process.env.ICM_BASE_URL || "http://127.0.0.1:8003/";
const browserName = process.env.ICM_BROWSER || "chromium";
const browser = await { chromium, firefox }[browserName].launch(
  browserLaunchOptions(),
);
const outcomes = [];
const record = (route, control, expected, observed) => {
  outcomes.push({ route, control, status: "PASS", expected, observed });
  console.log("DATA_PROCESS_PASS " + browserName + " " + control);
};
const dataRoute = "data/time-series";
try {
  const context = await browser.newContext({
    ...browserContextOptions(),
    viewport: { width: 1440, height: 1000 },
  });
  if (browserName === "chromium")
    await context.grantPermissions(["clipboard-read", "clipboard-write"], {
      origin: new URL(base).origin,
    });
  const privacy = installPrivacyGuard(context, base),
    page = await context.newPage(),
    errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await privacy.navigate(page, base);
  await page.waitForFunction(
    () =>
      window.__ICM_PRECISION_WORKBENCH__?.navigate &&
      typeof engine !== "undefined",
  );
  assert.equal(
    await page.locator('meta[name="icm-build-sha"]').getAttribute("content"),
    process.env.GITHUB_SHA,
  );
  await page.locator('.pw-primary-nav [data-workspace="data"]').click();
  await page.evaluate(() => {
    const original = engine._message.bind(engine);
    window.dataControlOriginal = original;
    engine._message = (message) => {
      if (
        message.type === "result" &&
        engine.active?.message?.type === "addFile" &&
        !window.dataControlHeld
      ) {
        window.dataControlHeld = message;
        return;
      }
      return original(message);
    };
  });
  const preview =
    "timestamp,Level (m),Rainfall (mm/h),Flow (m3/s)\n2026-01-01T00:00:00,0.2,12,0.1\n2026-01-01T00:02:00,0.3,12,0.2\n2026-01-01T00:04:00,0.4,12,0.3\n";
  await page.setInputFiles("#fileInput", {
    name: "Synthetic-preview.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(preview),
  });
  await page.waitForFunction(() => Boolean(window.dataControlHeld), null, {
    timeout: 120000,
  });
  const transient = await page.evaluate(() =>
    [...state.files.values()].map((file) => ({
      id: file.id,
      status: file.status,
    })),
  );
  assert.equal(transient.length, 1);
  assert.notEqual(transient[0].status, "ready");
  const remove = page.getByRole("button", {
    name: "Finish importing before removing",
    exact: true,
  });
  assert.equal(await remove.isDisabled(), true);
  assert.equal(
    await remove.getAttribute("data-source-remove"),
    transient[0].id,
  );
  record(
    dataRoute,
    "button:Finish importing before removing",
    "Keep the in-flight source removal disabled",
    "Real addFile result held; source exists, is not Ready, and exact remove control is disabled",
  );
  for (const quantity of ["level", "rainfall"]) {
    await page
      .locator('#fastpathPreviewBar [data-fastpath-mode="' + quantity + '"]')
      .click();
    await page.waitForFunction(
      (quantity) => window.__ICM_WORKBENCH__.fastpathPreview?.mode === quantity,
      quantity,
    );
    const shown = await page.evaluate(() =>
      window.__ICM_WORKBENCH__.fastpathPreview.series.map(
        (series) => series.quantity,
      ),
    );
    assert.deepEqual(shown, [quantity]);
    assert.equal(
      await page
        .locator('#fastpathPreviewBar [data-fastpath-mode="' + quantity + '"]')
        .evaluate((el) => el.classList.contains("active")),
      true,
    );
    record(
      dataRoute,
      "button:" + quantity[0].toUpperCase() + quantity.slice(1),
      "Select the requested preview quantity",
      "Exactly " +
        quantity +
        " preview series rendered with active control; display-only, not authoritative calculation",
    );
  }
  await page.evaluate(() => {
    engine._message = window.dataControlOriginal;
    engine._message(window.dataControlHeld);
  });
  await page.waitForFunction(
    () =>
      [...state.files.values()].every((file) => file.status === "ready") &&
      !document.body.classList.contains("operation-busy"),
    null,
    { timeout: 90000 },
  );
  async function disclosure(selector, control) {
    const details = page.locator(selector),
      summary = details.locator(":scope > summary"),
      body = details.locator(":scope > :not(summary)").first();
    assert.equal(await summary.isVisible(), true);
    const opened = await details.evaluate((el) => el.open);
    await summary.press("Enter");
    assert.equal(await details.evaluate((el) => el.open), !opened);
    assert.equal(await body.isVisible(), !opened);
    await summary.press("Space");
    assert.equal(await details.evaluate((el) => el.open), opened);
    assert.equal(await body.isVisible(), opened);
    record(
      dataRoute,
      control,
      "Toggle actual evidence content with Enter and restore with Space",
      { initialOpen: opened },
    );
  }
  await disclosure("#guidedImportReview", "summary:Import Review");
  const fdv =
    "**IDENTIFIER: 1,SYNTHETIC-FM\n**FIELD: 3,FLOW,LEVEL,VELOCITY\n**UNITS: 3,m3/s,m,m/s\n**CONSTANTS: 2,START,INTERVAL\n*CSTART\n2601010000 2\n*CEND\n" +
    Array.from(
      { length: 24 },
      (_, i) => "0.1 " + (0.2 + i * 0.01).toFixed(3) + " 0.5",
    ).join("\n") +
    "\n";
  const rain =
    "**FIELD: 1,RAINFALL\n**UNITS: 1,mm/h\n*CSTART\n2601010000 2601010048 2\n*CEND\n" +
    Array(24).fill("12").join(" ") +
    "\n";
  await page.setInputFiles("#fileInput", [
    {
      name: "Synthetic-control.fdv",
      mimeType: "text/plain",
      buffer: Buffer.from(fdv),
    },
    {
      name: "Synthetic-control.R",
      mimeType: "text/plain",
      buffer: Buffer.from(rain),
    },
  ]);
  await page.waitForFunction(
    () =>
      state.files.size === 3 &&
      [...state.files.values()].every((file) => file.status === "ready") &&
      !document.body.classList.contains("operation-busy"),
    null,
    { timeout: 90000 },
  );
  const option = async (selector, name, quantity) =>
    page
      .locator(selector + " option")
      .evaluateAll(
        (opts, { name, quantity }) =>
          opts.find(
            (option) =>
              option.textContent.includes(name) &&
              (!quantity ||
                option.textContent.toLowerCase().includes(quantity)),
          )?.value,
        { name, quantity },
      );
  await page.selectOption(
    "#observedSelect",
    await option("#observedSelect", "Synthetic-control.fdv"),
  );
  await page.selectOption("#modelSelect", []);
  await page.selectOption(
    "#rainSelect",
    await option("#rainSelect", "Synthetic-control.R", "rainfall"),
  );
  await page.locator("#applyMappingBtn").click();
  await page.waitForFunction(
    () =>
      window.__ICM_WORKBENCH__.uiV2.graphRefreshing === false &&
      window.__ICM_WORKBENCH__.lastPanelOrder?.includes("level"),
    null,
    { timeout: 90000 },
  );
  assert.match(
    await page.locator("#observedSelect option:checked").innerText(),
    /Flow \/ Level \/ Velocity/,
  );
  assert.equal(
    await page
      .locator("#timeChart")
      .evaluate(
        (chart) => chart.data.find((trace) => trace.name === "Rainfall").type,
      ),
    "scatter",
  );
  assert.equal(await page.locator("#timeChart .no-webgl:visible").count(), 0);
  await page.locator('#v2ChannelNav [data-channel="level"]').click();
  await page.waitForFunction(
    () =>
      JSON.stringify(window.__ICM_WORKBENCH__.lastPanelOrder) ===
      JSON.stringify(["rainfall", "level"]),
    null,
    { timeout: 60000 },
  );
  assert.equal(
    await page
      .locator('#v2ChannelNav [data-channel="level"]')
      .getAttribute("aria-pressed"),
    "true",
  );
  record(
    dataRoute,
    "button:Level",
    "Render authoritative level-only hydraulic panel with rainfall",
    "Real imported FDV level mode has rainfall/level panels and pressed state; preview Level also checked",
  );
  const graph = page.locator("#timeChart");
  const visible = await graph.evaluate(async (chart) => {
    const trace = chart.data.find((trace) =>
      /Observed level/i.test(trace.name),
    );
    const range = [trace.x[4], trace.x[9]];
    await Plotly.relayout(chart, { "xaxis.range": range });
    return range;
  });
  await page.waitForFunction(
    () => window.__ICM_WORKBENCH__.uiV2.graphRefreshing === false,
    null,
    { timeout: 90000 },
  );
  async function clickMode(title) {
    await graph.hover();
    await graph.locator('.modebar-btn[data-title="' + title + '"]').click();
  }
  await clickMode("Fit Y axes to visible period");
  await page.waitForFunction(() =>
    /fitted/.test(
      document.getElementById("v2GraphInteractionStatus").textContent,
    ),
  );
  const fit = await graph.evaluate((chart) => {
    const trace = chart.data.find((trace) =>
      /Observed level/i.test(trace.name),
    );
    const axis = trace.yaxis === "y" ? "yaxis" : "yaxis" + trace.yaxis.slice(1);
    return chart.layout[axis].range;
  });
  assert.ok(Math.abs(fit[0] - (0.24 - 0.003)) < 1e-9);
  assert.ok(Math.abs(fit[1] - (0.29 + 0.003)) < 1e-9);
  record(
    dataRoute,
    "button:Fit Y axes to visible period",
    "Fit selected visible level samples with six percent padding",
    fit,
  );
  await clickMode("Use visible period for analysis");
  const period = await page.evaluate(() => [
    document.getElementById("analysisStart").value,
    document.getElementById("analysisEnd").value,
  ]);
  assert.deepEqual(period, ["2026-01-01T00:08", "2026-01-01T00:18"]);
  record(
    dataRoute,
    "button:Use visible period for analysis",
    "Copy exact visible dates into analysis period",
    period,
  );
  const inspector = page.locator("#pwInspectorToggle");
  if ((await inspector.getAttribute("aria-expanded")) !== "true")
    await inspector.click();
  await page.locator("#clearPeriodBtn").click();
  await page.waitForFunction(
    () => window.__ICM_WORKBENCH__.uiV2.graphRefreshing === false,
    null,
    { timeout: 90000 },
  );
  await clickMode("Add multiple exclusion periods");
  assert.equal(
    await page.evaluate(() => window.__ICM_WORKBENCH__.uiV2.exclusionCapture),
    true,
  );
  assert.equal(
    await graph.evaluate((chart) => chart.layout.dragmode),
    "select",
  );
  await graph.evaluate(
    (chart, range) => chart.emit("plotly_selected", { range: { x: range } }),
    visible,
  );
  await page.waitForFunction(
    () =>
      state.exclusions.length === 1 &&
      window.__ICM_WORKBENCH__.uiV2.graphRefreshing === false,
    null,
    { timeout: 90000 },
  );
  assert.equal(
    await page.evaluate(() => state.exclusions[0].reason),
    "Graph-selected exclusion",
  );
  await clickMode("Add multiple exclusion periods");
  assert.equal(
    await page.evaluate(() => window.__ICM_WORKBENCH__.uiV2.exclusionCapture),
    false,
  );
  assert.equal(await graph.evaluate((chart) => chart.layout.dragmode), "zoom");
  record(
    dataRoute,
    "button:Add multiple exclusion periods",
    "Enable capture, store selected range via the chart event, and return to zoom",
    "Capture enabled, select drag mode, one persisted graph-selected exclusion and zoom restoration asserted; synthetic selection event",
  );
  const raw = page
    .locator("details")
    .filter({
      has: page
        .locator(":scope > summary")
        .getByText("Raw source statistics (before exclusions)", {
          exact: true,
        }),
    });
  assert.equal(await raw.count(), 1);
  await disclosure(
    'details:has(> summary:text-is("Raw source statistics (before exclusions)"))',
    "summary:Raw source statistics (before exclusions)",
  );
  await disclosure(
    "#pwTimeSeriesEventSurface",
    "summary:Rainfall events on Time seriesWAPUG presets or manual event criteriaSettings and overlay",
  );
  const rainfall = page.locator("#pwTimeSeriesEventSurface");
  if (!(await rainfall.evaluate((el) => el.open)))
    await rainfall.locator(":scope > summary").click();
  const generation = await page.evaluate(
    () => window.__ICM_WORKBENCH__.uiV3.rainGeneration,
  );
  await page.locator("#refreshCumulativeRainBtn").click();
  await page.waitForFunction(
    (generation) =>
      window.__ICM_WORKBENCH__.uiV3.rainGeneration > generation &&
      window.__ICM_WORKBENCH__.lastCumulativeRainfall?.totals?.some(
        (row) =>
          row.file === "Synthetic-control.R" &&
          Math.abs(row.total_mm - 9.6) < 1e-9,
      ),
    generation,
    { timeout: 90000 },
  );
  assert.match(await page.locator("#cumulativeRainTotals").innerText(), /9\.6/);
  record(
    dataRoute,
    "#refreshCumulativeRainBtn",
    "Recalculate native-interval cumulative intensity as 24 × 12 × 2/60 mm",
    "New generation; 9.6 mm for synthetic .R file; raw-source total unaffected by assessment exclusion",
  );
  await graph.evaluate((chart) => {
    const trace = chart.data.find((trace) =>
      /Observed level/i.test(trace.name),
    );
    chart.emit("plotly_click", {
      points: [{ x: trace.x[0], y: trace.y[0], fullData: trace }],
    });
  });
  const point = await page.locator("#v2PointInspectorValue").innerText();
  assert.match(point, /Observed level/i);
  await page.locator("#v2PointInspectorCopy").click();
  await page.waitForFunction(
    () =>
      document.getElementById("v2GraphInteractionStatus").textContent ===
      "Selected graph point copied to the clipboard.",
  );
  if (browserName === "chromium")
    assert.equal(
      await page.evaluate(() => navigator.clipboard.readText()),
      point,
    );
  // Paste into a test-only editable surface to observe actual clipboard content.
  await page.evaluate(() => {
    const box = document.createElement("textarea");
    box.id = "syntheticClipboardProbe";
    box.style.cssText = "position:fixed;top:10px;left:500px;z-index:99999";
    document.body.appendChild(box);
    box.focus();
  });
  await page.keyboard.press("Control+V");
  if (browserName === "firefox")
    assert.equal(
      await page.locator("#syntheticClipboardProbe").inputValue(),
      point,
    );
  await page.locator("#syntheticClipboardProbe").evaluate((el) => el.remove());
  record(
    dataRoute,
    "#v2PointInspectorCopy",
    "Copy exact inspected point to local clipboard; Chromium readText / Firefox paste verify bytes",
    point,
  );
  await page.evaluate(() =>
    window.__ICM_PRECISION_WORKBENCH__.navigate("spills", "assessment", false),
  );
  const before = await page.evaluate(() => state.exclusions.length);
  await page
    .getByRole("button", { name: "Exclude visible period", exact: true })
    .click();
  assert.equal(await page.evaluate(() => state.exclusions.length), before + 1);
  const exclusions = await page.evaluate(() =>
    structuredClone(state.exclusions),
  );
  await page.locator("#exclusionRows .remove-ex").last().click();
  await page.waitForFunction(
    () => !document.body.classList.contains("operation-busy"),
  );
  assert.deepEqual(
    await page.evaluate(() => state.exclusions),
    exclusions.slice(0, -1),
  );
  record(
    "spills/assessment",
    "button:Exclude visible period",
    "Append the visible graph range to exclusions",
    { before, after: before + 1 },
  );
  record(
    "spills/assessment",
    "button:Remove",
    "Remove the selected exclusion and preserve siblings",
    "Remaining exclusion objects equal original prefix",
  );
  await page.getByRole("button", { name: "Undo removal", exact: true }).click();
  await page.waitForFunction(
    () =>
      !document.body.classList.contains("operation-busy") &&
      document
        .getElementById("spillRunStatus")
        .textContent.includes(
          "Every exclusion requires start, end and a reason.",
        ),
  );
  const canonical = (rows) =>
    rows.map((row) => ({
      ...row,
      start: Date.parse(row.start + "Z"),
      end: Date.parse(row.end + "Z"),
    }));
  assert.deepEqual(
    canonical(await page.evaluate(() => state.exclusions)),
    canonical(exclusions),
  );
  record(
    "spills/assessment",
    "button:Undo removal",
    "Restore the most recently removed exclusion with equivalent model-clock boundaries",
    "IDs and equivalent boundaries restored; incomplete draft reason is reported visibly without unhandled rejection; no calculation accepted",
  );
  // Clear bounded UI fixture exclusions before the independent threshold count.
  await page.evaluate(() => {
    state.exclusions = [];
    renderExclusions();
  });
  await page.locator("#obsThreshold").fill("0.3");
  await page.locator("#runSpillsBtn").click();
  await page.waitForFunction(
    () =>
      document
        .getElementById("spillRunStatus")
        .textContent.includes("Completed in") && state.spills.observed,
    null,
    { timeout: 120000 },
  );
  const calculated = await page.evaluate(() => ({
    count: state.spills.observed.total_spill_count,
    hours: state.spills.observed.total_spill_duration_hours,
  }));
  assert.equal(calculated.count, 1);
  assert.ok(Math.abs(calculated.hours - 26 / 60) < 1e-9);
  for (const [selector, control] of [
    [
      "#spillRecordDetails",
      "summary:Spill records · observed and modelled Show recordsHide records",
    ],
    [".v2-monthly-detail", "summary:Monthly detail"],
  ]) {
    for (const details of await page.locator(selector).all()) {
      const summary = details.locator(":scope > summary"),
        body = details.locator(":scope > :not(summary)").first(),
        opened = await details.evaluate((el) => el.open);
      await summary.press("Enter");
      assert.equal(await body.isVisible(), !opened);
      await summary.press("Space");
      assert.equal(await body.isVisible(), opened);
    }
    assert.ok(await page.locator(selector).count());
    record(
      "spills/assessment",
      control,
      "Show and restore populated calculated evidence",
      { calculated },
    );
  }
  privacy.assertClean();
  assert.deepEqual(errors, []);
} finally {
  console.log(
    "EVIDENCE " +
      (await writeEvidence(
        (process.env.ICM_EVIDENCE_DIR || "/tmp/hydra-data-process-controls") +
          "/outcomes.json",
        JSON.stringify(
          { browser: browserName, candidate: process.env.GITHUB_SHA, outcomes },
          null,
          2,
        ),
      )),
  );
  await browser.close();
}
