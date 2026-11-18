import assert from "node:assert/strict";
import { chromium, firefox } from "playwright";
import {
  browserLaunchOptions,
  browserContextOptions,
} from "./browser-environment.mjs";
import { installPrivacyGuard } from "./privacy-network.mjs";
import { writeEvidence } from "./evidence-output.mjs";
const base = process.env.ICM_BASE_URL || "http://127.0.0.1:8008/",
  name = process.env.ICM_BROWSER || "chromium",
  outcomes = [];
const browser = await { chromium, firefox }[name].launch(
  browserLaunchOptions(),
);
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
  await page.setInputFiles("#fileInput", {
    name: "Model-storage-input.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(
      "timestamp,Depth (m),Flow (m3/s)\n" +
        [0, 2, 2, 0, 0, 0]
          .map(
            (depth, i) =>
              new Date(Date.UTC(2026, 0, 1, 0, i * 2))
                .toISOString()
                .slice(0, 19) +
              "," +
              depth +
              ",0.1",
          )
          .join("\n") +
        "\n",
    ),
  });
  await page.waitForFunction(
    () =>
      state.files.size === 1 &&
      [...state.files.values()].every((file) => file.status === "ready") &&
      !document.body.classList.contains("operation-busy"),
    null,
    { timeout: 120000 },
  );
  await page.evaluate(() =>
    window.__ICM_PRECISION_WORKBENCH__.navigate("spills", "storage", false),
  );
  const option = async (selector, quantity) =>
    page
      .locator(selector + " option")
      .evaluateAll(
        (options, quantity) =>
          options.find(
            (option) =>
              option.textContent.includes("Model-storage-input") &&
              option.textContent.toLowerCase().includes(quantity),
          )?.value,
        quantity,
      );
  await page.selectOption(
    "#storageLevelSelect",
    await option("#storageLevelSelect", "depth"),
  );
  await page.selectOption(
    "#storageFlowSelect",
    await option("#storageFlowSelect", "flow"),
  );
  await page.selectOption("#storageLevelUnit", "m");
  await page.selectOption("#storageFlowUnit", "m3/s");
  await page.selectOption("#storageThresholdUnit", "m");
  await page.locator("#storageThreshold").fill("1");
  await page.locator("#targetCount").fill("0");
  const run = async () => {
    await page.locator("#runStorageBtn").click();
    await page.waitForFunction(
      () =>
        state.storage &&
        state.storageSignature === storageInputSignature() &&
        !document.body.classList.contains("operation-busy"),
      null,
      { timeout: 120000 },
    );
    return page.evaluate(() => structuredClone(state.storage));
  };
  let result = await run();
  console.log("STORAGE_INPUT_DIAGNOSTIC " + JSON.stringify(result));
  assert.equal(result.threshold_canonical_m, 1);
  assert.equal(result.screening[0].target_count, 0);
  assert.ok(Math.abs(result.screening[0].required_storage_m3 - 24) < 1e-6);
  await page.selectOption("#storageThresholdUnit", "mm");
  await page.locator("#storageThreshold").fill("1000");
  result = await run();
  assert.equal(result.threshold_canonical_m, 1);
  assert.ok(Math.abs(result.screening[0].required_storage_m3 - 24) < 1e-6);
  outcomes.push({
    route: "spills/storage",
    control: "#storageThresholdUnit",
    status: "PASS",
    expected:
      "Convert 1000mm threshold to the same 1m criterion without reinterpreting source units",
    observed:
      "Both threshold choices give canonical1m and 24m³ bounded-episode storage (0.1m³/s × 240s)",
  });
  await page.locator("#targetCount").fill("1");
  result = await run();
  assert.equal(result.screening[0].target_count, 1);
  assert.equal(result.screening[0].required_storage_m3, 0);
  outcomes.push({
    route: "spills/storage",
    control: "#targetCount",
    status: "PASS",
    expected:
      "Change the allowed spill count and recompute actual bounded storage screening",
    observed:
      "One bounded episode: target0 needs24m³; target1 needs0m³; target values returned explicitly by the engine",
  });
  guard.assertClean();
  assert.deepEqual(errors, []);
} finally {
  console.log(
    "EVIDENCE " +
      (await writeEvidence(
        (process.env.ICM_EVIDENCE_DIR || "/tmp/hydra-storage-inputs") +
          "/outcomes.json",
        JSON.stringify(
          {
            browser: name,
            candidate: process.env.GITHUB_SHA,
            outcomes,
            scope:
              "Bounded ten-minute synthetic episode; no full-year eligibility claim",
          },
          null,
          2,
        ),
      )),
  );
  await browser.close();
}
