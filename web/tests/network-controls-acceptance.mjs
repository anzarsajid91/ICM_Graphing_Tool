// Synthetic desktop acceptance for controls lacking direct outcome assertions.
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { chromium, firefox } from "playwright";
import {
  browserLaunchOptions,
  browserContextOptions,
} from "./browser-environment.mjs";
import { installPrivacyGuard } from "./privacy-network.mjs";

const browserName = process.env.ICM_BROWSER || "chromium";
assert.ok(["chromium", "firefox"].includes(browserName));
const base = process.env.ICM_BASE_URL || "http://127.0.0.1:8003/";
const candidate = process.env.GITHUB_SHA || "local";
const evidenceRoot = process.env.ICM_EVIDENCE_DIR || "/tmp/hydra-network-controls";
await fs.mkdir(evidenceRoot, { recursive: true });
const directory = await fs.mkdtemp(path.join(evidenceRoot, "evidence-"));
const results = [],
  errors = [];
const browser = await (browserName === "firefox" ? firefox : chromium).launch(
  browserLaunchOptions(),
);
const context = await browser.newContext({
  ...browserContextOptions(),
  viewport: { width: 1600, height: 1050 },
});
const page = await context.newPage();
page.on("pageerror", (error) => errors.push(error.message));
const privacy = installPrivacyGuard(context, base);
const snapshot = () =>
  page.evaluate(() => window.ICMNetworkSchematic.snapshot());
const coordinates = (network) =>
  network.nodes.map(({ id, x, y }) => ({ id, x, y }));
function record(control, expected, observed) {
  results.push({
    route: "network/schematic",
    control,
    status: "PASS",
    expected,
    observed,
  });
  console.log(browserName + ": PASS " + control);
}
async function tools(open = true) {
  const details = page.locator("#nsReviewTools");
  if ((await details.evaluate((el) => el.open)) !== open)
    await details.locator(":scope > summary").click();
}
async function layout() {
  await tools();
  const detail = page
    .locator("#nsReviewTools details")
    .filter({
      has: page.locator("summary").getByText("Layout", { exact: true }),
    });
  if (!(await detail.evaluate((el) => el.open)))
    await detail.locator(":scope > summary").click();
}
async function select(id) {
  await tools(false);
  const node = page.locator('[data-ns-node="' + id + '"]');
  await node.focus();
  await node.press("Enter");
}
async function seed() {
  await page.evaluate(() => {
    const n = window.ICMNetworkCore.empty();
    n.nodes = [
      ["up", 130, 140],
      ["middle", 330, 310],
      ["down", 720, 550],
      ["isolated", 1000, 210],
    ].map(([id, x, y]) => ({
      id,
      name: "Synthetic " + id,
      type: "cso",
      colour: "blue",
      x,
      y,
      bindings: [],
      exclusions: [],
      defaults: { observed: "", model: "" },
      gap: 900,
      confirmed: false,
    }));
    n.edges = [
      { id: "up-link", from: "up", to: "middle", colour: "blue", arrow: true },
      {
        id: "down-link",
        from: "middle",
        to: "down",
        colour: "blue",
        arrow: true,
      },
    ];
    n.nodes.find((node) => node.id === "middle").monitorId = "Synthetic FM01";
    n.nodes.find((node) => node.id === "middle").contextSource = true;
    n.nodes.find((node) => node.id === "middle").bindings = [
      {
        id: "synthetic-binding",
        sourceId: "synthetic-unloaded",
        sha256: "synthetic-only",
        sourceName: "Synthetic unavailable.csv",
        column: "Depth (m)",
        role: "model",
        scenario: "Synthetic baseline",
        years: [2024],
        quantity: "depth",
        unit: "m",
        threshold: 1,
      },
    ];
    window.ICMNetworkSchematic.restore(n);
  });
  await page.locator("#nsFit").click();
}
async function selectThree() {
  await select("up");
  for (const id of ["middle", "down"])
    await page
      .locator('[data-ns-node="' + id + '"] [data-ns-frame]')
      .click({ modifiers: ["Shift"] });
}
// Exercise native details through keyboard, checking state and a populated child.
async function disclosure(details, control, content) {
  const summary = details.locator(":scope > summary");
  if (await details.evaluate((el) => el.open)) await summary.click();
  assert.equal(await details.evaluate((el) => el.open), false);
  await summary.focus();
  await summary.press("Enter");
  assert.equal(await details.evaluate((el) => el.open), true);
  assert.equal(await content.isVisible(), true);
  await summary.press("Space");
  assert.equal(await details.evaluate((el) => el.open), false);
  assert.equal(await content.isVisible(), false);
  record(
    control,
    "Enter expands populated disclosure; Space collapses it",
    "Native open state and populated content visibility changed in both directions.",
  );
}
try {
  await privacy.navigate(page, base);
  assert.match(await page.title(), /Hydra Bench/);
  assert.ok(
    await page
      .locator("script[src]")
      .evaluateAll(
        (scripts, sha) => scripts.some((script) => script.src.includes(sha)),
        candidate,
      ),
    "Candidate asset token matches requested product identity",
  );
  await page.getByRole("link", { name: "Open network schematic" }).click();
  await page.locator("#nsSvg").waitFor();
  await page.locator("#nsEdit").click();
  await seed();

  for (const [control, type] of [
    ["#nsAddManhole", "manhole"],
    ["#nsAddLabel", "label"],
  ]) {
    const before = await snapshot();
    await page.locator(control).click();
    const after = await snapshot(),
      added = after.nodes.filter(
        (n) => !before.nodes.some((old) => old.id === n.id),
      );
    assert.equal(after.nodes.length, before.nodes.length + 1);
    assert.equal(added.length, 1);
    assert.equal(added[0].type, type);
    assert.deepEqual(
      after.nodes.filter((n) => n.id !== added[0].id),
      before.nodes,
    );
    record(
      control,
      "Add exactly one " + type + " and preserve existing points",
      "One new " + type + "; all existing point objects unchanged.",
    );
  }
  for (const colour of ["red", "amber"]) {
    const before = await snapshot();
    await page.locator('[data-ns-colour="' + colour + '"]').click();
    await page.locator("#nsAddManhole").click();
    const after = await snapshot();
    assert.equal(after.nodes.length, before.nodes.length + 1);
    assert.equal(after.nodes.at(-1).colour, colour);
    record(
      "button:" + colour + " network colour",
      "Apply selected colour to a newly added point",
      "New manhole colour is " + colour + " in snapshot.",
    );
  }
  await seed();
  const camera = (await snapshot()).camera;
  await page.locator("#nsZoomOut").click();
  assert.ok((await snapshot()).camera.zoom < camera.zoom);
  record(
    "#nsZoomOut",
    "Decrease schematic camera zoom",
    "Camera zoom decreased after Zoom out.",
  );
  await select("middle");
  await tools();
  await page.locator('[data-ns-trace="down"]').click();
  for (const [id, opacity] of [
    ["middle", 1],
    ["down", 1],
    ["up", 0.2],
    ["isolated", 0.2],
  ]) {
    assert.equal(
      await page
        .locator('[data-ns-node="' + id + '"]')
        .evaluate((el) => Number(el.style.opacity || 1)),
      opacity,
    );
  }
  record(
    "button:Downstream",
    "Retain selected/downstream nodes and dim upstream/unconnected nodes",
    "Middle/down opacity 1; upstream/isolated opacity .2.",
  );
  await page.locator("#nsClearTrace").click();
  for (const id of ["up", "middle", "down", "isolated"])
    assert.equal(
      await page
        .locator('[data-ns-node="' + id + '"]')
        .evaluate((el) => Number(el.style.opacity || 1)),
      1,
    );
  record(
    "#nsClearTrace",
    "Restore all node opacities after active trace",
    "All four nodes returned to opacity 1.",
  );

  // Alignment creates a real geometry edit; Undo and Redo must restore full coordinates.
  for (const [kind, label] of [
    ["left", "Align left"],
    ["horizontal", "Distribute horizontally"],
    ["vertical", "Distribute vertically"],
  ]) {
    await seed();
    await selectThree();
    const before = await snapshot();
    await layout();
    await page.locator('[data-ns-arrange="' + kind + '"]').click();
    const after = await snapshot(),
      selected = after.nodes.filter((n) => n.id !== "isolated");
    assert.notDeepEqual(coordinates(after), coordinates(before));
    assert.deepEqual(
      after.nodes.find((n) => n.id === "isolated"),
      before.nodes.find((n) => n.id === "isolated"),
    );
    if (kind === "left")
      assert.deepEqual(
        selected.map((n) => n.x),
        [130, 130, 130],
      );
    else {
      const axis = kind === "horizontal" ? "x" : "y",
        values = selected.map((n) => n[axis]).sort((a, b) => a - b);
      assert.equal(values[1] - values[0], values[2] - values[1]);
      assert.equal(
        values[0],
        Math.min(
          ...before.nodes
            .filter((n) => n.id !== "isolated")
            .map((n) => n[axis]),
        ),
      );
      assert.equal(
        values[2],
        Math.max(
          ...before.nodes
            .filter((n) => n.id !== "isolated")
            .map((n) => n[axis]),
        ),
      );
    }
    record(
      "button:" + label,
      "Arrange three selected nodes and preserve unselected point",
      "Expected alignment/equal spacing asserted; isolated point unchanged.",
    );
    if (kind === "left") {
      await tools(false);
      await page.locator("#nsUndo").click();
      assert.deepEqual(coordinates(await snapshot()), coordinates(before));
      await layout();
      await page.locator("#nsRedo").click();
      assert.deepEqual(coordinates(await snapshot()), coordinates(after));
      record(
        "#nsRedo",
        "Restore actual aligned geometry after Undo",
        "Undo restored all original coordinates; Redo restored all aligned coordinates.",
      );
    }
  }
  await seed();
  await select("middle");
  const beforeDelete = await snapshot();
  await page.locator("#nsDelete").click();
  let deleted = await snapshot();
  assert.deepEqual(
    deleted.nodes.map((n) => n.id),
    ["up", "down", "isolated"],
  );
  assert.equal(deleted.edges.length, 0);
  await page.locator("#nsUndo").click();
  assert.deepEqual((await snapshot()).nodes, beforeDelete.nodes);
  assert.deepEqual((await snapshot()).edges, beforeDelete.edges);
  record(
    "#nsDelete",
    "Delete selected node and incident edges; Undo restores them",
    "Middle and both incident links removed; Undo restored exact point/edge arrays.",
  );
  await tools(false);
  const edge = page.locator('[data-ns-edge="up-link"]');
  await edge.focus();
  await edge.press("Enter");
  const beforeEdge = await snapshot();
  await page
    .getByRole("button", { name: "Delete connector", exact: true })
    .click();
  deleted = await snapshot();
  assert.deepEqual(deleted.nodes, beforeEdge.nodes);
  assert.deepEqual(
    deleted.edges.map((e) => e.id),
    ["down-link"],
  );
  await page.locator("#nsUndo").click();
  assert.deepEqual((await snapshot()).edges, beforeEdge.edges);
  record(
    "button:Delete connector",
    "Delete only selected connector; Undo restores exact edges",
    "up-link removed, nodes/down-link preserved, Undo restored edge array.",
  );

  // Exact drawer deletion entry point has its own acceptance identity.
  await seed();
  await select("middle");
  const beforePoint = await snapshot();
  await page.getByRole("button", { name: "Delete point", exact: true }).click();
  const removedPoint = await snapshot();
  assert.deepEqual(
    removedPoint.nodes.map((n) => n.id),
    ["up", "down", "isolated"],
  );
  assert.equal(removedPoint.edges.length, 0);
  await page.locator("#nsUndo").click();
  assert.deepEqual((await snapshot()).nodes, beforePoint.nodes);
  assert.deepEqual((await snapshot()).edges, beforePoint.edges);
  record(
    "button:Delete point",
    "Delete point through drawer and remove incident edges; Undo restores them",
    "Selected middle point and both incident edges removed; Undo restored exact point/edge arrays.",
  );

  await select("middle");
  const beforeCloseSettings = await snapshot();
  await page
    .getByRole("button", { name: "Close settings", exact: true })
    .click();
  assert.equal(
    await page.evaluate(() => ICMNetworkSchematic.debug().selected),
    null,
  );
  assert.equal(await page.locator("#nsName").count(), 0);
  assert.equal(await page.locator("#nsDrawer h3").innerText(), "Edit network");
  assert.deepEqual(await snapshot(), beforeCloseSettings);
  record(
    "button:Close settings",
    "Clear selected property settings while preserving network",
    "Selection is null, selected name field removed and Edit network guidance visible; snapshot unchanged.",
  );

  await select("middle");
  const addSources = page.locator('[data-ns-add-sources="observed"]');
  const beforePicker = await snapshot();
  await addSources.click();
  assert.equal(await page.locator("#nsPicker").isVisible(), true);
  await page
    .getByRole("button", { name: "Close source picker", exact: true })
    .click();
  assert.equal(await page.locator("#nsPicker").isVisible(), false);
  assert.equal(
    await addSources.evaluate((el) => document.activeElement === el),
    true,
  );
  assert.deepEqual(await snapshot(), beforePicker);
  record(
    "button:Close source picker",
    "Close picker without assigning files and return focus to its opener",
    "Picker hidden, observed Add datasets opener focused and network snapshot unchanged (no loaded source fixture).",
  );

  await page.locator("#nsEdit").click();
  await select("middle");
  assert.equal(await page.locator("#nsPopup").isVisible(), true);
  const beforePopupClose = await snapshot();
  await page
    .getByRole("button", { name: "Close asset evidence", exact: true })
    .click();
  assert.equal(await page.locator("#nsPopup").isVisible(), false);
  assert.deepEqual(await snapshot(), beforePopupClose);
  record(
    "button:Close asset evidence",
    "Hide selected asset evidence without mutating network",
    "Evidence popup hidden and full network snapshot unchanged.",
  );
  await page.locator("#nsEdit").click();

  // Each previously inventoried point name/type is independently selected.
  const pendingPoints = [
    ["CSO B", "cso", "CSO"],
    ["MH01", "manhole", "Manhole"],
    ["MH02", "manhole", "Manhole"],
    ["Out", "outfall", "Outfall"],
    ["Outfall", "outfall", "Outfall"],
    ["Pumping station", "pump", "Pumping station"],
    ["Storm route", "label", "Pointer label"],
    ["Storm tank", "tank", "Storm tank"],
    ["WwTW storm", "wwtw", "Treatment works"],
  ];
  await page.evaluate((points) => {
    const n = ICMNetworkCore.empty();
    n.nodes = points.map(([name, type], index) => ({
      id: "pending-" + index,
      name,
      type,
      colour: "blue",
      x: 120 + (index % 3) * 350,
      y: 130 + Math.floor(index / 3) * 200,
      bindings: [],
      exclusions: [],
      defaults: { observed: "", model: "" },
    }));
    n.edges = [
      {
        id: "pending-connector",
        from: "pending-7",
        to: "pending-8",
        colour: "blue",
        arrow: true,
      },
    ];
    ICMNetworkSchematic.restore(n);
  }, pendingPoints);
  await page.locator("#nsFit").click();
  const pendingNetwork = await snapshot();
  for (const [index, [name, type, label]] of pendingPoints.entries()) {
    const point = page.locator('[data-ns-node="pending-' + index + '"]');
    assert.equal(await point.getAttribute("aria-label"), name + " · " + label);
    await point.focus();
    await point.press("Enter");
    assert.equal(
      await page.evaluate(() => ICMNetworkSchematic.debug().selected),
      "pending-" + index,
    );
    assert.equal(await page.locator("#nsDrawer h3").innerText(), name);
    assert.equal(await page.locator("#nsName").inputValue(), name);
    assert.equal(await page.locator("#nsType").inputValue(), type);
    assert.deepEqual(await snapshot(), pendingNetwork);
    record(
      "g:" + name + " · " + label,
      "Keyboard-select this exact named/type point and show matching settings",
      "Selected ID, drawer title/name/type all match; network snapshot unchanged. No engineering calculation asserted.",
    );
  }
  const pendingEdge = page.locator('[data-ns-edge="pending-connector"]');
  assert.equal(
    await pendingEdge.getAttribute("aria-label"),
    "Connector Storm tank to WwTW storm",
  );
  await pendingEdge.focus();
  await pendingEdge.press("Enter");
  assert.equal(
    await page.evaluate(() => ICMNetworkSchematic.debug().selected),
    "pending-connector",
  );
  assert.equal(await page.locator("#nsDrawer h3").innerText(), "Connector");
  assert.equal(
    await page
      .getByRole("button", { name: "Delete connector", exact: true })
      .isVisible(),
    true,
  );
  assert.deepEqual(await snapshot(), pendingNetwork);
  record(
    "g:Connector Storm tank to WwTW storm",
    "Keyboard-select exact named connector and show connector settings",
    "Matching aria-label and selected edge ID; Connector title and delete-connector control visible; snapshot unchanged.",
  );

  await seed();
  await select("middle");
  await disclosure(
    page
      .locator("#nsDrawer details")
      .filter({ has: page.getByText("Assessment settings", { exact: true }) }),
    "summary:Assessment settings",
    page.locator("#nsGap"),
  );
  await disclosure(
    page.locator("#nsDrawer .ns-review-notes"),
    "summary:Review notes",
    page.locator("#nsReviewComment"),
  );
  await disclosure(
    page
      .locator("#nsDrawer details")
      .filter({
        has: page.getByText("Monitoring association", { exact: true }),
      }),
    "summary:Monitoring association",
    page.locator("#nsMonitorAssociation"),
  );
  await disclosure(
    page
      .locator("#nsDrawer details")
      .filter({
        has: page.getByText("Detriment association", { exact: true }),
      }),
    "summary:Detriment association",
    page
      .locator("#nsDrawer details")
      .filter({ has: page.getByText("Detriment association", { exact: true }) })
      .locator(":scope > p")
      .first(),
  );
  await tools();
  for (const [label, content] of [
    ["Layout", page.locator("#nsLocked")],
    ["Views & snapshots", page.locator("#nsViewName")],
    [
      "Scenarios",
      page.locator('[data-ns-scenario-choice="Synthetic baseline"]'),
    ],
  ]) {
    const detail = page
      .locator("#nsReviewTools details")
      .filter({ has: page.getByText(label, { exact: true }) });
    await disclosure(detail, "summary:" + label, content);
  }
  // Real synthetic source import and authoritative calculation; no injected applied rows.
  console.log(
    browserName + ": importing six annual synthetic sources for bound controls",
  );
  await tools(false);
  await page.locator('.pw-primary-nav button[data-workspace="data"]').click();
  const timeSeries = page.locator(
    '#pwSecondaryNav button[data-page="time-series"]',
  );
  if (await timeSeries.isVisible()) await timeSeries.click();
  const sourceSpecs = [
    ["Observed_2023.csv", 2023, 1],
    ["Observed_2024.csv", 2024, 2],
    ["Baseline_2023.csv", 2023, 3],
    ["Baseline_2024.csv", 2024, 4],
    ["Updated_2024.csv", 2024, 5],
    ["ZeroFlow_2024.csv", 2024, 6],
  ];
  const annualCsv = (year, count, flow) => {
    const rows = ["timestamp," + (flow ? "Flow (m3/s)" : "Depth (m)")];
    for (
      let time = Date.UTC(year - 1, 11, 1);
      time <= Date.UTC(year + 1, 0, 1);
      time += 3600000
    ) {
      const hours = (time - Date.UTC(year, 0, 2)) / 3600000;
      const spill =
        hours >= 0 &&
        Math.floor(hours / (12 * 24)) < count &&
        hours % (12 * 24) < 6;
      rows.push(
        new Date(time).toISOString().slice(0, 19) + "," + (spill ? 2 : 0),
      );
    }
    return Buffer.from(rows.join("\n"));
  };
  await page.setInputFiles(
    "#fileInput",
    sourceSpecs.map(([name, year, count]) => ({
      name,
      mimeType: "text/csv",
      buffer: annualCsv(year, count, name === "ZeroFlow_2024.csv"),
    })),
  );
  await page.waitForFunction(
    (names) =>
      names.every((name) =>
        [...state.files.values()].some(
          (file) => file.displayName === name && file.status === "ready",
        ),
      ),
    sourceSpecs.map(([name]) => name),
    { timeout: 120000 },
  );
  const sourcePool = () =>
    page.evaluate(() =>
      [...state.files.values()]
        .map((file) => ({
          id: file.id,
          hash: file.hash,
          name: file.displayName,
          status: file.status,
        }))
        .sort((a, b) => a.id.localeCompare(b.id)),
    );
  const importedPool = await sourcePool();
  assert.equal(importedPool.length, 6);
  await page
    .locator('.pw-primary-nav button[data-workspace="network"]')
    .click();
  await page.evaluate(() =>
    ICMNetworkSchematic.restore(ICMNetworkCore.empty()),
  );
  if (!(await page.evaluate(() => ICMNetworkSchematic.debug().editing)))
    await page.locator("#nsEdit").click();
  const field = async (id, value) => {
    await page.locator("#" + id).fill(value);
    await page.locator("#" + id).dispatchEvent("change");
  };
  const assign = async (role, names) => {
    await page.locator('[data-ns-add-sources="' + role + '"]').click();
    for (const name of names)
      await page
        .locator("#nsPicker .ns-file-list label")
        .filter({ hasText: name })
        .locator("input")
        .check();
    await page.locator("#nsAddSelected").click();
  };
  await page.locator("#nsAddAsset").click();
  await field("nsName", "Synthetic bound control asset");
  await field("nsObservedDefault", "1.2");
  await field("nsModelDefault", "1.2");
  await assign("observed", ["Observed_2023.csv", "Observed_2024.csv"]);
  await assign("model", ["Baseline_2023.csv", "Baseline_2024.csv"]);
  await field("nsNewScenario", "Updated");
  await assign("model", ["Updated_2024.csv"]);
  await field("nsNewScenario", "Zero flow");
  await assign("model", ["ZeroFlow_2024.csv"]);
  const boundAsset = (await snapshot()).nodes[0];
  assert.equal(boundAsset.bindings.length, 6);
  const assessment = page
    .locator("#nsDrawer details")
    .filter({ has: page.getByText("Assessment settings", { exact: true }) });
  if (!(await assessment.evaluate((el) => el.open)))
    await assessment.locator(":scope > summary").click();
  await field("nsGap", "3700");
  await page.locator("#nsConfirmed").check();
  await page.locator("#nsCalculate").click();
  await page.waitForFunction(
    () => ICMNetworkSchematic.snapshot().nodes[0].applied?.rows.length === 6,
    null,
    { timeout: 120000 },
  );
  const calculatedAsset = (await snapshot()).nodes[0];
  assert.equal(
    await page.evaluate(() => ICMNetworkSchematic.debug().fresh[0].fresh),
    true,
  );
  for (const [name, year, count] of sourceSpecs) {
    const row = calculatedAsset.applied.rows.find(
      (row) => row.source_name === name && row.year === year,
    );
    assert.ok(row, "Calculated result exists for " + name);
    assert.equal(row.spill_count, count);
    assert.equal(row.eligible, true);
  }
  // Preserve a second asset with a real independent binding during source removals.
  await page.locator("#nsAddAsset").click();
  await field("nsName", "Synthetic unrelated bound asset");
  await assign("observed", ["Observed_2024.csv"]);
  const unrelated = (await snapshot()).nodes[1];
  assert.equal(unrelated.bindings.length, 1);
  await page.locator("#nsEdit").click();
  await select(boundAsset.id);
  await page.getByRole("button", { name: "Edit asset", exact: true }).click();
  assert.equal(
    await page.evaluate(() => ICMNetworkSchematic.debug().editing),
    true,
  );
  assert.equal(
    await page.evaluate(() => ICMNetworkSchematic.debug().selected),
    boundAsset.id,
  );
  assert.equal(
    await page.locator("#nsName").inputValue(),
    "Synthetic bound control asset",
  );
  assert.equal(await page.locator("#nsDrawer").isVisible(), true);
  assert.equal(await page.locator("#nsPopup").isVisible(), false);
  record(
    "button:Edit asset",
    "Open editing settings for the asset selected in evidence popup",
    "Editing true, exact selected ID/name retained, drawer visible and popup hidden.",
  );
  await page.locator("#nsEdit").click();
  await select(boundAsset.id);
  await page
    .getByRole("button", { name: "Spill analysis", exact: true })
    .click();
  assert.equal(
    await page.locator("#nsAnalysis").evaluate((el) => el.matches(":modal")),
    true,
  );
  assert.equal(
    await page.locator("#nsAnalysisTitle").innerText(),
    "Synthetic bound control asset",
  );
  assert.equal(await page.locator("#nsAnalysisPlot").isVisible(), false);
  assert.equal(
    await page.locator("#nsAnalysisMode").innerText(),
    "Show time series",
  );
  const annualRows = await page
    .locator("#nsAnalysisCounts tbody tr")
    .evaluateAll((rows) =>
      rows.map((row) =>
        [...row.cells].map((cell) => {
          const content = cell.cloneNode(true);
          content
            .querySelectorAll(".ns-rag-label")
            .forEach((label) => label.remove());
          return content.textContent.trim();
        }),
      ),
    );
  for (const [year, scenario, observed, model] of [
    [2023, "Baseline", 1, 3],
    [2024, "Baseline", 2, 4],
    [2024, "Updated", 2, 5],
    [2024, "Zero flow", 2, 6],
  ]) {
    const row = annualRows.find(
      (row) => row[0] === String(year) && row[1] === scenario,
    );
    assert.ok(row, "Annual spill modal row " + year + " " + scenario);
    assert.equal(row[2], String(observed));
    assert.equal(row[3], String(model));
  }
  assert.deepEqual(
    (await snapshot()).nodes[0].applied,
    calculatedAsset.applied,
  );
  record(
    "button:Spill analysis",
    "Open annual spill modal with actual calculated counts",
    "Native modal shows 2023/2024 observed counts 1/2 and model counts 3/4/5/6 by scenario; series plot hidden; applied evidence unchanged.",
  );
  const audit = page
    .locator("#nsAnalysis details")
    .filter({ has: page.getByText("Assessment details", { exact: true }) });
  await disclosure(
    audit,
    "summary:Assessment details",
    page.locator("#nsAnalysisAudit"),
  );
  await audit.locator(":scope > summary").click();
  const auditText = await page.locator("#nsAnalysisAudit").innerText();
  for (const [name] of sourceSpecs) assert.ok(auditText.includes(name));
  assert.match(auditText, /Threshold/);
  assert.match(auditText, /SHA-256/);
  assert.match(auditText, /gap 3,?700 s/);
  assert.equal(await page.locator("#nsAnalysisAudit > p").count(), 7);
  await page.locator("#nsCloseAnalysis").click();
  await page.locator("#nsEdit").click();
  await select(boundAsset.id);
  for (const [name] of sourceSpecs) {
    const before = await snapshot(),
      asset = before.nodes.find((n) => n.id === boundAsset.id);
    const binding = asset.bindings.find(
      (binding) => binding.sourceName === name,
    );
    assert.ok(binding);
    await page
      .getByRole("button", { name: "Remove " + name, exact: true })
      .click();
    const after = await snapshot(),
      changed = after.nodes.find((n) => n.id === boundAsset.id);
    assert.deepEqual(
      changed.bindings,
      asset.bindings.filter((row) => row.id !== binding.id),
    );
    assert.equal(
      await page
        .getByRole("button", { name: "Remove " + name, exact: true })
        .count(),
      0,
    );
    assert.deepEqual(
      after.nodes.find((n) => n.id === unrelated.id),
      unrelated,
    );
    assert.deepEqual(await sourcePool(), importedPool);
    assert.deepEqual(changed.applied, calculatedAsset.applied);
    assert.equal(
      await page.evaluate(
        (id) =>
          ICMNetworkSchematic.debug().fresh.find((row) => row.id === id).fresh,
        boundAsset.id,
      ),
      false,
    );
    record(
      "button:Remove " + name,
      "Remove only this real assigned binding; preserve pool/other bindings and stale the frozen results",
      "Exact binding removed; all remaining bindings and unrelated bound asset preserved; six imported sources unchanged; applied rows retained but marked stale.",
    );
  }
  privacy.assertClean();
  assert.deepEqual(errors, []);
  await page.screenshot({
    path: directory + "/network-controls-" + browserName + ".png",
  });
  console.log(
    browserName +
      ": " +
      results.length +
      " asserted network-control outcomes passed.",
  );
} catch (error) {
  results.push({
    route: "network/schematic",
    control: "suite execution",
    status: "FAIL",
    expected: "Complete focused synthetic control assertions",
    observed: error.stack || String(error),
  });
  await page
    .screenshot({
      path: directory + "/network-controls-" + browserName + "-failure.png",
    })
    .catch(() => {});
  throw error;
} finally {
  await fs.writeFile(
    directory + "/network-controls-" + browserName + ".json",
    JSON.stringify(
      {
        browser: browserName,
        base,
        candidate,
        viewport: { width: 1600, height: 1050 },
        results,
        gaps: [
          "Annual count expectations are bounded to the six synthetic source fixtures.",
          "Cancel operations and process queue require their separate acceptance suite.",
          "Other desktop widths, zoom levels and environments remain untested.",
        ],
      },
      null,
      2,
    ) + "\n",
  );
  await browser.close();
}
