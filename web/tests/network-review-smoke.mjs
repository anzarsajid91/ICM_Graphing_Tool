import {chromium} from 'playwright';
import {browserLaunchOptions,browserContextOptions} from './browser-environment.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const browser=await chromium.launch(browserLaunchOptions()),page=await browser.newPage({...browserContextOptions(),viewport:{width:1600,height:1050},acceptDownloads:true});
const errors=[];page.on('pageerror',e=>{errors.push(e.message);console.error('PAGE ERROR:',e.message);});
const evidence=process.env.ICM_EVIDENCE_DIR||'/tmp/hydra-annual-review';await fs.mkdir(evidence,{recursive:true});
const base=process.env.ICM_BASE_URL||'http://127.0.0.1:8000/';
function csv(year,count,channel='Depth (m)',factor=1){const rows=['timestamp,'+channel];for(let t=Date.UTC(year-1,11,1);t<=Date.UTC(year+1,0,1);t+=3600000){const hour=(t-Date.UTC(year,0,10))/3600000,spill=hour>=0&&hour<300*count&&hour%300<6;rows.push(new Date(t).toISOString().slice(0,19)+','+(spill?2*factor:0));}return Buffer.from(rows.join('\n'));}
const files=[['ReviewObserved2023.csv',2023,10],['ReviewObserved2024.csv',2024,20],['ReviewBaseline2023.csv',2023,13],['ReviewBaseline2024.csv',2024,22],['ReviewUpdate2024.csv',2024,21]].map(([name,y,n])=>({name,mimeType:'text/csv',buffer:csv(y,n,name==='ReviewBaseline2023.csv'?'Flow (L/s)':name==='ReviewBaseline2024.csv'?'Depth (mm)':'Depth (m)',name.includes('Baseline')?1000:1)}));
files.push({name:'ReviewUnknownUnit2024.csv',mimeType:'text/csv',buffer:csv(2024,20,'Depth',1000)});
const snapshot=()=>page.evaluate(()=>ICMNetworkSchematic.snapshot());
async function field(id,value){await page.locator('#'+id).fill(value);await page.locator('#'+id).dispatchEvent('change');}
async function assign(role,names){await page.click('[data-ns-add-sources="'+role+'"]');for(const name of names)await page.locator('#nsPicker .ns-file-list label').filter({hasText:name}).locator('input').check();await page.click('#nsAddSelected');}
try{
  await page.goto(base,{waitUntil:'domcontentloaded'});assert.match(await page.title(),/Hydra Bench/);await page.waitForFunction(()=>window.__ICM_PRECISION_WORKBENCH__?.navigate);
  await page.setInputFiles('#fileInput',files);await page.waitForFunction(()=>[...state.files.values()].filter(x=>x.status==='ready').length===6,null,{timeout:120000});
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
  assert.equal(await page.locator('#nsPopup [data-ns-evidence-year="2023"] .ns-rag-red').count(),2,'Level/flow outcome comparison highlights count and duration');
  assert.equal(await page.locator('#nsPopup [data-ns-evidence-year="2023"] .ns-rag-red').first().evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(253, 235, 236)');
  await page.screenshot({path:evidence+'/annual-inspector.png'});
  await page.click('[data-ns-open-analysis="series"]');await page.waitForFunction(()=>document.getElementById('nsAnalysisPlot')?.data?.length===3,null,{timeout:120000});assert.equal(await page.locator('#nsAnalysisAudit').isVisible(),false,'Quality basis starts collapsed');
  assert.equal(await page.locator('#nsAnalysisPlot').evaluate(el=>el.layout.shapes.filter(s=>s.type==='line').length),3,'Source-specific thresholds are present');
  await page.locator('#nsAnalysisSettings > summary').click();
  const modelSettings=page.locator('#nsAnalysisSources [data-ns-binding]').filter({hasText:'ReviewBaseline2024.csv'});
  await modelSettings.locator('[data-ns-binding-field="unit"]').selectOption('mm');
  await page.waitForFunction(()=>{const el=document.getElementById('nsAnalysisPlot');return el?.data?.length===3&&el.data.some(t=>t.name==='Baseline'&&Math.max(...t.y.filter(v=>v!==null))===2000);},null,{timeout:120000});
  assert.equal(await modelSettings.locator('[data-ns-binding-field="threshold"]').inputValue(),'1200','m/mm unit change preserves physical threshold');
  assert.equal(await page.locator('#nsAnalysisPlot').evaluate(el=>el.layout.shapes.some(s=>s.y0===1200)),true);
  await page.click('#nsAnalysisCalculate');await page.waitForFunction(()=>ICMNetworkSchematic.debug().fresh[0].fresh,null,{timeout:120000});
  const scaled=(await snapshot()).nodes[0].applied.rows.find(r=>r.role==='model'&&r.scenario==='Baseline'&&r.year===2024);
  assert.equal(scaled.spill_count,22);assert.equal(scaled.unit,'mm');assert.equal(scaled.threshold,1200);assert.equal(scaled.value_max,2000);
  await page.waitForFunction(()=>document.getElementById('nsAnalysisMessage').textContent.startsWith('Dashed lines'),null,{timeout:120000});
  assert.deepEqual(await page.locator('#nsAnalysisPlot').evaluate(el=>[el._fullLayout.yaxis.title.text,el._fullLayout.yaxis2.title.text]),['depth · m','depth · mm'],'Rendered axes show quantities and actual value units');
  await page.screenshot({path:evidence+'/associated-unit-controls.png'});
  await page.locator('#nsAnalysisSettings > summary').click();await page.locator('#nsAnalysis .ns-analysis-body').evaluate(el=>el.scrollTop=0);
  await page.screenshot({path:evidence+'/associated-time-series.png'});
  await page.locator('#nsAnalysis details:not(#nsAnalysisSettings) summary').first().click();await page.click('#nsCommonCalculate');await page.waitForSelector('#nsCommonResult:not([hidden])',{timeout:120000});assert.match(await page.locator('#nsCommonResult').innerText(),/20/);assert.match(await page.locator('#nsCommonMessage').innerText(),/Comparable/);
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
  const savedReview=await snapshot();
  await page.evaluate(()=>{const current=ICMNetworkSchematic.snapshot(),source=[...state.files.values()].find(x=>x.displayName==='ReviewUnknownUnit2024.csv');current.nodes.push({id:'unknown-unit-check',name:'Unknown-unit CSO',type:'cso',colour:'blue',x:600,y:300,defaults:{observed:1200,model:''},gap:3700,exclusions:[],confirmed:false,bindings:[{id:'unknown-binding',sourceId:source.id,sha256:source.hash,sourceName:source.displayName,column:'Depth',role:'observed',scenario:'Observed',years:[2024],threshold:'',quantity:'depth',unit:'',datum:''}]});ICMNetworkSchematic.restore(current);});
  await field('nsAssetSearch','Unknown-unit CSO');await page.click('#nsPopup [data-ns-open-analysis="series"]');
  await page.waitForSelector('#nsAnalysis:not([hidden])');await page.waitForFunction(()=>document.getElementById('nsAnalysisTitle').textContent==='Unknown-unit CSO'&&document.getElementById('nsAnalysisSettings').open);
  await page.locator('#nsAnalysisSources [data-ns-binding-field="unit"]').selectOption('mm');
  await page.waitForFunction(()=>document.getElementById('nsAnalysisPlot')?.data?.[0]?.y.some(v=>v===2000),null,{timeout:120000});
  assert.equal(await page.locator('#nsAnalysisPlot').evaluate(el=>el.layout.shapes[0].y0),1200,'Unknown unit assignment retains source numbers and threshold');
  await page.click('#nsAnalysisCalculate');await page.waitForFunction(()=>ICMNetworkSchematic.debug().fresh.at(-1).fresh,null,{timeout:120000});
  assert.equal((await snapshot()).nodes.at(-1).applied.rows[0].spill_count,20);
  await page.click('#nsCloseAnalysis');await page.evaluate(n=>ICMNetworkSchematic.restore(n),savedReview);
  await page.reload();await page.waitForFunction(()=>window.__ICM_PRECISION_WORKBENCH__?.navigate);await page.evaluate(()=>__ICM_PRECISION_WORKBENCH__.navigate('spills','network',true));await page.waitForSelector('#nsEdit');const restored=await snapshot();assert.equal(restored.schema,2);assert.equal(restored.views.length,1);assert.equal(restored.reviewSnapshots.length,1);assert.equal(restored.nodes[0].review.status,'reviewed');assert.equal(restored.nodes[0].pinned,true);
  await page.setViewportSize({width:820,height:900});await page.locator('[data-ns-node="'+asset.id+'"] [data-ns-frame]').click();await page.screenshot({path:evidence+'/annual-tablet.png'});assert(await page.locator('#nsPopup').isVisible());
  assert.deepEqual(errors,[],'No page runtime errors');console.log('Annual network review passed: all years, hover, graph thresholds, common-period isolation, scenarios, tracing, pinned layout, notes, snapshots, vector/PDF and restore.');
}catch(error){await page.screenshot({path:evidence+'/annual-review-failure.png',fullPage:true});throw error;}
finally{await browser.close();}
