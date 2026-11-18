import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { chromium, firefox } from "playwright";
import {
  browserLaunchOptions,
  browserContextOptions,
} from "./browser-environment.mjs";
import { installPrivacyGuard, resourcePaths } from "./privacy-network.mjs";
import { writeEvidence } from "./evidence-output.mjs";

const base = process.env.ICM_BASE_URL || "http://127.0.0.1:8000/";
const browserName = process.env.ICM_BROWSER || "chromium";
const browser = await (browserName === "firefox" ? firefox : chromium).launch(
  browserLaunchOptions(),
);
const outcomes = [];
const repository = "https://github.com/anzarsajid91/ICM_Graphing_Tool";
try {
  const context = await browser.newContext({
    ...browserContextOptions(),
    viewport: { width: 1440, height: 1000 },
  });
  // The builder copies this fixed root licence file outside the web source tree.
  const paths = resourcePaths();
  paths.add("LICENSE.txt");
  const privacy = installPrivacyGuard(context, base, { paths });
  const page = await context.newPage();
  await privacy.navigate(page, base);
  await page.waitForFunction(() => window.__ICM_PRECISION_WORKBENCH__?.routes);
  const routes = await page.evaluate(() =>
    Object.entries(window.__ICM_PRECISION_WORKBENCH__.routes).flatMap(
      ([workspace, spec]) =>
        Object.keys(spec.pages).map((view) => [workspace, view]),
    ),
  );
  await page.locator(".pw-about-nav button").click();
  const shortcuts = await page
    .locator("[data-about-workspace]")
    .evaluateAll((buttons) =>
      buttons.map((button) => ({
        workspace: button.dataset.aboutWorkspace,
        page: button.dataset.aboutPage,
        label: button.textContent.trim(),
      })),
    );
  for (const shortcut of shortcuts) {
    await page.evaluate(() =>
      window.__ICM_PRECISION_WORKBENCH__.navigate("about", "overview", false),
    );
    await page
      .locator('[data-about-workspace="' + shortcut.workspace + '"]')
      .click();
    await page.waitForFunction(({ workspace, page }) => {
      const route = window.__ICM_PRECISION_WORKBENCH__.route();
      return route.workspace === workspace && route.page === page;
    }, shortcut);
    assert.ok(await page.locator(".pw-route-visible").first().isVisible());
    outcomes.push({
      route: "about/overview",
      control: "button:" + shortcut.label,
      status: "PASS",
      expected: "Open canonical workspace page and expose its surface",
      observed: shortcut.workspace + "/" + shortcut.page,
    });
  }
  for (const [workspace, view] of routes) {
    await page.evaluate(
      ([w, p]) => window.__ICM_PRECISION_WORKBENCH__.navigate(w, p, false),
      [workspace, view],
    );
    const route = workspace + "/" + view;
    const license = page
      .locator(".hb-app-footer a")
      .filter({ hasText: "GNU AGPLv3" });
    const url = await license.evaluate((link) => link.href);
    assert.equal(url, new URL("LICENSE.txt", base).href);
    const reached = page.waitForURL(url);
    await license.click();
    await reached;
    assert.match(
      await page.locator("body").innerText(),
      /GNU AFFERO GENERAL PUBLIC LICENSE[\s\S]*END OF TERMS AND CONDITIONS/,
    );
    outcomes.push({
      route,
      control: "a:GNU AGPLv3",
      status: "PASS",
      expected: "Open complete same-origin AGPL text",
      observed: url,
    });
    await page.goBack({ waitUntil: "domcontentloaded" });
    await page.waitForFunction(
      () => window.__ICM_PRECISION_WORKBENCH__?.navigate,
    );
  }
  privacy.assertClean();
  await context.close();

  // These explicit link activations are intercepted locally. They verify the
  // browser's destination and referrer contract, not GitHub's page availability.
  const links = await browser.newContext({
    ...browserContextOptions(),
    viewport: { width: 1440, height: 1000 },
  });
  const external = [];
  await links.route("https://github.com/**", async (route) => {
    const request = route.request();
    const headers = await request.allHeaders();
    assert.equal(request.method(), "GET");
    assert.equal(request.postData(), null);
    assert.equal(headers.referer, undefined);
    assert.ok(
      request.url() === repository ||
        /^https:\/\/github\.com\/anzarsajid91\/ICM_Graphing_Tool\/tree\/[a-f0-9]{40}$/.test(
          request.url(),
        ),
    );
    external.push(request.url());
    await route.fulfill({
      status: 200,
      contentType: "text/html",
      body: "<!doctype html><title>Intercepted fixed repository destination</title><p>Link navigation test fixture</p>",
    });
  });
  const sourcePage = await links.newPage();
  await sourcePage.goto(base);
  await sourcePage.waitForFunction(
    () => window.__ICM_PRECISION_WORKBENCH__?.navigate,
  );
  const sha = await sourcePage
    .locator('meta[name="icm-build-sha"]')
    .getAttribute("content");
  assert.match(sha, /^[a-f0-9]{40}$/);
  async function checkLink(locator, expected, route, control) {
    assert.equal(await locator.getAttribute("href"), expected);
    assert.equal(await locator.getAttribute("referrerpolicy"), "no-referrer");
    assert.match(await locator.getAttribute("rel"), /noopener/);
    assert.match(await locator.getAttribute("rel"), /noreferrer/);
    const popupPromise = sourcePage.waitForEvent("popup");
    await locator.click();
    const popup = await popupPromise;
    await popup.waitForLoadState("domcontentloaded");
    assert.equal(popup.url(), expected);
    assert.equal(await popup.evaluate(() => window.opener), null);
    assert.equal(external.at(-1), expected);
    outcomes.push({
      route,
      control,
      status: "PASS",
      expected: "Open fixed repository URL in isolated tab without referrer",
      observed: expected,
      scope:
        "Destination request fulfilled by local test fixture; remote page availability unverified",
    });
    await popup.close();
  }
  for (const [workspace, view] of routes) {
    await sourcePage.evaluate(
      ([w, p]) => window.__ICM_PRECISION_WORKBENCH__.navigate(w, p, false),
      [workspace, view],
    );
    await checkLink(
      sourcePage.locator("#hbBuildSource"),
      repository + "/tree/" + sha,
      workspace + "/" + view,
      "#hbBuildSource",
    );
  }
  await sourcePage.evaluate(() =>
    window.__ICM_PRECISION_WORKBENCH__.navigate("about", "overview", false),
  );
  await checkLink(
    sourcePage
      .locator("#tab-about")
      .getByRole("link", { name: "Official repository", exact: true }),
    repository,
    "about/overview",
    "a:Official repository",
  );
  await checkLink(
    sourcePage
      .locator("#tab-about")
      .getByRole("link", { name: "Source for this build", exact: true }),
    repository + "/tree/" + sha,
    "about/overview",
    "a:Source for this build",
  );
  await links.close();
  const directory = process.env.ICM_EVIDENCE_DIR || "/tmp/hydra-link-controls";
  await fs.mkdir(directory, { recursive: true });
  await writeEvidence(
    path.join(directory, "outcomes.json"),
    JSON.stringify({ browser: browserName, build: sha, outcomes }, null, 2),
  );
  console.log(
    "PASS " +
      browserName +
      ": " +
      outcomes.length +
      " About, licence and fixed source-link outcomes.",
  );
} finally {
  await browser.close();
}
