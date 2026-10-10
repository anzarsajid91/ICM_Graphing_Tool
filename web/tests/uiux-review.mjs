// Synthetic/no-data review harness. Never part of the deployed application.
import {chromium} from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';
import {installPrivacyGuard} from './privacy-network.mjs';
const base=process.env.ICM_BASE_URL||'http://127.0.0.1:8000/';
const out=process.env.ICM_UIUX_EVIDENCE||'/tmp/hydra-uiux';
await fs.mkdir(out,{recursive:true});
const browser=await chromium.launch();
const context=await browser.newContext({viewport:{width:1440,height:1000},acceptDownloads:true});
const privacy=installPrivacyGuard(context,base);
const page=await context.newPage(),errors=[],inventory=[],timings=[];
page.on('pageerror',e=>errors.push(e.message));
const routes=[['data','time-series'],['spills','assessment'],['spills','storage'],['spills','network'],['survey','fdv-check'],['survey','rainfall-check'],['survey','volume-balance'],['survey','monthly-review'],['detriment','flooding'],['detriment','level'],['detriment','spill'],['graphs','comparison'],['graphs','rating'],['graphs','dwf'],['reports','report-generation'],['reports','workspace'],['about','overview']];
try{
  for(let run=0;run<3;run++){
    await page.goto(base,{waitUntil:'domcontentloaded'});
    await page.waitForFunction(()=>Boolean(window.__ICM_PRECISION_WORKBENCH__?.navigate));
    timings.push(await page.evaluate(()=>({type:'boot',navigation:performance.getEntriesByType('navigation')[0].toJSON(),apiReadyFromNavigationMs:performance.now(),paints:performance.getEntriesByType('paint').map(x=>({name:x.name,startTime:x.startTime})),heap:performance.memory?.usedJSHeapSize})));
  }
  for(const [w,p] of routes){
    const start=await page.evaluate(()=>performance.now());
    await page.evaluate(([w,p])=>window.__ICM_PRECISION_WORKBENCH__.navigate(w,p,false),[w,p]);
    if(w==='spills'&&p==='network')await page.waitForSelector('#nsSvg');
    await page.waitForFunction(([w,p])=>{const r=window.__ICM_PRECISION_WORKBENCH__.route();return r.workspace===w&&r.page===p&&Boolean(document.querySelector('.pw-route-visible'));},[w,p]);
    const painted=await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(()=>r(performance.now())))));
    timings.push({type:'route_to_next_paint',route:w+'/'+p,elapsedMs:painted-start});
    await page.evaluate(()=>window.scrollTo(0,0));
    inventory.push(...await page.evaluate(route=>[...document.querySelectorAll('button,input,select,textarea,summary,[role="button"],[role="dialog"],dialog,a[href],.chart,.table-wrap')].map((el,index)=>({route,tag:el.tagName,id:el.id,classes:el.className?.baseVal??el.className,label:el.getAttribute('aria-label')||el.labels?.[0]?.textContent?.trim()||el.textContent?.trim().slice(0,120)||el.title,type:el.getAttribute('type'),attributes:[...el.attributes].filter(a=>a.name.startsWith('data-')).map(a=>[a.name,a.value]),visible:Boolean(el.getClientRects().length)&&getComputedStyle(el).visibility!=='hidden'&&!el.closest('[hidden],[inert]'),state:'empty',disabled:Boolean(el.disabled),index})),w+'/'+p));
    await page.screenshot({path:path.join(out,w+'-'+p+'-empty.png'),fullPage:true});
  }
  for(const width of [1920,1440,1280,1024,768,390]){
    await page.setViewportSize({width,height:1000});
    for(const [w,p] of routes){
      await page.evaluate(([w,p])=>window.__ICM_PRECISION_WORKBENCH__.navigate(w,p,false),[w,p]);
      await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
      await page.screenshot({path:path.join(out,w+'-'+p+'-'+width+'.png')});
    }
  }
  await fs.writeFile(path.join(out,'revision.json'),JSON.stringify(await page.evaluate(()=>({build:document.querySelector('meta[name="icm-build-sha"]')?.content,version:document.querySelector('#appVersion')?.textContent})),null,2));
  await fs.writeFile(path.join(out,'inventory.json'),JSON.stringify(inventory,null,2));
  await fs.writeFile(path.join(out,'performance.json'),JSON.stringify(timings,null,2));
  await fs.writeFile(path.join(out,'errors.json'),JSON.stringify(errors,null,2));
  privacy.assertClean();
  if(errors.length)throw new Error(JSON.stringify(errors));
  console.log('UIUX route inventory/screenshots: 17 routes, 6 widths; privacy clean');
}finally{await context.close();await browser.close();}
