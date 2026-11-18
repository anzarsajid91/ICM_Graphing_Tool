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

const base = process.env.ICM_BASE_URL || "http://127.0.0.1:8007/";
const name = process.env.ICM_BROWSER || "chromium";
const browser = await (name === "firefox" ? firefox : chromium).launch(
  browserLaunchOptions(),
);
const outcomes = [];
try {
  const context = await browser.newContext({
    ...browserContextOptions(),
    viewport: { width: 1440, height: 1000 },
  });
  const privacy = installPrivacyGuard(context, base),
    page = await context.newPage(),
    errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await privacy.navigate(page, base);
  await page.waitForFunction(
    () => window.__ICM_PRECISION_WORKBENCH__?.navigate,
  );
  assert.equal(
    await page.locator('meta[name="icm-build-sha"]').getAttribute("content"),
    process.env.GITHUB_SHA,
  );
  await page.locator('.pw-primary-nav [data-workspace="data"]').click();
  await page.setInputFiles("#fileInput", {
    name: "Queue-ready.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(
      "timestamp,Flow (m3/s)\n2026-01-01T00:00:00,0.1\n2026-01-01T00:01:00,0.2\n",
    ),
  });
  await page.waitForFunction(
    () =>
      [...state.files.values()].some(
        (file) =>
          file.file.name === "Queue-ready.csv" && file.status === "ready",
      ) &&
      engine.ready &&
      !engine.active &&
      !document.body.classList.contains("operation-busy"),
    null,
    { timeout: 90000 },
  );
  const source = await page.evaluate(() =>
    [...state.files.values()].map((file) => ({
      id: file.id,
      hash: file.hash,
      status: file.status,
    })),
  );
  const routes = [
    "home/overview",
    "data/time-series",
    "spills/assessment",
    "network/schematic",
    "survey/fdv-check",
    "graphs/comparison",
    "graphs/rating",
    "hydraulics/capacity",
    "reports/report-generation",
    "reports/workspace",
  ];
  for (const route of routes) {
    await page.evaluate(
      (route) =>
        window.__ICM_PRECISION_WORKBENCH__.navigate(...route.split("/"), false),
      route,
    );
    await page.evaluate(() => {
      const original = engine._message.bind(engine);
      let held;
      window.queueAcceptanceOriginal = original;
      window.queueAcceptanceWorker = engine.worker;
      engine._message = (message) => {
        if (
          message.type === "result" &&
          !held &&
          engine.active?.message?.type === "call"
        ) {
          held = message;
          return;
        }
        return original(message);
      };
      const args = {
        diameter_m: 0.45,
        gradient: 0.005,
        roughness_m: 0.0015,
        viscosity_m2_s: 1e-6,
      };
      window.queueAcceptanceOutcomes = Array.from({ length: 4 }, () =>
        engine.call("circular_pipe_capacity", args).then(
          (value) => ({ ok: true, value }),
          (error) => ({ ok: false, error: error.message }),
        ),
      );
    });
    const overlay = page.locator("#globalOperation");
    await overlay.waitFor({ state: "visible" });
    const detail = overlay.locator("details.operation-tasks"),
      summary = detail.locator(":scope > summary");
    if (await detail.evaluate((el) => el.open)) await summary.click();
    await summary.press("Enter");
    assert.equal(await detail.evaluate((el) => el.open), true);
    assert.equal(await page.locator("[data-prioritise-job]").count(), 3);
    await summary.press("Space");
    assert.equal(await detail.evaluate((el) => el.open), false);
    await summary.click();
    outcomes.push({
      route,
      control: "summary:Process queue",
      status: "PASS",
      expected: "Reveal queued jobs and toggle queue disclosure by keyboard",
      observed:
        "Three waiting jobs rendered; Enter opens and Space closes details",
    });
    const queued = await page
      .locator("[data-prioritise-job]")
      .evaluateAll((buttons) =>
        buttons.map((button) => button.dataset.prioritiseJob),
      );
    await page.locator('[data-prioritise-job="' + queued[2] + '"]').click();
    assert.equal(
      await page
        .locator("[data-prioritise-job]")
        .first()
        .getAttribute("data-prioritise-job"),
      queued[2],
    );
    outcomes.push({
      route,
      control: "button:Run next",
      status: "PASS",
      expected: "Move selected waiting calculation to the front of the queue",
      observed: "Third waiting job became first without replacing running job",
    });
    await page.locator('[data-cancel-job="' + queued[0] + '"]').click();
    assert.equal(
      await page.locator('[data-cancel-job="' + queued[0] + '"]').count(),
      0,
    );
    const cancelled = await page.evaluate(async () => {
      const outcomes = await Promise.race([
        window.queueAcceptanceOutcomes[1],
        new Promise((resolve) => setTimeout(() => resolve(null), 1000)),
      ]);
      return outcomes;
    });
    assert.deepEqual(cancelled, {
      ok: false,
      error: "Queued analysis cancelled.",
    });
    outcomes.push({
      route,
      control: "button:Cancel",
      status: "PASS",
      expected: "Cancel selected waiting job only",
      observed:
        "Waiting row removed and exactly that promise rejected with queued-cancellation reason",
    });
    await page.evaluate(() => {
      engine._message = window.queueAcceptanceOriginal;
    });
    await page.locator("#globalOperationCancel").click();
    const results = await page.evaluate(() =>
      Promise.all(window.queueAcceptanceOutcomes),
    );
    assert.equal(results.filter((result) => result.ok).length, 0);
    assert.equal(
      results.filter((result) => /worker is restarting/.test(result.error))
        .length,
      3,
    );
    await page.waitForFunction(
      () =>
        engine.ready &&
        window.__ICM_WORKBENCH__.status === "ready" &&
        !document.body.classList.contains("operation-busy"),
      null,
      { timeout: 90000 },
    );
    assert.equal(
      await page.evaluate(() => engine.worker !== window.queueAcceptanceWorker),
      true,
    );
    assert.deepEqual(
      await page.evaluate(() =>
        [...state.files.values()].map((file) => ({
          id: file.id,
          hash: file.hash,
          status: file.status,
        })),
      ),
      source,
    );
    const checked = await page.evaluate(() =>
      engine.call("circular_pipe_capacity", {
        diameter_m: 0.45,
        gradient: 0.005,
        roughness_m: 0.0015,
        viscosity_m2_s: 1e-6,
      }),
    );
    assert.ok(Math.abs(checked.discharge_m3_s * 1000 - 202.65) < 0.01);
    await page.waitForFunction(
      () =>
        !engine.active && !document.body.classList.contains("operation-busy"),
    );
    outcomes.push({
      route,
      control: "#globalOperationCancel",
      status: "PASS",
      expected:
        "Restart worker, reject active/pending jobs, preserve ready sources and support a new calculation",
      observed:
        "New worker identity, three restart rejections, unchanged source IDs/hashes/status, new 202.65 L/s result",
      scope:
        "First real worker result held at test message boundary to make queue actions deterministic; native OS/process scheduling not simulated",
    });
    console.log("QUEUE_CASE_PASS " + name + " " + route);
  }
  assert.deepEqual(errors, []);
  privacy.assertClean();
  const output = process.env.ICM_EVIDENCE_DIR || "/tmp/hydra-queue-controls";
  await fs.mkdir(output, { recursive: true });
  await writeEvidence(
    path.join(output, "outcomes.json"),
    JSON.stringify({ browser: name, outcomes }, null, 2),
  );
  console.log(
    "PASS " + name + ": " + outcomes.length + " process queue outcomes.",
  );
} finally {
  await browser.close();
}
