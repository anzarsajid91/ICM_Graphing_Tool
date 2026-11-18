import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { chromium, firefox } from "playwright";
import {
  browserLaunchOptions,
  browserContextOptions,
} from "./browser-environment.mjs";
import { installPrivacyGuard } from "./privacy-network.mjs";
import { writeEvidence } from "./evidence-output.mjs";

const base = process.env.ICM_BASE_URL || "http://127.0.0.1:8000/";
const browserName = process.env.ICM_BROWSER || "chromium";
const output = process.env.ICM_EVIDENCE_DIR || "/tmp/hydra-import-controls";
await fs.mkdir(output, { recursive: true });
const fixture = await fs.mkdtemp(path.join(output, "synthetic-folder-"));
const csv =
  "timestamp,Flow (m3/s)\n2026-01-01T00:00:00,0.1\n2026-01-01T00:05:00,0.2\n2026-01-01T00:10:00,0.3\n";
await fs.writeFile(path.join(fixture, "Folder-A.csv"), csv);
await fs.mkdir(path.join(fixture, "nested"));
await fs.writeFile(
  path.join(fixture, "nested", "Folder-B.csv"),
  csv.replaceAll("0.1", "0.4"),
);
const browser = await (browserName === "firefox" ? firefox : chromium).launch(
  browserLaunchOptions(),
);
const outcomes = [];
try {
  const context = await browser.newContext({
    ...browserContextOptions(),
    viewport: { width: 1440, height: 1000 },
  });
  const privacy = installPrivacyGuard(context, base);
  const page = await context.newPage(),
    errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await privacy.navigate(page, base);
  await page.waitForFunction(
    () => window.__ICM_PRECISION_WORKBENCH__?.navigate,
  );
  await page.locator('.pw-primary-nav [data-workspace="data"]').click();
  const before = await page.evaluate(() => state.files.size);
  let chooser = page.waitForEvent("filechooser");
  await page.locator("#addFilesBtn").click();
  await (await chooser).setFiles([]);
  assert.equal(await page.evaluate(() => state.files.size), before);
  chooser = page.waitForEvent("filechooser");
  await page.locator("#addFilesBtn").click();
  await (
    await chooser
  ).setFiles({
    name: "Button-upload.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(csv),
  });
  await page.waitForFunction(
    () =>
      [...state.files.values()].some(
        (file) =>
          file.displayName === "Button-upload.csv" && file.status === "ready",
      ),
    null,
    { timeout: 90000 },
  );
  assert.ok(
    (await page.locator("#observedSelect option").allTextContents()).some(
      (text) => text.includes("Button-upload.csv"),
    ),
  );
  outcomes.push({
    route: "data/time-series",
    control: "#addFilesBtn",
    status: "PASS",
    expected:
      "Empty selection preserves source state; selected CSV parses and becomes assignable",
    observed:
      "Filechooser events, unchanged empty selection count, Ready row and observed-series option checked",
  });

  // Exercise the documented folder-input fallback used without File System Access.
  // Native OS directory dialogs remain outside headless browser automation.
  await page.evaluate(() => {
    window.showDirectoryPicker = undefined;
  });
  // The implementation detects the property, so remove the test override entirely.
  await page.evaluate(() => {
    delete window.showDirectoryPicker;
  });
  const nativeStillPresent = await page.evaluate(
    () => "showDirectoryPicker" in window,
  );
  assert.equal(
    nativeStillPresent,
    false,
    "Folder fallback fixture requires the API to be absent",
  );
  chooser = page.waitForEvent("filechooser");
  await page.locator("#chooseFolderBtn").click();
  await (await chooser).setFiles(fixture);
  const selectedFolderFiles = await page
    .locator("#folderInput")
    .evaluate((el) =>
      [...el.files].map((file) => ({
        name: file.name,
        relativePath: file.webkitRelativePath,
      })),
    );
  assert.deepEqual(selectedFolderFiles.map((file) => file.name).sort(), [
    "Folder-A.csv",
    "Folder-B.csv",
  ]);
  assert.ok(
    selectedFolderFiles.some((file) => file.relativePath.includes("/nested/")),
  );
  await page.waitForFunction(
    () =>
      ["Folder-A.csv", "Folder-B.csv"].every((name) =>
        [...state.files.values()].some(
          (file) => file.file.name === name && file.status === "ready",
        ),
      ),
    null,
    { timeout: 90000 },
  );
  const folderRows = await page.evaluate(() =>
    [...state.files.values()]
      .filter((file) =>
        ["Folder-A.csv", "Folder-B.csv"].includes(file.file.name),
      )
      .map((file) => ({
        name: file.file.name,
        displayName: file.displayName,
        status: file.status,
      })),
  );
  assert.equal(folderRows.length, 2);
  assert.ok(
    folderRows.some((file) =>
      file.displayName.includes("/nested/Folder-B.csv"),
    ),
  );
  outcomes.push({
    route: "data/time-series",
    control: "#chooseFolderBtn",
    status: "PASS",
    expected: "Folder-input fallback imports files recursively",
    observed: folderRows,
    scope: "File System Access absent; native OS picker interaction unverified",
  });

  await page.locator("#dtReportUpload > summary").click();
  const countBeforeReport = await page.evaluate(() => state.files.size);
  chooser = page.waitForEvent("filechooser");
  await page.locator("#dtUploadBtn").click();
  await (await chooser).setFiles([]);
  assert.equal(await page.evaluate(() => state.files.size), countBeforeReport);
  chooser = page.waitForEvent("filechooser");
  await page.locator("#dtUploadBtn").click();
  await (
    await chooser
  ).setFiles(path.resolve("tests/fixtures/detriment/flood-a.csv"));
  await page.waitForFunction(
    () =>
      [...state.files.values()].some(
        (file) =>
          file.displayName === "flood-a.csv" &&
          file.status === "ready" &&
          file.parsed?.metadata?.source_kind === "detriment_report",
      ),
    null,
    { timeout: 90000 },
  );
  assert.equal(
    await page.evaluate(() =>
      allSeries().some((series) => series.item.displayName === "flood-a.csv"),
    ),
    false,
  );
  outcomes.push({
    route: "data/time-series",
    control: "#dtUploadBtn",
    status: "PASS",
    expected:
      "Report chooser imports ready assessment source without adding it to time-series mapping; empty selection preserves pool",
    observed:
      "Report metadata kind, Ready state and excluded hydraulic-series mapping checked",
  });

  const associationPath = path.resolve(
    "reference/current-tool/sample-data/rainfall/fm_rg_assoc.xlsx",
  );
  for (const route of ["fdv-check", "monthly-review", "volume-balance"]) {
    await page.evaluate(
      (p) => window.__ICM_PRECISION_WORKBENCH__.navigate("survey", p, false),
      route,
    );
    const settings = page.locator("#surveyAssessmentSettings");
    if ((await settings.count()) && !(await settings.evaluate((el) => el.open)))
      await settings.locator(":scope > summary").click();
    const collapse = page.locator(
      "#surveyAssociationPanel > .subhead .tool-collapse-toggle",
    );
    if (!(await page.locator("#chooseAssocBtn").isVisible()))
      await collapse.click();
    chooser = page.waitForEvent("filechooser");
    await page.locator("#chooseAssocBtn").click();
    await (await chooser).setFiles(associationPath);
    await page.waitForFunction(
      () => window.__ICM_WORKBENCH__.survey.association?.records?.length === 9,
      null,
      { timeout: 90000 },
    );
    assert.equal(
      await page.locator("#surveyAssociationTable tbody > tr").count(),
      9,
    );
    const association = await page.evaluate(
      () => window.__ICM_WORKBENCH__.survey.association.records,
    );
    assert.ok(JSON.stringify(association).includes("FM7413"));
    outcomes.push({
      route: "survey/" + route,
      control: "#chooseAssocBtn",
      status: "PASS",
      expected:
        "Chooser loads nine synthetic workbook relationships and renders their table",
      observed: "Nine records and rows; FM7413 relationship present",
    });
  }
  assert.deepEqual(errors, []);
  privacy.assertClean();
  await writeEvidence(
    path.join(output, "outcomes.json"),
    JSON.stringify({ browser: browserName, outcomes }, null, 2),
  );
  console.log(
    "PASS " +
      browserName +
      ": file, recursive folder fallback, report and association chooser outcomes.",
  );
} catch (error) {
  console.error("IMPORT_CONTROLS_FAILURE", String(error));
  throw error;
} finally {
  await browser.close();
}
