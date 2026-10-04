import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import path from 'node:path';

const base=process.env.ICM_BASE_URL||'http://127.0.0.1:8000/';
const browser=await chromium.launch();
const context=await browser.newContext({viewport:{width:1440,height:1000}});
const page=await context.newPage();
const errors=[];
const pyodideRequests=[];
page.on('pageerror',error=>errors.push('pageerror: '+error.message));
page.on('console',message=>{
  if(message.type()==='error'&&!message.text().includes('favicon.ico'))errors.push('console: '+message.text());
});
page.on('request',request=>{
  if(request.url().includes('/vendor/pyodide-0.29.4/'))pyodideRequests.push(request.url());
});

try{
  const started=Date.now();
  await page.goto(base,{waitUntil:'domcontentloaded'});
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
  assert.equal(initial.deferred,true,'desktop cold start must defer the heavyweight Python runtime');
  assert.equal(initial.engineReadyAt,null,'authoritative engine must not be ready before a workflow needs it');
  assert.equal(pyodideRequests.length,0,'cold page open must not request Pyodide');
  assert.ok(shellReadyMs<5000,'desktop shell should become navigable within the 5 s local release budget');
  assert.match(initial.body,/Data \/ Time Series/);
  assert.match(initial.body,/Flow Survey/);
  assert.match(initial.body,/Detriment Assessment/);

  for(const [route,tab] of [['data','time-series'],['spills','spill-assessment'],['survey','fdv-check'],['detriment','flooding'],['graphs','scatter'],['reports','report-generation']]){
    await page.evaluate(([r,t])=>window.__ICM_PRECISION_WORKBENCH__.navigate(r,t,false),[route,tab]);
    assert.ok((await page.locator('body').innerText()).trim().length>100,'workspace shell should remain navigable before Python boot');
  }
  assert.equal(pyodideRequests.length,0,'navigation alone must not start Pyodide');

  const sample=path.join(process.cwd(),'reference/current-tool/sample-data/fdv/FM01.fdv');
  await page.setInputFiles('#fileInput',sample);
  await page.waitForFunction(
    ()=>['booting','ready'].includes(window.__ICM_WORKBENCH__?.status),
    null,{timeout:5000}
  );
  await page.waitForFunction(()=>performance.getEntriesByType('resource').some(e=>String(e.name).includes('/vendor/pyodide-0.29.4/')),null,{timeout:10000});
  assert.ok(pyodideRequests.length>0,'loading engineering data should start the authoritative runtime on demand');
  assert.deepEqual(errors,[]);
  console.log('PASS desktop cold start: shell ready in '+shellReadyMs+' ms with no Pyodide request before data load.');
} finally {
  await browser.close();
}
