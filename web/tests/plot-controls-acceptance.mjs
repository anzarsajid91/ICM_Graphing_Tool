// Native modebar regression with deterministic synthetic traces in normal app chart hosts.
// Native controls have bounded fixture scope; Detriment uses real CSV calculations
// and records separate numerical assertions before exercising its rendered charts.
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
const base = process.env.ICM_BASE_URL || "http://127.0.0.1:8005/";
const evidenceRoot = process.env.ICM_EVIDENCE_DIR || "/tmp/hydra-plot-controls";
const candidate = process.env.GITHUB_SHA || null;
const browserNames = process.env.ICM_BROWSER
  ? [process.env.ICM_BROWSER]
  : ["chromium", "firefox"];
const results = [];
let failed = false;
for (const browserName of browserNames) {
  const browser = await { chromium, firefox }[browserName].launch(
    browserLaunchOptions(),
  );
  const context = await browser.newContext({
    ...browserContextOptions(),
    viewport: { width: 1440, height: 1000 },
    acceptDownloads: true,
  });
  const guard = installPrivacyGuard(context, base),
    page = await context.newPage(),
    errors = [];
  page.on("pageerror", (error) => errors.push(String(error)));
  try {
    await guard.navigate(page, base, { waitUntil: "domcontentloaded" });
    assert.match(await page.title(), /Hydra Bench/);
    await page.waitForFunction(
      () =>
        typeof Plotly !== "undefined" &&
        window.__ICM_PRECISION_WORKBENCH__?.navigate,
      null,
      { timeout: 60000 },
    );
    if (candidate) {
      const actual = await page
        .locator('meta[name="icm-build-sha"]')
        .getAttribute("content");
      assert.equal(actual, candidate);
    }
    for (const [route, id, selection] of [
      ["data/time-series", "timeChart", false],
      ["graphs/comparison", "scatterChart", true],
      ["graphs/rating", "ratingChart", true],
    ]) {
      await page.evaluate(
        (route) =>
          window.__ICM_PRECISION_WORKBENCH__.navigate(
            ...route.split("/"),
            false,
          ),
        route,
      );
      // Use the normal app host and app native plotConfig. No controls are added;
      // Time series retains the production exclusion of Box/Lasso selection.
      await page.evaluate(
        async ({ id, selection }) => {
          const chart = document.getElementById(id);
          await Plotly.newPlot(
            chart,
            [
              {
                x: [0, 2, 4, 6, 8, 10],
                y: [0, 2, 4, 6, 8, 10],
                type: "scatter",
                mode: "markers",
                name: "Synthetic native-control fixture",
                marker: { size: 12 },
              },
            ],
            {
              height: 470,
              margin: { l: 70, r: 30, t: 45, b: 60 },
              xaxis: { type: "linear", range: [0, 10] },
              yaxis: { type: "linear", range: [0, 10] },
              dragmode: "zoom",
              showlegend: false,
            },
            plotConfig("synthetic-native-control", {
              modeBarButtonsToRemove: selection ? [] : ["select2d", "lasso2d"],
            }),
          );
          window.__nativeControlSelection = null;
          chart.on("plotly_selected", (event) => {
            window.__nativeControlSelection = event
              ? {
                  points: (event.points || []).map((p) => p.pointIndex),
                  range: event.range || null,
                  lassoPoints: event.lassoPoints || null,
                }
              : null;
          });
        },
        { id, selection },
      );
      const chart = page.locator("#" + id);
      await chart.scrollIntoViewIfNeeded();
      await chart.hover();
      const state = () =>
        chart.evaluate((el) => ({
          x: [...el._fullLayout.xaxis.range],
          y: [...el._fullLayout.yaxis.range],
          dragmode: el._fullLayout.dragmode,
          traceX: [...el.data[0].x],
          traceY: [...el.data[0].y],
        }));
      const click = async (title) => {
        await chart.hover();
        await chart.locator('.modebar-btn[data-title="' + title + '"]').click();
      };
      const record = async (control, expected, operation) => {
        try {
          const observed = await operation();
          results.push({
            browser: browserName,
            route,
            chart: id,
            control: "button:" + control,
            status: "PASS",
            expected,
            observed,
            fixture:
              "synthetic deterministic numeric 0–10 diagonal; normal app host/app plotConfig",
            candidate,
          });
        } catch (error) {
          results.push({
            browser: browserName,
            route,
            chart: id,
            control: "button:" + control,
            status: "FAIL",
            expected,
            observed: String(error),
            candidate,
          });
          throw error;
        }
      };
      const waitSpan = async (predicate) => {
        await page.waitForFunction(
          ({ id, predicate }) => {
            const r = document.getElementById(id)._fullLayout.xaxis.range;
            const span = r[1] - r[0];
            return predicate === "smaller" ? span < 9.9 : span > 9.9;
          },
          { id, predicate },
        );
      };
      await record(
        "Zoom in",
        "Native zoom-in narrows the visible X domain",
        async () => {
          const before = await state();
          await click("Zoom in");
          await waitSpan("smaller");
          const after = await state();
          assert.ok(after.y[1] - after.y[0] < before.y[1] - before.y[0]);
          return { before, after };
        },
      );
      await record(
        "Zoom out",
        "Native zoom-out expands X and Y domains",
        async () => {
          const before = await state();
          await click("Zoom out");
          await waitSpan("larger");
          const after = await state();
          assert.ok(after.y[1] - after.y[0] > before.y[1] - before.y[0]);
          return { before, after };
        },
      );
      await click("Zoom in");
      await waitSpan("smaller");
      await record(
        "Reset axes",
        "Native Reset restores configured 0–10 X/Y domains",
        async () => {
          await click("Reset axes");
          await page.waitForFunction(
            (id) =>
              JSON.stringify(
                document.getElementById(id)._fullLayout.xaxis.range,
              ) === "[0,10]",
            id,
          );
          const after = await state();
          assert.deepEqual(after.y, [0, 10]);
          return after;
        },
      );
      await record(
        "Autoscale",
        "Native Autoscale includes every fixture point with nonzero padding",
        async () => {
          await click("Zoom in");
          await waitSpan("smaller");
          await click("Autoscale");
          await page.waitForFunction((id) => {
            const c = document.getElementById(id)._fullLayout;
            return (
              c.xaxis.autorange &&
              c.yaxis.autorange &&
              c.xaxis.range[0] < 0 &&
              c.xaxis.range[1] > 10
            );
          }, id);
          const after = await state();
          assert.ok(after.y[0] < 0 && after.y[1] > 10);
          return after;
        },
      );
      for (const [title, mode] of [
        ["Pan", "pan"],
        ["Zoom", "zoom"],
        ...(selection
          ? [
              ["Box Select", "select"],
              ["Lasso Select", "lasso"],
            ]
          : []),
      ]) {
        await record(
          title,
          "Native modebar sets " +
            mode +
            " drag mode" +
            (mode === "select" || mode === "lasso"
              ? " and mouse gesture selects exact points"
              : ""),
          async () => {
            await click(title);
            await page.waitForFunction(
              ({ id, mode }) =>
                document.getElementById(id)._fullLayout.dragmode === mode,
              { id, mode },
            );
            if (mode === "select" || mode === "lasso") {
              // Pixel bounds come from Plotly's rendered axes; the actual gesture uses mouse input.
              const bounds = await chart.evaluate((el) => {
                const r = el.getBoundingClientRect(),
                  x = el._fullLayout.xaxis,
                  y = el._fullLayout.yaxis;
                return {
                  left: r.left + x._offset + x.l2p(1),
                  right: r.left + x._offset + x.l2p(7),
                  top: r.top + y._offset + y.l2p(7),
                  bottom: r.top + y._offset + y.l2p(1),
                };
              });
              await page.evaluate(() => {
                window.__nativeControlSelection = null;
              });
              await page.mouse.move(bounds.left, bounds.top);
              await page.mouse.down();
              if (mode === "lasso") {
                await page.mouse.move(bounds.right, bounds.top, { steps: 8 });
                await page.mouse.move(bounds.right, bounds.bottom, {
                  steps: 8,
                });
                await page.mouse.move(bounds.left, bounds.bottom, { steps: 8 });
                await page.mouse.move(bounds.left, bounds.top, { steps: 8 });
              } else
                await page.mouse.move(bounds.right, bounds.bottom, {
                  steps: 12,
                });
              await page.mouse.up();
              await page.waitForFunction(
                () => window.__nativeControlSelection?.points?.length > 0,
              );
              const selected = await page.evaluate(
                () => window.__nativeControlSelection,
              );
              assert.deepEqual(selected.points, [1, 2, 3]);
              return { state: await state(), selected };
            }
            return await state();
          },
        );
      }
      await record(
        "Download plot as a PNG",
        "Native camera downloads a valid local PNG with positive dimensions",
        async () => {
          const pending = page.waitForEvent("download");
          await click("Download plot as a PNG");
          const download = await pending;
          assert.equal(await download.failure(), null);
          assert.match(download.suggestedFilename(), /\.png$/i);
          const bytes = await fs.readFile(await download.path());
          assert.deepEqual(
            [...bytes.subarray(0, 8)],
            [137, 80, 78, 71, 13, 10, 26, 10],
          );
          const width = bytes.readUInt32BE(16),
            height = bytes.readUInt32BE(20);
          assert.ok(width > 0 && height > 0);
          return {
            filename: download.suggestedFilename(),
            bytes: bytes.length,
            width,
            height,
          };
        },
      );
      const final = await state();
      assert.deepEqual(final.traceX, [0, 2, 4, 6, 8, 10]);
      assert.deepEqual(final.traceY, [0, 2, 4, 6, 8, 10]);
      const screenshot = await writeEvidence(
        evidenceRoot + "/" + browserName + "-" + id + ".png",
        await page.screenshot({ fullPage: false }),
      );
      console.log("SCREENSHOT " + screenshot);
    }
    // Real Detriment charts: these are calculated from normal CSV uploads. No
    // Plotly.newPlot/react, configuration overrides or result replacement here.
    await page.evaluate(() =>
      window.__ICM_PRECISION_WORKBENCH__.navigate("data", "time-series", false),
    );
    await page.locator("#dtReportUpload").evaluate((el) => {
      el.open = true;
    });
    await page.setInputFiles(
      "#dtFileInput",
      ["flood-a.csv", "flood-b.csv", "spill-a.csv", "spill-b.csv"].map((name) =>
        path.resolve("tests/fixtures/detriment", name),
      ),
    );
    await page.waitForFunction(
      () =>
        [...state.files.values()].filter(
          (x) =>
            x.status === "ready" &&
            x.parsed?.metadata?.source_kind === "detriment_report",
        ).length === 4,
      null,
      { timeout: 120000 },
    );
    const field = (key) => page.locator('#dtForm [data-key="' + key + '"]');
    for (const [kind, id, selection] of [
      ["flooding", "dtChart", false],
      ["spill", "dtPairedChart", true],
    ]) {
      const route = "detriment/" + kind;
      await page.evaluate(
        (kind) =>
          window.__ICM_PRECISION_WORKBENCH__.navigate("detriment", kind, false),
        kind,
      );
      for (const slot of ["a", "b"]) {
        const source = kind === "flooding" ? "flood" : kind;
        const value = await field(slot + ".id")
          .locator("option")
          .evaluateAll(
            (options, name) =>
              options.find((o) => o.textContent === name)?.value,
            source + "-" + slot + ".csv",
          );
        assert.ok(value);
        await field(slot + ".id").selectOption(value);
      }
      await field("scope").fill("Matched synthetic native-control regression");
      await field("scope_confirmed").check();
      if (kind === "flooding") await field("threshold").fill("5");
      else {
        await field("period_start").fill("2025-01-01");
        await field("period_end").fill("2026-01-01");
        await field("template").fill(
          "UK12/24 identical threshold and integral",
        );
      }
      await page.click("#runDetrimentBtn");
      await page.waitForFunction(
        () => Boolean(window.ICMDetriment.result()),
        null,
        { timeout: 60000 },
      );
      const engineering = await page.evaluate(() =>
        window.ICMDetriment.result(),
      );
      if (kind === "flooding") {
        assert.equal(engineering.summary.detriment, 1);
        assert.equal(
          engineering.rows.find((row) => row.asset_id === "001").delta,
          6,
        );
      } else {
        assert.equal(engineering.rows[0].delta, 3);
        assert.equal(engineering.rows[0].duration_delta_hours, 4);
      }
      const chart = page.locator("#" + id);
      await chart.scrollIntoViewIfNeeded();
      await chart.hover();
      await page.waitForFunction(
        (id) =>
          document.getElementById(id)?._fullLayout &&
          document.getElementById(id)?.data?.length,
        id,
      );
      const state = () =>
        chart.evaluate((el) => ({
          x: [...el._fullLayout.xaxis.range],
          y: [...el._fullLayout.yaxis.range],
          dragmode: el._fullLayout.dragmode,
          data: el.data.map((t) => ({
            type: t.type,
            x: [...t.x],
            y: [...t.y],
          })),
        }));
      const initial = await state();
      const span = (r) => r[1] - r[0];
      const click = async (title) => {
        await chart.hover();
        await chart.locator('.modebar-btn[data-title="' + title + '"]').click();
      };
      const record = async (control, expected, operation) => {
        try {
          const observed = await operation();
          results.push({
            browser: browserName,
            route,
            chart: id,
            control: "button:" + control,
            status: "PASS",
            expected,
            observed,
            fixture:
              "Real normal-input CSV import/calculation; no chart replacement; flood-a/b or spill-a/b",
            engineering: {
              flooding_delta: kind === "flooding" ? 6 : null,
              spill_delta: kind === "spill" ? 3 : null,
              spill_duration_delta_hours: kind === "spill" ? 4 : null,
            },
            candidate,
          });
        } catch (error) {
          results.push({
            browser: browserName,
            route,
            chart: id,
            control: "button:" + control,
            status: "FAIL",
            expected,
            observed: String(error),
            candidate,
          });
          throw error;
        }
      };
      const waitSpan = async (before, direction) =>
        page.waitForFunction(
          ({ id, before, direction }) => {
            const r = document.getElementById(id)._fullLayout.xaxis.range,
              s = r[1] - r[0];
            return direction === "smaller"
              ? s < before - 0.001
              : s > before + 0.001;
          },
          { id, before, direction },
        );
      await record(
        "Zoom in",
        "Native zoom-in narrows real chart X/Y domains",
        async () => {
          const before = await state();
          await click("Zoom in");
          await waitSpan(span(before.x), "smaller");
          const after = await state();
          assert.ok(span(after.y) < span(before.y));
          return { before, after };
        },
      );
      await record(
        "Zoom out",
        "Native zoom-out expands real chart X/Y domains",
        async () => {
          const before = await state();
          await click("Zoom out");
          await waitSpan(span(before.x), "larger");
          const after = await state();
          assert.ok(span(after.y) > span(before.y));
          return { before, after };
        },
      );
      await click("Zoom in");
      await waitSpan(span(initial.x), "smaller");
      await record(
        "Reset axes",
        "Native Reset restores real calculated chart initial X/Y domains",
        async () => {
          await click("Reset axes");
          await page.waitForFunction(
            ({ id, x }) => {
              const r = document.getElementById(id)._fullLayout.xaxis.range;
              return r.every((v, i) => Math.abs(v - x[i]) < 1e-8);
            },
            { id, x: initial.x },
          );
          const after = await state();
          after.y.forEach((v, i) =>
            assert.ok(Math.abs(v - initial.y[i]) < 1e-8),
          );
          return { initial, after };
        },
      );
      await record(
        "Autoscale",
        "Native Autoscale restores both real chart autorange domains after zoom",
        async () => {
          await click("Zoom in");
          await waitSpan(span(initial.x), "smaller");
          await click("Autoscale");
          await page.waitForFunction((id) => {
            const c = document.getElementById(id)._fullLayout;
            return c.xaxis.autorange && c.yaxis.autorange;
          }, id);
          const after = await state();
          after.x.forEach((v, i) =>
            assert.ok(Math.abs(v - initial.x[i]) < 1e-8),
          );
          after.y.forEach((v, i) =>
            assert.ok(Math.abs(v - initial.y[i]) < 1e-8),
          );
          return { initial, after };
        },
      );
      for (const [title, mode] of [
        ["Pan", "pan"],
        ["Zoom", "zoom"],
        ...(selection
          ? [
              ["Box Select", "select"],
              ["Lasso Select", "lasso"],
            ]
          : []),
      ]) {
        await record(
          title,
          "Native control sets " +
            mode +
            " drag mode" +
            (selection && ["select", "lasso"].includes(mode)
              ? " and mouse enclosure selects every actual bar"
              : ""),
          async () => {
            await click(title);
            await page.waitForFunction(
              ({ id, mode }) =>
                document.getElementById(id)._fullLayout.dragmode === mode,
              { id, mode },
            );
            if (["select", "lasso"].includes(mode)) {
              const expected = await chart.evaluate((el) =>
                el.data.flatMap((trace, curveNumber) =>
                  trace.x.map((_, pointIndex) => [curveNumber, pointIndex]),
                ),
              );
              await chart.evaluate((el) => {
                window.__detrimentNativeSelection = null;
                el.on("plotly_selected", (event) => {
                  window.__detrimentNativeSelection = event?.points?.map(
                    (point) => [point.curveNumber, point.pointIndex],
                  );
                });
              });
              const b = await chart.evaluate((el) => {
                const r = el.getBoundingClientRect(),
                  x = el._fullLayout.xaxis,
                  y = el._fullLayout.yaxis;
                return {
                  left: r.left + x._offset + 1,
                  right: r.left + x._offset + x._length - 1,
                  top: r.top + y._offset + 1,
                  bottom: r.top + y._offset + y._length - 1,
                };
              });
              await page.mouse.move(b.left, b.top);
              await page.mouse.down();
              if (mode === "lasso") {
                await page.mouse.move(b.right, b.top, { steps: 8 });
                await page.mouse.move(b.right, b.bottom, { steps: 8 });
                await page.mouse.move(b.left, b.bottom, { steps: 8 });
                await page.mouse.move(b.left, b.top, { steps: 8 });
              } else await page.mouse.move(b.right, b.bottom, { steps: 12 });
              await page.mouse.up();
              await page.waitForFunction(
                () => window.__detrimentNativeSelection?.length > 0,
              );
              const selected = await page.evaluate(
                () => window.__detrimentNativeSelection,
              );
              assert.deepEqual(selected.sort(), expected.sort());
              return { state: await state(), selected };
            }
            return await state();
          },
        );
      }
      await record(
        "Download plot as a PNG",
        "Native camera downloads a valid PNG from real calculated Detriment chart",
        async () => {
          const pending = page.waitForEvent("download");
          await click("Download plot as a PNG");
          const download = await pending;
          assert.equal(await download.failure(), null);
          assert.match(download.suggestedFilename(), /\.png$/i);
          const bytes = await fs.readFile(await download.path());
          assert.deepEqual(
            [...bytes.subarray(0, 8)],
            [137, 80, 78, 71, 13, 10, 26, 10],
          );
          const width = bytes.readUInt32BE(16),
            height = bytes.readUInt32BE(20);
          assert.ok(width > 0 && height > 0);
          return {
            filename: download.suggestedFilename(),
            bytes: bytes.length,
            width,
            height,
          };
        },
      );
      assert.deepEqual(
        (await state()).data,
        initial.data,
        "Native controls preserve real calculated trace values",
      );
      assert.deepEqual(
        await page.evaluate(() => window.ICMDetriment.result()),
        engineering,
        "Native controls preserve authoritative engineering results",
      );
      console.log(
        "SCREENSHOT " +
          (await writeEvidence(
            evidenceRoot + "/" + browserName + "-" + kind + "-native.png",
            await page.screenshot({ fullPage: false }),
          )),
      );
    }
    guard.assertClean();
    assert.deepEqual(errors, []);
  } catch (error) {
    failed = true;
    console.error(browserName + ": " + error.stack);
  } finally {
    await browser.close();
  }
}
const evidence = await writeEvidence(
  evidenceRoot + "/plot-controls-results.json",
  JSON.stringify(
    {
      candidate,
      base,
      viewport: { width: 1440, height: 1000 },
      scope:
        "Deterministic native modebar fixtures in Data/Comparison/Rating hosts; real normal-input synthetic CSV imports/calculations in Detriment flooding/spill hosts; bounded engineering assertions recorded separately",
      results,
    },
    null,
    2,
  ),
);
console.log("EVIDENCE " + evidence);
console.log(
  "RESULTS " +
    JSON.stringify({
      passed: results.filter((x) => x.status === "PASS").length,
      failed: results.filter((x) => x.status === "FAIL").length,
    }),
);
if (failed) process.exitCode = 1;
