// Optional same-runner probe. Run baseline and candidate servers on 8001/8000.
// Synthetic survey content; local CDP counters and frame timings never enter app code.
import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import {installPrivacyGuard} from './privacy-network.mjs';
import {browserLaunchOptions,browserContextOptions} from './browser-environment.mjs';
const browser=await chromium.launch(browserLaunchOptions()),rows=[];
const targets=[['baseline','http://127.0.0.1:8001/'],['candidate','http://127.0.0.1:8000/']];
const metricMap=response=>Object.fromEntries(response.metrics.map(m=>[m.name,m.value]));
try{
 for(let round=0;round<3;round++)for(const [name,base] of round%2?[...targets].reverse():targets){
  const context=await browser.newContext({...browserContextOptions(),viewport:{width:1440,height:1000}}),page=await context.newPage();
  const privacy=installPrivacyGuard(context,base),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base,{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>Boolean(window.__ICM_PRECISION_WORKBENCH__));
  await page.evaluate(()=>{
    const wb=window.__ICM_WORKBENCH__,s=wb.survey,names=Array.from({length:24},(_,i)=>'FM'+String(i+1).padStart(2,'0'));
    const weeks=Array.from({length:12},(_,i)=>new Date(Date.UTC(2026,0,4+i*7)).toISOString().slice(0,10));
    s.association={records:names.map((monitor,i)=>({monitor,rain_gauge:'RG01',diameter_mm:600,upstream:i?[names[i-1]]:[]}))};
    s.batch={monitors:names.map(monitor=>({monitor,status:'complete',rain_gauge:'RG01',diameter_mm:600,weekly:{weeks:weeks.map(week_ending=>({week_ending,rag:'Green',decision_path:'Synthetic motion probe'}))},event_response:{rows:[]},contracts:{}})),network:{gauge_count:1,criteria:{},gauge_summary:[{gauge:'RG01',status:'Green'}],gauge_weekly:weeks.map(week_ending=>({gauge:'RG01',week_ending,rag:'Green'})),candidate_wapug_events:[],qualified_wapug_events:[]},volume_balance:{rows:[],summary:{}},analysis_controls:{}};
    s.batchSignature=wb.surveyDependencySignature('complete');wb.workflow26.render();window.__ICM_PRECISION_WORKBENCH__.navigate('survey','monthly-review',false);
  });
  await page.waitForTimeout(500);
  const session=await context.newCDPSession(page);await session.send('Performance.enable');await session.send('Emulation.setCPUThrottlingRate',{rate:4});
  const before=metricMap(await session.send('Performance.getMetrics'));
  const rendering=await page.evaluate(async()=>{
    let redraws=0;const observer=new MutationObserver(records=>redraws+=records.filter(r=>r.target.id==='surveyReviewReadiness').length);observer.observe(document.querySelector('#surveyReviewReadiness'),{childList:true});
    const start=performance.now();
    for(const id of ['completeSurveySummary','surveyBalanceSummary','surveyAssociationStatus'])document.getElementById(id).textContent='Synthetic probe notification';
    await new Promise(r=>setTimeout(r,400));observer.disconnect();
    return {redraws,elapsed:performance.now()-start,content:document.querySelector('#surveyMonthlyReviewBody').textContent};
  });
  const after=metricMap(await session.send('Performance.getMetrics'));
  await page.evaluate(()=>{window.motionFrames=[];let last;window.motionSampling=true;const tick=t=>{if(last)window.motionFrames.push(t-last);last=t;if(window.motionSampling)requestAnimationFrame(tick);};requestAnimationFrame(tick);});
  await session.send('Input.synthesizeScrollGesture',{x:1100,y:750,yDistance:-1500,speed:900,gestureSourceType:'mouse'});
  const frames=await page.evaluate(()=>{window.motionSampling=false;return window.motionFrames;});
  const sorted=[...frames].sort((a,b)=>a-b),p95=sorted[Math.floor(sorted.length*.95)]??null;
  const cost={};for(const key of ['TaskDuration','ScriptDuration','LayoutDuration','RecalcStyleDuration'])cost[key+'Ms']=(after[key]-before[key])*1000;
  rows.push({name,round,redraws:rendering.redraws,contentHash:crypto.createHash('sha256').update(rendering.content).digest('hex'),...cost,frames:frames.length,frameP95Ms:p95,framesAbove33ms:frames.filter(t=>t>33.4).length,scrollY:await page.evaluate(()=>scrollY)});
  assert.deepEqual(errors,[]);privacy.assertClean();await context.close();
 }
 assert.equal(new Set(rows.map(row=>row.contentHash)).size,1,'The displayed synthetic monthly evidence matches baseline');
 const result={environment:'Chromium 140 headless, 1440x1000, 4x CDP CPU throttle, 24 synthetic monitors /12 weeks, alternating fresh contexts, 3 repetitions; not physical-device FPS',rows};
 await fs.writeFile(process.env.ICM_MOTION_EVIDENCE||'/tmp/hydra-motion-profile.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
}finally{await browser.close();}
