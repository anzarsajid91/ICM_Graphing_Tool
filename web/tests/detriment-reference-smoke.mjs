import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {execFileSync} from 'node:child_process';

const generated=await fs.mkdtemp(path.join(os.tmpdir(),'icm-reference-scenarios-'));
const cases=JSON.parse(execFileSync(process.env.PYTHON||'python3',['scripts/detriment_reference_cases.py',generated],{encoding:'utf8'}));
const evidence=process.env.ICM_EVIDENCE_DIR||'/tmp/icm-reference-evidence';
await fs.mkdir(evidence,{recursive:true});
const base=process.env.ICM_BASE_URL||'http://127.0.0.1:8000/';
const browser=await chromium.launch({headless:true});
const page=await browser.newPage({viewport:{width:1440,height:1000},acceptDownloads:true});
const errors=[];page.on('pageerror',e=>errors.push(String(e)));
const field=key=>page.locator('#dtForm [data-key="'+key+'"]');
const route=kind=>page.evaluate(k=>window.__ICM_PRECISION_WORKBENCH__.navigate('detriment',k,true),kind);
async function select(slot,file){const id=await page.locator('#dtForm [data-key="'+slot+'.id"] option').evaluateAll((options,name)=>options.find(o=>o.textContent===name)?.value,path.basename(file));assert.ok(id);await field(slot+'.id').selectOption(id);}
async function run(){await page.click('#runDetrimentBtn');await page.waitForFunction(()=>!document.querySelector('#runDetrimentBtn').disabled&&document.querySelector('#dtStatus').textContent.startsWith('Assessment complete'),null,{timeout:60000});return page.evaluate(()=>window.ICMDetriment.result());}
async function download(selector){const event=page.waitForEvent('download');await page.click(selector);const file=await event;return fs.readFile(await file.path(),'utf8');}
function close(a,b){assert.ok(Math.abs(a-b)<1e-9,`${a} != ${b}`);}
try{
  await page.goto(base,{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>Boolean(window.ICMDetriment&&window.__ICM_PRECISION_WORKBENCH__),null,{timeout:30000});
  assert.match(await page.title(),/ICM Buddy/);
  assert.deepEqual((await page.locator('.pw-primary-nav .pw-nav-label').allTextContents()).map(x=>x.trim()),['Data / Time Series','Spills','Flow Survey','Detriment Assessment','Graphs','Reports']);
  const note=await page.locator('#dropzone span').textContent();
  assert.match(note,/\.CSV, \.FDV, \.R/);assert.match(note,/fm_rg_assoc.xlsx/);assert.doesNotMatch(note,/\.txt|\.FTV/i);
  const files=Object.values(cases).flatMap(c=>[c.original,...c.paths]);
  await page.setInputFiles('#fileInput',files);
  await page.waitForFunction(()=>[...state.files.values()].filter(x=>x.status==='ready').length===9,null,{timeout:120000});
  assert.equal(await page.evaluate(()=>allSeries().length),0);
  assert.deepEqual(await page.evaluate(()=>[...state.files.values()].filter(x=>x.displayName.endsWith('_Sample.csv')).map(x=>x.parsed.metadata.report_kind).sort()),['flooding','level','spill_detail']);
  assert.deepEqual(await page.evaluate(()=>window.__ICM_PRECISION_WORKBENCH__.route()),{workspace:'data',page:'time-series'});
  for(const kind of ['flooding','level','spill']){
    await route(kind);
    await select('a',cases[kind].paths[0]);await select('b',cases[kind].paths[1]);
    await field('scope').fill('Controlled reference A/B · same model scope');await field('scope_confirmed').check();
    if(kind==='level'){
      assert.equal(await field('a.mapping.value').inputValue(),'Max Level (m AD)');
      assert.equal(await field('datum').inputValue(),'AD');
      await field('threshold').fill('0.15');await field('freeboard_required').fill('0.5');await field('elevation_confirmed').check();
      assert.match(await page.locator('#dtForm').innerText(),/date-formatted cells/);
    }else if(kind==='flooding'){
      assert.equal(await field('a.mapping.value').inputValue(),'Max Flood/Lost Volume (m3)');await field('threshold').fill('5');
    }else{
      assert.equal(await field('a.mapping.duration').inputValue(),'Spill Duration (mins)');
      assert.equal(await field('a.mapping.start').inputValue(),'Start of Spill (absolute)');
      assert.equal(await field('a.mapping.end').inputValue(),'End of Spill (absolute)');
      await field('period_start').fill('2023-01-01');await field('period_end').fill('2025-01-01');await field('template').fill('Controlled exported row basis, identical settings');
      await page.click('#runDetrimentBtn');await page.waitForFunction(()=>document.querySelector('#dtStatus').textContent.includes('Summary'));assert.equal(await page.evaluate(()=>window.ICMDetriment.result()),null);
      await field('counting_mode').selectOption('block-rows');
    }
    const result=await run();assert.equal(result.summary.unresolved,0);
    for(const expected of cases[kind].expected){
      const row=result.rows.find(r=>r.asset_id===expected.asset_id);assert.ok(row);
      for(const [key,value] of Object.entries(expected)){
        if(key==='flag')assert.ok(row.flags.includes(value));else if(typeof value==='number')close(row[key],value);else assert.equal(row[key],value);
      }
    }
    const plot=await page.locator('#dtChart').evaluate(el=>({x:el.data[0].x,y:el.data[0].y,axis:el.layout.xaxis.title.text}));
    const largest=cases[kind].expected[0];assert.ok(plot.y.includes(largest.asset_id));close(plot.x[plot.y.indexOf(largest.asset_id)],largest.delta);
    await page.locator('#dtResults [data-key="filter"]').selectOption('all');
    assert.equal(await page.locator('#dtTable tbody tr').count(),kind==='spill'?1:cases[kind].original_rows);
    await page.locator('[data-asset="'+largest.asset_id+'"]').click();
    if(kind==='level')assert.equal(await page.locator('#dtSectionChart .plot-container').count(),1);
    if(kind==='spill'){
      assert.equal(result.count_unit,'spill-block rows');assert.equal(result.rows[0].details_a.length,124);assert.equal(result.rows[0].details_b.length,125);
      const timeline=await page.locator('#dtTimelineChart').evaluate(el=>el.data.map(t=>({count:t.x.length,groups:[...new Set(t.y)]})));
      assert.deepEqual(timeline,[{count:124,groups:['A · baseline']},{count:125,groups:['B · proposed']}]);
      assert.match(await page.locator('#dtChart').evaluate(el=>el.layout.xaxis.title.text),/spill-block rows/);
    }
    const csv=await download('#dtExportCsv');assert.match(csv,/source_a_sha256/);assert.ok(csv.includes(largest.asset_id));
    const html=await download('#dtExportHtml');assert.match(html,/ICM Buddy/);assert.match(html,/data:image\/png;base64/);assert.match(html,/Anzar Sajid/);
    if(kind==='level')assert.match(html,/Freeboard A \/ B/);
    if(kind==='spill')assert.match(html,/Actual duration A \/ B/);
    const report=await browser.newPage({viewport:{width:390,height:844}});await report.setContent(html);
    await report.waitForFunction(()=>[...document.images].every(img=>img.complete&&img.naturalWidth>0));
    assert.ok(await report.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth<=1),'Exported report contains mobile tables and images');await report.close();
    await fs.writeFile(path.join(evidence,'reference-'+kind+'.html'),html);
    await fs.writeFile(path.join(evidence,'reference-'+kind+'.csv'),csv);
    await fs.writeFile(path.join(evidence,'reference-'+kind+'-result.json'),JSON.stringify(result,null,2));
    await page.waitForFunction(()=>['dtChart','dtPairedChart','dtDurationChart'].every(id=>{const el=document.getElementById(id);return !el?.data||Math.abs(el._fullLayout.width-el.getBoundingClientRect().width)<2;}));
    await page.screenshot({path:path.join(evidence,'reference-'+kind+'.png'),fullPage:false});
  }
  // A real worker-error event makes the subtle retry available without reload.
  const before=await page.evaluate(()=>({sources:[...state.files.keys()],route:window.__ICM_PRECISION_WORKBENCH__.route()}));
  await page.evaluate(()=>engine.worker.dispatchEvent(new ErrorEvent('error',{message:'Controlled recovery test'})));
  await page.locator('#engineRetryBtn').click();
  await page.waitForFunction(()=>window.__ICM_WORKBENCH__.status==='ready'&&[...state.files.values()].every(x=>x.status==='ready'),null,{timeout:120000});
  assert.deepEqual(await page.evaluate(()=>({sources:[...state.files.keys()],route:window.__ICM_PRECISION_WORKBENCH__.route()})),before);
  assert.equal((await run()).rows[0].duration_delta_hours,2);
  assert.equal(await page.locator('#engineRetryBtn').count(),0);
  for(const viewport of [{width:1366,height:768},{width:390,height:844}]){
    await page.setViewportSize(viewport);await route('level');await run();
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth<=1),'No horizontal page overflow');
    await page.screenshot({path:path.join(evidence,'reference-level-'+viewport.width+'.png'),fullPage:false});
  }
  // Failed initial startup: previously uploaded report sources survive retry.
  const failed=await browser.newPage({viewport:{width:1366,height:768}});
  await failed.route('**/python/package-manifest.json*',r=>r.fulfill({status:503,body:'Controlled first-boot failure'}));
  await failed.goto(base,{waitUntil:'domcontentloaded'});
  await failed.waitForFunction(()=>window.__ICM_WORKBENCH__?.status==='failed',null,{timeout:120000});
  await failed.setInputFiles('#fileInput',cases.spill.original);
  await failed.waitForFunction(()=>[...state.files.values()].some(x=>x.advancedUnavailable),null,{timeout:60000});
  await failed.unroute('**/python/package-manifest.json*');await failed.locator('#engineRetryBtn').click();
  await failed.waitForFunction(()=>[...state.files.values()].some(x=>x.status==='ready'&&x.parsed.metadata.report_kind==='spill_detail'),null,{timeout:120000});
  await failed.screenshot({path:path.join(evidence,'recovered-startup.png'),fullPage:false});await failed.close();
  assert.deepEqual(errors,[]);
  console.log('Reference browser acceptance passed: all three native CSVs, independent A/B results, chart arrays, PNG/CSV/HTML exports, retained sources on crash/retry and failed initial boot, desktop/mobile containment.');
}catch(error){await page.screenshot({path:path.join(evidence,'reference-failure.png'),fullPage:true}).catch(()=>{});console.error(await page.locator('#dtStatus').textContent().catch(()=>''),errors);throw error;}
finally{await browser.close();}
