import {chromium} from 'playwright';
import {browserLaunchOptions,browserContextOptions} from './browser-environment.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const browser=await chromium.launch(browserLaunchOptions()),page=await browser.newPage({...browserContextOptions(),viewport:{width:1600,height:1050},acceptDownloads:true});
const errors=[];page.on('pageerror',e=>errors.push(e.message));
const evidence=process.env.ICM_EVIDENCE_DIR||'/tmp/hydra-annual-review';await fs.mkdir(evidence,{recursive:true});
const base=process.env.ICM_BASE_URL||'http://127.0.0.1:8000/';
function csv(year,count){const rows=['timestamp,Depth (m)'];for(let t=Date.UTC(year-1,11,1);t<=Date.UTC(year+1,0,1);t+=3600000){const hour=(t-Date.UTC(year,0,10))/3600000,spill=hour>=0&&hour<300*count&&hour%300<6;rows.push(new Date(t).toISOString().slice(0,19)+','+(spill?2:0));}return Buffer.from(rows.join('\n'));}
const files=[['ReviewObserved2023.csv',2023,10],['ReviewObserved2024.csv',2024,20],['ReviewBaseline2023.csv',2023,13],['ReviewBaseline2024.csv',2024,22],['ReviewUpdate2024.csv',2024,21]].map(([name,y,n])=>({name,mimeType:'text/csv',buffer:csv(y,n)}));
const snapshot=()=>page.evaluate(()=>ICMNetworkSchematic.snapshot());
async function field(id,value){await page.locator('#'+id).fill(value);await page.locator('#'+id).dispatchEvent('change');}
async function assign(role,names){await page.click('[data-ns-add-sources="'+role+'"]');for(const name of names)await page.locator('#nsPicker .ns-file-list label').filter({hasText:name}).locator('input').check();await page.click('#nsAddSelected');}
try{
  await page.goto(base,{waitUntil:'domcontentloaded'});assert.match(await page.title(),/Hydra Bench/);await page.waitForFunction(()=>window.__ICM_PRECISION_WORKBENCH__?.navigate);
  await page.setInputFiles('#fileInput',files);await page.waitForFunction(()=>[...state.files.values()].filter(x=>x.status==='ready').length===5,null,{timeout:120000});
  await page.evaluate(()=>__ICM_PRECISION_WORKBENCH__.navigate('spills','network',true));await page.waitForSelector('#nsAssetSearch');await page.click('#nsEdit');await page.click('#nsAddAsset');await field('nsName','Annual review CSO');
  await field('nsObservedDefault','1.2');await assign('observed',['ReviewObserved2023.csv','ReviewObserved2024.csv']);await field('nsModelDefault','1.2');await assign('model',['ReviewBaseline2023.csv','ReviewBaseline2024.csv']);await field('nsNewScenario','Update');await assign('model',['ReviewUpdate2024.csv']);
  await page.locator('#nsDrawer details summary').first().click();await field('nsGap','3700');await page.locator('#nsConfirmed').check();
  const sharedBefore=await page.evaluate(()=>JSON.stringify({mapping:state.mapping,spills:state.spills,exclusions:state.exclusions,obs:document.getElementById('obsThreshold').value,model:document.getElementById('modelThreshold').value}));
  await page.click('#nsCalculate');await page.waitForFunction(()=>ICMNetworkSchematic.snapshot().nodes[0].applied,null,{timeout:120000});let network=await snapshot(),asset=network.nodes[0];
  assert.equal(asset.applied.rows.find(r=>r.role==='observed'&&r.year===2024).spill_count,20);
  for(const label of ['Upstream pump','Downstream works']){await page.click('#nsAddAsset');await field('nsName',label);}
  network=await snapshot();const [a,b,c]=network.nodes;a.x=480;a.y=300;b.x=180;b.y=300;c.x=790;c.y=300;network.edges=[{id:'up',from:b.id,to:a.id,colour:'blue',name:'Rising main',arrow:true},{id:'down',from:a.id,to:c.id,colour:'red',arrow:true}];await page.evaluate(n=>ICMNetworkSchematic.restore(n),network);await page.click('#nsFit');await page.click('#nsEdit');
  await page.locator('[data-ns-node="'+asset.id+'"] [data-ns-frame]').hover();await page.waitForSelector('#nsHover:not([hidden])');assert.match(await page.locator('#nsHover').innerText(),/2023/);assert.match(await page.locator('#nsHover').innerText(),/2024/);
  await page.locator('[data-ns-node="'+asset.id+'"] [data-ns-frame]').click();await page.selectOption('#nsYear','2024');assert.equal(await page.locator('#nsPopup [data-ns-evidence-year="2023"]').count(),2,'Annual inspector retains every year when overlay year changes');
  await page.screenshot({path:evidence+'/annual-inspector.png'});
  await page.click('[data-ns-open-analysis="series"]');await page.waitForFunction(()=>document.getElementById('nsAnalysisPlot')?.data?.length===3,null,{timeout:120000});assert.equal(await page.locator('#nsAnalysisAudit').isVisible(),false,'Quality basis starts collapsed');
  assert.equal(await page.locator('#nsAnalysisPlot').evaluate(el=>el.layout.shapes.filter(s=>s.type==='line').length),3,'Source-specific thresholds are present');
  await page.screenshot({path:evidence+'/associated-time-series.png'});
  await page.locator('#nsAnalysis details summary').first().click();await page.click('#nsCommonCalculate');await page.waitForSelector('#nsCommonResult:not([hidden])',{timeout:120000});assert.match(await page.locator('#nsCommonResult').innerText(),/20/);assert.match(await page.locator('#nsCommonMessage').innerText(),/Comparable/);
  assert.equal((await snapshot()).nodes[0].applied.rows.length,5,'Common-period results do not replace annual totals');await page.click('#nsCloseAnalysis');
  const sharedAfter=await page.evaluate(()=>JSON.stringify({mapping:state.mapping,spills:state.spills,exclusions:state.exclusions,obs:document.getElementById('obsThreshold').value,model:document.getElementById('modelThreshold').value}));assert.equal(sharedAfter,sharedBefore,'Drill-down/common-period analysis leave shared workspaces untouched');
  await page.click('#nsAnnualTable');assert.match(await page.locator('#nsMatrixBody').innerText(),/2023/);assert.match(await page.locator('#nsMatrixBody').innerText(),/2024/);assert.match(await page.locator('#nsMatrixBody').innerText(),/\+2/);
  await page.click('#nsReviewTools > summary');await page.click('[data-ns-trace="up"]');assert.equal(await page.locator('[data-ns-node="'+c.id+'"]').evaluate(el=>Number(el.style.opacity)),.2);await page.click('#nsClearTrace');
  await page.locator('#nsReviewTools details summary').filter({hasText:'Scenarios'}).click();
  await page.locator('[data-ns-scenario-choice="Update"]').uncheck();assert.equal(await page.locator('#nsMatrixBody').getByText('Update',{exact:true}).count(),0);assert.equal((await snapshot()).nodes[0].applied.rows.length,5);
  await page.selectOption('#nsTypeFilter','pump');assert.equal(await page.locator('[data-ns-node]').count(),0);await page.selectOption('#nsTypeFilter','all');
  await page.locator('#nsReviewTools details summary').filter({hasText:'Views'}).click();await field('nsViewName','Annual review layout');await page.click('#nsSaveView');assert.equal((await snapshot()).views.length,1);await page.click('#nsSaveSnapshot');assert.equal((await snapshot()).reviewSnapshots.length,1);
  await page.click('#nsAudit');assert.match(await page.locator('#nsAuditResult').innerText(),/1 components/);await page.click('#nsClearTrace');await page.click('#nsReviewTools > summary');
  await page.click('#nsCloseMatrix');await page.click('#nsEdit');await page.locator('[data-ns-node="'+asset.id+'"] [data-ns-frame]').click();await page.locator('#nsPinned').check();const pinned=(await snapshot()).nodes[0];
  await page.click('#nsReviewTools > summary');
  await page.locator('#nsReviewTools details summary').filter({hasText:'Layout'}).click();await page.click('[data-ns-arrange="auto"]');let laid=await snapshot();assert.equal(laid.nodes[0].x,pinned.x);assert.equal(laid.nodes[0].y,pinned.y);assert.equal(await page.evaluate(()=>ICMNetworkSchematic.debug().fresh[0].fresh),true);
  await page.click('#nsReviewTools > summary');await page.click('#nsUndo');await page.click('#nsReviewTools > summary');await page.click('#nsRedo');assert.equal((await snapshot()).nodes[0].x,pinned.x);
  await page.click('#nsReviewTools > summary');await page.locator('[data-ns-node="'+asset.id+'"] [data-ns-frame]').click();await page.locator('#nsDrawer .ns-review-notes summary').click();await field('nsReviewComment','Review annual count and duration; inspect upstream response.');await page.selectOption('#nsReviewStatus','reviewed');
  await page.click('#nsEdit');await page.locator('.ns-export-menu summary').click();const svgDownload=page.waitForEvent('download');await page.click('#nsSvgExport');const svg=await svgDownload;await svg.saveAs(evidence+'/network-review.svg');assert.match(await fs.readFile(evidence+'/network-review.svg','utf8'),/Rising main/);
  await page.locator('.ns-export-menu summary').click();const reportPromise=page.waitForEvent('popup');await page.click('#nsReportExport');const report=await reportPromise;await report.waitForLoadState();assert.match(await report.locator('body').innerText(),/2023/);assert.match(await report.locator('body').innerText(),/2024/);assert.match(await report.locator('body').innerText(),/Review annual count/);await report.pdf({path:evidence+'/annual-network-report.pdf',format:'A4',landscape:true});await report.close();
  await page.reload();await page.waitForFunction(()=>window.__ICM_PRECISION_WORKBENCH__?.navigate);await page.evaluate(()=>__ICM_PRECISION_WORKBENCH__.navigate('spills','network',true));await page.waitForSelector('#nsEdit');const restored=await snapshot();assert.equal(restored.schema,2);assert.equal(restored.views.length,1);assert.equal(restored.reviewSnapshots.length,1);assert.equal(restored.nodes[0].review.status,'reviewed');assert.equal(restored.nodes[0].pinned,true);
  await page.setViewportSize({width:820,height:900});await page.locator('[data-ns-node="'+asset.id+'"] [data-ns-frame]').click();await page.screenshot({path:evidence+'/annual-tablet.png'});assert(await page.locator('#nsPopup').isVisible());
  assert.deepEqual(errors,[],'No page runtime errors');console.log('Annual network review passed: all years, hover, graph thresholds, common-period isolation, scenarios, tracing, pinned layout, notes, snapshots, vector/PDF and restore.');
}catch(error){await page.screenshot({path:evidence+'/annual-review-failure.png',fullPage:true});throw error;}
finally{await browser.close();}
