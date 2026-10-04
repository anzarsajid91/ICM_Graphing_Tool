import {chromium} from 'playwright';
import {browserLaunchOptions, browserContextOptions} from './browser-environment.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const base=process.env.ICM_BASE_URL||'http://127.0.0.1:8000/';
const evidence=(process.env.ICM_EVIDENCE_DIR||'/tmp/icm-pr-evidence')+'/audit-release';
await fs.mkdir(evidence,{recursive:true});
const browser=await chromium.launch(browserLaunchOptions());
const context=await browser.newContext({...browserContextOptions(),viewport:{width:1440,height:1000}});
const remote=[],errors=[];
await context.route('**/*',route=>{
  const url=new URL(route.request().url());
  if(['http:','https:'].includes(url.protocol)&&url.origin!==new URL(base).origin){remote.push(url.href);return route.abort();}
  return route.continue();
});
const page=await context.newPage();
page.on('pageerror',error=>errors.push(error.message));
page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
try{
  await page.goto(base,{waitUntil:'domcontentloaded'});
  assert.match(await page.title(),/Hydra Bench/);
  await page.waitForFunction(()=>window.__ICM_WORKBENCH__?.status==='idle'&&window.__ICM_PRECISION_WORKBENCH__?.navigate,null,{timeout:30000});
  await page.setInputFiles('#fileInput',{name:'audit-hydraulic.csv',mimeType:'text/csv',buffer:Buffer.from('Time,Flow (m3/s)\n2025-01-01 00:00:00,0.02\n2025-01-01 00:05:00,0.03\n2025-01-01 00:10:00,0.04\n')});
  await page.waitForFunction(()=>[...state.files.values()].some(x=>x.displayName==='audit-hydraulic.csv'&&x.status==='ready'));
  const restored=await page.evaluate(async()=>{
    const item=[...state.files.values()].find(x=>x.displayName==='audit-hydraulic.csv');
    const before=item.hash,snapshot=workspaceObject();await applyWorkspace(snapshot);
    return {before,after:[...state.files.values()].find(x=>x.displayName==='audit-hydraulic.csv').hash};
  });
  assert.equal(restored.before,restored.after);assert.match(restored.before,/^[a-f0-9]{64}$/);
  for(const size of [{width:1440,height:1000},{width:1366,height:768},{width:780,height:900}]){
    await page.setViewportSize(size);
    for(const [route,tab] of [['data','time-series'],['spills','spill-assessment'],['survey','fdv-check'],['detriment','flooding'],['graphs','scatter'],['reports','report-generation']]){
      await page.evaluate(([r,t])=>window.__ICM_PRECISION_WORKBENCH__.navigate(r,t,false),[route,tab]);
      assert.equal(await page.locator('.pw-primary-nav').isVisible(),true);
      assert.equal(await page.locator('#pwSecondaryNav').isVisible(),true);
      assert.ok((await page.locator('body').innerText()).trim().length>100,'Meaningful content renders');
    }
    await page.evaluate(()=>window.__ICM_PRECISION_WORKBENCH__.navigate('survey','fdv-check',false));
    await page.screenshot({path:evidence+'/survey-'+size.width+'.png',fullPage:false});
  }
  assert.deepEqual(remote,[],'Core workflows must make no third-party requests');
  assert.deepEqual(errors,[]);
  await fs.writeFile(evidence+'/result.json',JSON.stringify({page:await page.url(),viewports:[1440,1366,780],restored,remote,errors},null,2));
  console.log('PASS audit release: CDN blocked, worker boot/import, source fingerprint restore, six workspaces and three viewports.');
}finally{await browser.close();}
