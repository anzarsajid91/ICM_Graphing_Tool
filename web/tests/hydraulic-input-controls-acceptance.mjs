// Input wiring plus independent Colebrook/Darcy residual checks, synthetic values only.
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
const friction = (re, relative) => {
  let low = 0.00001,
    high = 1;
  for (let i = 0; i < 120; i++) {
    const f = (low + high) / 2,
      residual =
        1 / Math.sqrt(f) +
        2 * Math.log10(relative / 3.7 + 2.51 / (re * Math.sqrt(f)));
    if (residual > 0) low = f;
    else high = f;
  }
  return (low + high) / 2;
};
const slopeFor = (velocity, diameter, roughness, viscosity) =>
  (friction((velocity * diameter) / viscosity, roughness / diameter) *
    velocity *
    velocity) /
  (2 * 9.80665 * diameter);
let low = 0.001,
  high = 20;
for (let i = 0; i < 100; i++) {
  const velocity = (low + high) / 2;
  if (slopeFor(velocity, 0.6, 0.001, 1.1e-6) < 0.0073) low = velocity;
  else high = velocity;
}
const expectedCapacity = (((low + high) / 2) * Math.PI * 0.6 * 0.6) / 4;
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
  await page.getByRole("link", { name: "Run hydraulic calculations" }).click();
  const form = page.locator("#pipeCapacityForm"),
    result = page.locator("#pipeCapacityResult");
  const fluid = form
    .locator("details")
    .filter({ has: page.getByText(/Advanced fluid properties/) });
  if (!(await fluid.evaluate((el) => el.open)))
    await fluid.locator(":scope > summary").click();
  for (const [field, value] of Object.entries({
    diameter: "600",
    gradient: "0.0073",
    roughness: "1",
    viscosity: "0.0000011",
  }))
    await form.locator('[name="' + field + '"]').fill(value);
  await page.evaluate(() => {
    window.hydraulicInputCalls = [];
    const original = engine.call.bind(engine);
    engine.call = async (name, args, ...rest) => {
      const values = await original(name, args, ...rest);
      if (name.startsWith("circular_pipe_"))
        window.hydraulicInputCalls.push({ name, args, values });
      return values;
    };
  });
  await page
    .getByRole("button", { name: "Calculate capacity", exact: true })
    .click();
  await page.waitForFunction(
    () => window.hydraulicInputCalls.length === 1,
    null,
    { timeout: 120000 },
  );
  let call = await page.evaluate(() => window.hydraulicInputCalls.at(-1));
  assert.deepEqual(call.args, {
    diameter_m: 0.6,
    gradient: 0.0073,
    roughness_m: 0.001,
    viscosity_m2_s: 1.1e-6,
  });
  assert.ok(Math.abs(call.values.discharge_m3_s - expectedCapacity) < 1e-9);
  assert.match(await result.innerText(), /552\.17 L\/s/);
  const record = (label, expected, observed) =>
    outcomes.push({
      route: "hydraulics/capacity",
      control: "label:" + label,
      status: "PASS",
      expected,
      observed,
    });
  for (const label of [
    "Diameter (mm) · circular (CIRC)",
    "Gradient (m/m)",
    "Colebrook–White roughness kₛ (mm)",
    "Kinematic viscosity (m²/s)",
  ])
    record(
      label,
      "Pass edited values in canonical metres/seconds to actual worker and match independent friction bisection",
      {
        args: call.args,
        capacityM3S: call.values.discharge_m3_s,
        independentCapacityM3S: expectedCapacity,
      },
    );
  await form.locator('[name="discharge"]').fill("250");
  await page
    .getByRole("button", { name: "Assess design flow", exact: true })
    .click();
  await page.waitForFunction(() => window.hydraulicInputCalls.length === 2);
  call = await page.evaluate(() => window.hydraulicInputCalls.at(-1));
  assert.equal(call.args.discharge_m3_s, 0.25);
  assert.equal(call.values.depths.length, 1);
  for (const depth of call.values.depths) {
    const theta = 2 * Math.acos(1 - (2 * depth.depth_m) / 0.6),
      area = ((0.6 * 0.6) / 8) * (theta - Math.sin(theta)),
      radius = area / ((0.6 * theta) / 2),
      velocity = 0.25 / area;
    assert.ok(
      Math.abs(slopeFor(velocity, 4 * radius, 0.001, 1.1e-6) - 0.0073) < 1e-9,
    );
  }
  record(
    "Design discharge (L/s)",
    "Convert 250 L/s to 0.25 m³/s and return a physical normal depth satisfying independent Darcy/Colebrook residual",
    { args: call.args, depths: call.values.depths },
  );
  const invert = form.locator("details").filter({
    has: page.getByText("Calculate gradient from ICM conduit fields", {
      exact: true,
    }),
  });
  if (!(await invert.evaluate((el) => el.open)))
    await invert.locator(":scope > summary").click();
  for (const [field, value] of Object.entries({
    usInvert: "100.2",
    dsInvert: "98.74",
    conduitLength: "200",
  }))
    await form.locator('[name="' + field + '"]').fill(value);
  await page.locator("#pipeUseInvertGradient").click();
  assert.ok(
    Math.abs(
      Number(await form.locator('[name="gradient"]').inputValue()) - 0.0073,
    ) < 1e-12,
  );
  assert.match(await result.innerText(), /Calculated gradient applied/);
  await form.locator('[name="dsInvert"]').fill("101");
  await page.locator("#pipeUseInvertGradient").click();
  assert.match(
    await result.innerText(),
    /outside the supported 0–1 m\/m range/i,
  );
  assert.ok(
    Math.abs(
      Number(await form.locator('[name="gradient"]').inputValue()) - 0.0073,
    ) < 1e-12,
  );
  await form.locator('[name="dsInvert"]').fill("98.74");
  await form.locator('[name="conduitLength"]').fill("0");
  await page.locator("#pipeUseInvertGradient").click();
  assert.match(await result.innerText(), /length|positive/i);
  assert.ok(
    Math.abs(
      Number(await form.locator('[name="gradient"]').inputValue()) - 0.0073,
    ) < 1e-12,
  );
  for (const label of [
    "US invert level (m)",
    "DS invert level (m)",
    "Length (m)",
  ])
    record(
      label,
      "Derive slope from edited invert elevations and length; reject adverse fall and zero length while preserving valid slope",
      "(100.2 − 98.74)/200 = 0.0073; adverse/zero-length validation shown; valid slope unchanged",
    );
  guard.assertClean();
  assert.deepEqual(errors, []);
} finally {
  console.log(
    "EVIDENCE " +
      (await writeEvidence(
        (process.env.ICM_EVIDENCE_DIR || "/tmp/hydra-hydraulic-inputs") +
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
