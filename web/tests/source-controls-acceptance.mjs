// Synthetic imports exercise real model selection and source removal handlers.
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
const outcomes = [],
  names = [
    "CS2666_EDM.csv",
    "CS2666_Rainfall.csv",
    "FM7413.fdv",
    "FM8095.fdv",
    "FM8356.fdv",
    "Plotly-Model-FM7413.fdv",
    "Plotly-Observed-FM7413.fdv",
    "Plotly-RG5097.R",
    "Reference-FM7413.fdv",
    "Reference-RG5097.R",
    "interpret-model-a.csv",
    "interpret-model-b.csv",
    "interpret-observed.csv",
    "model.csv",
    "observed.csv",
    "rainfall.csv",
  ];
const route = "data/time-series";
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
  await page.locator('.pw-primary-nav [data-workspace="data"]').click();
  const fixtures = names.map((name, index) => {
    const value = (index + 1) / 100;
    const text = /\.fdv$/i.test(name)
      ? `**IDENTIFIER: 1,SYNTHETIC${index}\n**FIELD: 3,FLOW,DEPTH,VELOCITY\n**UNITS: 3,m3/s,m,m/s\n**CONSTANTS: 2,START,INTERVAL\n*CSTART\n2601050000 2\n*CEND\n${value} 0.2 0.5\n${value + 0.01} 0.3 0.6\n${value + 0.02} 0.4 0.7\n`
      : /\.r$/i.test(name)
        ? `**FIELD: 1,RAINFALL\n**UNITS: 1,mm/h\n*CSTART\n2601010000 2601010006 2\n*CEND\n${value} ${value + 1} ${value + 2}\n`
        : `timestamp,Flow (m3/s)\n2026-01-01T00:00:00,${value}\n2026-01-01T00:05:00,${value + 0.1}\n2026-01-01T00:10:00,${value + 0.2}\n`;
    return { name, mimeType: "text/plain", buffer: Buffer.from(text) };
  });
  await page.setInputFiles("#fileInput", fixtures);
  await page.waitForFunction(
    (names) =>
      names.every((name) =>
        [...state.files.values()].some(
          (file) => file.file.name === name && file.status === "ready",
        ),
      ),
    names,
    { timeout: 120000 },
  );
  await page.waitForFunction(
    () => !document.body.classList.contains("operation-busy") && !engine.active,
    null,
    { timeout: 60000 },
  );
  const count = await page.locator("#modelSelect option").count();
  assert.ok(count >= names.length);
  await page.locator("#modelPickerTrigger").click();
  await page.locator('#modelPickerPopover [data-action="all"]').click();
  assert.equal(
    await page
      .locator("#modelSelect")
      .evaluate((el) => [...el.options].filter((o) => o.value).length),
    await page
      .locator("#modelSelect")
      .evaluate((el) => el.selectedOptions.length),
  );
  assert.match(
    await page.locator("#modelPickerTrigger").innerText(),
    /models selected/,
  );
  assert.equal(
    await page
      .locator("#modelPickerPopover .pw-scenario-list input:not(:checked)")
      .count(),
    0,
  );
  outcomes.push({
    route,
    control: "button:data-action=all",
    status: "PASS",
    expected:
      "Select all available model series and reflect count and checkboxes",
    observed: { modelOptions: count },
  });
  await page.locator('#modelPickerPopover [data-action="none"]').click();
  assert.equal(
    await page
      .locator("#modelSelect")
      .evaluate((el) => el.selectedOptions.length),
    0,
  );
  assert.equal(
    await page
      .locator("#modelPickerPopover .pw-scenario-list input:checked")
      .count(),
    0,
  );
  assert.equal(
    await page.locator("#modelPickerTrigger").innerText(),
    "No models",
  );
  outcomes.push({
    route,
    control: "button:data-action=none",
    status: "PASS",
    expected:
      "Clear model selection and reflect zero count and unchecked checkboxes",
    observed: "No selected canonical options or checked model boxes",
  });
  await page.locator("#modelPickerTrigger").click();
  if (
    (await page.locator("#sourcePoolToggle").innerText()).startsWith("Show all")
  )
    await page.locator("#sourcePoolToggle").click();
  for (const name of names) {
    const before = await page.evaluate(() =>
      [...state.files.values()].map((file) => ({
        id: file.id,
        name: file.file.name,
        hash: file.hash,
        path: file.virtualPath,
      })),
    );
    const removed = before.find((file) => file.name === name);
    assert.ok(removed);
    const series = await page
      .locator("#observedSelect option")
      .evaluateAll(
        (options, id) =>
          options
            .filter((o) => o.value && JSON.parse(o.value)[0] === id)
            .map((o) => o.value),
        removed.id,
      );
    assert.ok(series.length, "removable source has parsed selectable series");
    await page
      .getByRole("button", { name: "Remove " + name, exact: true })
      .click();
    await page.waitForFunction(
      (id) =>
        !state.files.has(id) &&
        !document.body.classList.contains("operation-busy") &&
        !engine.active,
      removed.id,
      { timeout: 60000 },
    );
    const after = await page.evaluate(() =>
      [...state.files.values()].map((file) => ({
        id: file.id,
        name: file.file.name,
        hash: file.hash,
        path: file.virtualPath,
      })),
    );
    assert.deepEqual(
      after,
      before.filter((file) => file.id !== removed.id),
    );
    assert.equal(
      await page
        .locator("#observedSelect option")
        .evaluateAll(
          (options, keys) =>
            options.filter((o) => keys.includes(o.value)).length,
          series,
        ),
      0,
    );
    assert.match(
      await page.locator("#mappingStatus").innerText(),
      new RegExp("Removed " + name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
    );
    outcomes.push({
      route,
      control: "button:Remove " + name,
      status: "PASS",
      expected:
        "Remove exact source and its series options while preserving all sibling identities and hashes",
      observed: {
        removed: removed.name,
        remaining: after.length,
        removedOptions: series.length,
      },
    });
  }
  assert.equal(await page.locator("#poolBody tr").count(), 0);
  guard.assertClean();
  assert.deepEqual(errors, []);
} finally {
  console.log(
    "EVIDENCE " +
      (await writeEvidence(
        (process.env.ICM_EVIDENCE_DIR || "/tmp/hydra-source-controls") +
          "/outcomes.json",
        JSON.stringify(
          {
            browser: browserName,
            candidate: process.env.GITHUB_SHA,
            scope:
              "Synthetic CSV/FDV/R content bearing inventory filenames; selection and source-removal scope only",
            outcomes,
          },
          null,
          2,
        ),
      )),
  );
  await browser.close();
}
