// Real synthetic native sources; verify presentation changes preserve hydraulic data.
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
    route: "data/time-series",
    control: "#" + control,
    status: "PASS",
    expected,
    observed,
  });
  console.log("APPEARANCE_INPUT_PASS " + name + " " + control);
};
try {
  const context = await browser.newContext({
      ...browserContextOptions(),
      viewport: { width: 1440, height: 1000 },
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
  await page.locator('.pw-primary-nav [data-workspace="data"]').click();
  const fdv = (name, offset) => ({
    name,
    mimeType: "text/plain",
    buffer: Buffer.from(
      "**IDENTIFIER: 1,SYNTHETIC\n**FIELD: 4,FLOW,DEPTH,LEVEL,VELOCITY\n**UNITS: 4,m3/s,m,m,m/s\n**CONSTANTS: 2,START,INTERVAL\n*CSTART\n2601010000 2\n*CEND\n" +
        Array.from({ length: 24 }, (_, i) =>
          [
            0.1 + offset,
            0.2 + i * 0.01 + offset,
            1.2 + i * 0.01 + offset,
            0.5 + offset,
          ]
            .map((value) => value.toFixed(3))
            .join(" "),
        ).join("\n") +
        "\n",
    ),
  });
  const rain = {
    name: "RG-appearance.R",
    mimeType: "text/plain",
    buffer: Buffer.from(
      "**FIELD: 1,RAINFALL\n**UNITS: 1,mm/h\n*CSTART\n2601010000 2601010048 2\n*CEND\n" +
        Array(24).fill("12").join(" ") +
        "\n",
    ),
  };
  await page.setInputFiles("#fileInput", [
    fdv("Observed-appearance.fdv", 0),
    fdv("Model-appearance.fdv", 0.02),
    rain,
  ]);
  await page.waitForFunction(
    () =>
      state.files.size === 3 &&
      [...state.files.values()].every((file) => file.status === "ready") &&
      !document.body.classList.contains("operation-busy"),
    null,
    { timeout: 120000 },
  );
  const option = async (selector, name) =>
    page
      .locator(selector + " option")
      .evaluateAll(
        (options, name) =>
          options.find((option) => option.textContent.includes(name))?.value,
        name,
      );
  await page.selectOption(
    "#observedSelect",
    await option("#observedSelect", "Observed-appearance"),
  );
  await page.selectOption(
    "#modelSelect",
    await option("#modelSelect", "Model-appearance"),
  );
  await page.selectOption(
    "#rainSelect",
    await option("#rainSelect", "RG-appearance"),
  );
  await page.locator("#applyMappingBtn").click();
  await page.waitForFunction(
    () =>
      window.__ICM_WORKBENCH__.uiV2.graphRefreshing === false &&
      window.__ICM_WORKBENCH__.lastPanelOrder?.includes("level"),
    null,
    { timeout: 90000 },
  );
  await page.evaluate(() =>
    window.__ICM_PRECISION_WORKBENCH__.navigate("spills", "assessment", false),
  );
  await page.locator("#obsThreshold").fill("0.25");
  await page.locator("#modelThreshold").fill("0.27");
  await page.locator("#modelThreshold").press("Tab");
  await page.evaluate(() =>
    window.__ICM_PRECISION_WORKBENCH__.navigate("data", "time-series", false),
  );
  const inspector = page.locator("#pwInspectorToggle");
  if ((await inspector.getAttribute("aria-expanded")) !== "true")
    await inspector.click();
  const appearance = page.locator("details.appearance-panel");
  if (!(await appearance.evaluate((el) => el.open)))
    await appearance.locator(":scope > summary").click();
  await page.waitForFunction(
    () => window.__ICM_WORKBENCH__.uiV2.graphRefreshing === false,
    null,
    { timeout: 90000 },
  );
  const values = () =>
    page
      .locator("#timeChart")
      .evaluate((chart) =>
        JSON.stringify(
          chart.data
            .filter((trace) => trace.x?.some((value) => value !== null))
            .map((trace) => ({ name: trace.name, x: trace.x, y: trace.y })),
        ),
      );
  const baseline = await values();
  for (const [control, quantity, color] of [
    ["observedFlowColour", "flow", "#412aff"],
    ["observedDepthColour", "depth", "#124578"],
    ["observedVelocityColour", "velocity", "#f00dc0"],
    ["obsColor", "level", "#679abc"],
    ["rainColor", "rainfall", "#219b64"],
  ]) {
    await page.locator("#" + control).fill(color);
    await page.locator("#" + control).press("Tab");
    await page.waitForFunction(
      ({ quantity, color }) =>
        document
          .getElementById("timeChart")
          .data.some(
            (trace) =>
              (quantity === "rainfall"
                ? trace.name === "Rainfall"
                : new RegExp("^Observed " + quantity + "\\b", "i").test(
                    trace.name,
                  )) && trace.line?.color === color,
          ),
      { quantity, color },
      { timeout: 90000 },
    );
    assert.equal(await values(), baseline);
    record(
      control,
      "Apply selected native color to the correct trace while preserving coordinates",
      { quantity, color },
    );
  }
  for (const [control, label] of [
    ["threshold1Label", "Synthetic observed threshold"],
    ["threshold2Label", "Synthetic model threshold"],
  ]) {
    await page.locator("#" + control).fill(label);
    await page.locator("#" + control).press("Tab");
    await page.waitForFunction(
      (label) =>
        document
          .getElementById("timeChart")
          .data.some((trace) => trace.name === label) &&
        [...document.querySelectorAll("#timeChart .legendtext")].some(
          (text) => text.textContent === label,
        ),
      label,
      { timeout: 90000 },
    );
    assert.equal(await values(), baseline);
    record(
      control,
      "Render the edited threshold legend entry without altering source trace data",
      label,
    );
  }
  for (const [control, color] of [
    ["threshold1Color", "#11aabb"],
    ["threshold2Color", "#cc5522"],
  ]) {
    await page.locator("#" + control).fill(color);
    await page.locator("#" + control).press("Tab");
    await page.waitForFunction(
      (color) =>
        document
          .getElementById("timeChart")
          .layout.shapes.some(
            (shape) => shape.type === "line" && shape.line?.color === color,
          ),
      color,
      { timeout: 90000 },
    );
    assert.equal(await values(), baseline);
    record(
      control,
      "Render threshold line color while preserving hydraulic coordinates",
      color,
    );
  }
  const beforeFactor = await page.locator("#timeChart").evaluate((chart) => ({
    hydraulic: JSON.stringify(
      chart.data
        .filter((trace) => trace.name !== "Rainfall")
        .map((trace) => ({ name: trace.name, x: trace.x, y: trace.y })),
    ),
    rain: [...chart.data.find((trace) => trace.name === "Rainfall").y],
  }));
  await page.locator("#rainFactor").fill("2");
  await page.locator("#rainFactor").press("Tab");
  await page.waitForFunction(
    () =>
      document
        .getElementById("timeChart")
        .data.find((trace) => trace.name === "Rainfall")
        .y.every((value) => value === 24),
    null,
    { timeout: 90000 },
  );
  const afterFactor = await page.locator("#timeChart").evaluate((chart) => ({
    hydraulic: JSON.stringify(
      chart.data
        .filter((trace) => trace.name !== "Rainfall")
        .map((trace) => ({ name: trace.name, x: trace.x, y: trace.y })),
    ),
    rain: [...chart.data.find((trace) => trace.name === "Rainfall").y],
  }));
  assert.deepEqual(
    afterFactor.rain,
    beforeFactor.rain.map((value) => value * 2),
  );
  assert.equal(afterFactor.hydraulic, beforeFactor.hydraulic);
  await page.locator("#refreshCumulativeRainBtn").click();
  await page.waitForFunction(
    () =>
      window.__ICM_WORKBENCH__.lastCumulativeRainfall?.totals?.some(
        (row) =>
          row.file === "RG-appearance.R" &&
          Math.abs(row.total_mm - 19.2) < 1e-9,
      ),
    null,
    { timeout: 90000 },
  );
  record(
    "rainFactor",
    "Apply explicit factor2 to rainfall only and independently match native-interval cumulative depth",
    "12→24 mm/h; 24×24×2/60 = 19.2mm; hydraulic trace coordinates unchanged",
  );
  await page.locator("#rainAxisMax").fill("50");
  await page.locator("#rainAxisMax").press("Tab");
  await page.waitForFunction(
    () =>
      document.getElementById("timeChart").layout.yaxis.range[0] === 50 &&
      document.getElementById("timeChart").layout.yaxis.range[1] === 0,
    null,
    { timeout: 90000 },
  );
  record(
    "rainAxisMax",
    "Set the inverted rainfall display-axis limit without rescaling source data",
    [50, 0],
  );
  await page.locator("#rainCriteriaMode").selectOption("manual");
  for (const [id, value] of [
    ["rainMinIntensity", "1"],
    ["rainIntensityDuration", "2"],
    ["rainEventDuration", "2"],
    ["rainTotalDepth", "1"],
    ["rainDryGap", "4"],
  ])
    await page.locator("#" + id).fill(value);
  await page.locator("#runRainEventsBtn").click();
  await page.waitForFunction(
    () =>
      rainEventsFresh() &&
      state.rainEvents.length > 0 &&
      !document.body.classList.contains("operation-busy"),
    null,
    { timeout: 120000 },
  );
  await page.locator("#showEventOverlay").uncheck();
  await page.locator("#showEventOverlay").press("Tab");
  await page.waitForFunction(
    () =>
      !document
        .getElementById("timeChart")
        .layout.shapes.some((shape) => shape.type === "rect"),
    null,
    { timeout: 90000 },
  );
  await page.locator("#rainEventColor").fill("#ee22aa");
  await page.locator("#rainEventColor").press("Tab");
  await page.locator("#showEventOverlay").check();
  await page.waitForFunction(
    () =>
      document
        .getElementById("timeChart")
        .layout.shapes.some(
          (shape) => shape.type === "rect" && shape.fillcolor === "#ee22aa",
        ),
    null,
    { timeout: 90000 },
  );
  const events = await page.evaluate(() =>
    JSON.parse(JSON.stringify(state.rainEvents)),
  );
  const rectangles = await page.locator("#timeChart").evaluate((chart) =>
    chart.layout.shapes
      .filter((shape) => shape.type === "rect")
      .map((shape) => ({
        start: shape.x0,
        end: shape.x1,
        color: shape.fillcolor,
      })),
  );
  assert.equal(rectangles.length, events.length);
  assert.ok(rectangles.every((rect) => rect.color === "#ee22aa"));
  record(
    "rainEventColor",
    "Color the actual qualified event overlays using the edited color",
    rectangles,
  );
  await page.locator("#showEventOverlay").uncheck();
  await page.waitForFunction(
    () =>
      !document
        .getElementById("timeChart")
        .layout.shapes.some((shape) => shape.type === "rect"),
    null,
    { timeout: 90000 },
  );
  assert.deepEqual(
    await page.evaluate(() => JSON.parse(JSON.stringify(state.rainEvents))),
    events,
  );
  record(
    "showEventOverlay",
    "Show/hide actual event overlays while preserving calculated event evidence",
    "Colored rectangles shown then absent; calculated event objects unchanged",
  );
  guard.assertClean();
  assert.deepEqual(errors, []);
} finally {
  console.log(
    "EVIDENCE " +
      (await writeEvidence(
        (process.env.ICM_EVIDENCE_DIR || "/tmp/hydra-appearance-inputs") +
          "/outcomes.json",
        JSON.stringify(
          {
            browser: name,
            candidate: process.env.GITHUB_SHA,
            outcomes,
            scope:
              "Native browser color/input changes; OS color dialog itself is outside headless automation",
          },
          null,
          2,
        ),
      )),
  );
  await browser.close();
}
