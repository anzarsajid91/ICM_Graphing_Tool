import assert from 'node:assert/strict';
import {readFile, mkdir, writeFile} from 'node:fs/promises';
import {chromium, firefox} from 'playwright';
import {browserContextOptions, browserLaunchOptions} from '../../../../web/tests/browser-environment.mjs';
import {installPrivacyGuard} from '../../../../web/tests/privacy-network.mjs';

const base = process.env.ICM_BASE_URL || 'https://anzarsajid91.github.io/ICM_Graphing_Tool/';
const expected = process.env.GITHUB_SHA || 'ccc36427c12f003e5d9b1fee61632770b31952cc';
const dir = process.env.ICM_EVIDENCE_DIR || '/tmp/hydra-v301-schematic-review';
const engine = process.env.ICM_BROWSER || 'chromium';
await mkdir(dir, {recursive: true});
const browser = await (engine === 'firefox' ? firefox : chromium).launch(browserLaunchOptions());

try {
  const context = await browser.newContext({
    ...browserContextOptions(), viewport: {width: 1440, height: 1000},
    reducedMotion: 'reduce', acceptDownloads: true,
  });
  const guard = installPrivacyGuard(context, base, {buildToken: expected});
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const build = await (await page.request.get(new URL('build.json', base).href)).json();
  assert.equal(build.commit, expected);
  assert.equal(build.asset_version, expected);
  const evidence = {commit: build.commit, version: build.app_version, engine, browser: browser.version()};
  const fixture = (file) => readFile(new URL(file, import.meta.url));
  const loadCsv = async (selector, name) => page.setInputFiles(selector, {
    name, mimeType: 'text/csv', buffer: await fixture(name),
  });

  await guard.navigate(page, base);
  await page.getByRole('link', {name: 'Open network schematic'}).click();
  await loadCsv('#nsLoadInput', 'branched-network.csv');
  await page.locator('#nsContextUnits').check();
  await page.click('#nsContextApply');
  await page.locator('#nsContextApply').waitFor({state: 'hidden'});
  await page.click('#nsOpenMonitorImport');
  await loadCsv('#nsMonitorFile', 'monitor-locations.csv');
  await page.click('#nsMonitorApply');
  assert.match(await page.locator('#nsMonitorMessage').textContent(), /2 applied · 0 unresolved/);
  await page.click('#nsMonitorClose');
  const source = await page.evaluate(() => {
    const {nodes, edges} = ICMNetworkSchematic.snapshot();
    return {nodes, edges};
  });
  assert.deepEqual([source.nodes.length, source.edges.length], [101, 101]);

  for (const [mode, selector, title] of [
    ['detailed', '#nsDetailed', 'Detailed network'],
    ['engineering', '#nsOverview', 'Engineering schematic'],
    ['strategic', '#nsStrategic', 'Strategic asset diagram'],
  ]) {
    await page.click(selector);
    await page.click('#nsFit');
    const output = await page.evaluate(mode => {
      const state = ICMNetworkSchematic.snapshot();
      const report = {
        points: document.querySelectorAll('#nsSvg [data-ns-node]').length,
        links: document.querySelectorAll('#nsSvg [data-ns-wire]').length,
        monitorMarkers: document.querySelectorAll('#nsSvg [data-ns-monitor]').length,
        visibleLabels: [...document.querySelectorAll('#nsSvg [data-ns-label]')]
          .filter(label => getComputedStyle(label).visibility !== 'hidden')
          .map(label => label.textContent),
      };
      if (mode === 'detailed') return report;
      const view = ICMNetworkDiagram.project(state, mode, state.diagrams?.[mode], true);
      const original = new Map(state.edges.map(edge => [edge.id, edge]));
      const members = view.edges.flatMap(edge => edge.sourceEdges).concat(view.groups.flatMap(group => group.sourceEdges));
      const pathTraceable = view.edges.every(edge => edge.from === edge.sourceNodes[0] &&
        edge.to === edge.sourceNodes.at(-1) && edge.sourceEdges.every((id, i) =>
          original.get(id)?.from === edge.sourceNodes[i] && original.get(id)?.to === edge.sourceNodes[i + 1]));
      const visible = new Set(view.nodes.map(node => node.id));
      function retainReachability(edges, start) {
        const downstream = new Map();
        for (const {from, to, direction} of edges) {
          if (direction === 'unknown') continue;
          if (!downstream.has(from)) downstream.set(from, []);
          downstream.get(from).push(to);
        }
        const seen = new Set();
        const stack = [start];
        while (stack.length) {
          const next = stack.pop();
          if (seen.has(next)) continue;
          seen.add(next);
          stack.push(...downstream.get(next) || []);
        }
        return [...seen].filter(id => visible.has(id)).sort().join(',');
      }
      return {
        ...report, sourcePathsTraceable: pathTraceable,
        everySourceLinkAccountsOnce: members.length === original.size && new Set(members).size === original.size &&
          members.every(id => original.has(id)),
        retainedReachabilityMatches: view.nodes.every(({id}) =>
          retainReachability(view.edges, id) === retainReachability(state.edges, id)),
        folded: view.groups.map(({id, to, sourceNodes, sourceEdges}) => ({
          id, to, sourceNodes: sourceNodes.length, sourceLinks: sourceEdges.length,
        })),
      };
    }, mode);
    assert.equal(output.monitorMarkers, 2);
    if (mode !== 'detailed') {
      assert(output.sourcePathsTraceable && output.everySourceLinkAccountsOnce && output.retainedReachabilityMatches);
    }
    evidence[mode] = output;
    await page.locator('#nsCanvas').screenshot({path: dir + '/' + mode + '.jpg', type: 'jpeg', quality: 85});
    await page.locator('.ns-export-menu > summary').click();
    await page.locator('#nsPublicationTitle').fill(title + ' · synthetic branched ICM network');
    const exportEvent = page.waitForEvent('download');
    await page.click('#nsSvgExport');
    const exportFile = await exportEvent;
    await exportFile.saveAs(dir + '/' + mode + '.svg');
    const svg = await readFile(dir + '/' + mode + '.svg', 'utf8');
    assert.match(svg, /<svg[\s>]/);
    assert(svg.includes(title));
    evidence[mode].exportBytes = Buffer.byteLength(svg);
  }

  const after = await page.evaluate(() => {
    const {nodes, edges} = ICMNetworkSchematic.snapshot();
    return {nodes, edges};
  });
  assert.deepEqual(after, source, 'Schematic presentation changes preserve original geometry and identifiers');
  assert.deepEqual(errors, []);
  guard.assertClean();
  await writeFile(dir + '/schematic-facts.json', JSON.stringify({...evidence, sourcePreserved: true}, null, 2) + '\n');
  console.log('DUAL_EXPERT_SCHEMATIC_PASS', engine, expected);
} finally {
  await browser.close();
}
