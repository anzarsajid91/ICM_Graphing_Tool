// Bounded shared-control UI checks with synthetic date traces; no engine-result claim.
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
try {
  const context = await browser.newContext({
    ...browserContextOptions(),
    viewport: { width: 1440, height: 1000 },
  });
  const guard = installPrivacyGuard(context, base),
    page = await context.newPage(),
    errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await guard.navigate(page, base);
  await page.waitForFunction(
    () => window.__ICM_PRECISION_WORKBENCH__?.navigate,
  );
  assert.equal(
    await page.locator('meta[name="icm-build-sha"]').getAttribute("content"),
    process.env.GITHUB_SHA,
  );
  const routes = [
    "data/time-series",
    "graphs/comparison",
    "graphs/dwf",
    "graphs/rating",
    "spills/storage",
    "survey/fdv-check",
    "survey/monthly-review",
    "survey/volume-balance",
    "survey/rainfall-check",
    "reports/report-generation",
    "reports/workspace",
    "spills/assessment",
  ];
  const periodRoutes = routes.slice(0, 9);
  for (const route of routes) {
    await page.evaluate(
      (route) =>
        window.__ICM_PRECISION_WORKBENCH__.navigate(...route.split("/"), false),
      route,
    );
    const inspector = page.locator("#pwInspectorToggle");
    if (
      (await inspector.isVisible()) &&
      (await inspector.getAttribute("aria-expanded")) !== "true"
    )
      await inspector.click();
    if (route.startsWith("survey/")) {
      const settings = page.locator("#surveyAssessmentSettings");
      if (!(await settings.evaluate((el) => el.open)))
        await settings.locator(":scope > summary").click();
    }
    if (periodRoutes.includes(route)) {
      // Synthetic chart domain isolates the global period callback from parsing.
      await page.evaluate(async () => {
        if (typeof Plotly === "undefined") await loadVendorScript("Plotly");
        await Plotly.newPlot(
          "timeChart",
          [
            {
              x: ["2026-01-02T03:04:00", "2026-01-03T05:06:00"],
              y: [1, 2],
              type: "scatter",
            },
          ],
          {
            xaxis: {
              type: "date",
              range: ["2026-01-02T03:04:00", "2026-01-03T05:06:00"],
            },
            height: 300,
          },
          plotConfig("synthetic-period"),
        );
        window.periodAcceptanceChanges = [];
        for (const id of ["analysisStart", "analysisEnd"])
          document
            .getElementById(id)
            .addEventListener("change", (event) =>
              window.periodAcceptanceChanges.push({
                id,
                value: event.target.value,
              }),
            );
      });
      await page.locator("#useZoomPeriodBtn").click();
      assert.equal(
        await page.locator("#analysisStart").inputValue(),
        "2026-01-02T03:04",
      );
      assert.equal(
        await page.locator("#analysisEnd").inputValue(),
        "2026-01-03T05:06",
      );
      let changes = await page.evaluate(() => [
        ...new Map(
          window.periodAcceptanceChanges.map((change) => [change.id, change]),
        ).values(),
      ]);
      assert.deepEqual(changes, [
        { id: "analysisStart", value: "2026-01-02T03:04" },
        { id: "analysisEnd", value: "2026-01-03T05:06" },
      ]);
      outcomes.push({
        route,
        control: "#useZoomPeriodBtn",
        status: "PASS",
        expected:
          "Copy bounded graph domain to both analysis controls and emit change events",
        observed: changes,
      });
      await page.evaluate(() => {
        window.periodAcceptanceChanges = [];
      });
      await page.locator("#clearPeriodBtn").click();
      assert.equal(await page.locator("#analysisStart").inputValue(), "");
      assert.equal(await page.locator("#analysisEnd").inputValue(), "");
      changes = await page.evaluate(() => [
        ...new Map(
          window.periodAcceptanceChanges.map((change) => [change.id, change]),
        ).values(),
      ]);
      assert.deepEqual(changes, [
        { id: "analysisStart", value: "" },
        { id: "analysisEnd", value: "" },
      ]);
      outcomes.push({
        route,
        control: "#clearPeriodBtn",
        status: "PASS",
        expected: "Clear both analysis bounds and emit change events",
        observed: changes,
      });
    }
    const toggles = await page.locator(".tool-collapse-toggle:visible").all();
    assert.ok(toggles.length, route + " must have section controls");
    let checked = 0;
    for (const toggle of toggles) {
      if (!(await toggle.isVisible())) continue;
      const label = await toggle.innerText();
      assert.ok(["Collapse", "Expand"].includes(label));
      if (label === "Expand") await toggle.click();
      const body = toggle.locator(
        'xpath=../following-sibling::*[contains(@class,"tool-collapse-body")]',
      );
      // Header is the direct sibling of the section body.
      assert.equal(await body.count(), 1);
      assert.equal(await toggle.getAttribute("aria-expanded"), "true");
      assert.equal(await body.isVisible(), true);
      await toggle.click();
      assert.equal(await toggle.innerText(), "Expand");
      assert.equal(await toggle.getAttribute("aria-expanded"), "false");
      assert.equal(await body.isVisible(), false);
      await toggle.click();
      assert.equal(await toggle.innerText(), "Collapse");
      assert.equal(await toggle.getAttribute("aria-expanded"), "true");
      assert.equal(await body.isVisible(), true);
      if (label === "Expand") await toggle.click();
      checked++;
    }
    assert.ok(checked, route + " tested at least one visible section body");
    outcomes.push({
      route,
      control: "button:Collapse",
      status: "PASS",
      expected:
        "Each visible section hides and restores its own content with matching expanded state",
      observed: { sections: checked },
    });
    console.log("SHARED_CASE_PASS " + browserName + " " + route);
  }
  guard.assertClean();
  assert.deepEqual(errors, []);
} finally {
  console.log(
    "EVIDENCE " +
      (await writeEvidence(
        (process.env.ICM_EVIDENCE_DIR || "/tmp/hydra-shared-controls") +
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
