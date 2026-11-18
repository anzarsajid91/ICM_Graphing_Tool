import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { writeEvidence } from "./evidence-output.mjs";

export async function verifyNetworkExplorer(page, browserName, record) {
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
  const snapshot = () => page.evaluate(() => ICMNetworkSchematic.snapshot());
  const native = (remark = "Original remarks") =>
    [
      "**** hw_node",
      "ObjectTable,node_id,x,y,node_type,remarks",
      "FieldDescription,Node identifier,Easting,Northing,Node type,Operator notes",
      "UserUnits,,m,m,,",
      "hw_node,A,0,0,manhole," + remark,
      "hw_node,B,140,100,manhole,",
      "hw_node,C,320,20,outfall,",
      "hw_node,Independent,0,220,manhole,",
      "**** hw_weir",
      "ObjectTable,us_node_id,ds_node_id,link_suffix,opening",
      "UserUnits,,,,custom unit",
      "hw_weir,A,B,W,001.60",
      "**** hw_pump",
      "ObjectTable,us_node_id,ds_node_id,link_suffix,setting",
      "hw_pump,B,C,P,automatic",
    ].join("\n");
  const selectFile = async ({ name, mimeType, buffer }) => {
    await page.getByText("Save / Export / Load", { exact: true }).click();
    const opened = page.waitForEvent("filechooser");
    await page.locator("#nsLoad").click();
    await (await opened).setFiles({ name, mimeType, buffer });
  };
  const importNetwork = async (text) => {
    await selectFile({
      name: "synthetic-explorer.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(text),
    });
    const audit = page.getByRole("dialog", {
      name: "Model Context Import Audit",
    });
    await audit.waitFor();
    await page.locator("#nsContextUnits").check();
    await page.locator("#nsContextApply").click();
    await audit.waitFor({ state: "hidden" });
    assert.equal((await snapshot()).edges.length, 2);
  };
  await importNetwork(native());
  assert.equal(
    await page.locator("#nsModeLabel").textContent(),
    "Explore mode",
  );
  const asset = (id) =>
    page.locator('[data-ns-node="' + id + '"] rect[fill="transparent"]');
  const firstLink = page.locator("[data-ns-edge]").first();
  const linkId = await firstLink.getAttribute("data-ns-edge");
  const tab = (name) => page.getByRole("tab", { name, exact: true });
  const panel = page.locator("#nsPopup").getByRole("tabpanel");
  await firstLink.focus();
  await firstLink.press("Enter");
  assert.equal(await tab("Properties").getAttribute("aria-selected"), "true");
  assert.match(
    await panel.innerText(),
    /synthetic-explorer\.csv · hw_weir · row 12/,
  );
  await panel.getByText("Other source attributes", { exact: true }).click();
  await screenshot("imported-connector-inspector");
  assert.match(await panel.innerText(), /001\.60 custom unit/);
  assert.equal(
    await panel.getByRole("textbox", { name: "opening" }).count(),
    0,
  );
  await panel
    .getByRole("textbox", { name: "Property name" })
    .fill("Inspection note");
  await panel
    .getByRole("textbox", { name: "Value", exact: true })
    .fill("<Local only>");
  await panel.getByRole("textbox", { name: "Unit (optional)" }).fill("m");
  await panel.getByRole("button", { name: "Add property" }).click();
  assert.match(await panel.innerText(), /Inspection note: <Local only> m/);
  await panel
    .getByRole("button", { name: "Edit custom property Inspection note" })
    .click();
  await panel
    .getByRole("textbox", { name: "Value", exact: true })
    .fill("Verified");
  await panel.getByRole("button", { name: "Save property" }).click();
  assert.deepEqual((await snapshot()).edges[0].customProperties, [
    { name: "Inspection note", value: "Verified", unit: "m" },
  ]);

  await panel
    .getByRole("button", { name: "Edit custom property Inspection note" })
    .click();
  await panel
    .getByRole("textbox", { name: "Value", exact: true })
    .fill("Discard edit");
  await panel.getByRole("button", { name: "Cancel edit" }).click();
  assert.equal(
    (await snapshot()).edges[0].customProperties[0].value,
    "Verified",
  );
  await panel
    .getByRole("textbox", { name: "Property name" })
    .fill("Inspection note");
  await panel.getByRole("button", { name: "Add property" }).click();
  assert.match(await panel.innerText(), /already exists/);
  await panel
    .getByRole("textbox", { name: "Property name" })
    .fill("Temporary property");
  await panel.getByRole("button", { name: "Add property" }).click();
  await panel
    .getByRole("button", { name: "Remove custom property Temporary property" })
    .click();
  assert.equal((await snapshot()).edges[0].customProperties.length, 1);
  await tab("Properties").press("ArrowRight");
  assert.equal(await tab("Upload data").getAttribute("aria-selected"), "true");
  const chooseSource = page.waitForEvent("filechooser");
  await panel.getByRole("button", { name: "Upload local files" }).click();
  await (
    await chooseSource
  ).setFiles({
    name: "explorer-reference.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(
      "Timestamp,Flow (m3/s)\n2025-01-01 00:00,0.1\n2025-01-01 00:05,0.2\n2025-01-01 00:10,0.1\n",
    ),
  });
  await panel
    .getByText(/explorer-reference\.csv · ready/)
    .waitFor({ timeout: 90000 });
  await tab("Upload data").press("ArrowRight");
  const source = panel.getByLabel("Reference source");
  await source.selectOption({ label: "explorer-reference.csv" });
  await panel.getByRole("button", { name: "Link time series" }).click();
  assert.equal((await snapshot()).edges[0].seriesLinks.length, 1);
  assert.match(await panel.innerText(), /Source ready/);
  await panel.getByRole("button", { name: "Remove reference" }).click();
  assert.equal((await snapshot()).edges[0].seriesLinks.length, 0);
  await panel
    .getByLabel("Reference source")
    .selectOption({ label: "explorer-reference.csv" });
  await panel.getByRole("button", { name: "Link time series" }).click();
  await tab("Data linking").press("End");
  await panel.getByText("Review notes", { exact: true }).click();
  await panel
    .getByLabel("Comment", { exact: true })
    .fill("Synthetic connector review");
  await panel.getByLabel("Comment", { exact: true }).press("Tab");
  assert.equal(
    (await snapshot()).edges[0].review.comment,
    "Synthetic connector review",
  );
  record(
    "nsInspectorPanel",
    "Inspect and update a connector across four tabs",
    "Original ICM properties, local file chooser, reference add/remove and review notes verified",
  );

  await page.locator("#nsResetView").click();
  await asset("B").click();
  assert.equal(await tab("Evidence").getAttribute("aria-selected"), "true");
  await tab("Properties").click();
  assert.match(
    await panel.innerText(),
    /synthetic-explorer\.csv · hw_node · row 6/,
  );
  const beforeFocus = (await snapshot()).camera;
  await asset("B").dblclick();
  assert.notDeepEqual((await snapshot()).camera, beforeFocus);
  await page.locator("#nsFocusSelected").click();
  await asset("B").click({ button: "right" });
  const actions = page.locator("#nsContextActions");
  await actions.getByRole("button", { name: "Trace upstream" }).click();
  assert.equal(
    await page.locator('[data-ns-node="C"]').evaluate((el) => el.style.opacity),
    ".2".replace(/^\./, "0."),
  );
  await asset("B").click({ button: "right" });
  await actions.getByRole("button", { name: "Trace downstream" }).click();
  assert.equal(
    await page
      .locator('[data-ns-node="A"]')
      .evaluate((el) => Number(el.style.opacity)),
    0.2,
  );
  await asset("B").click({ button: "right" });
  await actions.getByRole("button", { name: "Isolate branch" }).click();
  assert.equal(await page.locator('[data-ns-node="Independent"]').count(), 0);
  await page.locator("#nsResetView").click();
  assert.equal(await page.locator('[data-ns-node="Independent"]').count(), 1);
  const map = page.locator("#nsMinimap");
  const beforeMap = (await snapshot()).camera;
  await map.click({ position: { x: 25, y: 40 } });
  assert.notDeepEqual((await snapshot()).camera, beforeMap);
  const beforeKeys = (await snapshot()).camera;
  await map.press("ArrowRight");
  assert.equal((await snapshot()).camera.x, beforeKeys.x - 30);
  await map.press("Enter");
  await page.locator("#nsAssetSearch").fill(linkId);
  await page.locator("#nsAssetSearch").press("Enter");
  assert.match(await page.locator("#nsPopup h3").innerText(), /A\.W/);
  await page.setViewportSize({ width: 1024, height: 900 });
  await screenshot("explorer-at-1024");
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  );
  await page.setViewportSize({ width: 1600, height: 1050 });
  record(
    "nsMinimap",
    "Focus, pan, trace and restore the network",
    "Double-click, focus, context actions, minimap mouse/keyboard, search and narrow desktop verified",
  );

  if (browserName === "chromium") {
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Emulation.setTouchEmulationEnabled", {
      enabled: true,
      maxTouchPoints: 2,
    });
    try {
      const box = await page.locator("#nsCanvas").boundingBox();
      const x = Math.round(box.x + box.width / 2),
        y = Math.round(box.y + 140);
      const before = (await snapshot()).camera;
      await cdp.send("Input.dispatchTouchEvent", {
        type: "touchStart",
        touchPoints: [
          { x: x - 25, y, id: 1 },
          { x: x + 25, y, id: 2 },
        ],
      });
      await cdp.send("Input.dispatchTouchEvent", {
        type: "touchMove",
        touchPoints: [
          { x: x - 70, y, id: 1 },
          { x: x + 70, y, id: 2 },
        ],
      });
      await cdp.send("Input.dispatchTouchEvent", {
        type: "touchEnd",
        touchPoints: [],
      });
      assert.ok((await snapshot()).camera.zoom > before.zoom);
      const beforePan = (await snapshot()).camera;
      await cdp.send("Input.dispatchTouchEvent", {
        type: "touchStart",
        touchPoints: [{ x, y, id: 1 }],
      });
      await cdp.send("Input.dispatchTouchEvent", {
        type: "touchMove",
        touchPoints: [{ x: x + 36, y: y + 27, id: 1 }],
      });
      await cdp.send("Input.dispatchTouchEvent", {
        type: "touchEnd",
        touchPoints: [],
      });
      const panned = (await snapshot()).camera;
      assert.equal(panned.zoom, beforePan.zoom);
      assert.ok(panned.x > beforePan.x && panned.y > beforePan.y);
      record(
        "nsCanvas",
        "Pan and pinch on a touch surface",
        "Native two-contact zoom and single-contact pan verified",
      );
    } finally {
      await cdp.send("Emulation.setTouchEmulationEnabled", { enabled: false });
      await cdp.detach();
    }
  }

  await importNetwork(native("Revised remarks"));
  const revised = await snapshot();
  const retained = revised.edges.find((edge) => edge.id === linkId);
  assert.equal(retained.review.comment, "Synthetic connector review");
  assert.equal(retained.customProperties[0].value, "Verified");
  assert.equal(retained.seriesLinks.length, 1);
  assert.equal(
    revised.nodes[0].sourceAttributes.fields.at(-1).value,
    "Revised remarks",
  );
  await page.getByText("Save / Export / Load", { exact: true }).click();
  const download = page.waitForEvent("download");
  await page.locator("#nsSave").click();
  const saved = await fs.readFile(await (await download).path());
  const exported = JSON.parse(saved.toString("utf8"));
  assert.deepEqual(
    exported.edges.find((edge) => edge.id === linkId),
    retained,
  );
  await selectFile({
    name: "explorer-restored.json",
    mimeType: "application/json",
    buffer: saved,
  });
  await page
    .getByRole("status")
    .filter({ hasText: "Network restored" })
    .waitFor();
  assert.deepEqual(
    (await snapshot()).edges.find((edge) => edge.id === linkId),
    retained,
  );
  record(
    "nsSave",
    "Reimport matching native data and round-trip a saved explorer network",
    "New source fields, compatible local properties, references and notes preserved",
  );
}
