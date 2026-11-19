// Presentation/filter inputs on explicit unassigned and missing-source states.
import assert from "node:assert/strict";
import { chromium, firefox } from "playwright";
import {
  browserLaunchOptions,
  browserContextOptions,
} from "./browser-environment.mjs";
import { installPrivacyGuard } from "./privacy-network.mjs";
import { writeEvidence } from "./evidence-output.mjs";
import { verifyNetworkExplorer } from "./network-explorer-acceptance.mjs";
const base = process.env.ICM_BASE_URL || "http://127.0.0.1:8008/",
  name = process.env.ICM_BROWSER || "chromium";
const browser = await { chromium, firefox }[name].launch(
    browserLaunchOptions(),
  ),
  outcomes = [];
const record = (control, expected, observed) => {
  outcomes.push({
    route: "network/schematic",
    control: "#" + control,
    status: "PASS",
    expected,
    observed,
  });
  console.log("NETWORK_INPUT_PASS " + name + " " + control);
};
try {
  const context = await browser.newContext({
      ...browserContextOptions(),
      viewport: { width: 1600, height: 1050 },
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
  await page.evaluate(() =>
    window.__ICM_PRECISION_WORKBENCH__.navigate("network", "schematic", false),
  );
  await page.waitForFunction(
    () =>
      window.ICMNetworkSchematic?.debug &&
      window.ICMNetworkCore &&
      document.getElementById("nsSvg"),
  );
  await page.evaluate(() => {
    const network = ICMNetworkCore.empty();
    network.nodes = [
      ["alpha", "Alpha asset", 130, 150],
      ["beta", "Beta asset", 500, 350],
    ].map(([id, name, x, y]) => ({
      id,
      name,
      x,
      y,
      type: "cso",
      colour: "blue",
      bindings: [],
      defaults: { observed: "", model: "" },
      exclusions: [],
      gap: 900,
      confirmed: false,
    }));
    network.nodes[1].bindings = [
      {
        id: "missing-input",
        sourceId: "absent-synthetic-source",
        sha256: "synthetic-missing-fingerprint",
        sourceName: "Missing synthetic source",
        column: "level",
        quantity: "level",
        unit: "m",
        role: "observed",
        scenario: "Observed",
        years: [2026],
        threshold: 0.3,
      },
    ];
    network.edges = [
      { id: "link", from: "alpha", to: "beta", colour: "blue", arrow: true },
    ];
    network.camera = { x: 0, y: 0, zoom: 1 };
    ICMNetworkSchematic.restore(network);
  });
  const snapshot = () => page.evaluate(() => ICMNetworkSchematic.snapshot()),
    ids = () =>
      page
        .locator("#nsSvg [data-ns-node]")
        .evaluateAll((nodes) => nodes.map((node) => node.dataset.nsNode));
  const tools = async (open) => {
    const details = page.locator("#nsReviewTools");
    if ((await details.evaluate((el) => el.open)) !== open)
      await details.locator(":scope > summary").click();
  };
  await tools(true);
  await page.selectOption("#nsHealthFilter", "unassigned");
  assert.deepEqual(await ids(), ["alpha"]);
  await page.selectOption("#nsHealthFilter", "missing");
  assert.deepEqual(await ids(), ["beta"]);
  await page.selectOption("#nsHealthFilter", "ready");
  assert.deepEqual(await ids(), []);
  await page.selectOption("#nsHealthFilter", "all");
  assert.deepEqual(await ids(), ["alpha", "beta"]);
  record(
    "nsHealthFilter",
    "Filter actual missing-source and unassigned states; no false Ready assets",
    "Unassigned→Alpha; missing→Beta; ready→none; all→both",
  );
  for (const result of ["red", "amber", "green"]) {
    await page.selectOption("#nsResultFilter", result);
    assert.deepEqual(await ids(), []);
  }
  await page.selectOption("#nsResultFilter", "neutral");
  assert.deepEqual(await ids(), ["alpha", "beta"]);
  await page.selectOption("#nsResultFilter", "all");
  assert.deepEqual(await ids(), ["alpha", "beta"]);
  record(
    "nsResultFilter",
    "Keep uncalculated/missing evidence neutral and filter result choices",
    "Colored-result filters show none; neutral/all show both; no engineering result is injected",
  );
  await page.selectOption("#nsDetail", "full");
  assert.equal(await page.locator("#nsSvg [data-ns-summary]").count(), 1);
  await page.selectOption("#nsDetail", "minimal");
  assert.equal(await page.locator("#nsSvg [data-ns-summary]").count(), 0);
  await page.selectOption("#nsDetail", "auto");
  assert.equal(await page.locator("#nsSvg [data-ns-summary]").count(), 1);
  for (let i = 0; i < 4; i++) await page.locator("#nsZoomOut").click();
  assert.ok((await snapshot()).camera.zoom < 0.55);
  assert.equal(await page.locator("#nsSvg [data-ns-summary]").count(), 0);
  await page.selectOption("#nsDetail", "full");
  assert.equal(await page.locator("#nsSvg [data-ns-summary]").count(), 1);
  record(
    "nsDetail",
    "Choose full/minimal/adaptive detail while preserving node evidence",
    "Full shows missing-evidence summary; minimal hides it; adaptive hides at low zoom; full restores it",
  );
  await tools(false);
  await page.locator("#nsEdit").click();
  await tools(true);
  const layout = page
    .locator("#nsReviewTools details")
    .filter({ has: page.getByText("Layout", { exact: true }) });
  if (!(await layout.evaluate((el) => el.open)))
    await layout.locator(":scope > summary").click();
  const drag = async (dx, dy) => {
    const box = await page
      .locator('#nsSvg [data-ns-node="alpha"] [data-ns-frame]')
      .boundingBox();
    assert.ok(box);
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(
      box.x + box.width / 2 + dx,
      box.y + box.height / 2 + dy,
      { steps: 10 },
    );
    await page.mouse.up();
  };
  await page.locator("#nsSnap").check();
  await tools(false);
  await drag(23, 19);
  const snapped = (await snapshot()).nodes.find((node) => node.id === "alpha");
  assert.equal(snapped.x % 20, 0);
  assert.equal(snapped.y % 20, 0);
  await tools(true);
  await page.locator("#nsSnap").uncheck();
  await tools(false);
  const zoom = (await snapshot()).camera.zoom;
  await drag(7 * zoom, 9 * zoom);
  const free = (await snapshot()).nodes.find((node) => node.id === "alpha");
  assert.notEqual(free.x, snapped.x);
  assert.ok(Math.abs(free.x / 20 - Math.round(free.x / 20)) > 0.05);
  record(
    "nsSnap",
    "Quantize native drag coordinates only while Snap is checked",
    { snapped: { x: snapped.x, y: snapped.y }, free: { x: free.x, y: free.y } },
  );
  await page.locator("#nsAssetSearch").fill("BETA");
  assert.deepEqual(
    await page
      .locator("#nsAssetNames option")
      .evaluateAll((options) => options.map((option) => option.value)),
    ["Beta asset"],
  );
  await page.locator("#nsAssetSearch").press("Tab");
  assert.equal(await page.locator("#nsName").inputValue(), "Beta asset");
  const camera = (await snapshot()).camera;
  await page.locator("#nsAssetSearch").fill("no-matching-synthetic-asset");
  await page.locator("#nsAssetSearch").press("Tab");
  assert.match(await page.locator("#nsStatus").innerText(), /Asset not found/);
  assert.deepEqual((await snapshot()).camera, camera);
  assert.equal((await snapshot()).nodes.length, 2);
  record(
    "nsAssetSearch",
    "Suggest and center a case-insensitive match; handle misses without mutating geometry",
    "BETA suggests/selects Beta asset; unknown input shows local error and preserves camera/nodes",
  );
  const ioMenu = page.getByText("Save / Export / Load", { exact: true });
  await ioMenu.press("Enter");
  const chooserPromise = page.waitForEvent("filechooser");
  await page
    .getByRole("button", { name: "Load network or context CSV" })
    .click();
  const chooser = await chooserPromise;
  const savedNetwork = await snapshot();
  await chooser.setFiles({
    name: "synthetic-layout.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(savedNetwork)),
  });
  await page
    .getByRole("status")
    .filter({ hasText: "Network restored" })
    .waitFor();
  assert.equal(await ioMenu.evaluate((el) => el.parentElement.open), false);
  assert.equal((await snapshot()).nodes.length, 2);
  record(
    "nsLoad",
    "Find Load in the labelled menu and import a saved schematic",
    "Native chooser loaded two synthetic assets",
  );

  const screenshot = async (label) => {
    if (!process.env.ICM_SCHEMATIC_SCREENSHOTS) return;
    console.log(
      "SCREENSHOT " +
        (await writeEvidence(
          process.env.ICM_SCHEMATIC_SCREENSHOTS + "/" + label + ".png",
          await page.screenshot({ animations: "disabled" }),
        )),
    );
  };
  const canvas = page.locator("#nsCanvas");
  const zoomMode = page.getByRole("button", { name: "Zoom", exact: true });
  await zoomMode.press("Enter");
  assert.equal(await zoomMode.getAttribute("aria-pressed"), "true");
  assert.equal(
    await page.locator("#nsSvg").evaluate((el) => getComputedStyle(el).cursor),
    "zoom-in",
  );
  await canvas.scrollIntoViewIfNeeded();
  await screenshot("zoom-mode");
  const box = await canvas.boundingBox();
  const anchor = { x: Math.round(box.width * 0.35), y: 120 };
  const beforeZoom = (await snapshot()).camera;
  await page.mouse.move(box.x + anchor.x, box.y + anchor.y);
  await page.mouse.wheel(0, -180);
  await page.waitForFunction(
    (value) => ICMNetworkSchematic.snapshot().camera.zoom > value,
    beforeZoom.zoom,
  );
  const afterZoom = (await snapshot()).camera;
  for (const axis of ["x", "y"]) {
    const before = (anchor[axis] - beforeZoom[axis]) / beforeZoom.zoom;
    const after = (anchor[axis] - afterZoom[axis]) / afterZoom.zoom;
    assert.ok(
      Math.abs(before - after) < 2,
      "Zoom anchors the point under the cursor",
    );
  }
  await page.mouse.wheel(0, 150);
  await page.waitForFunction(
    (value) => ICMNetworkSchematic.snapshot().camera.zoom < value,
    afterZoom.zoom,
  );

  const beforePan = await snapshot();
  const startPoint = await page
    .locator('[data-ns-node="beta"] [data-ns-frame]')
    .boundingBox();
  const start = {
    x: startPoint.x + startPoint.width / 2,
    y: startPoint.y + startPoint.height / 2,
  };
  const selectionBefore = await page.evaluate(
    () => ICMNetworkSchematic.debug().selected,
  );
  await page.mouse.move(start.x, start.y);
  await page.mouse.down({ button: "middle" });
  await page.mouse.move(start.x + 40, start.y + 25, { steps: 5 });
  await page.mouse.up({ button: "middle" });
  const afterPan = await snapshot();
  assert.equal(afterPan.camera.zoom, beforePan.camera.zoom);
  assert.ok(Math.abs(afterPan.camera.x - beforePan.camera.x - 40) < 2);
  assert.ok(Math.abs(afterPan.camera.y - beforePan.camera.y - 25) < 2);
  assert.deepEqual(afterPan.nodes, beforePan.nodes);
  assert.deepEqual(afterPan.edges, beforePan.edges);
  assert.equal(
    await page.evaluate(() => ICMNetworkSchematic.debug().selected),
    selectionBefore,
  );
  await zoomMode.press("Space");
  assert.equal(await zoomMode.getAttribute("aria-pressed"), "false");
  const beforeScroll = await page.evaluate(() => window.scrollY);
  await page.mouse.move(box.x + anchor.x, box.y + anchor.y);
  await page.mouse.wheel(0, 160);
  await page.waitForFunction((value) => window.scrollY > value, beforeScroll);
  assert.deepEqual((await snapshot()).camera, afterPan.camera);
  record(
    "nsZoomMode",
    "Wheel zoom follows the pointer and wheel-button drag pans without editing",
    "Keyboard toggle, both wheel directions, anchor, mouse drag, stable selection and ordinary page scroll verified",
  );

  await page.locator("#fileInput").setInputFiles({
    name: "synthetic-map-source.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(
      "Timestamp,Flow (m3/s)\n2025-01-01 00:00,0.1\n2025-01-01 00:05,0.2\n2025-01-01 00:10,0.1\n",
    ),
  });
  await page.waitForFunction(
    () =>
      [...state.files.values()].some(
        (file) =>
          file.displayName === "synthetic-map-source.csv" &&
          file.status === "ready",
      ),
    null,
    { timeout: 90000 },
  );
  const clear = page.locator("#nsClearMap");
  await tools(true);
  await page.locator("#nsLocked").check();
  assert.equal(await clear.isDisabled(), true);
  await page.locator("#nsLocked").uncheck();
  await page.getByText("Views & snapshots", { exact: true }).click();
  await page.locator("#nsViewName").fill("Synthetic saved state");
  await page.locator("#nsSaveView").click();
  await page.locator("#nsSaveSnapshot").click();
  await tools(false);
  const dialog = page.getByRole("dialog", { name: "Clear map" });
  const beforeClear = await snapshot();
  assert.equal(beforeClear.views.length, 1);
  assert.equal(beforeClear.reviewSnapshots.length, 1);
  const sources = () =>
    page.evaluate(() =>
      [...state.files.values()].map(({ id, hash, status }) => ({
        id,
        hash,
        status,
      })),
    );
  const retainedSources = await sources();
  assert.equal(retainedSources.length, 1);
  await clear.click();
  await screenshot("clear-confirmation");
  assert.equal(
    await dialog
      .getByRole("button", { name: "Cancel" })
      .evaluate((el) => el === document.activeElement),
    true,
  );
  await page.keyboard.press("Escape");
  await dialog.waitFor({ state: "hidden" });
  assert.deepEqual(await snapshot(), beforeClear);
  await clear.click();
  await dialog.getByRole("button", { name: "Clear map" }).click();
  assert.deepEqual(
    await snapshot(),
    await page.evaluate(() => ICMNetworkCore.empty()),
  );
  assert.deepEqual(await sources(), retainedSources);
  assert.equal(await clear.isDisabled(), true);
  assert.equal(
    await page.locator("#nsSvg [data-ns-node], #nsSvg [data-ns-edge]").count(),
    0,
  );
  await page.locator("#nsUndo").click();
  assert.deepEqual(await snapshot(), beforeClear);
  await clear.click();
  await dialog.getByRole("button", { name: "Clear map" }).click();
  await page.reload();
  await page
    .getByRole("button", { name: "Network Schematic", exact: true })
    .click();
  await page.waitForFunction(
    () =>
      !!window.ICMNetworkSchematic?.snapshot &&
      !!document.getElementById("nsClearMap"),
  );
  assert.equal((await snapshot()).nodes.length, 0);
  assert.equal((await snapshot()).edges.length, 0);
  await page.setViewportSize({ width: 1024, height: 900 });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
    true,
  );
  await screenshot("cleared-at-1024");
  record(
    "nsClearMap",
    "Confirm and clear the full schematic, preserving imported files and undoing in-session",
    "Escape preserves state, confirm empties geometry, Undo restores the full snapshot, reload retains a confirmed clear",
  );
  await verifyNetworkExplorer(page, name, record);
  await page.evaluate(() => {
    const test = ICMNetworkCore.empty();
    test.nodes = [
      { id: "pump", type: "pump", name: "Synthetic pump", x: 70, y: 80, colour: "blue", bindings: [] },
      { id: "outfall", type: "outfall", name: "Synthetic outfall", x: 440, y: 130, colour: "blue", bindings: [] },
    ];
    test.edges = [{ id: "pipe", from: "pump", to: "outfall", colour: "blue" }];
    ICMNetworkSchematic.restore(test);
  });
  const markerWidths = () => page.locator("#nsSvg [data-ns-symbol]").evaluateAll(
    (markers) => markers.map((marker) => marker.getBoundingClientRect().width),
  );
  const normal = await markerWidths();
  const zoomIn = page.getByRole("button", { name: "Zoom in", exact: true });
  for (let i = 0; i < 8; i++) await zoomIn.click();
  const close = await markerWidths();
  assert.ok((await snapshot()).camera.zoom > 4, "Zoom passes 400%");
  assert.ok(close.every((width, i) => width > 0 && width < normal[i]));
  for (let i = 0; i < 9; i++) await zoomIn.click();
  const closest = await markerWidths();
  assert.equal((await snapshot()).camera.zoom, 32, "Zoom caps at 3,200%");
  assert.ok(closest.every((width, i) => width > 0 && width < close[i]));
  await tools(true);
  await page.getByText("Views & snapshots", { exact: true }).click();
  await page.locator("#nsViewName").fill("Synthetic deep view");
  await page.locator("#nsSaveView").click();
  await tools(false);
  await page.locator("#nsResetView").click();
  assert.ok((await snapshot()).camera.zoom <= 2);
  await tools(true);
  await page.locator("#nsViewSelect").selectOption("0");
  assert.equal((await snapshot()).camera.zoom, 32);
  assert.deepEqual(await markerWidths(), closest);
  record(
    "nsZoomIn",
    "Zoom to 3,200% with proportionately smaller asset symbols",
    "Pump and outfall markers shrink, Reset view fits, and the saved camera restores deep zoom",
  );
  guard.assertClean();
  assert.deepEqual(errors, []);
} finally {
  console.log(
    "EVIDENCE " +
      (await writeEvidence(
        (process.env.ICM_EVIDENCE_DIR || "/tmp/hydra-network-inputs") +
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
