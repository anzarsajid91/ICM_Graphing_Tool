// Isolated synthetic attempts, intercepted before transport; never application data.
import {chromium} from 'playwright';
import {browserLaunchOptions,browserContextOptions} from './browser-environment.mjs';
import {installPrivacyGuard} from './privacy-network.mjs';
import assert from 'node:assert/strict';
const base=process.env.ICM_BASE_URL||'http://127.0.0.1:8000/';
const browser=await chromium.launch(browserLaunchOptions());
try{
 for(const kind of ['query','post','beacon','external']){
  const context=await browser.newContext(browserContextOptions());
  const guard=installPrivacyGuard(context,base),page=await context.newPage();
  await guard.navigate(page,base,{waitUntil:'domcontentloaded'});guard.assertClean();
  await context.route('**/*',route=>route.abort());
  const attempted=context.waitForEvent('request');
  await page.evaluate(({base,kind})=>{
   const fixed=new URL('assets/runtime.js',base).href;
   if(kind==='beacon'){navigator.sendBeacon(fixed,'SYNTHETIC_CANARY');return;}
   const url=kind==='external'?'https://collector.invalid/synthetic':kind==='query'?fixed+'?filename=SYNTHETIC_CANARY':fixed;
   void fetch(url,kind==='post'?{method:'POST',body:'SYNTHETIC_CANARY'}:{}).catch(()=>{});
  },{base,kind});
  await attempted;
  assert.throws(()=>guard.assertClean(),/Data-confidentiality network violations/,kind+' must be detected');
  await context.close();
 }
 console.log('PASS four intercepted browser probes: query, body, beacon and external destination.');
}finally{await browser.close();}
