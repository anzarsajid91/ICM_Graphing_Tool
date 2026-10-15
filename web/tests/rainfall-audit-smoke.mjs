// Synthetic audit regressions through the deployed UI and browser-local Python.
import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {browserLaunchOptions,browserContextOptions} from './browser-environment.mjs';
import {installPrivacyGuard} from './privacy-network.mjs';
const base=process.env.ICM_BASE_URL||'http://127.0.0.1:8000/';
const browser=await chromium.launch(browserLaunchOptions());
const context=await browser.newContext({...browserContextOptions(),viewport:{width:1440,height:1000},acceptDownloads:true});
const privacy=installPrivacyGuard(context,base),page=await context.newPage(),errors=[];
page.on('pageerror',error=>errors.push(String(error)));
function rain(name,unit,value){return {name,mimeType:'text/plain',buffer:Buffer.from(
  `**FIELD: 1,RAINFALL\n**UNITS: 1,${unit}\n**CONSTANTS: 3,START,END,INTERVAL\n*CSTART\n2601010000 2601010055 5\n*CEND\n`+Array(12).fill(value).join(' ')+'\n')};}
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-9,`${a} != ${b}`);
try{
  await privacy.navigate(page,base,{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.__ICM_WORKBENCH__?.status==='idle'&&window.__ICM_PRECISION_WORKBENCH__?.navigate);
  await page.setInputFiles('#fileInput',[rain('Audit-depth.R','mm',1),rain('Audit-intensity.R','mm/h',12),rain('Audit-negative.R','mm/h',-1)]);
  await page.waitForFunction(()=>[...state.files.values()].filter(x=>x.status==='ready').length===3,null,{timeout:120000});
  await page.waitForFunction(()=>window.__ICM_WORKBENCH__.lastCumulativeRainfall?.totals?.length===3,null,{timeout:120000});
  const totals=await page.evaluate(()=>window.__ICM_WORKBENCH__.lastCumulativeRainfall.totals);
  near(totals.find(x=>x.file==='Audit-depth.R').total_mm,12);
  near(totals.find(x=>x.file==='Audit-intensity.R').total_mm,12);
  assert.equal(totals.find(x=>x.file==='Audit-negative.R').total_mm,null);
  assert.equal(totals.find(x=>x.file==='Audit-negative.R').complete,false);
  const result=await page.evaluate(async()=>{
    const source=name=>[...state.files.values()].find(x=>x.displayName===name);
    const depth=source('Audit-depth.R'),intensity=source('Audit-intensity.R');
    const calculate=item=>engine.call('rainfall_event_scaled',{path:item.virtualPath,column:'rainfall',rainfall_semantics:rainfallSemanticsFor(item,'rainfall')},'advanced_bridge');
    const d=await calculate(depth),i=await calculate(intensity);
    const bounded=await engine.call('rainfall_event_scaled',{path:depth.virtualPath,column:'rainfall',rainfall_semantics:'incremental_depth',start:'2026-01-01T00:02',end:'2026-01-01T00:08',minimum_intensity:10,minimum_intensity_duration_min:6,minimum_depth_mm:0,minimum_event_duration_min:6},'advanced_bridge');
    return {d,i,bounded};
  });
  assert.equal(result.d.count,1);assert.equal(result.i.count,1);
  near(result.d.events[0].total_depth_mm,12);near(result.d.events[0].peak_intensity,12);
  assert.equal(result.bounded.count,1);near(result.bounded.events[0].total_depth_mm,1.2);
  assert.equal(result.bounded.events[0].start,'2026-01-01T00:02:00');
  assert.equal(result.bounded.events[0].end,'2026-01-01T00:08:00');
  await page.evaluate(()=>{window.__ICM_PRECISION_WORKBENCH__.navigate('data','time-series',false);document.querySelector('#pwTimeSeriesEventSurface').open=true;});
  await page.locator('#cumulativeRainChart').scrollIntoViewIfNeeded();
  await page.waitForFunction(()=>document.querySelector('#cumulativeRainChart')?._fullLayout);
  const range=()=>page.locator('#cumulativeRainChart').evaluate(el=>[...el._fullLayout.xaxis.range]);
  const before=await range();
  await page.locator('#cumulativeRainChart').hover();await page.mouse.wheel(0,-120);await page.waitForTimeout(400);
  assert.deepEqual(await range(),before,'Wheel must preserve rainfall axis');
  // Overrides must trigger refresh and survive the real workspace serializer.
  await page.evaluate(()=>{const item=[...state.files.values()].find(x=>x.displayName==='Audit-depth.R');state.rainfallSemanticsOverrides.set(sourceKey(item.id,'rainfall'),'intensity');window.dispatchEvent(new CustomEvent('icm:rainfall-interpretation-changed'));});
  await page.waitForFunction(()=>window.__ICM_WORKBENCH__.lastCumulativeRainfall?.totals?.some(x=>x.file==='Audit-depth.R'&&Math.abs(x.total_mm-1)<1e-9));
  await page.evaluate(async()=>{const item=[...state.files.values()].find(x=>x.displayName==='Audit-depth.R');state.mapping.rain=sourceKey(item.id,'rainfall');document.querySelector('#rainSelect').value=state.mapping.rain;const snapshot=workspaceObject();state.rainfallSemanticsOverrides.clear();await applyWorkspace(snapshot);});
  const restored=await page.evaluate(()=>{const item=[...state.files.values()].find(x=>x.displayName==='Audit-depth.R');return rainfallSemanticsFor(item,'rainfall');});
  assert.equal(restored,'intensity');
  // Repeated import/remove cycles exercise source lifecycle and stale totals.
  for(let n=0;n<3;n++){
    await page.setInputFiles('#fileInput',rain(`Audit-cycle-${n}.R`,'mm',1));
    await page.waitForFunction(name=>[...state.files.values()].some(x=>x.displayName===name&&x.status==='ready'),`Audit-cycle-${n}.R`);
    await page.evaluate(async name=>{const item=[...state.files.values()].find(x=>x.displayName===name);await removeSourceById(item.id);},`Audit-cycle-${n}.R`);
  }
  await page.waitForFunction(()=>window.__ICM_WORKBENCH__.lastCumulativeRainfall?.totals?.length===3);
  assert.deepEqual(errors,[]);privacy.assertClean();
  console.log('PASS rainfall audit: 12 mm encoding parity, event intensity/peak, exact window, invalid negatives, wheel, interpretation refresh/workspace restore, three import/remove cycles.');
}finally{await browser.close();}
