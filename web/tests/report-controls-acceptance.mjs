// Native controls on an actual generated, self-contained synthetic report.
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { chromium, firefox } from "playwright";
import {
  browserLaunchOptions,
  browserContextOptions,
} from "./browser-environment.mjs";
import { installPrivacyGuard } from "./privacy-network.mjs";
import { writeEvidence } from "./evidence-output.mjs";
export async function verifyReportControls(page, evidenceRoot) {
  const outcomes = [];
  assert.equal(
    await page.evaluate(() => Boolean(window.__ICM_PRECISION_WORKBENCH__)),
    false,
    "Standalone report is an unrouted document",
  );
  const record = (control, expected, observed) => {
    outcomes.push({
      route: "initial",
      control: "button:" + control,
      status: "PASS",
      expected,
      observed,
    });
    console.log("REPORT_CONTROL_PASS " + control);
  };
  const chartId = await page
    .locator(".report-plot")
    .evaluateAll(
      (plots) =>
        plots.find((plot) =>
          plot.data?.some(
            (trace) => trace.mode?.includes("markers") && trace.x?.length > 2,
          ),
        )?.id,
    );
  assert.ok(chartId, "Generated report contains actual scatter observations");
  const chart = page.locator("#" + chartId);
  assert.equal(
    await chart.count(),
    1,
    "Report exposes native selection controls",
  );
  await chart.scrollIntoViewIfNeeded();
  const state = () =>
    chart.evaluate((el) => ({
      x: [...el._fullLayout.xaxis.range],
      y: [...el._fullLayout.yaxis.range],
      dragmode: el._fullLayout.dragmode,
      data: JSON.stringify(
        el.data.map((trace) => ({
          x: trace.x,
          y: trace.y,
          name: trace.name,
          type: trace.type,
        })),
      ),
    }));
  const initial = await state();
  const click = async (title) => {
    await chart.hover();
    await chart.locator('.modebar-btn[data-title="' + title + '"]').click();
  };
  const waitSpan = async (before, direction) => {
    for (let attempt = 0; attempt < 100; attempt++) {
      const after = await state(),
        ratio = (after.x[1] - after.x[0]) / (before.x[1] - before.x[0]);
      if (direction === "smaller" ? ratio < 0.99 : ratio > 1.01) return after;
      await page.waitForTimeout(20);
    }
    assert.fail("Report axis span did not change " + direction);
  };
  await click("Zoom in");
  let after = await waitSpan(initial, "smaller");
  assert.ok(after.y[1] - after.y[0] < initial.y[1] - initial.y[0]);
  record("Zoom in", "Narrow both actual report domains", {
    before: initial.x,
    after: after.x,
  });
  const zoomed = after;
  await click("Zoom out");
  after = await waitSpan(zoomed, "larger");
  assert.ok(after.y[1] - after.y[0] > zoomed.y[1] - zoomed.y[0]);
  record("Zoom out", "Expand both actual report domains", {
    before: zoomed.x,
    after: after.x,
  });
  await click("Reset axes");
  await page.waitForFunction(
    ({ id, x, y }) => {
      const el = document.getElementById(id);
      return [el._fullLayout.xaxis.range, el._fullLayout.yaxis.range].every(
        (range, i) => range.every((v, j) => Math.abs(v - [x, y][i][j]) < 1e-7),
      );
    },
    { id: await chart.getAttribute("id"), x: initial.x, y: initial.y },
  );
  record("Reset axes", "Restore original report axis domains", {
    x: initial.x,
    y: initial.y,
  });
  await click("Zoom in");
  await waitSpan(initial, "smaller");
  await click("Autoscale");
  await page.waitForFunction(
    (id) => {
      const el = document.getElementById(id);
      return el._fullLayout.xaxis.autorange && el._fullLayout.yaxis.autorange;
    },
    await chart.getAttribute("id"),
  );
  after = await state();
  assert.ok(after.x[1] - after.x[0] > zoomed.x[1] - zoomed.x[0]);
  record("Autoscale", "Recompute both full report domains", {
    x: after.x,
    y: after.y,
  });
  const bounds = () =>
    chart.evaluate((el) => {
      const rect = el.getBoundingClientRect(),
        x = el._fullLayout.xaxis,
        y = el._fullLayout.yaxis;
      return {
        x: rect.left + x._offset,
        y: rect.top + y._offset,
        width: x._length,
        height: y._length,
      };
    });
  await click("Pan");
  assert.equal((await state()).dragmode, "pan");
  let b = await bounds(),
    before = await state();
  await page.mouse.move(b.x + b.width * 0.45, b.y + b.height * 0.5);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width * 0.55, b.y + b.height * 0.5, {
    steps: 10,
  });
  await page.mouse.up();
  await page.waitForFunction(
    ({ id, start }) =>
      Math.abs(document.getElementById(id)._fullLayout.xaxis.range[0] - start) >
      1e-8,
    { id: await chart.getAttribute("id"), start: before.x[0] },
  );
  after = await state();
  assert.ok(
    Math.abs((after.x[1] - after.x[0]) / (before.x[1] - before.x[0]) - 1) <
      1e-6,
  );
  record(
    "Pan",
    "Mouse pan translates the actual report domain without rescaling",
    { before: before.x, after: after.x },
  );
  await click("Reset axes");
  await click("Zoom");
  assert.equal((await state()).dragmode, "zoom");
  before = await state();
  b = await bounds();
  await page.mouse.move(b.x + b.width * 0.25, b.y + b.height * 0.25);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width * 0.75, b.y + b.height * 0.75, {
    steps: 10,
  });
  await page.mouse.up();
  after = await waitSpan(before, "smaller");
  record("Zoom", "Mouse box zoom narrows the actual report domain", {
    before: before.x,
    after: after.x,
  });
  await click("Reset axes");
  await chart.evaluate((el) => {
    el.on("plotly_selected", (event) => {
      window.reportControlSelection =
        event?.points?.map((point) => ({
          curve: point.curveNumber,
          index: point.pointNumber,
          x: point.x,
          y: point.y,
        })) || [];
    });
  });
  let boxSelection;
  for (const [title, mode] of [
    ["Box Select", "select"],
    ["Lasso Select", "lasso"],
  ]) {
    await click(title);
    assert.equal((await state()).dragmode, mode);
    const selection = await chart.evaluate((el) => {
      const rect = el.getBoundingClientRect();
      const curve = el.data.findIndex(
        (trace) => trace.mode?.includes("markers") && trace.x?.length > 2,
      );
      if (curve < 0) return null;
      const trace = el.data[curve],
        index = Math.floor(trace.x.length / 2),
        px =
          rect.left +
          el._fullLayout.xaxis._offset +
          el._fullLayout.xaxis.d2p(trace.x[index]),
        py =
          rect.top +
          el._fullLayout.yaxis._offset +
          el._fullLayout.yaxis.d2p(trace.y[index]);
      return {
        left: px - 8,
        right: px + 8,
        top: py - 8,
        bottom: py + 8,
        curve,
        index,
      };
    });
    assert.ok(selection, "Report marker trace has selectable actual points");
    await page.evaluate(() => {
      window.reportControlSelection = null;
    });
    await page.mouse.move(selection.left, selection.top);
    await page.mouse.down();
    if (mode === "lasso") {
      await page.mouse.move(selection.right, selection.top, { steps: 6 });
      await page.mouse.move(selection.right, selection.bottom, { steps: 6 });
      await page.mouse.move(selection.left, selection.bottom, { steps: 6 });
      await page.mouse.move(selection.left, selection.top, { steps: 6 });
    } else
      await page.mouse.move(selection.right, selection.bottom, { steps: 10 });
    await page.mouse.up();
    await page.waitForFunction(() => window.reportControlSelection?.length > 0);
    const selected = await page.evaluate(() => window.reportControlSelection);
    assert.ok(
      selected.some(
        (point) =>
          point.curve === selection.curve && point.index === selection.index,
      ),
    );
    if (mode === "select") boxSelection = selected;
    else assert.deepEqual(selected, boxSelection);
    record(
      title,
      "Mouse selection contains the targeted actual report sample; both selection tools agree",
      selected,
    );
  }
  const pending = page.waitForEvent("download");
  await click("Download plot as a PNG");
  const download = await pending;
  assert.equal(await download.failure(), null);
  const bytes = await fs.readFile(await download.path());
  assert.deepEqual(
    [...bytes.subarray(0, 8)],
    [137, 80, 78, 71, 13, 10, 26, 10],
  );
  assert.ok(bytes.readUInt32BE(16) > 0 && bytes.readUInt32BE(20) > 0);
  record(
    "Download plot as a PNG",
    "Download valid local PNG from actual report chart",
    {
      bytes: bytes.length,
      width: bytes.readUInt32BE(16),
      height: bytes.readUInt32BE(20),
    },
  );
  await page.waitForSelector(".notifier-note .notifier-close");
  const note = page.locator(".notifier-note").first(),
    handle = await note.elementHandle();
  await note.locator(".notifier-close").click();
  await page.waitForFunction((el) => !el.isConnected, handle);
  record(
    "×",
    "Dismiss a real Plotly notification",
    "Notification count decreased after native close click",
  );
  assert.equal(
    (await state()).data,
    initial.data,
    "All native controls preserve exported report trace data",
  );
  console.log(
    "EVIDENCE " +
      (await writeEvidence(
        evidenceRoot + "/report-control-outcomes.json",
        JSON.stringify({ outcomes, title: await page.title() }, null, 2),
      )),
  );
  return outcomes;
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
) {
  assert.ok(
    process.env.ICM_REPORT_HTML,
    "Use a generated synthetic self-contained report fixture",
  );
  const html = await fs.readFile(process.env.ICM_REPORT_HTML, "utf8");
  const name = process.env.ICM_BROWSER || "chromium",
    browser = await { chromium, firefox }[name].launch(browserLaunchOptions());
  try {
    const context = await browser.newContext({
        ...browserContextOptions(),
        viewport: { width: 1440, height: 1000 },
        acceptDownloads: true,
      }),
      guard = installPrivacyGuard(
        context,
        process.env.ICM_BASE_URL || "http://127.0.0.1:8008/",
      ),
      page = await context.newPage(),
      errors = [];
    const resourceProbe = await context.newPage();
    await guard.navigate(
      resourceProbe,
      process.env.ICM_BASE_URL || "http://127.0.0.1:8008/",
    );
    await resourceProbe.close();
    page.on("pageerror", (error) => errors.push(error.message));
    await page.setContent(html, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() =>
      [...document.querySelectorAll(".report-plot")].every(
        (el) => el._fullLayout,
      ),
    );
    await verifyReportControls(
      page,
      process.env.ICM_EVIDENCE_DIR || "/tmp/hydra-report-controls",
    );
    guard.assertClean();
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
}
