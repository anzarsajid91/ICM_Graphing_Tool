// Synthetic survey UI acceptance: fixture ratings are not engineering calculations.
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { chromium, firefox } from "playwright";
import {
  browserLaunchOptions,
  browserContextOptions,
} from "./browser-environment.mjs";
import { installPrivacyGuard } from "./privacy-network.mjs";
import { writeEvidence } from "./evidence-output.mjs";
const base = process.env.ICM_BASE_URL || "http://127.0.0.1:8004/",
  name = process.env.ICM_BROWSER || "chromium";
const browser = await (name === "firefox" ? firefox : chromium).launch(
  browserLaunchOptions(),
);
const context = await browser.newContext({
    ...browserContextOptions(),
    viewport: { width: 1440, height: 1000 },
  }),
  page = await context.newPage();
const privacy = installPrivacyGuard(context, base),
  rows = [],
  errors = [];
page.on("pageerror", (e) => errors.push(e.message));
const record = (route, control, expected, observed) =>
  rows.push({
    route: "survey/" + route,
    control,
    status: "PASS",
    expected,
    observed,
  });
const settle = () =>
  page.evaluate(
    () =>
      new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))),
  );
const navigate = async (route) => {
  await page.evaluate(
    (r) => window.__ICM_PRECISION_WORKBENCH__.navigate("survey", r, false),
    route,
  );
  await settle();
};
try {
  await page.goto(base, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => window.__ICM_WORKBENCH__?.workflow26);
  const build = await page
    .locator('meta[name="icm-build-sha"]')
    .getAttribute("content");
  if (process.env.GITHUB_SHA) assert.equal(build, process.env.GITHUB_SHA);
  await page.evaluate(() => {
    const wb = window.__ICM_WORKBENCH__,
      s = wb.survey,
      names = ["FM01", "FM02", "FM03", "FM04"],
      ratings = ["Green", "Amber", "Red", "Grey"];
    const week = (rag) => ({
      start: "2026-09-01T00:00:00",
      end: "2026-09-07T00:00:00",
      week_ending: "2026-09-06",
      rag,
      decision_path: "Synthetic UI control fixture",
      coverage_percent: 93.25,
    });
    s.association = {
      records: names.map((monitor, i) => ({
        monitor,
        rain_gauge: "RG" + String(i + 1).padStart(2, "0"),
        diameter_mm: 600,
        upstream: i ? [names[i - 1]] : [],
      })),
    };
    s.batch = {
      monitors: names.map((monitor, i) => ({
        monitor,
        status: "complete",
        rain_gauge: "RG" + String(i + 1).padStart(2, "0"),
        diameter_mm: 600,
        weekly: { weeks: [week(ratings[i])] },
        event_response: {
          rows: [
            {
              event: "Synthetic event",
              event_start: "2026-09-02",
              depth_velocity_response: "Synthetic response",
              min_depth_at_peak_flow_m: 0.25,
              min_depth_pass: true,
              response_ratio: 1.3,
              comments: ["Synthetic event detail"],
            },
          ],
        },
        contracts: {},
      })),
      network: {
        gauge_count: 4,
        criteria: {},
        gauge_summary: ratings.map((status, i) => ({
          gauge: "RG" + String(i + 1).padStart(2, "0"),
          status,
          operational_coverage_percent: 93.25,
          event_strike_count: 0,
        })),
        gauge_weekly: ratings.map((rag, i) => ({
          gauge: "RG" + String(i + 1).padStart(2, "0"),
          ...week(rag),
        })),
        candidate_wapug_events: [],
        qualified_wapug_events: [],
      },
      volume_balance: { rows: [], summary: {} },
      analysis_controls: {},
    };
    s.batchSignature = wb.surveyDependencySignature("complete");
    wb.workflow26.render();
  });
  assert(
    await page.evaluate(() => window.__ICM_WORKBENCH__.surveyFresh("complete")),
    "fixture uses actual current dependency signature",
  );
  for (const [route, suffix, prefix] of [
    ["fdv-check", "fdv", "FM"],
    ["rainfall-check", "rain", "RG"],
  ]) {
    await navigate(route);
    const drawer = page.locator("#assessmentDrawer-" + suffix),
      viewport = page.locator("#assessmentSchematicViewport-" + suffix);
    for (const [index, rating] of ["Green", "Amber", "Red", "Grey"].entries()) {
      const id = prefix + String(index + 1).padStart(2, "0"),
        node = viewport.locator(
          "[" +
            (suffix === "fdv" ? "data-survey-node" : "data-survey-gauge") +
            '="' +
            id +
            '"]',
        );
      assert.match(
        await node.getAttribute("aria-label"),
        new RegExp(id + ".*" + rating),
      );
      await node.click();
      await drawer.locator('[data-drawer-tab="overview"]').click();
      assert.match(await drawer.locator("h4").innerText(), new RegExp(id));
      assert.match(
        await drawer.locator(".w26-drawer-status").innerText(),
        new RegExp("Calculated " + rating),
      );
      record(
        route,
        "g:Review " + id + " · " + rating,
        "Select the specific synthetic " +
          rating +
          " node and display its calculated status.",
        id + " selected; drawer calculated " + rating + ".",
      );
    }
    await viewport
      .locator(
        "[" +
          (suffix === "fdv" ? "data-survey-node" : "data-survey-gauge") +
          '="' +
          prefix +
          '02"]',
      )
      .click();
    await drawer.locator('[data-exception-step="1"]').click();
    assert.match(
      await drawer.locator("h4").innerText(),
      new RegExp(prefix + "03"),
    );
    record(
      route,
      "button:Next exception →",
      "Move from Amber exception to next Red exception.",
      prefix + "03 selected.",
    );
    await drawer.locator('[data-exception-step="-1"]').click();
    assert.match(
      await drawer.locator("h4").innerText(),
      new RegExp(prefix + "02"),
    );
    record(
      route,
      "button:← Previous exception",
      "Return to previous Amber exception.",
      prefix + "02 selected.",
    );
    await drawer.locator('[data-drawer-tab="evidence"]').click();
    assert.match(await drawer.locator(".w26-drawer-body").innerText(), /93.25/);
    assert.match(
      await drawer.locator(".w26-drawer-body").innerText(),
      /Synthetic UI control fixture/,
    );
    if (suffix === "fdv")
      assert.match(
        await drawer.locator(".w26-drawer-body").innerText(),
        /Synthetic event detail/,
      );
    record(
      route,
      "button:Evidence",
      "Show selected weekly scalar and event/gauge evidence.",
      "Coverage 93.25 and synthetic decision path rendered" +
        (suffix === "fdv" ? " with synthetic event detail." : "."),
    );
    await drawer.locator('[data-drawer-tab="audit"]').click();
    const editor = drawer.locator(".weekly-editor");
    await editor.locator(".weekly-reviewer").fill("Synthetic reviewer");
    await editor.locator('[data-week-note="Pumping influence noted."]').click();
    assert.equal(
      await editor.locator(".weekly-comment").inputValue(),
      "Pumping influence noted.",
    );
    record(
      route,
      "button:Pumping influence",
      "Insert pumping influence context into current weekly comment.",
      "Exact pumping context text appears in weekly editor.",
    );
    await editor.locator(".weekly-rating").selectOption("Green");
    await editor.locator("[data-week-save]").click();
    assert(
      await page.evaluate(
        (prefix) =>
          Object.values(window.__ICM_WORKBENCH__.survey.reviews).some(
            (r) =>
              r.monitor_or_gauge === prefix + "02" &&
              r.reason === "Pumping influence noted." &&
              r.reviewed_status === "Green",
          ),
        prefix,
      ),
    );
    record(
      route,
      "button:Save weekly review",
      "Save current review with reviewer, reason and changed rating.",
      "Current " +
        prefix +
        "02 weekly review saved Green with pumping context.",
    );
    await editor.locator("[data-week-reset]").click();
    assert.equal(await editor.locator("[data-week-reset]").count(), 0);
    assert.equal(await editor.locator(".weekly-rating").inputValue(), "auto");
    assert.equal(await editor.locator(".weekly-comment").inputValue(), "");
    assert(
      await page.evaluate(
        (prefix) =>
          !Object.values(window.__ICM_WORKBENCH__.survey.reviews).some(
            (r) => r.monitor_or_gauge === prefix + "02",
          ) &&
          window.__ICM_WORKBENCH__.survey.reviewLedger.some(
            (r) => r.event_type === "reverted_to_calculated",
          ),
        prefix,
      ),
    );
    record(
      route,
      "button:Reset this week",
      "Remove active review and restore calculated weekly rating while retaining audit event.",
      "Review removed, auto rating restored, comment cleared, reset ledger event retained.",
    );
    const pan = page.locator(
      '[data-schematic-pan][data-schematic-kind="' + suffix + '"]',
    );
    await pan.click();
    assert.equal(await pan.getAttribute("aria-pressed"), "false");
    assert.equal(await viewport.getAttribute("data-pan"), "off");
    await pan.click();
    assert.equal(await viewport.getAttribute("data-pan"), "on");
    record(
      route,
      "button:Drag the schematic to pan",
      "Toggle schematic pan interaction off and on.",
      "aria-pressed false/data-pan off, then data-pan on.",
    );
    for (let i = 0; i < 8; i++)
      await page
        .locator(
          '[data-schematic-zoom="1"][data-schematic-kind="' + suffix + '"]',
        )
        .click();
    await viewport.evaluate((el) => {
      el.scrollLeft = 0;
      el.scrollTop = 0;
    });
    const target = await viewport.evaluate((el, id) => {
      const node = el.querySelector(
          '[data-survey-node="' + id + '"],[data-survey-gauge="' + id + '"]',
        ),
        a = el.getBoundingClientRect(),
        b = node.getBoundingClientRect();
      return {
        x: Math.min(
          el.scrollWidth - el.clientWidth,
          Math.max(0, b.x + b.width / 2 - a.x - a.width / 2),
        ),
        y: Math.min(
          el.scrollHeight - el.clientHeight,
          Math.max(0, b.y + b.height / 2 - a.y - a.height / 2),
        ),
      };
    }, prefix + "02");
    await page
      .locator('[data-schematic-focus][data-schematic-kind="' + suffix + '"]')
      .click();
    const centered = await viewport.evaluate((el, id) => {
      const node = el.querySelector(
          '[data-survey-node="' + id + '"],[data-survey-gauge="' + id + '"]',
        ),
        a = el.getBoundingClientRect(),
        b = node.getBoundingClientRect();
      return {
        dx: Math.abs(b.x + b.width / 2 - a.x - a.width / 2),
        dy: Math.abs(b.y + b.height / 2 - a.y - a.height / 2),
        x: el.scrollLeft,
        y: el.scrollTop,
      };
    }, prefix + "02");
    assert(
      centered.x > 0 || centered.y > 0,
      "Focus moves camera toward selected node",
    );
    assert(
      Math.abs(centered.x - target.x) < 2 &&
        Math.abs(centered.y - target.y) < 2,
      "Selected node centered within actual scroll bounds",
    );
    record(
      route,
      "button:Focus selected",
      "Center selected node in zoomed schematic.",
      "Selected " +
        prefix +
        "02 moved to its center target clamped to actual scroll bounds, within 2 pixels.",
    );
    await drawer.locator("[data-drawer-close]").click();
    assert.equal(await drawer.locator("h4").count(), 0);
    assert.match(
      await drawer.innerText(),
      /Select a matrix cell or schematic node/,
    );
    record(
      route,
      "button:Close",
      "Close selected review drawer detail.",
      "Selected heading removed and empty-selection prompt shown.",
    );
  }

  // Additional actual desktop controls; all underlying assessment values here
  // remain synthetic UI fixtures, and are never recorded as calculated outcomes.
  for (const route of ["fdv-check", "volume-balance", "monthly-review"]) {
    await navigate(route);
    const settings = page.locator("#surveyAssessmentSettings");
    if (!(await settings.evaluate((el) => el.open)))
      await settings.locator(":scope > summary").click();
    const assoc = page.locator("#surveyAssociationPanel"),
      toggle = assoc.locator(":scope > .subhead .tool-collapse-toggle"),
      body = assoc.locator(":scope > .tool-collapse-body");
    if (await assoc.evaluate((el) => el.classList.contains("tool-collapsed")))
      await toggle.click();
    assert(await body.isVisible());
    record(
      route,
      "button:Expand Survey configuration — fm_rg_assoc.xlsx",
      "Expand the shared survey configuration panel in open desktop assessment settings.",
      "Configuration body visible after expansion; synthetic associations, no workbook import claim.",
    );
    await toggle.click();
    assert(!(await body.isVisible()));
    assert(
      await assoc.evaluate((el) => el.classList.contains("tool-collapsed")),
    );
    record(
      route,
      "button:Collapse Survey configuration — fm_rg_assoc.xlsx",
      "Collapse survey configuration panel.",
      "Configuration body hidden and tool-collapsed class set.",
    );
    await settings.locator(":scope > summary").click();
    await page.click("#surveyMonthlyReviewBtn");
    assert.deepEqual(
      await page.evaluate(() => window.__ICM_PRECISION_WORKBENCH__.route()),
      { workspace: "survey", page: "monthly-review" },
    );
    assert(
      await page.locator("#surveyMonthlyReview").evaluate((el) => el.open),
    );
    assert(await page.locator("#surveyMonthlyReviewBody").isVisible());
    record(
      route,
      "#surveyMonthlyReviewBtn",
      "Navigate to open monthly synthesis from this desktop survey page.",
      "Actual route monthly-review, disclosure open and synthesis body visible.",
    );
    if (route !== "monthly-review") {
      await navigate(route);
      const popupEvent = page.waitForEvent("popup");
      await page.click("#surveyMonthlyPdfBtn");
      const popup = await popupEvent;
      await popup.waitForFunction(() =>
        /Monthly flow survey assessment/i.test(document.body?.innerText || ""),
      );
      assert.match(
        await popup.locator("body").innerText(),
        /Monthly flow survey assessment/i,
      );
      assert.match(await popup.locator("body").innerText(), /FM01/);
      await popup.close();
      record(
        route,
        "#surveyMonthlyPdfBtn",
        "Open printable monthly report containing synthetic survey identities.",
        "Popup contains monthly assessment title and FM01; popup content contract only, no PDF visual correctness claim.",
      );
    }
  }
  await navigate("fdv-check");
  const complete = page.locator("#completeSurveyPanel"),
    completeToggle = complete.locator(".tool-collapse-toggle").first();
  if (
    !(await complete.evaluate((el) => el.classList.contains("tool-collapsed")))
  )
    await completeToggle.click();
  await completeToggle.click();
  assert(
    !(await complete.evaluate((el) => el.classList.contains("tool-collapsed"))),
  );
  assert(await complete.locator(".tool-collapse-body").first().isVisible());
  record(
    "fdv-check",
    "button:Expand Complete survey assessment",
    "Expand the complete survey assessment panel.",
    "Collapsed class removed and actual section body visible.",
  );
  const allRows = page
    .locator("details.assessment-all-rows")
    .filter({ has: page.locator("#completeSurveyMonitors") });
  if (!(await allRows.evaluate((el) => el.open)))
    await allRows.locator(":scope > summary").click();
  await page.locator('[data-w26-monitor="FM01"]').click();
  const detail = page.locator("#surveyMonitorDetail");
  assert.match(await detail.locator("h4").innerText(), /FM01/);
  assert(await detail.locator(".weekly-editor").isVisible());
  record(
    "fdv-check",
    "button:Details / review",
    "Open a monitor legacy table detail via visible All monitor assessment rows.",
    "FM01 detail heading and weekly editor shown.",
  );
  const calculated = detail
    .locator("details")
    .filter({
      has: page.getByText("Calculated evidence for this week", { exact: true }),
    })
    .first();
  await calculated.locator(":scope > summary").click();
  assert.match(await calculated.innerText(), /93.25/);
  record(
    "fdv-check",
    "summary:Calculated evidence for this week",
    "Reveal synthetic weekly scalar evidence.",
    "Opened disclosure includes fixture coverage93.25.",
  );
  const event = detail
    .locator("details")
    .filter({ has: page.getByText("Event response evidence", { exact: true }) })
    .first();
  await event.locator(":scope > summary").click();
  assert.match(await event.innerText(), /Synthetic event detail/);
  record(
    "fdv-check",
    "summary:Event response evidence",
    "Reveal selected monitor event evidence.",
    "Visible disclosure contains synthetic event detail.",
  );
  await detail.locator('[data-week-close="monitor"]').click();
  assert.equal(await detail.innerText(), "");
  record(
    "fdv-check",
    "button:Close detail",
    "Close legacy selected monitor detail.",
    "Monitor detail content removed.",
  );
  for (const [id, rating] of [
    ["FM01", "Green"],
    ["FM02", "Amber"],
  ]) {
    const cell = page.locator(
      '#assessmentMatrix-fdv [data-week-name="' + id + '"]',
    );
    await cell.click();
    const drawer = page.locator("#assessmentDrawer-fdv");
    assert((await drawer.locator("h4").innerText()).startsWith(id + " · "));
    record(
      "fdv-check",
      "button:" + rating,
      "Select calculated " + rating + " matrix cell.",
      "Actual selected drawer is " + id + ".",
    );
    await drawer.locator('[data-drawer-tab="audit"]').click();
    await drawer.locator(".weekly-reviewer").fill("Synthetic reviewer");
    await drawer.locator("[data-week-save]").click();
    assert.equal((await cell.innerText()).replace(/\s+/g, ""), rating + "R");
    await cell.click();
    assert((await drawer.locator("h4").innerText()).startsWith(id + " · "));
    record(
      "fdv-check",
      "button:" + rating + "R",
      "Select engineer-reviewed " + rating + " matrix cell.",
      "Reviewed marker rendered; clicking selects " + id + " actual detail.",
    );
  }
  await navigate("rainfall-check");
  await page
    .locator('#assessmentSchematic-rain [data-survey-gauge="RG01"]')
    .click();
  await page
    .locator('#assessmentDrawer-rain [data-drawer-tab="audit"]')
    .click();
  assert.equal(
    await page
      .locator("#assessmentDrawer-rain .weekly-editor")
      .getAttribute("data-week-name"),
    "RG01",
  );
  assert(
    await page.locator("#assessmentDrawer-rain .weekly-reviewer").isVisible(),
  );
  record(
    "rainfall-check",
    "button:Edit / audit",
    "Open the selected gauge weekly editor.",
    "RG01 editor identity and visible reviewer field asserted.",
  );

  // Inventory identities are fixed UI callback cases; injected ratings exercise
  // rendering and selection only, independently of engine benchmark evidence.
  const csv = await fs.readFile(
    new URL("../../docs/hydrabench-v2-control-results.csv", import.meta.url),
    "utf8",
  );
  const parsed = [];
  let recordFields = [],
    field = "",
    quoted = false;
  for (let i = 0; i < csv.length; i++) {
    const ch = csv[i];
    if (ch === '"') {
      if (quoted && csv[i + 1] === '"') {
        field += '"';
        i++;
      } else quoted = !quoted;
    } else if (!quoted && (ch === "," || ch === "\n")) {
      recordFields.push(field.replace(/\r$/, ""));
      field = "";
      if (ch === "\n") {
        parsed.push(recordFields);
        recordFields = [];
      }
    } else field += ch;
  }
  if (field || recordFields.length) {
    recordFields.push(field);
    parsed.push(recordFields);
  }
  const headers = parsed.shift(),
    inventory = parsed
      .filter((r) => r.length === headers.length)
      .map((r) => Object.fromEntries(headers.map((h, i) => [h, r[i]])));
  const identityCases = inventory.filter(
    (r) =>
      r.Route.startsWith("survey/") &&
      /^g:Review (FM\d+|RG\d+) · (Green|Amber|Red|Grey)$/.test(r.Control),
  );
  assert(identityCases.length > 0, "Inventory includes exact node identities");
  for (const group of [
    ...new Set(identityCases.map((r) => r.Route + "|" + r.Control)),
  ]) {
    const [route, control] = group.split("|"),
      rating = control.split(" · ")[1],
      cases = identityCases.filter(
        (r) => r.Route === route && r.Control === control,
      );
    const identities = cases.map(
      (r) => r.Control.match(/^g:Review (\w+) ·/)[1],
    );
    await page.evaluate(
      ({ identities, rating, route }) => {
        const wb = window.__ICM_WORKBENCH__,
          s = wb.survey,
          isRain = route === "survey/rainfall-check";
        const monitors = isRain ? ["SYNTHETIC_MONITOR"] : identities,
          gauges = isRain ? identities : ["SYNTHETIC_GAUGE"];
        const week = () => ({
          start: "2026-09-01T00:00:00",
          end: "2026-09-07T00:00:00",
          week_ending: "2026-09-06",
          rag: rating,
          decision_path: "Synthetic inventory identity UI fixture",
        });
        s.reviews = {};
        s.reviewLedger = [];
        s.selectedMonitor = null;
        s.selectedGauge = null;
        s.selectedWeeks = {};
        s.schematicWeek = "2026-09-06";
        s.selectedWeek = null;
        s.reviewContext = {
          kind: isRain ? "gauge-week" : "monitor-week",
          name: null,
          weekKey: null,
          drawerTab: "overview",
          exceptionsOnly: false,
          search: "",
          zoom: { fdv: 1, rain: 1 },
        };
        s.association = {
          records: monitors.map((monitor, i) => ({
            monitor,
            rain_gauge: gauges[i % gauges.length],
            diameter_mm: 600,
            upstream: i ? [monitors[i - 1]] : [],
          })),
        };
        s.batch = {
          monitors: monitors.map((monitor, i) => ({
            monitor,
            status: "complete",
            rain_gauge: gauges[i % gauges.length],
            diameter_mm: 600,
            weekly: { weeks: [week()] },
            event_response: { rows: [] },
            contracts: {},
          })),
          network: {
            gauge_count: gauges.length,
            criteria: {},
            gauge_summary: gauges.map((gauge) => ({ gauge, status: rating })),
            gauge_weekly: gauges.map((gauge) => ({ gauge, ...week() })),
            candidate_wapug_events: [],
            qualified_wapug_events: [],
          },
          volume_balance: { rows: [], summary: {} },
          analysis_controls: {},
        };
        s.batchSignature = wb.surveyDependencySignature("complete");
        wb.workflow26.render();
      },
      { identities, rating, route },
    );
    assert(
      await page.evaluate(() =>
        window.__ICM_WORKBENCH__.surveyFresh("complete"),
      ),
    );
    await navigate(route.split("/")[1]);
    const suffix = route.endsWith("rainfall-check") ? "rain" : "fdv",
      drawer = page.locator("#assessmentDrawer-" + suffix);
    for (const item of cases) {
      const id = item.Control.match(/^g:Review (\w+) ·/)[1],
        node = page.locator(
          "#assessmentSchematic-" +
            suffix +
            " [" +
            (suffix === "fdv" ? "data-survey-node" : "data-survey-gauge") +
            '="' +
            id +
            '"]',
        );
      assert.equal(
        await node.getAttribute("aria-label"),
        item.Control.slice(2),
      );
      await node.click();
      assert((await drawer.locator("h4").innerText()).startsWith(id + " · "));
      assert.match(
        await drawer.locator(".w26-drawer-status").innerText(),
        new RegExp("Calculated " + rating),
      );
      assert.equal(
        await page.evaluate(
          () => window.__ICM_WORKBENCH__.survey.reviewContext.name,
        ),
        id,
      );
      record(
        route.split("/")[1],
        item.Control,
        "Select exact synthetic inventory identity and show its injected calculated rating; UI callback contract only.",
        id +
          " is selected in actual review context and drawer with calculated " +
          rating +
          ". Source-backed current synthetic batch signature; rating is injected, not an engine result.",
      );
    }
  }
  assert.deepEqual(errors, []);
  privacy.assertClean();
  const artifact = await writeEvidence(
    (process.env.ICM_EVIDENCE_DIR || "/workspace/hydra-evidence") +
      "/survey-controls-" +
      name +
      ".json",
    JSON.stringify(
      {
        browser: name,
        build,
        fixture:
          "Synthetic UI evidence, current source-backed dependency signature; no engineering calculation claim.",
        rows,
        errors,
      },
      null,
      2,
    ),
  );
  console.log("SURVEY_CONTROLS_PASS " + artifact);
} finally {
  await browser.close();
}
