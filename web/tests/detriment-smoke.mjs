import {browserLaunchOptions,browserContextOptions} from './browser-environment.mjs';
import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
const browser=await chromium.launch(browserLaunchOptions());
const page=await browser.newPage({...browserContextOptions(),viewport:{width:1440,height:1000},acceptDownloads:true});
const evidence=process.env.ICM_EVIDENCE_DIR||'/tmp/icm-detriment-evidence';
await fs.mkdir(evidence,{recursive:true});
const errors=[];page.on('pageerror',e=>errors.push(String(e)));
const base=process.env.ICM_BASE_URL||'http://127.0.0.1:8000/';
const field=k=>page.locator('#dtForm [data-key="'+k+'"]');
async function route(kind){await page.evaluate(k=>window.__ICM_PRECISION_WORKBENCH__.navigate('detriment',k,true),kind);}
async function selectReport(slot,name){const id=await page.locator('#dtForm [data-key="'+slot+'.id"] option').evaluateAll((opts,n)=>opts.find(x=>x.textContent===n)?.value,name);assert.ok(id,'Source '+name);await field(slot+'.id').selectOption(id);}
async function run(){await page.click('#runDetrimentBtn');await page.waitForFunction(()=>Boolean(window.ICMDetriment.result()),null,{timeout:60000});return page.evaluate(()=>window.ICMDetriment.result());}
async function scope(){await field('scope').fill('30-year matched storm set');await field('scope_confirmed').check();}
async function exportText(id){const downloadPromise=page.waitForEvent('download');await page.click(id);const download=await downloadPromise;return fs.readFile(await download.path(),'utf8');}
try{
  await page.goto(base,{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>Boolean(window.ICMDetriment&&window.__ICM_PRECISION_WORKBENCH__),null,{timeout:30000});
  await page.locator('#dtReportUpload summary').click();
  await page.setInputFiles('#dtFileInput',(await fs.readdir('tests/fixtures/detriment')).filter(n=>n.endsWith('.csv')).map(n=>path.resolve('tests/fixtures/detriment',n)));
  await page.waitForFunction(()=>[...state.files.values()].filter(x=>x.status==='ready'&&x.parsed?.metadata?.source_kind==='detriment_report').length===9,null,{timeout:120000});
  assert.equal(await page.evaluate(()=>allSeries().length),0,'Report-only pool has no hydraulic series');
  // Missing scope must be actionable in every assessment, including on a narrow screen.
  await page.evaluate(()=>{window.__detrimentCalls=0;const call=engine.call.bind(engine);engine.call=(name,...args)=>{if(name==='detriment_result')window.__detrimentCalls++;return call(name,...args);};});
  for(const [assessment,width] of [['flooding',1440],['level',1440],['spill',1440],['flooding',390]]){
    await page.setViewportSize({width,height:1000});await route(assessment);
    const prefix=assessment==='flooding'?'flood':assessment;
    await selectReport('a',prefix+'-a.csv');await selectReport('b',prefix+'-b.csv');
    await field('scope').fill('');await field('scope_confirmed').check();
    for(const value of ['', '   ']){
      await field('scope').fill(value);await page.click('#runDetrimentBtn');
      assert.match(await page.locator('#dtStatus').innerText(),/Enter a common assessment scope/);
      assert.doesNotMatch(await page.locator('#dtStatus').innerText(),/Traceback|scopes must match/);
      assert.equal(await field('scope').getAttribute('aria-invalid'),'true');
      assert.ok(await field('scope').evaluate(el=>{const r=el.getBoundingClientRect();return document.activeElement===el&&r.top>=0&&r.bottom<=window.innerHeight;}),'Required scope is focused and brought into view');
      assert.match(await page.locator('#dtError-scope').innerText(),/Enter a common assessment scope/);
      assert.ok(await page.locator('#dtError-scope').evaluate(el=>{const r=el.getBoundingClientRect();return r.top>=0&&r.bottom<=window.innerHeight;}),'Explanation remains visible beside the required field');
      assert.equal(await page.evaluate(()=>window.ICMDetriment.result()),null);
      assert.equal(await page.locator('#dtExportCsv').isDisabled(),true);
      assert.equal(await page.locator('#runDetrimentBtn').isDisabled(),false);
    }
    if(assessment==='flooding'&&width===1440)await page.screenshot({path:path.join(evidence,'detriment-missing-scope.png'),fullPage:false});
    await field('scope').fill('30-year matched storm set');
    assert.equal(await field('scope').getAttribute('aria-invalid'),null);
    assert.equal(await page.locator('#dtError-scope').count(),0);
    await field('scope_confirmed').uncheck();await page.click('#runDetrimentBtn');
    assert.match(await page.locator('#dtStatus').innerText(),/Confirm matching assessment scope/);
    assert.ok(await field('scope_confirmed').evaluate(el=>document.activeElement===el));
    assert.ok(await page.locator('#dtError-scope_confirmed').evaluate(el=>{const r=el.getBoundingClientRect();return r.top>=0&&r.bottom<=window.innerHeight;}),'Confirmation error remains visible');
  }
  assert.equal(await page.evaluate(()=>window.__detrimentCalls),0,'Incomplete setup does not call Python');
  await page.setViewportSize({width:1440,height:1000});
  await route('flooding');await selectReport('a','flood-a.csv');await selectReport('b','flood-b.csv');await scope();
  // Actual Pyodide ValueErrors retain their useful message without the traceback.
  await field('threshold').fill('-1');await page.click('#runDetrimentBtn');
  await page.waitForFunction(()=>document.getElementById('dtStatus').textContent.includes('non-negative'),null,{timeout:60000});
  assert.doesNotMatch(await page.locator('#dtStatus').innerText(),/Traceback|ValueError:|\/workbench/);
  assert.equal(await page.evaluate(()=>window.ICMDetriment.result()),null);
  await field('threshold').fill('5');
  let r=await run();assert.equal(r.summary.detriment,1);assert.equal(r.summary.matched,4);assert.equal(r.summary.unresolved,2);assert.equal(r.rows.find(x=>x.asset_id==='001').delta,6);assert.equal(r.rows.find(x=>x.asset_id==='004').status,'risk');
  assert.equal(await page.locator('#dtTable tbody tr').count(),1);
  // Applied lists scope every view; editing the draft alone does not alter evidence.
  const unfiltered=await page.evaluate(()=>JSON.stringify(window.ICMDetriment.result()));
  await page.locator('#dtAssetIds').fill('002, 001, ABSENT, A-only, 002');
  assert.equal(await page.locator('#dtTable tbody tr').count(),1);
  await page.click('#dtApplyIds');
  assert.deepEqual(await page.locator('#dtTable tbody tr td:first-child').allTextContents(),['002','001','A-only']);
  assert.match(await page.locator('.dt-selection-status').innerText(),/4 requested · 3 found · 1 absent/);
  assert.match(await page.locator('.dt-selection-status').innerText(),/1 duplicate removed/);
  assert.equal(await page.locator('#dtResults [data-key="filter"]').inputValue(),'all');
  assert.deepEqual(await page.locator('#dtChart').evaluate(el=>el.data[0].y.slice().sort()),['001','002']);
  assert.match(await page.locator('.dt-metrics').innerText(),/2/);
  assert.equal(await page.evaluate(()=>JSON.stringify(window.ICMDetriment.result())),unfiltered);
  let subsetCsv=await exportText('#dtExportCsv');assert.match(subsetCsv,/asset_selection_ids/);assert.doesNotMatch(subsetCsv,/"003"/);assert.match(subsetCsv,/"A-only","unmatched","5",""/);
  let subsetHtml=await exportText('#dtExportHtml');assert.match(subsetHtml,/Applied manhole \/ link IDs/);assert.match(subsetHtml,/Absent IDs: ABSENT/);assert.doesNotMatch(subsetHtml,/<td>003<\/td>/);
  await page.screenshot({path:path.join(evidence,'detriment-selected.png'),fullPage:false,animations:'disabled'});
  await page.locator('#dtAssetIds').fill('MISSING');await page.click('#dtApplyIds');
  assert.equal(await page.locator('#dtTable tbody tr').count(),0);assert.deepEqual(await page.locator('#dtChart').evaluate(el=>el.data[0].y),[]);
  assert.match(await page.locator('.dt-metrics').innerText(),/—/);
  await page.click('#dtClearIds');assert.equal(await page.locator('#dtTable tbody tr').count(),1);
  // A copied ICM grid with two ID columns requires an explicit selection.
  await page.locator('#dtAssetIds').fill('Node ID\tLink ID\tX\n001\t001.1\t100\n002\t002.1\t200');
  assert.equal(await page.locator('#dtApplyIds').isDisabled(),true);
  await page.locator('#dtIdsColumn').selectOption('0');await page.click('#dtApplyIds');
  assert.deepEqual(await page.locator('#dtTable tbody tr td:first-child').allTextContents(),['001','002']);
  const selectionWorkspace=await page.evaluate(()=>workspaceObject());
  assert.deepEqual(selectionWorkspace.detriment.flooding.asset_ids,['001','002']);
  await page.evaluate(w=>applyWorkspace(w),selectionWorkspace);await run();
  assert.deepEqual(await page.locator('#dtTable tbody tr td:first-child').allTextContents(),['001','002']);
  await page.click('#dtClearIds');

  await page.click('[data-asset="001"]');assert.ok(await page.locator('#dtDrawer').evaluate(el=>{const r=el.getBoundingClientRect();return r.top>=0&&r.top<window.innerHeight&&r.right<=window.innerWidth;}),'Asset evidence opens in viewport');assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth<=1),'Selected drawer containment');assert.match(await page.locator('#dtDrawer').innerText(),/30y-120min/);
  const csv=await exportText('#dtExportCsv');assert.match(csv,/"001"/);assert.match(csv,/source_a_sha256/);assert.match(csv,/"5"/);
  assert.match(await exportText('#dtExportHtml'),/Assessment criteria and source provenance/);
  await page.screenshot({path:path.join(evidence,'detriment-flooding.png'),fullPage:false});
  await page.locator('#dtResults [data-key="filter"]').selectOption('new_flooding');assert.equal(await page.locator('#dtTable tbody tr').count(),1);assert.match(await page.locator('#dtTable').innerText(),/002/);
  await page.locator('#dtResults [data-key="filter"]').selectOption('all');assert.equal(await page.locator('#dtTable tbody tr').count(),6);
  await page.locator('#dtResults [data-key="search"]').fill('only');assert.equal(await page.locator('#dtTable tbody tr').count(),2);
  await field('threshold').fill('6');assert.equal(await page.locator('#dtExportCsv').isDisabled(),true);assert.equal(await page.evaluate(()=>window.ICMDetriment.result()),null);
  await field('threshold').fill('5');await run();
  const workspace=await page.evaluate(()=>workspaceObject());assert.ok(workspace.detriment.flooding.a.reference.sha256);assert.equal(workspace.detriment.flooding.a.id,undefined);
  await page.evaluate(w=>applyWorkspace(w),workspace);assert.equal(await page.evaluate(()=>window.ICMDetriment.result()),null);assert.equal(await field('threshold').inputValue(),'5');await run();
  await route('level');await selectReport('a','level-a.csv');await selectReport('b','level-b.csv');await scope();await field('threshold').fill('0.15');await field('freeboard_required').fill('0.5');await field('datum').fill('AOD');await field('elevation_confirmed').check();
  r=await run();const mh=r.rows.find(x=>x.asset_id==='MH01');assert.ok(Math.abs(mh.delta-.3)<1e-12);assert.equal(mh.freeboard_b,.35);assert.ok(mh.flags.includes('new_freeboard_breach'));assert.equal(r.rows.find(x=>x.asset_id==='MH02').status,'risk');
  await page.locator('#dtAssetIds').fill('Node ID\tX\nMH02\t100');await page.click('#dtApplyIds');
  assert.deepEqual(await page.locator('#dtTable tbody tr td:first-child').allTextContents(),['MH02']);
  assert.deepEqual(await page.locator('#dtPairedChart').evaluate(el=>el.data[0].x),['MH02']);
  await route('flooding');assert.equal(await page.locator('#dtAssetIds').inputValue(),'');
  await route('level');assert.deepEqual(await page.evaluate(()=>window.ICMDetriment.config().asset_ids),['MH02']);
  await page.click('#dtClearIds');

  assert.equal(await page.locator('#dtPairedChart .plot-container').count(),1);await page.click('[data-asset="MH01"]');assert.equal(await page.locator('#dtSectionChart .plot-container').count(),1);assert.match(await exportText('#dtExportCsv'),/AOD/);
  await page.screenshot({path:path.join(evidence,'detriment-level.png'),fullPage:false});
  await page.getByText('Separate common ground-level table (optional)',{exact:true}).click();await selectReport('ground','ground.csv');r=await run();assert.equal(r.rows[0].freeboard_b,.35);
  await route('spill');await selectReport('a','spill-a.csv');await selectReport('b','spill-b.csv');await scope();await field('period_start').fill('2025-01-01');await field('period_end').fill('2026-01-01');await field('template').fill('UK12/24 identical threshold and integral');
  r=await run();assert.equal(r.rows[0].delta,3);assert.equal(r.rows[0].duration_delta_hours,4);assert.equal(r.rows[1].status,'risk');assert.ok(r.rows[1].flags.includes('mixed_result'));
  await page.locator('#dtAssetIds').fill('CSO02');await page.click('#dtApplyIds');
  assert.deepEqual(await page.locator('#dtTable tbody tr td:first-child').allTextContents(),['CSO02']);
  for(const id of ['dtChart','dtDurationChart'])assert.deepEqual(await page.locator('#'+id).evaluate(el=>el.data[0].y),['CSO02']);
  assert.deepEqual(await page.locator('#dtPairedChart').evaluate(el=>el.data[0].x),['CSO02']);
  assert.doesNotMatch(await exportText('#dtExportHtml'),/<td>CSO01<\/td>/);
  await page.click('#dtClearIds');

  await page.getByText('Optional exceedance detail for evidence',{exact:true}).click();await selectReport('detail_a','detail-a.csv');assert.equal(await field('detail_b.id').isVisible(),true,'Optional detail stays open after selecting A');await selectReport('detail_b','detail-b.csv');r=await run();assert.equal(r.rows[0].details_b.length,2);await page.click('[data-asset="CSO01"]');assert.match(await page.locator('#dtDrawer').innerText(),/2025-02-01/);assert.equal(await page.locator('#dtTimelineChart .plot-container').count(),1);assert.equal(await page.locator('#dtPairedChart .plot-container').count(),1);assert.match(await exportText('#dtExportHtml'),/detail_source_b/);
  await page.screenshot({path:path.join(evidence,'detriment-spill.png'),fullPage:false});
  await field('counting_mode').selectOption('block-rows');await selectReport('a','detail-a.csv');await selectReport('b','detail-b.csv');r=await run();assert.equal(r.rows[0].delta,1);assert.equal(r.rows[0].duration_delta_hours,2);assert.equal(r.counting_mode,'block-rows');
  for(const size of [{width:1366,height:768},{width:390,height:844}]){await page.setViewportSize(size);await route('flooding');const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth);assert.ok(overflow<=1,'Document overflow '+overflow);await page.screenshot({path:path.join(evidence,'detriment-'+size.width+'.png'),fullPage:false});}
  await page.setViewportSize({width:1440,height:1000});
  await page.evaluate(()=>window.__ICM_PRECISION_WORKBENCH__.navigate('data','time-series',true));
  await page.locator('#dtPasteName').fill('Pasted flooding');await page.locator('#dtPasteGrid').fill('Node ID\tFlood volume (m³)\n009\t4');await page.click('#dtPasteBtn');
  await page.waitForFunction(()=>[...state.files.values()].some(x=>x.displayName==='Pasted flooding.csv'&&x.status==='ready'),null,{timeout:60000});
  assert.equal(await page.evaluate(()=>allSeries().length),0);
  await page.locator('#dtReportType').selectOption('generic');await page.locator('#dtPasteName').fill('Mapped proposed');await page.locator('#dtPasteGrid').fill('Identifier\tOutcome\n009\t8');await page.click('#dtPasteBtn');
  await page.waitForFunction(()=>[...state.files.values()].some(x=>x.displayName==='Mapped proposed.csv'&&x.status==='ready'),null,{timeout:60000});
  await route('flooding');await selectReport('a','Pasted flooding.csv');await selectReport('b','Mapped proposed.csv');await field('b.mapping.asset_id').selectOption('Identifier');await field('b.mapping.value').selectOption('Outcome');await field('b.unit').selectOption('m³');await field('threshold').fill('1');r=await run();assert.equal(r.rows[0].asset_id,'009');assert.equal(r.rows[0].delta,4);
  await selectReport('a','flood-a.csv');await selectReport('b','flood-b.csv');await field('threshold').fill('5');await page.evaluate(()=>window.__ICM_PRECISION_WORKBENCH__.navigate('data','time-series',true));await page.locator('#dtReportType').selectOption('auto');
  await page.setInputFiles('#fileInput',{name:'hydraulic.csv',mimeType:'text/csv',buffer:Buffer.from('Time,Flow (L/s)\n2025-01-01 00:00:00,2\n2025-01-01 00:01:00,3\n')});
  await page.waitForFunction(()=>allSeries().some(x=>x.item.displayName==='hydraulic.csv'),null,{timeout:60000});
  assert.equal(await page.evaluate(()=>allSeries().some(x=>x.item.parsed.metadata?.source_kind==='detriment_report')),false);
  await route('flooding');await run();
  const baselineB=await fs.readFile('tests/fixtures/detriment/flood-b.csv');
  await page.evaluate(async()=>{const item=[...state.files.values()].find(x=>x.displayName==='flood-b.csv');await removeSourceById(item.id);});
  assert.equal(await page.evaluate(()=>window.ICMDetriment.result()),null);assert.equal(await page.locator('#dtExportCsv').isDisabled(),true);
  await page.evaluate(()=>window.__ICM_PRECISION_WORKBENCH__.navigate('data','time-series',true));await page.setInputFiles('#dtFileInput',{name:'renamed-proposed.csv',mimeType:'text/csv',buffer:baselineB});
  await page.waitForFunction(()=>[...state.files.values()].some(x=>x.displayName==='renamed-proposed.csv'&&x.status==='ready'),null,{timeout:60000});await route('flooding');assert.ok((await field('b.id').inputValue()).length);r=await run();assert.equal(r.rows.find(x=>x.asset_id==='001').delta,6);
  // About lives immediately above the source list and is a genuine workspace.
  const about=page.locator('.pw-about-nav [data-workspace="about"]');
  assert.equal(await about.count(),1);
  assert.ok(await page.evaluate(()=>document.querySelector('.pw-about-nav').nextElementSibling.classList.contains('pw-asset-browser')));
  await about.click();assert.equal(await page.title(),'About Hydra Bench · Hydra Bench');
  assert.equal(await page.locator('#tab-about').isVisible(),true);assert.equal(await page.locator('#tab-detriment').isVisible(),false);
  assert.equal(await page.locator('.pw-about-workspaces section').count(),6);assert.match(await page.locator('.pw-about-author').innerText(),/Built by Anzar Sajid/);
  for(const size of [{width:1440,height:1000},{width:390,height:844}]){await page.setViewportSize(size);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth<=1));await page.screenshot({path:path.join(evidence,'about-'+size.width+'.png'),fullPage:false,animations:'disabled'});}
  await page.locator('[data-about-workspace="detriment"]').click();assert.equal(await page.locator('#dtAssetIds').isVisible(),true);
  assert.deepEqual(errors,[]);console.log('Detriment acceptance passed: Data Sources → 3 tabs → evidence/export, precision boundaries, restoration, source removal and responsive containment.');
}catch(error){await page.screenshot({path:path.join(evidence,'detriment-failure.png'),fullPage:true}).catch(()=>{});console.error('Detriment state:',await page.locator('#dtStatus').textContent().catch(()=>''),errors);throw error;}finally{await browser.close();}
