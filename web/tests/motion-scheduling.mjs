// Scheduling regressions use synthetic UI evidence and real Plotly charts.
import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {installPrivacyGuard} from './privacy-network.mjs';
import {browserLaunchOptions,browserContextOptions} from './browser-environment.mjs';
const base=process.env.ICM_BASE_URL||'http://127.0.0.1:8000/';
const browser=await chromium.launch(browserLaunchOptions());
const context=await browser.newContext({...browserContextOptions(),viewport:{width:1440,height:1000}});
const page=await context.newPage(),errors=[],privacy=installPrivacyGuard(context,base);
page.on('pageerror',error=>errors.push(error.message));
const settle=()=>page.waitForTimeout(450);
try{
  await page.goto(base,{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>Boolean(window.__ICM_PRECISION_WORKBENCH__));
  await page.evaluate(async()=>{
    const chart=document.querySelector('#timeChart');
    await Plotly.newPlot(chart,[{x:[0,1,2],y:[0,1,0]}],{autosize:true},{responsive:true});
  });
  await settle();
  // An overlay does not change chart geometry. It must not trigger Plotly work.
  await page.evaluate(()=>{
    window.__ICM_PRECISION_WORKBENCH__.setFocus(true);
  });
  await settle();
  await page.evaluate(()=>{
    window.motionCounts={resize:0};const resize=Plotly.Plots.resize;
    Plotly.Plots.resize=function(...args){window.motionCounts.resize++;return resize.apply(this,args);};
  });
  await page.click('#pwInspectorToggle');await settle();
  const overlayResize=await page.evaluate(()=>window.motionCounts.resize);
  console.log(JSON.stringify({overlayResize}));
  assert.equal(overlayResize,0,'Opening an overlay inspector must not resize unchanged charts');
  await page.click('#pwInspectorClose');await settle();
  assert.equal(await page.evaluate(()=>window.motionCounts.resize),0,'Closing an overlay must not resize unchanged charts');
  await page.evaluate(()=>window.__ICM_PRECISION_WORKBENCH__.setFocus(false));await settle();
  assert.ok(await page.evaluate(()=>{const c=document.querySelector('#timeChart');return Math.abs(c._fullLayout.width-c.clientWidth)<2;}),'Actual layout changes still resize the chart');
  assert.ok(await page.evaluate(()=>window.motionCounts.resize)>0,'A real chart width change invokes Plotly');
  await page.evaluate(()=>window.__ICM_PRECISION_WORKBENCH__.navigate('spills','assessment',false));await settle();
  await page.evaluate(()=>window.motionPill=document.querySelector('.pw-tab-indicator'));
  await page.click('#pwSecondaryNav [data-page="storage"]');
  assert.equal(await page.evaluate(()=>window.motionPill===document.querySelector('.pw-tab-indicator')),true,'Subtab selection preserves its indicator for uninterrupted motion');
  // Three source notifications in one task must produce one survey presentation.
  const renders=await page.evaluate(async()=>{
    let count=0;const observer=new MutationObserver(records=>count+=records.filter(r=>r.type==='childList'&&r.target.id==='surveyReviewReadiness').length);
    observer.observe(document.querySelector('#surveyReviewReadiness'),{childList:true});
    for(const id of ['completeSurveySummary','surveyBalanceSummary','surveyAssociationStatus'])document.getElementById(id).textContent='Synthetic scheduling notification';
    await new Promise(resolve=>setTimeout(resolve,250));observer.disconnect();return count;
  });
  console.log(JSON.stringify({surveyRenders:renders}));
  assert.equal(renders,1,'A burst of survey notifications produces one UI redraw');
  const freshness=await page.evaluate(()=>{
    const wb=window.__ICM_WORKBENCH__,s=wb.survey;
    s.batch={monitors:[{monitor:'FM01',status:'complete',weekly:{weeks:[{week_ending:'2026-09-06',rag:'Green'},{week_ending:'2026-09-13',rag:'Red'}]},event_response:{rows:[]},contracts:{}}],network:{gauge_count:0,criteria:{},gauge_summary:[],gauge_weekly:[],candidate_wapug_events:[],qualified_wapug_events:[]},volume_balance:{rows:[],summary:{}},analysis_controls:{}};
    s.batchSignature=wb.surveyDependencySignature('complete');
    const realFresh=wb.surveyFresh,calls=[];wb.surveyFresh=kind=>{calls.push(kind);return realFresh(kind);};
    try{
      wb.workflow26.render();const perRender=[...calls];
      const start=document.getElementById('analysisStart'),saved=start.value;start.value='2026-09-01T00:00';
      wb.workflow26.render();const stale=document.getElementById('surveyReviewReadiness').textContent.includes('Stale');
      let reviewBlocked=false;try{wb.workflow26.applyWeeklyReview('monitor-week','FM01',wb.workflow26.weekKey('FM01',s.batch.monitors[0].weekly.weeks[0]),'auto','Synthetic','QA');}catch(e){reviewBlocked=/Re-run/.test(e.message);}
      start.value=saved;wb.workflow26.render();return {perRender,stale,reviewBlocked,current:document.getElementById('surveyReviewReadiness').textContent.includes('Current')};
    }finally{wb.surveyFresh=realFresh;}
  });
  console.log(JSON.stringify({freshness}));
  assert.deepEqual(freshness.perRender,['complete','balance'],'Freshness is evaluated once per kind in a synchronous render');
  assert.equal(freshness.stale,true,'The next render detects changed controls');
  assert.equal(freshness.reviewBlocked,true,'Review actions independently reject stale calculations');
  assert.equal(freshness.current,true,'Restoring original controls restores current presentation');
  await page.evaluate(()=>window.__ICM_PRECISION_WORKBENCH__.navigate('data','time-series',false));await settle();
  assert.match(await page.title(),/Hydra Bench/);
  assert.ok((await page.locator('body').innerText()).length>100);
  await fs.mkdir('/tmp/hydra-motion-evidence',{recursive:true});
  await page.screenshot({path:'/tmp/hydra-motion-evidence/desktop.png'});
  await context.close();
  assert.deepEqual(errors,[]);privacy.assertClean();
  console.log('Motion scheduling, real width resize, stable selection and confidentiality passed.');
}finally{await browser.close();}
