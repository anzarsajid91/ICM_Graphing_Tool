// Normal synthetic FDV/R/workbook imports and actual complete/balance engines.
import assert from "node:assert/strict";
import { chromium, firefox } from "playwright";
import {
  browserLaunchOptions,
  browserContextOptions,
} from "./browser-environment.mjs";
import { installPrivacyGuard } from "./privacy-network.mjs";
import { writeEvidence } from "./evidence-output.mjs";
import XLSX from "../vendor/sheetjs-0.20.3/xlsx.full.min.js";
const base = process.env.ICM_BASE_URL || "http://127.0.0.1:8008/";
const browserName = process.env.ICM_BROWSER || "chromium";
const browser = await { chromium, firefox }[browserName].launch(
  browserLaunchOptions(),
);
const outcomes = [];
const record = (route, control, expected, observed) => {
  outcomes.push({
    route: "survey/" + route,
    control,
    status: "PASS",
    expected,
    observed,
  });
  console.log(
    "SURVEY_PROCESS_PASS " + browserName + " " + route + " " + control,
  );
};
try {
  const context = await browser.newContext({
    ...browserContextOptions(),
    viewport: { width: 1440, height: 1000 },
  });
  const guard = installPrivacyGuard(context, base),
    page = await context.newPage(),
    errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await guard.navigate(page, base);
  await page.waitForFunction(() => window.__ICM_WORKBENCH__?.workflow26);
  assert.equal(
    await page.locator('meta[name="icm-build-sha"]').getAttribute("content"),
    process.env.GITHUB_SHA,
  );
  await page.locator('.pw-primary-nav [data-workspace="data"]').click();
  const count = 2016,
    upstream = Array.from({ length: count + 1 }, (_, i) =>
      Number((0.1 + 0.01 * Math.sin((2 * Math.PI * i) / 288)).toFixed(6)),
    );
  const expectedUp = upstream
    .slice(1)
    .reduce((sum, value, i) => sum + (upstream[i] + value) * 150, 0);
  const fdv = (name, multiplier) => ({
    name: name + ".fdv",
    mimeType: "text/plain",
    buffer: Buffer.from(
      "**IDENTIFIER: 1," +
        name +
        "\n**FIELD: 3,FLOW,DEPTH,VELOCITY\n**UNITS: 3,m3/s,m,m/s\n**CONSTANTS: 2,START,INTERVAL\n*CSTART\n2601050000 5\n*CEND\n" +
        upstream
          .map(
            (flow, i) =>
              (flow * multiplier).toFixed(6) +
              " " +
              (0.2 + 0.02 * Math.sin((2 * Math.PI * i) / 288)).toFixed(6) +
              " " +
              (0.5 + 0.02 * Math.cos((2 * Math.PI * i) / 288)).toFixed(6),
          )
          .join("\n") +
        "\n",
    ),
  });
  const rain = {
    name: "RG01.R",
    mimeType: "text/plain",
    buffer: Buffer.from(
      "**FIELD: 1,RAINFALL\n**UNITS: 1,mm/h\n*CSTART\n2601050000 2601120000 5\n*CEND\n" +
        Array.from({ length: count }, (_, i) =>
          i % 288 >= 96 && i % 288 < 120 ? "12" : "0",
        ).join(" ") +
        "\n",
    ),
  };
  await page.setInputFiles("#fileInput", [
    fdv("FM01", 1),
    fdv("FM02", 1),
    fdv("FM03", 2),
    rain,
  ]);
  await page.waitForFunction(
    () =>
      state.files.size === 4 &&
      [...state.files.values()].every((file) => file.status === "ready") &&
      !document.body.classList.contains("operation-busy"),
    null,
    { timeout: 120000 },
  );
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    book,
    XLSX.utils.aoa_to_sheet([
      ["FDV_Name", "RG", "Pipe Diameter (mm)", "Upstream Trace"],
      ["FM03", "RG01", 600, "FM01, FM02"],
      ["FM01", "RG01", 450, ""],
      ["FM02", "RG01", 450, ""],
    ]),
    "Associations",
  );
  await page.setInputFiles("#assocFileInput", {
    name: "fm_rg_assoc.xlsx",
    mimeType:
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    buffer: Buffer.from(XLSX.write(book, { type: "array", bookType: "xlsx" })),
  });
  await page.waitForFunction(
    () =>
      window.__ICM_WORKBENCH__.survey.association?.records?.length === 3 &&
      !document.body.classList.contains("operation-busy"),
    null,
    { timeout: 90000 },
  );
  const navigate = async (route) => {
    await page.evaluate(
      (route) =>
        window.__ICM_PRECISION_WORKBENCH__.navigate("survey", route, false),
      route,
    );
  };
  await page.evaluate(() => {
    window.surveyInputCalls = [];
    const original = engine.call.bind(engine);
    engine.call = async (name, args, ...rest) => {
      const values = await original(name, args, ...rest);
      if (name === "professional_survey_batch_result")
        window.surveyInputCalls.push({ ...args });
      return values;
    };
  });
  for (const route of [
    "fdv-check",
    "rainfall-check",
    "volume-balance",
    "monthly-review",
  ]) {
    await navigate(route);
    const variant = [
      "fdv-check",
      "rainfall-check",
      "volume-balance",
      "monthly-review",
    ].indexOf(route);
    const population = variant % 2 ? "under50" : "over50",
      tolerance = 7 + variant,
      cutoff = variant % 2 === 0;
    const assessmentSettings = page.locator("#surveyAssessmentSettings");
    if (!(await assessmentSettings.evaluate((el) => el.open)))
      await assessmentSettings.locator(":scope > summary").click();
    await page.locator("#surveyPopulation").selectOption(population);
    await page.locator("#surveyBalanceTolerance").fill(String(tolerance));
    await page.locator("#surveyBalanceTolerance").press("Tab");
    await page.locator("#surveyApplyFaultCutoff").setChecked(cutoff);
    const complete = page.locator("#completeSurveyPanel"),
      toggle = complete.locator(".tool-collapse-toggle").first();
    if (
      route === "fdv-check" &&
      !(await complete.evaluate((el) =>
        el.classList.contains("tool-collapsed"),
      ))
    )
      await toggle.click();
    if (
      await complete.evaluate((el) => el.classList.contains("tool-collapsed"))
    ) {
      await toggle.click();
      assert.equal(
        await complete.locator(".tool-collapse-body").first().isVisible(),
        true,
      );
      if (route === "fdv-check")
        record(
          route,
          "button:Expand",
          "Expand complete survey to expose its normal calculation action",
          "Section body visible",
        );
    }
    const previous = await page.evaluate(
      () => window.__ICM_WORKBENCH__.survey.generation,
    );
    await page.locator("#runCompleteSurveyBtn").click();
    await page.waitForFunction(
      (previous) =>
        window.__ICM_WORKBENCH__.survey.generation > previous &&
        document
          .getElementById("completeSurveyStatus")
          .textContent.includes("Complete survey assessment calculated") &&
        !document.body.classList.contains("operation-busy"),
      previous,
      { timeout: 180000 },
    );
    assert.equal(
      await page.evaluate(
        () => window.__ICM_WORKBENCH__.survey.batch.monitors.length,
      ),
      3,
    );
    assert.equal(
      await page.evaluate(() =>
        window.__ICM_WORKBENCH__.surveyFresh("complete"),
      ),
      true,
    );
    const supplied = await page.evaluate(() => window.surveyInputCalls.at(-1));
    assert.equal(supplied.population_above_50k, population === "over50");
    assert.equal(supplied.amber_tolerance_percent, tolerance);
    assert.equal(supplied.apply_fault_cutoff, cutoff);
    for (const [control, value] of [
      ["#surveyPopulation", population],
      ["#surveyBalanceTolerance", tolerance],
      ["#surveyApplyFaultCutoff", cutoff],
    ])
      record(
        route,
        control,
        "Pass the edited criterion to the actual complete-survey worker and bind fresh calculated evidence",
        { value, monitors: 3, fresh: true },
      );
    record(
      route,
      "#runCompleteSurveyBtn",
      "Run complete survey from this route with current imported source signatures",
      "Real engine result: three monitors, fresh complete signature and completed status",
    );
  }
  await navigate("volume-balance");
  const settings = page.locator("#surveyAssessmentSettings");
  if (!(await settings.evaluate((el) => el.open)))
    await settings.locator(":scope > summary").click();
  const previous = await page.evaluate(
    () => window.__ICM_WORKBENCH__.survey.generation,
  );
  await page.locator("#runSurveyBalanceBtn").click();
  await page.waitForFunction(
    (previous) =>
      window.__ICM_WORKBENCH__.survey.generation > previous &&
      window.__ICM_WORKBENCH__.survey.balance?.rows?.length &&
      !document.body.classList.contains("operation-busy"),
    previous,
    { timeout: 120000 },
  );
  const balance = await page.evaluate(
    () => window.__ICM_WORKBENCH__.survey.balance,
  );
  const row = balance.rows.find(
    (row) =>
      row.downstream_monitor === "FM03" &&
      row.upstream_monitors?.length === 2 &&
      String(row.week_ending).startsWith("2026-01-11"),
  );
  assert.ok(row);
  console.log("BALANCE_DIAGNOSTIC " + JSON.stringify({ row, expectedUp }));
  assert.ok(Math.abs(row.downstream_volume_m3 - 2 * expectedUp) < 1e-6);
  assert.ok(Math.abs(row.upstream_sum_m3 - 2 * expectedUp) < 1e-6);
  assert.ok(Math.abs(row.balance_ratio - 1) < 1e-9);
  record(
    "volume-balance",
    "#runSurveyBalanceBtn",
    "Recalculate seven-day trapezoidal continuity from 2017 native boundary samples / 2016 five-minute intervals",
    {
      expectedUpstreamEachM3: expectedUp,
      downstream: row.downstream_volume_m3,
      upstream: row.upstream_sum_m3,
      ratio: row.balance_ratio,
    },
  );
  await page.evaluate(() => window.__ICM_WORKBENCH__.workflow26.render());
  // The actual result's status is preserved; never change methods to obtain Green.
  const detailButton = page.locator("[data-w26-balance]").first();
  await detailButton.click();
  const detail = page.locator("#surveyBalanceReviewDetail");
  assert.match(await detail.innerText(), /FM01.*FM02.*FM03/);
  record(
    "volume-balance",
    "button:Details / review",
    "Select actual calculated network path",
    "Review detail identifies FM01 + FM02 → FM03",
  );
  const evidence = detail.locator("details.w26-technical-evidence"),
    summary = evidence.locator(":scope > summary");
  const opened = await evidence.evaluate((el) => el.open);
  await summary.press("Enter");
  assert.equal(await evidence.locator("pre").isVisible(), !opened);
  await summary.press("Space");
  assert.equal(await evidence.locator("pre").isVisible(), opened);
  record(
    "volume-balance",
    "summary:Balance calculation evidence",
    "Open and restore actual serialized calculation evidence",
    "Disclosure content visibility toggled and restored",
  );
  const green = page
    .locator("#surveyBalanceReviewTable [data-balance-matrix]")
    .filter({ hasText: /^Green$/ })
    .first();
  await green.click();
  assert.match(await detail.innerText(), /FM01.*FM02.*FM03/);
  record(
    "volume-balance",
    "button:Green",
    "Select the actual calculated Green balance matrix cell",
    "Selected detail identifies matching network path",
  );
  const original = await page.evaluate(() =>
    JSON.stringify(window.__ICM_WORKBENCH__.survey.balance),
  );
  await detail.locator(".w26-reviewed-status").selectOption("Green");
  await detail
    .locator(".w26-reviewer-input")
    .fill("Synthetic release reviewer");
  await detail
    .locator(".w26-review-reason-input")
    .fill(
      "Synthetic continuity fixture independently matches upstream and downstream volumes.",
    );
  await detail.locator("[data-w26-review-apply]").click();
  assert.match(
    await detail.locator(".w26-detail-status").innerText(),
    /Current reported Green/,
  );
  assert.match(
    await detail.locator(".w26-review-meta").innerText(),
    /Last reviewed.*calculated at review Green/,
  );
  assert.ok(
    await page
      .locator("#surveyBalanceReviewTable .w26-matrix-review-mark")
      .count(),
  );
  assert.equal(
    await page.evaluate(() =>
      JSON.stringify(window.__ICM_WORKBENCH__.survey.balance),
    ),
    original,
  );
  record(
    "volume-balance",
    "button:Apply engineer review",
    "Save a separate reported RAG while preserving calculated evidence",
    "New Last reviewed metadata and matrix review marker, reported Green and byte-identical calculation JSON",
  );
  await navigate("monthly-review");
  const monthly = page.locator("#surveyMonthlyReview");
  assert.equal(await monthly.count(), 1);
  const monthlySummary = monthly.locator(":scope > summary"),
    wasOpen = await monthly.evaluate((el) => el.open),
    body = monthly.locator(":scope > :not(summary)").first();
  await monthlySummary.press("Enter");
  assert.equal(await body.isVisible(), !wasOpen);
  await monthlySummary.press("Space");
  assert.equal(await body.isVisible(), wasOpen);
  record(
    "monthly-review",
    "summary:Monthly reviewSurvey synthesis and engineering actions",
    "Toggle populated monthly synthesis",
    "Synthesis body visibility changed and restored",
  );
  guard.assertClean();
  assert.deepEqual(errors, []);
} finally {
  console.log(
    "EVIDENCE " +
      (await writeEvidence(
        (process.env.ICM_EVIDENCE_DIR || "/tmp/hydra-survey-process") +
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
