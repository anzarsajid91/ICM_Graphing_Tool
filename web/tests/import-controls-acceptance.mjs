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

  // Exercise the real directory traversal with synthetic handles. This tests the
  // application process, not the browser/OS permission dialog itself.
  const beforeDirectory = await page.evaluate(() =>
    [...state.files.values()].map((file) => ({
      id: file.id,
      hash: file.hash,
      status: file.status,
    })),
  );
  await page.evaluate((csv) => {
    window.directoryPickerCase = "success";
    window.directoryPickerCalls = [];
    const entry = (name) => ({
      kind: "file",
      getFile: async () => new File([csv], name, { type: "text/csv" }),
    });
    const hidden = {
      kind: "file",
      getFile: async () => {
        throw new Error("Hidden directory entry must not be read");
      },
    };
    const nested = {
      kind: "directory",
      async *entries() {
        yield ["Native-B.csv", entry("Native-B.csv")];
      },
    };
    const root = {
      kind: "directory",
      async *entries() {
        yield ["Native-A.csv", entry("Native-A.csv")];
        yield ["nested", nested];
        yield [".hidden.csv", hidden];
        yield [
          ".private",
          {
            kind: "directory",
            async *entries() {
              throw new Error("Hidden directory must not be traversed");
            },
          },
        ];
        yield ["ignored.txt", entry("ignored.txt")];
      },
    };
    window.showDirectoryPicker = async (options) => {
      window.directoryPickerCalls.push({ ...options });
      if (window.directoryPickerCase === "abort")
        throw new DOMException("Synthetic cancellation", "AbortError");
      if (window.directoryPickerCase === "denied")
        throw new DOMException(
          "Synthetic folder permission denied",
          "NotAllowedError",
        );
      return root;
    };
  }, csv);
  await page.locator("#chooseFolderBtn").click();
  await page.waitForFunction(
    () =>
      ["Native-A.csv", "Native-B.csv"].every((name) =>
        [...state.files.values()].some(
          (file) => file.file.name === name && file.status === "ready",
        ),
      ) && !document.body.classList.contains("operation-busy"),
    null,
    { timeout: 90000 },
  );
  const directoryRows = await page.evaluate(() =>
    [...state.files.values()]
      .filter((file) => file.file.name.startsWith("Native-"))
      .map((file) => ({
        name: file.file.name,
        path: file.displayName,
        status: file.status,
      })),
  );
  assert.deepEqual(directoryRows.map((row) => row.path).sort(), [
    "Native-A.csv",
    "nested/Native-B.csv",
  ]);
  assert.equal(
    await page.evaluate(() => state.files.size),
    beforeDirectory.length + 2,
  );
  assert.deepEqual(
    await page.evaluate(
      (ids) =>
        [...state.files.values()]
          .filter((file) => ids.includes(file.id))
          .map((file) => ({
            id: file.id,
            hash: file.hash,
            status: file.status,
          })),
      beforeDirectory.map((file) => file.id),
    ),
    beforeDirectory,
  );
  assert.ok(
    (await page.locator("#observedSelect option").allTextContents()).some(
      (text) => text.includes("Native-B.csv"),
    ),
  );
  outcomes.push({
    route: "data/time-series",
    control: "#chooseFolderBtn",
    status: "PASS",
    expected:
      "Traverse synthetic read-only directory handles recursively; skip hidden/unrecognised entries and preserve prior sources",
    observed: directoryRows,
    scope: "Synthetic API handles; native permission dialog unverified",
  });
  const afterDirectory = await page.evaluate(() =>
    [...state.files.values()].map((file) => ({
      id: file.id,
      hash: file.hash,
      status: file.status,
    })),
  );
  for (const pickerCase of ["abort", "denied"]) {
    await page.evaluate((value) => {
      window.directoryPickerCase = value;
    }, pickerCase);
    await page.locator("#chooseFolderBtn").click();
    await page.waitForFunction(
      () => !document.body.classList.contains("operation-busy"),
    );
    assert.deepEqual(
      await page.evaluate(() =>
        [...state.files.values()].map((file) => ({
          id: file.id,
          hash: file.hash,
          status: file.status,
        })),
      ),
      afterDirectory,
    );
    if (pickerCase === "denied")
      assert.match(
        await page.locator("#poolSummary").innerText(),
        /Synthetic folder permission denied/,
      );
    else
      assert.doesNotMatch(
        await page.locator("#poolSummary").innerText(),
        /Operation failed/,
      );
    outcomes.push({
      route: "data/time-series",
      control: "#chooseFolderBtn",
      status: "PASS",
      expected:
        pickerCase === "abort"
          ? "Cancellation preserves all source state without an error"
          : "Denied directory access shows a local error and preserves all source state",
      observed: { sourceCount: afterDirectory.length, unchanged: true },
      scope: "Synthetic API rejection; native permission dialog unverified",
    });
  }
  assert.deepEqual(await page.evaluate(() => window.directoryPickerCalls), [
    { mode: "read" },
    { mode: "read" },
    { mode: "read" },
  ]);

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
  const folderInput = page.locator("#folderInput");
  const selectionEvents = await folderInput.evaluateHandle((input) => {
    const events = [];
    for (const type of ["input", "change"])
      input.addEventListener(type, (event) => {
        events.push({ type, trusted: event.isTrusted });
      }, { once: true });
    return events;
  });
  chooser = page.waitForEvent("filechooser");
  await page.locator("#chooseFolderBtn").click();
  const folderChooser = await chooser;
  assert.equal(await folderChooser.element().getAttribute("id"), "folderInput");
  let acknowledged = true;
  try {
    await folderChooser.setFiles(fixture);
  } catch (error) {
    // Playwright can miss its own directory input acknowledgment. The two
    // pre-armed browser events and the complete FileList still have to agree.
    if (error.name !== "TimeoutError") throw error;
    acknowledged = false;
  }
  assert.deepEqual(await selectionEvents.jsonValue(), [
    { type: "input", trusted: true },
    { type: "change", trusted: true },
  ]);
  await selectionEvents.dispose();
  const selectedFolderFiles = await folderInput.evaluate((input) =>
    [...input.files].map((file) => ({
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
    observed: { rows: folderRows, trustedEvents: ["input", "change"], driverAcknowledged: acknowledged },
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
    // The real handler publishes association records before awaiting the source
    // fingerprint and rendering. Hold that real digest result on the first
    // route to reproduce the pre-render state deterministically.
    if (route === "fdv-check") {
      await page.evaluate(() => {
        const original = sha256;
        sha256 = async (file) => {
          const digest = await original(file);
          if (file.name !== "fm_rg_assoc.xlsx") return digest;
          window.associationDigestHeld = true;
          return new Promise((resolve) => {
            window.releaseAssociationDigest = () => {
              sha256 = original;
              resolve(digest);
            };
          });
        };
      });
    }
    chooser = page.waitForEvent("filechooser");
    await page.locator("#chooseAssocBtn").click();
    await (await chooser).setFiles(associationPath);
    if (route === "fdv-check") {
      await page.waitForFunction(() => window.associationDigestHeld === true);
      assert.equal(
        await page.evaluate(
          () => window.__ICM_WORKBENCH__.survey.association.records.length,
        ),
        9,
      );
      assert.equal(
        await page.locator("#surveyAssociationTable tbody > tr").count(),
        0,
      );
      assert.equal(
        await page.evaluate(() =>
          document.body.classList.contains("operation-busy"),
        ),
        true,
      );
      await page.evaluate(() => window.releaseAssociationDigest());
    }
    await page.waitForFunction(
      () => window.__ICM_WORKBENCH__.survey.association?.records?.length === 9,
      null,
      { timeout: 90000 },
    );
    await page.waitForFunction(
      () =>
        document.querySelectorAll("#surveyAssociationTable tbody > tr")
          .length === 9 &&
        !!window.__ICM_WORKBENCH__.survey.associationSource?.sha256 &&
        !document.body.classList.contains("operation-busy"),
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
