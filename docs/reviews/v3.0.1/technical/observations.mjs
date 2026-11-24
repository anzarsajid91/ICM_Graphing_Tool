import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { chromium, firefox } from '/workspace/hydra-v301-production/node_modules/playwright/index.mjs';
import { browserLaunchOptions, browserContextOptions } from '/workspace/hydra-v301-production/web/tests/browser-environment.mjs';
import { installPrivacyGuard } from '/workspace/hydra-v301-production/web/tests/privacy-network.mjs';

const root = new URL('.', import.meta.url);
const base = 'https://anzarsajid91.github.io/ICM_Graphing_Tool/';
const sha = 'ccc36427c12f003e5d9b1fee61632770b31952cc';
const name = process.env.ICM_BROWSER || 'chromium';
const cases = (process.argv[2] || 'network,direction,verification,detriment,calculation').split(',');
const browser = await { chromium, firefox }[name].launch(browserLaunchOptions());
const result = {};
const text = (name, body) => ({ name, mimeType: 'text/csv', buffer: Buffer.from(body) });
const save = () => writeFile(new URL('observations-' + name + '-' + cases.join('-') + '.json', root), JSON.stringify(result, null, 2) + '\n');

async function networkSetup(page, file) {
  await page.getByRole('link', { name: 'Open network schematic' }).click();
  await page.locator('#nsSvg').waitFor();
  const audit = page.getByRole('dialog', { name: 'Model Context Import Audit' });
  await page.locator('#nsLoadInput').setInputFiles(file);
  await audit.waitFor();
  const review = await audit.innerText();
  await audit.getByRole('checkbox').check();
  await audit.getByRole('button', { name: 'Apply network context' }).click();
  await audit.waitFor({ state: 'hidden' });
  return review;
}

const test = {
  async network(page, note) {
    const data = await readFile(new URL('network-expanded.csv', root));
    const monitorFile = await readFile(new URL('monitor-locations.csv', root));
    const audit = await networkSetup(page, text('A-TECH-network-expanded.csv', data));
    const snapshot = () => page.evaluate(() => ICMNetworkSchematic.snapshot());
    const original = await snapshot();
    await page.click('#nsOpenMonitorImport');
    await page.setInputFiles('#nsMonitorFile', text('A-TECH-monitor-locations.csv', monitorFile));
    await page.locator('#nsMonitorPreview tbody tr').nth(1).waitFor();
    const monitorAudit = await page.locator('#nsMonitorPreview').innerText();
    await page.click('#nsMonitorApply');
    const monitorApplied = await page.locator('#nsMonitorMessage').innerText();
    await page.click('#nsMonitorClose');
    const review = await snapshot();
    const observations = [];
    for (const [selector, label] of [['#nsDetailed','detailed'],['#nsOverview','engineering'],['#nsStrategic','strategic']]){
      await page.click(selector);
      await page.click('#nsFit');
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      const geometry = await snapshot();
      assert.deepEqual(geometry.nodes, review.nodes);
      assert.deepEqual(geometry.edges, review.edges);
      assert.deepEqual(geometry.monitorLocations, review.monitorLocations);
      const shown = await page.locator('#nsSvg').evaluate(svg => ({
        nodes: [...svg.querySelectorAll('[data-ns-node]')].map(el => el.dataset.nsNode),
        edgeCaptions: [...svg.querySelectorAll('[data-ns-edge]')].map(el => el.getAttribute('aria-label')),
        structureNames: [...svg.querySelectorAll('[data-ns-structure] title')].map(el => el.textContent),
        monitors: [...svg.querySelectorAll('[data-ns-monitor] title')].map(el => el.textContent),
        groups: [...svg.querySelectorAll('[data-ns-branch-group]')].map(el => el.getAttribute('aria-label')),
        arrows: svg.querySelectorAll('[data-ns-direction]').length
      }));
      observations.push({ label, camera: geometry.camera, nodeCount: shown.nodes.length, edgeCount: shown.edgeCaptions.length, ...shown });
      await page.locator('#nsCanvas').screenshot({ path: new URL(name+'-'+label+'.jpg', root).pathname, type: 'jpeg', quality: 67 });
    }
    const groups = page.locator('#nsSvg [data-ns-branch-group]');
    let branch;
    if (await groups.count()) {
      await groups.first().press('Enter');
      const input = page.getByLabel('Source asset in upstream branch');
      const sourceAssets = await input.locator('option').allTextContents();
      const explanation = await page.locator('#nsReach').innerText();
      const before = await page.locator('#nsSvg [data-ns-node]').count();
      await page.getByRole('button', { name: 'Expand branch', exact: true }).click();
      const after = await page.locator('#nsSvg [data-ns-node]').count();
      branch = { explanation, sourceAssets, before, after };
      assert(after > before);
    }
    note({ audit, monitorAudit, monitorApplied, sourceNodes: original.nodes.length, sourceLinks: original.edges.length,
      fixtureSha256: createHash('sha256').update(data).digest('hex'),
      networkSourceUnchanged: true, observations, branch});
  },

  async direction(page, note) {
    const fixture = '**** hw_node\nnode_id,node_type,x,y,ground_level,chamber_floor\n' +
       'A,manhole,0,0,12,10\nB,manhole,100,0,11,9\nC,outfall,200,0,10,8\n' +
       '**** hw_conduit\nus_node_id,ds_node_id,link_suffix,conduit_length,conduit_width,conduit_height,us_invert,ds_invert,flow_direction\n' +
       'A,B,1,100,600,600,10,9,Unknown\nB,C,1,100,600,600,9,8,Nominal\n';
    await writeFile(new URL('network-direction.csv', root), fixture);
    const audit = await networkSetup(page, text('A-TECH-network-direction.csv', fixture));
    const token = 'ICM conduit ["A","1"]';
    const link = page.locator('#nsSvg [data-ns-edge]').filter({ hasText: /A\.1|A to B/ }).first();
    const state = async () => link.evaluate(el => ({ caption: el.getAttribute('aria-label'), arrow: Boolean(el.querySelector('[data-ns-direction]')),
      dash: el.querySelector('[data-ns-wire]').getAttribute('stroke-dasharray') }));
    const detailed = await state();
    await page.click('#nsOverview');
    const engineering = await state();
    await page.click('#nsStrategic');
    const strategic = await state();
    await page.click('#nsLongSection');
    await page.selectOption('#nsRouteStart', 'A');
    await page.selectOption('#nsRouteEnd', 'C');
    await page.click('#nsOpenProfile');
    const routeMessage = await page.locator('#nsRouteMessage').innerText();
    const profileVisible = await page.locator('#nsProfile').isVisible();
    const sourceEdge = await page.evaluate(id => ICMNetworkSchematic.snapshot().edges.find(edge => edge.id === id), token);
    note({ audit, detailed, engineering, strategic, routeMessage, profileVisible, routeTable: profileVisible ? await page.locator('#nsProfileRows').innerText():null,
      sourceDirection: sourceEdge?.direction ?? null, sourceField: sourceEdge?.sourceAttributes.fields.find(field=>field.name==='flow_direction') });
  },

  async verification(page, note) {
    await page.locator('.pw-primary-nav [data-workspace="data"]').click();
    function series(name, values) {
      return text(name, ['Time,Flow (m3/s)', ...values.map((value, index) => '2026-04-11 00:0' + index + ':00,' + value), ''].join('\n'));
    }
    const files = [series('A-TECH-observed.csv', [.08,.09,.10,'','']), series('A-TECH-model.csv', ['','',.10,.11,.12])];
    for (const file of files) await writeFile(new URL(file.name, root), file.buffer);
    await page.setInputFiles('#fileInput', files);
    await page.waitForFunction(() => window.__ICM_WORKBENCH__.stateSummary().readyFiles === 2, null, { timeout: 90000 });
    await page.locator('#guidedImportReview summary').click();
    const review=page.locator('#guidedImportReview');
    await review.getByRole('combobox',{name:/Role for A-TECH-observed/}).selectOption('observed');
    await review.getByRole('combobox',{name:/Role for A-TECH-model/}).selectOption('model');
    await review.getByRole('button',{name:'Apply suggested setup'}).click();
    await page.locator('#timeBasisConfirmed').check();
    await page.locator('#applyMappingBtn').click();
    await page.waitForFunction(()=>state.mapping.observed&&state.mapping.models.length===1);
    await page.evaluate(()=>window.__ICM_WORKBENCH__.ensureTimeSeriesComparisonMetrics());
    await page.locator('.pw-primary-nav [data-workspace="graphs"]').click();
    await page.getByRole('tab',{name:'Overview',exact:true}).click();
    const table = page.locator('#verificationEvidenceTable');
    await table.locator('tbody tr').waitFor();
    const status = await page.locator('#verificationEvidenceStatus').innerText();
    const evidence = await page.evaluate(() => window.__ICM_WORKBENCH__.readVerificationEvidence());
    const header = await table.locator('th').allTextContents();
    const before = await table.locator('tbody tr td').allTextContents();
    await page.locator('#verificationReviewDecision').selectOption('Acceptable');
    await page.locator('#verificationReviewSave').click();
    const after = await table.locator('tbody tr td').allTextContents();
    const decisionStatus = await page.locator('#verificationReviewStatus').innerText();
    await page.screenshot({path: new URL(name+'-verification.jpg', root).pathname,type:'jpeg',quality:67});
    note({ expected: { individualObservedSeconds: 120, individualModelSeconds: 120, commonSeconds: 0, durationSeconds: 240, discretePairs: 1 },
      status, header, before, after, decisionStatus, coverage: evidence.scenarios[0].coverage, metrics: evidence.scenarios[0].metrics });
  },

  async detriment(page, note) {
    await page.getByRole('link',{name:'Open Data / time series'}).click();
    await page.locator('#dtReportUpload summary').click();
    const header='CSO ID,Spill count,Total duration of exceedances (h)\n';
    const files = [text('A-TECH-spill-baseline.csv', header+'COUNT,2,1\nDURATION,2,1\nCOMPLETE,2,1\n'),
      text('A-TECH-spill-proposed.csv', header+'COUNT,5,\nDURATION,,3.25\nCOMPLETE,5,3.25\n')];
    for (const file of files) await writeFile(new URL(file.name, root), file.buffer);
    await page.setInputFiles('#dtFileInput', files);
    await page.waitForFunction(()=>window.__ICM_WORKBENCH__.stateSummary().readyFiles===2,null,{timeout:90000});
    await page.locator('.pw-primary-nav [data-workspace="detriment"]').click();
    await page.getByRole('tab',{name:'Spill detriment',exact:true}).click();
    const field = key => page.locator('#dtForm [data-key="'+key+'"]');
    await field('a.id').selectOption({label:files[0].name});
    await field('b.id').selectOption({label:files[1].name});
    await field('scope').fill('Identical synthetic annual spill scope');
    await field('scope_confirmed').check();
    await field('period_start').fill('2025-01-01');
    await field('period_end').fill('2026-01-01');
    await field('template').fill('Synthetic matched 12/24 threshold and integral');
    await field('count_tolerance').fill('0');
    await field('duration_tolerance_hours').fill('0');
    await field('spill_combination_policy').selectOption('either_criterion');
    await page.click('#runDetrimentBtn');
    await page.waitForFunction(()=>Boolean(window.ICMDetriment.result()),null,{timeout:90000});
    const full = await page.evaluate(()=>window.ICMDetriment.result());
    await page.locator('#dtResults [data-key="filter"]').selectOption('all');
    const rendered = await page.locator('#dtTable').innerText();
    const event = page.waitForEvent('download');
    await page.click('#dtExportCsv');
    const download = await event;
    await writeFile(new URL(name+'-detriment-export.csv',root),await readFile(await download.path()));
    const rows = full.rows.map(row => ({ id: row.asset_id, countA:row.a, countB:row.b, countDelta:row.delta, countStatus:row.count_status,
      durationA:row.duration_a_hours,durationB:row.duration_b_hours,durationDelta:row.duration_delta_hours,durationStatus:row.duration_status,
      status:row.status,flags:row.flags }));
    note({ expected: { countDelta: 3, durationDeltaHours: 2.25 }, rows, summary: full.summary, rendered });
  },

  async calculation(page, note) {
    await page.locator('.pw-primary-nav [data-workspace="hydraulics"]').click();
    await page.getByRole('tab',{name:'System curve',exact:true}).click();
    const system = page.locator('#tab-pipe-system');
    const inputs={static_head_m:-2,flow_m3_s:.053,curve_max_m3_s:.16,diameter_m:.31,length_m:950,
      darcy_factor:.021,minor_k:2.1,entrance_k:.6,exit_k:1.05};
    for (const [field,value] of Object.entries(inputs)) await system.locator('[name="'+field+'"]').fill(String(value));
    await system.getByRole('button',{name:'Calculate',exact:true}).click();
    await system.getByRole('status').filter({hasText:/System curve calculated/}).waitFor({timeout:90000});
    const velocity=inputs.flow_m3_s/(Math.PI*inputs.diameter_m**2/4);
    const headVelocity=velocity**2/(2*9.80665);
    const friction=inputs.darcy_factor*inputs.length_m/inputs.diameter_m*headVelocity;
    const minor=(inputs.minor_k+inputs.entrance_k+inputs.exit_k)*headVelocity;
    const expected={velocity,headVelocity,friction,minor,total:inputs.static_head_m+friction+minor};
    await system.getByRole('button',{name:'Review calculation sheet',exact:true}).click();
    const sheetTitle='Pipe head loss and system curves calculation sheet';
    const worksheet=system.getByRole('dialog',{name:sheetTitle,exact:true});
    const calcText=await worksheet.innerText();
    await worksheet.getByRole('button',{name:'Close',exact:true}).click();
    await page.locator('.pw-primary-nav [data-workspace="reports"]').click();
    await page.getByRole('tab',{name:'Report generation',exact:true}).click();
    const reports=page.locator('#pwReportBuilderSurface');
    await reports.getByLabel('Report template',{exact:true}).selectOption('calculations');
    await reports.getByRole('group',{name:'Calculation sheets',exact:true}).getByRole('checkbox',{name:sheetTitle,exact:true}).check();
    await reports.getByRole('button',{name:'Preview assessment report',exact:true}).click();
    const dialog=reports.getByRole('dialog',{name:'Assessment report preview'});
    const frame=dialog.frameLocator('iframe');
    await frame.getByRole('heading',{name:sheetTitle,exact:true}).waitFor();
    const reportText=await frame.locator('.report-calculation-sheet').innerText();
    const [download]=await Promise.all([page.waitForEvent('download'),dialog.getByRole('button',{name:'Download preview',exact:true}).click()]);
    const html=await readFile(await download.path(),'utf8');
    await writeFile(new URL(name+'-calculation-report.html',root),html);
    await dialog.getByRole('button',{name:'Close',exact:true}).click();
    await page.locator('.pw-primary-nav [data-workspace="hydraulics"]').click();
    await page.getByRole('tab',{name:'System curve',exact:true}).click();
    await system.locator('[name="static_head_m"]').fill('-3');
    const localSheetDisabled=await system.getByRole('button',{name:'Review calculation sheet',exact:true}).isDisabled();
    await page.locator('.pw-primary-nav [data-workspace="reports"]').click();
    await reports.getByRole('button',{name:'Preview assessment report',exact:true}).click();
    const stale = reports.getByText('Refresh or deselect unavailable calculation sheets before generating the report.',{exact:false});
    await stale.waitFor();
    note({inputs,expected,calcText,reportText, stale:{localSheetDisabled, message:await stale.innerText()}, reportBytes:Buffer.byteLength(html)});
  }
};

try {
  for(const current of cases){
    const context = await browser.newContext({...browserContextOptions(),acceptDownloads:true,viewport:{width:1440,height:1000}});
    const guard = installPrivacyGuard(context,base,{buildToken:sha,canaries:['A-TECH-','Identical synthetic annual spill scope']});
    const page = await context.newPage();
    page.setDefaultTimeout(14000);
    const errors = [];
    page.on('pageerror',error => errors.push(error.message));
    try {
      await guard.navigate(page,base,{waitUntil:'domcontentloaded'});
      await page.waitForFunction(() => window.__ICM_PRECISION_WORKBENCH__?.navigate);
      const identity=await page.locator('meta[name="icm-build-sha"]').getAttribute('content');
      assert.equal(identity,sha);
      result[current]={identity, browser:browser.version(), errors};
      await test[current](page, observation=>Object.assign(result[current],observation));
      assert.deepEqual(errors,[]);
      guard.assertClean();
      result[current].guard='pass';
      console.log('COMPLETE '+current);
    } catch (error) {
      result[current] ??= {errors};
      result[current].failure=String(error);
      result[current].at=error.stack;
      try { result[current].visibleText=(await page.locator('body').innerText({timeout:2000})).slice(-8500); } catch {}
      try { guard.assertClean(); result[current].guard='pass'; } catch (guardError) { result[current].guard=String(guardError); }
      process.exitCode=1;
      console.error('FAILED '+current+' '+String(error));
    } finally {
      await save();
      await context.close();
    }
  }
} finally {
  await browser.close();
}
