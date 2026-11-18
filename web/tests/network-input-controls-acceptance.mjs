// Presentation/filter inputs on explicit unassigned and missing-source states.
import assert from "node:assert/strict";
import { chromium, firefox } from "playwright";
import {
  browserLaunchOptions,
  browserContextOptions,
} from "./browser-environment.mjs";
import { installPrivacyGuard } from "./privacy-network.mjs";
import { writeEvidence } from "./evidence-output.mjs";
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
