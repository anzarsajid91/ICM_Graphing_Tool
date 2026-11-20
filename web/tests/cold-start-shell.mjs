import { chromium, firefox } from 'playwright';
import assert from 'node:assert/strict';
import path from 'node:path';
import { installPrivacyGuard } from './privacy-network.mjs';

const base=process.env.ICM_BASE_URL||'http://127.0.0.1:8000/';
const browser=await (process.env.ICM_BROWSER==='firefox'?firefox:chromium).launch();
const context=await browser.newContext({viewport:{width:1440,height:1000}});
const privacy=installPrivacyGuard(context,base);
const page=await context.newPage();
const errors=[];
const pyodideRequests=[];
const vendorRequests=[];
page.on('pageerror',error=>errors.push('pageerror: '+error.message));
page.on('console',message=>{
  if(message.type()==='error'&&!message.text().includes('favicon.ico'))errors.push('console: '+message.text());
});
page.on('request',request=>{
  if(request.url().includes('/vendor/pyodide-0.29.4/'))pyodideRequests.push(request.url());
  if(/\/(plotly\.min|xlsx\.full\.min)\.js(?:\?|$)/.test(request.url()))vendorRequests.push(request.url());
});

try{
  let releaseShell;
  const shellGate=new Promise(resolve=>{releaseShell=resolve;});
  await page.route('**/assets/precision-workbench.js*',async route=>{await shellGate;await route.continue();});
  const started=Date.now();
  await privacy.navigate(page,base,{waitUntil:'commit'});
  try{
    await page.locator('#hbStartup [role="status"]').waitFor({state:'visible'});
    assert.equal(await page.locator('.source-panel').isVisible(),false,'legacy layout must stay hidden during startup');
    assert.deepEqual(vendorRequests,[],'inactive libraries must not start during shell loading');
  }finally{releaseShell();}
  await page.waitForFunction(
    ()=>Boolean(window.__ICM_PRECISION_WORKBENCH__?.navigate)&&window.__ICM_WORKBENCH__?.status==='idle',
    null,{timeout:5000}
  );
  const shellReadyMs=Date.now()-started;
  const initial=await page.evaluate(()=>({
    status:window.__ICM_WORKBENCH__?.status,
    deferred:Boolean(window.__ICM_WORKBENCH__?.deferredEngine),
    engineReadyAt:window.__ICM_WORKBENCH__?.engineReadyAt||null,
    body:document.body.innerText,
  }));
  assert.equal(initial.status,'idle');
  const version=await page.locator('#appVersion').textContent();
  assert.match(version,/^v(?:\d+\.\d{3}(?:-preview)?|2\.\d+\.\d+(?:-rc\.\d+|-preview)?)$/);
  assert.match(await page.locator('footer').innerText(),/Anzar Sajid/);
  assert.equal(initial.deferred,true,'desktop cold start must defer the heavyweight Python runtime');
  assert.equal(initial.engineReadyAt,null,'authoritative engine must not be ready before a workflow needs it');
  assert.equal(pyodideRequests.length,0,'cold page open must not request Pyodide');
  assert.equal(await page.locator('#hbStartup').isVisible(),false);
  assert.ok(shellReadyMs<5000,'desktop shell should become navigable within the 5 s local release budget');
  assert.match(initial.body,/Data \/ time series/);
  assert.match(initial.body,/Flow survey/);
  assert.match(initial.body,/Detriment assessment/);

  for(const [route,tab] of [['data','time-series'],['spills','spill-assessment'],['survey','fdv-check'],['detriment','flooding'],['graphs','scatter'],['reports','report-generation']]){
    await page.evaluate(([r,t])=>window.__ICM_PRECISION_WORKBENCH__.navigate(r,t,false),[route,tab]);
    assert.ok((await page.locator('body').innerText()).trim().length>100,'workspace shell should remain navigable before Python boot');
  }
  assert.equal(pyodideRequests.length,0,'navigation alone must not start Pyodide');
  assert.deepEqual(vendorRequests,[],'navigation alone must not load chart or Excel libraries');

  const sample=path.join(process.cwd(),'reference/current-tool/sample-data/fdv/FM7413.fdv');
  await Promise.all([
    page.waitForRequest(request=>request.url().includes('/vendor/pyodide-0.29.4/'),{timeout:60000}),
    page.setInputFiles('#fileInput',sample),
  ]);
  assert.ok(['booting','ready'].includes(await page.evaluate(()=>window.__ICM_WORKBENCH__?.status)));
  assert.equal(vendorRequests.filter(url=>url.includes('/plotly-')).length,1,'first chart should load the pinned chart library once');
  assert.equal(vendorRequests.some(url=>url.includes('/sheetjs-')),false);
  assert.ok(pyodideRequests.length>0,'loading engineering data should start the authoritative runtime on demand');
  assert.deepEqual(errors,[]);
  privacy.assertClean();
  console.log('PASS desktop cold start: shell ready in '+shellReadyMs+' ms with no Pyodide request before data load.');

  await page.close();
  const retryPage=await context.newPage();
  let plotlyAttempts=0;
  await retryPage.route('**/vendor/plotly-*/plotly.min.js*',route=>{
    plotlyAttempts++;
    return plotlyAttempts===1?route.abort():route.continue();
  });
  await privacy.navigate(retryPage,base+'#/data/time-series');
  await retryPage.setInputFiles('#fileInput',sample);
  await retryPage.waitForFunction(
    ()=>window.__ICM_WORKBENCH__?.stateSummary().readyFiles===1&&
      Boolean(document.getElementById('timeChart')?.data?.length),
    null,{timeout:120000}
  );
  assert.equal(plotlyAttempts,2,'an interrupted first chart download must allow an authoritative chart retry');
  privacy.assertClean();
  console.log('PASS authoritative FDV import and chart after a failed first chart-library request.');
} finally {
  await browser.close();
}
