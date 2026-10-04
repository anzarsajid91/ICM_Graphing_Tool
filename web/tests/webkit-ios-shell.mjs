import {webkit} from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

const base=process.env.ICM_BASE_URL||'http://127.0.0.1:8000/';
const evidence=process.env.ICM_EVIDENCE_DIR||'/tmp/icm-ios-webkit';
await fs.mkdir(evidence,{recursive:true});

const browser=await webkit.launch();
const context=await browser.newContext({
  viewport:{width:393,height:852},
  userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
  isMobile:true,
  hasTouch:true,
  deviceScaleFactor:3,
});
const page=await context.newPage();
const errors=[];
page.on('pageerror',error=>errors.push('pageerror: '+error.message));
page.on('console',message=>{if(message.type()==='error')errors.push('console: '+message.text());});

try{
  await page.goto(base,{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>Boolean(window.__ICM_PRECISION_WORKBENCH__?.navigate),null,{timeout:30000});
  await page.waitForTimeout(1200);

  const initial=await page.evaluate(()=>({
    title:document.title,
    status:window.__ICM_WORKBENCH__?.status,
    deferred:Boolean(window.__ICM_WORKBENCH__?.mobileDeferredEngine),
    body:document.body.innerText,
  }));
  assert.match(initial.title,/Hydra Bench/);
  assert.equal(initial.deferred,true,'iOS should defer the heavyweight Python runtime until data is actually needed');
  assert.equal(initial.status,'idle');
  assert.match(initial.body,/Data \/ Time Series/);
  assert.match(initial.body,/Flow Survey/);
  assert.match(initial.body,/Detriment Assessment/);

  for(const [route,tab] of [['data','time-series'],['spills','spill-assessment'],['survey','fdv-check'],['detriment','flooding'],['graphs','scatter'],['reports','report-generation']]){
    await page.evaluate(([r,t])=>window.__ICM_PRECISION_WORKBENCH__.navigate(r,t,false),[route,tab]);
    assert.ok((await page.locator('body').innerText()).trim().length>100,'Meaningful workspace content should render on iOS WebKit');
  }

  await page.screenshot({path:evidence+'/ios-shell.png',fullPage:false});
  assert.deepEqual(errors,[]);
  await fs.writeFile(evidence+'/result.json',JSON.stringify({initial,errors,url:await page.url()},null,2));
  console.log('PASS iOS WebKit shell: workbench opens before Pyodide boot and all primary workspaces navigate.');
} finally {
  await browser.close();
}
