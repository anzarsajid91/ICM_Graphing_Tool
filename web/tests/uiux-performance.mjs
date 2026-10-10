// Same-runner, alternating baseline/candidate measurements using repository synthetic fixtures.
import {chromium} from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {installPrivacyGuard} from './privacy-network.mjs';
const targets=[{name:'baseline',url:'http://127.0.0.1:8001/',sha:'dff8ff593e61dbfea142007b5ac32b0d66787f0a'},{name:'candidate',url:'http://127.0.0.1:8000/',sha:process.env.TARGET_SHA}];
const fixtures=['reference/current-tool/sample-data/fdv/FM7413.fdv','reference/current-tool/sample-data/other/CS2666_EDM.csv'];
const browser=await chromium.launch(),rows=[];
const paint=page=>page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(()=>r(performance.now())))));
try{
 for(let round=0;round<3;round++)for(const fixture of fixtures)for(const target of round%2?[...targets].reverse():targets){
  const context=await browser.newContext({viewport:{width:1440,height:1000}}),page=await context.newPage();
  const privacy=installPrivacyGuard(context,target.url,{buildToken:target.sha});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  try{
   const boot=Date.now();await page.goto(target.url,{waitUntil:'domcontentloaded'});
   await page.waitForFunction(()=>Boolean(window.__ICM_PRECISION_WORKBENCH__));await paint(page);
   const shellReadyMs=Date.now()-boot;
   assert.equal(await page.locator('meta[name="icm-build-sha"]').getAttribute('content'),target.sha);
   const selected=Date.now();await page.setInputFiles('#fileInput',fixture);
   await page.waitForFunction(()=>window.__ICM_WORKBENCH__?.lastGraphMode==='fastpath-preview'&&(document.querySelector('#timeChart')?.data||[]).some(t=>Array.isArray(t.y)&&t.y.some(Number.isFinite)),null,{timeout:60000});
   const firstUsefulGraphMs=Date.now()-selected;
   await page.waitForFunction(()=>window.__ICM_WORKBENCH__?.status==='ready'&&window.__ICM_WORKBENCH__?.fastpath?.last?.status==='ready',null,{timeout:120000});
   const authoritativeReadyMs=Date.now()-selected;
   assert.equal(await page.evaluate(()=>window.__ICM_WORKBENCH__.fastpath.last.reconciliation?.status),'matched');
   const routes=[];
   for(const [workspace,tab] of [['spills','assessment'],['graphs','comparison'],['survey','fdv-check'],['reports','workspace'],['data','time-series']]){
    const start=await page.evaluate(()=>performance.now());await page.evaluate(([w,p])=>window.__ICM_PRECISION_WORKBENCH__.navigate(w,p,false),[workspace,tab]);routes.push({route:workspace+'/'+tab,ms:(await paint(page))-start});
   }
   await page.waitForFunction(()=>window.__ICM_WORKBENCH__.lastGraphMode!=='fastpath-preview',null,{timeout:60000});
   const range=await page.evaluate(()=>{const x=document.querySelector('#timeChart').data.find(t=>t.x?.length&&t.y?.some(Number.isFinite)).x;return [x[0],new Date(Date.parse(x[0])+7200000).toISOString().slice(0,19)];});
   const zoomStart=Date.now();await page.evaluate(range=>Plotly.relayout('timeChart',{'xaxis.range[0]':range[0],'xaxis.range[1]':range[1]}),range);
   await page.waitForFunction(()=>window.__ICM_WORKBENCH__.lastGraphPointCounts?.observed?.native===true,null,{timeout:60000});
   const nativeZoomMs=Date.now()-zoomStart;
   const traces=await page.evaluate(()=>document.querySelector('#timeChart').data.filter(t=>t.x&&t.y).map(t=>({x:t.x,y:t.y,unit:t.name})));
   const nativeHash=crypto.createHash('sha256').update(JSON.stringify(traces)).digest('hex');
   const heapBytes=await page.evaluate(()=>performance.memory?.usedJSHeapSize??null);
   const collapsed=await page.locator('.pw-rail').evaluate(el=>el.getBoundingClientRect().width);
   const focusStart=Date.now();await page.locator('#pwFocusToggle').click();await paint(page);
   const focusToPaintMs=Date.now()-focusStart;
   await page.waitForFunction(()=>{const chart=document.querySelector('#timeChart');return chart?._fullLayout&&Math.abs(chart._fullLayout.width-chart.clientWidth)<2;},null,{timeout:10000});
   const focusChartResizeMs=Date.now()-focusStart;
   assert.ok(await page.locator('.pw-rail').evaluate(el=>el.getBoundingClientRect().width)<collapsed);
   assert.deepEqual(errors,[]);privacy.assertClean();
   rows.push({target:target.name,sha:target.sha,round,fixture,bytes:(await fs.stat(fixture)).size,shellReadyMs,firstUsefulGraphMs,authoritativeReadyMs,routes,nativeZoomMs,nativeHash,heapBytes,focusToPaintMs,focusChartResizeMs});
  }finally{await context.close();}
 }
 for(const fixture of fixtures){const values=rows.filter(r=>r.fixture===fixture);assert.equal(new Set(values.map(r=>r.nativeHash)).size,1,'Native-resolution x/y values and units must match baseline for '+fixture);}
 const out=process.env.ICM_UIUX_EVIDENCE||'/tmp/hydra-uiux-performance';await fs.mkdir(out,{recursive:true});
 await fs.writeFile(path.join(out,'comparison.json'),JSON.stringify({schema:1,environment:'one Ubuntu CI runner; Chromium 140; alternating cold contexts; 1440×1000; 3 repetitions per source/target',rows},null,2));
 console.log('Same-runner UIUX performance and native graph equivalence captured.');
}finally{await browser.close();}
