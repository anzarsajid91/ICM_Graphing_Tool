// Shared fields: real source registry filtering and notes carried through exports.
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { chromium, firefox } from "playwright";
import {
  browserLaunchOptions,
  browserContextOptions,
} from "./browser-environment.mjs";
import { installPrivacyGuard } from "./privacy-network.mjs";
import { writeEvidence } from "./evidence-output.mjs";
const base = process.env.ICM_BASE_URL || "http://127.0.0.1:8008/";
const name = process.env.ICM_BROWSER || "chromium",
  browser = await { chromium, firefox }[name].launch(browserLaunchOptions());
const outcomes = [];
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
  await page.locator('.pw-primary-nav [data-workspace="data"]').click();
  await page.setInputFiles(
    "#fileInput",
    ["Alpha", "Beta"].map((label, index) => ({
      name: label + "-synthetic.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(
        "timestamp,Flow (m3/s)\n2026-01-01T00:00:00," +
          (index + 1) / 10 +
          "\n2026-01-01T00:05:00," +
          (index + 2) / 10 +
          "\n2026-01-01T00:10:00," +
          (index + 3) / 10 +
          "\n",
      ),
    })),
  );
  await page.waitForFunction(
    () =>
      state.files.size === 2 &&
      [...state.files.values()].every((file) => file.status === "ready") &&
      !document.body.classList.contains("operation-busy"),
    null,
    { timeout: 90000 },
  );
  await page.evaluate(() => window.__ICM_PRECISION_WORKBENCH__.setFocus(false));
  const sourceIdentity = await page.evaluate(() =>
    [...state.files.values()].map((file) => ({
      id: file.id,
      hash: file.hash,
      status: file.status,
    })),
  );
  await page.evaluate(() => {
    window.sharedInputHealthCalls = [];
    const original = engine.call.bind(engine);
    engine.call = async (name, args, ...rest) => {
      const result = await original(name, args, ...rest);
      if (name === "data_assessment")
        window.sharedInputHealthCalls.push({ ...args });
      return result;
    };
  });
  const runHealth = async () => {
    await page.evaluate(() =>
      window.__ICM_PRECISION_WORKBENCH__.navigate("survey", "fdv-check", false),
    );
    await page.locator("#runHealthBtn").click();
    await page.waitForFunction(
      () =>
        healthFresh() && !document.body.classList.contains("operation-busy"),
      null,
      { timeout: 90000 },
    );
  };
  await runHealth();
  const routes = await page.evaluate(() =>
    Object.entries(window.__ICM_PRECISION_WORKBENCH__.routes).flatMap(
      ([workspace, config]) =>
        Object.keys(config.pages).map((route) => workspace + "/" + route),
    ),
  );
  for (const route of routes) {
    await page.evaluate(
      (route) =>
        window.__ICM_PRECISION_WORKBENCH__.navigate(...route.split("/"), false),
      route,
    );
    const search = page.locator("#pwAssetSearch");
    await search.fill("");
    const all = await page
      .locator("#pwAssets .pw-asset-item strong")
      .allTextContents();
    assert.equal(all.length, 2);
    await search.fill("ALPHA");
    assert.deepEqual(
      await page.locator("#pwAssets .pw-asset-item strong").allTextContents(),
      all.filter((value) => value.toLowerCase().includes("alpha")),
    );
    assert.equal(await page.locator("#pwAssets .pw-asset-item").count(), 1);
    await search.fill("no-matching-synthetic-asset");
    assert.equal(await page.locator("#pwAssets .pw-asset-item").count(), 0);
    assert.equal(
      await page.locator("#pwAssets .pw-empty-assets").innerText(),
      "No matching assets.",
    );
    await search.fill("");
    assert.deepEqual(
      await page.locator("#pwAssets .pw-asset-item strong").allTextContents(),
      all,
    );
    assert.deepEqual(
      await page.evaluate(() =>
        [...state.files.values()].map((file) => ({
          id: file.id,
          hash: file.hash,
          status: file.status,
        })),
      ),
      sourceIdentity,
    );
    outcomes.push({
      route,
      control: "#pwAssetSearch",
      status: "PASS",
      expected:
        "Filter actual assets case-insensitively, show no-match state, clear and restore without mutating source identity",
      observed: all,
    });
    const notes = page.locator("#reviewNotes");
    if (await notes.isVisible()) {
      const value = "Synthetic review note from " + route;
      await notes.fill(value);
      assert.equal(
        await page.evaluate(() => workspaceObject().review_notes),
        value,
      );
      await page.evaluate(() =>
        window.__ICM_PRECISION_WORKBENCH__.navigate("home", "overview", false),
      );
      assert.equal(
        await page.evaluate(() => workspaceObject().review_notes),
        value,
      );
      await page.evaluate(
        (route) =>
          window.__ICM_PRECISION_WORKBENCH__.navigate(
            ...route.split("/"),
            false,
          ),
        route,
      );
      assert.equal(await notes.inputValue(), value);
      outcomes.push({
        route,
        control: "#reviewNotes",
        status: "PASS",
        expected:
          "Carry edited notes into workspace serialization and preserve them across navigation",
        observed: value,
      });
    }
    if (route === "data/time-series" || route.startsWith("survey/")) {
      if (route.startsWith("survey/")) {
        const settings = page.locator("#surveyAssessmentSettings");
        if (!(await settings.evaluate((el) => el.open)))
          await settings.locator(":scope > summary").click();
      }
      const gap = String(240 + routes.indexOf(route));
      await page.locator("#gapInput").fill(gap);
      await page.locator("#gapInput").press("Tab");
      await page.waitForFunction(() => !healthFresh() && !state.healthResult);
      await runHealth();
      const calls = await page.evaluate(() =>
        window.sharedInputHealthCalls.slice(-2),
      );
      assert.equal(calls.length, 2);
      assert.ok(calls.every((call) => call.max_gap_seconds === Number(gap)));
      outcomes.push({
        route,
        control: "#gapInput",
        status: "PASS",
        expected:
          "Invalidate prior quality results, pass edited seconds to each real source assessment and bind a fresh result",
        observed: { maxGapSeconds: Number(gap), assessments: calls.length },
      });
      await page.evaluate(
        (route) =>
          window.__ICM_PRECISION_WORKBENCH__.navigate(
            ...route.split("/"),
            false,
          ),
        route,
      );
    }
    console.log("SHARED_INPUT_PASS " + name + " " + route);
  }
  await page.evaluate(() =>
    window.__ICM_PRECISION_WORKBENCH__.navigate("data", "time-series", false),
  );
  for (const [id, key] of [
    ["timeBasisConfirmed", "time_basis_confirmed"],
    ["levelDatumConfirmed", "level_datum_confirmed"],
  ]) {
    await page.locator("#" + id).check();
    assert.equal(
      await page.evaluate((key) => workspaceObject()[key], key),
      true,
    );
    await page.locator("#" + id).uncheck();
    assert.equal(
      await page.evaluate((key) => workspaceObject()[key], key),
      false,
    );
    outcomes.push({
      route: "data/time-series",
      control: "#" + id,
      status: "PASS",
      expected:
        "Record checked and unchecked engineer-confirmation metadata in the exported workspace",
      observed: { key, checked: true, unchecked: false },
    });
  }
  await page.evaluate(() =>
    window.__ICM_PRECISION_WORKBENCH__.navigate("spills", "assessment", false),
  );
  for (const [id, key] of [
    ["timeBasisConfirmed", "time_basis_confirmed"],
    ["levelDatumConfirmed", "level_datum_confirmed"],
  ]) {
    await page.locator("#spill-" + id).check();
    assert.equal(await page.locator("#" + id).isChecked(), true);
    assert.equal(
      await page.evaluate((key) => workspaceObject()[key], key),
      true,
    );
    await page.locator("#spill-" + id).uncheck();
    assert.equal(await page.locator("#" + id).isChecked(), false);
    assert.equal(
      await page.evaluate((key) => workspaceObject()[key], key),
      false,
    );
    outcomes.push({
      route: "spills/assessment",
      control: "#spill-" + id,
      status: "PASS",
      expected:
        "Synchronize mirrored confirmation controls with original fields and workspace metadata",
      observed: { key, checked: true, unchecked: false },
    });
  }
  await page.evaluate(() =>
    window.__ICM_PRECISION_WORKBENCH__.navigate("data", "time-series", false),
  );
  const option = async (selector, text) =>
    page
      .locator(selector + " option")
      .evaluateAll(
        (options, text) =>
          options.find((option) => option.textContent.includes(text))?.value,
        text,
      );
  await page.selectOption(
    "#observedSelect",
    await option("#observedSelect", "Alpha-synthetic"),
  );
  await page.selectOption("#modelSelect", []);
  await page.selectOption("#rainSelect", "");
  await page.locator("#applyMappingBtn").click();
  await page.waitForFunction(
    () => window.__ICM_WORKBENCH__.uiV2.graphRefreshing === false,
    null,
    { timeout: 90000 },
  );
  await page.evaluate(() =>
    window.__ICM_PRECISION_WORKBENCH__.navigate(
      "reports",
      "report-generation",
      false,
    ),
  );
  await page.locator("#reportIncludeTimeSeries").check();
  for (const id of [
    "reportIncludeSpillsStorage",
    "reportIncludeComparison",
    "reportIncludeSurvey",
  ])
    await page.locator("#" + id).uncheck();
  const note = "Synthetic exported note <tag> & exact text";
  await page.locator("#reviewNotes").fill(note);
  const pending = page.waitForEvent("download");
  await page.locator("#downloadReportBtn").click();
  const download = await pending;
  assert.equal(await download.failure(), null);
  const html = await fs.readFile(await download.path(), "utf8");
  assert.match(html, /Synthetic exported note &lt;tag&gt; &amp; exact text/);
  assert.ok(!html.includes("<tag>"));
  assert.ok(html.includes("<h2>Full time-period graph</h2>"));
  assert.ok(!html.includes("<h2>Spill / EDM assessment</h2>"));
  assert.ok(!html.includes("<h2>Observed vs modelled comparison</h2>"));
  const exported = async () => {
    const pending = page.waitForEvent("download");
    await page.locator("#downloadReportBtn").click();
    const download = await pending;
    assert.equal(await download.failure(), null);
    return fs.readFile(await download.path(), "utf8");
  };
  await page.locator("#reportIncludeTimeSeries").uncheck();
  const noTime = await exported();
  assert.ok(!noTime.includes('id="assessment-time-graph-data"'));
  assert.ok(noTime.includes("<h2>Reviewer notes</h2>"));
  outcomes.push({
    route: "reports/report-generation",
    control: "#reportIncludeTimeSeries",
    status: "PASS",
    expected:
      "Include or omit the actual full-period report graph from the explicit selection",
    observed:
      "First download contains full-period graph; unchecked download omits its payload while preserving reviewer notes",
  });
  for (const [id, heading] of [
    ["reportIncludeSpillsStorage", "Spill / EDM assessment"],
    ["reportIncludeComparison", "Observed vs modelled comparison"],
  ]) {
    await page.locator("#" + id).check();
    const selected = await exported();
    assert.ok(selected.includes("<h2>" + heading + "</h2>"));
    await page.locator("#" + id).uncheck();
    outcomes.push({
      route: "reports/report-generation",
      control: "#" + id,
      status: "PASS",
      expected: "Include the requested section and omit it when unchecked",
      observed:
        "Selected section heading present; first time-only download omits it. Empty calculation placeholders remain explicit; engine correctness tested separately.",
    });
  }
  guard.assertClean();
  assert.deepEqual(errors, []);
} finally {
  console.log(
    "EVIDENCE " +
      (await writeEvidence(
        (process.env.ICM_EVIDENCE_DIR || "/tmp/hydra-shared-inputs") +
          "/outcomes.json",
        JSON.stringify(
          {
            browser: name,
            candidate: process.env.GITHUB_SHA,
            outcomes,
            scope:
              "Actual shared input fields; generated source registry and actual escaped report export",
          },
          null,
          2,
        ),
      )),
  );
  await browser.close();
}
