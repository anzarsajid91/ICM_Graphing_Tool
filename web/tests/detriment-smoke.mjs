import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
const browser=await chromium.launch({headless:true});
const page=await browser.newPage({viewport:{width:1440,height:1000},acceptDownloads:true});
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
  await route('flooding');await selectReport('a','flood-a.csv');await selectReport('b','flood-b.csv');await scope();await field('threshold').fill('5');
  let r=await run();assert.equal(r.summary.detriment,1);assert.equal(r.summary.matched,4);assert.equal(r.summary.unresolved,2);assert.equal(r.rows.find(x=>x.asset_id==='001').delta,6);assert.equal(r.rows.find(x=>x.asset_id==='004').status,'risk');
  assert.equal(await page.locator('#dtTable tbody tr').count(),1);
  await page.click('[data-asset="001"]');assert.ok(await page.locator('#dtDrawer').evaluate(el=>{const r=el.getBoundingClientRect();return r.top>=0&&r.top<window.innerHeight&&r.right<=window.innerWidth;}),'Asset evidence opens in viewport');assert.match(await page.locator('#dtDrawer').innerText(),/30y-120min/);
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
  assert.equal(await page.locator('#dtPairedChart .plot-container').count(),1);await page.click('[data-asset="MH01"]');assert.equal(await page.locator('#dtSectionChart .plot-container').count(),1);assert.match(await exportText('#dtExportCsv'),/AOD/);
  await page.screenshot({path:path.join(evidence,'detriment-level.png'),fullPage:false});
  await page.getByText('Separate common ground-level table (optional)',{exact:true}).click();await selectReport('ground','ground.csv');r=await run();assert.equal(r.rows[0].freeboard_b,.35);
  await route('spill');await selectReport('a','spill-a.csv');await selectReport('b','spill-b.csv');await scope();await field('period_start').fill('2025-01-01');await field('period_end').fill('2026-01-01');await field('template').fill('UK12/24 identical threshold and integral');
  r=await run();assert.equal(r.rows[0].delta,3);assert.equal(r.rows[0].duration_delta_hours,4);assert.equal(r.rows[1].status,'risk');assert.ok(r.rows[1].flags.includes('mixed_result'));
  await page.getByText('Optional exceedance detail for evidence',{exact:true}).click();await selectReport('detail_a','detail-a.csv');await selectReport('detail_b','detail-b.csv');r=await run();assert.equal(r.rows[0].details_b.length,2);await page.click('[data-asset="CSO01"]');assert.match(await page.locator('#dtDrawer').innerText(),/2025-02-01/);assert.equal(await page.locator('#dtTimelineChart .plot-container').count(),1);assert.equal(await page.locator('#dtPairedChart .plot-container').count(),1);assert.match(await exportText('#dtExportHtml'),/detail_source_b/);
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
  assert.deepEqual(errors,[]);console.log('Detriment acceptance passed: Data Sources → 3 tabs → evidence/export, precision boundaries, restoration, source removal and responsive containment.');
}catch(error){await page.screenshot({path:path.join(evidence,'detriment-failure.png'),fullPage:true}).catch(()=>{});console.error('Detriment state:',await page.locator('#dtStatus').textContent().catch(()=>''),errors);throw error;}finally{await browser.close();}
