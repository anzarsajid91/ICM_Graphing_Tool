import {writeEvidence} from './evidence-output.mjs';
// Synthetic/no-data review harness. Never part of the deployed application.
import {chromium,firefox} from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {installPrivacyGuard} from './privacy-network.mjs';
import {browserContextOptions,browserLaunchOptions} from './browser-environment.mjs';
const base=process.env.ICM_BASE_URL||'http://127.0.0.1:8000/';
const out=process.env.ICM_UIUX_EVIDENCE||'/tmp/hydra-uiux';
await fs.mkdir(out,{recursive:true});
const browserName=process.env.ICM_BROWSER||'chromium';
const browser=await (browserName==='firefox'?firefox:chromium).launch(browserLaunchOptions());
const context=await browser.newContext({...browserContextOptions(),viewport:{width:1440,height:1000},acceptDownloads:true});
const privacy=installPrivacyGuard(context,base);
const page=await context.newPage(),errors=[],inventory=[],timings=[],disclosures=[],navigation=[];
page.on('pageerror',e=>errors.push(e.message));
const widths=[1920,1440,1280,1024];
try{
  for(let run=0;run<3;run++){
    await page.goto(base,{waitUntil:'domcontentloaded'});
    await page.waitForFunction(()=>Boolean(window.__ICM_PRECISION_WORKBENCH__?.navigate));
    timings.push(await page.evaluate(()=>({type:'boot',navigation:performance.getEntriesByType('navigation')[0].toJSON(),apiReadyFromNavigationMs:performance.now(),paints:performance.getEntriesByType('paint').map(x=>({name:x.name,startTime:x.startTime})),heap:performance.memory?.usedJSHeapSize})));
  }
  const routes=await page.evaluate(()=>Object.entries(window.__ICM_PRECISION_WORKBENCH__.routes)
    .flatMap(([workspace,route])=>Object.keys(route.pages).map(view=>[workspace,view])));
  const workspaces=[...new Set(routes.map(([workspace])=>workspace))];
  for(const [workspace,view] of routes){
    for(const target of workspaces){
      await page.evaluate(([w,p])=>window.__ICM_PRECISION_WORKBENCH__.navigate(w,p,false),[workspace,view]);
      const button=page.locator('.pw-primary-nav button[data-workspace="'+target+'"],.pw-about-nav button[data-workspace="'+target+'"]');
      await button.click();
      await page.waitForFunction(w=>window.__ICM_PRECISION_WORKBENCH__.route().workspace===w,target);
      assert.equal(await button.getAttribute('aria-current'),'page');
      const result=await page.evaluate(()=>window.__ICM_PRECISION_WORKBENCH__.route());
      const surface=page.locator('.pw-route-visible');
      assert.ok(await surface.count()>0,'Navigation exposes a page surface');
      assert.ok(await surface.first().isVisible(),'Selected workspace surface is visible');
      navigation.push({from:workspace+'/'+view,target,result,expected:'workspace selected, active navigation marked, page surface visible',status:'PASS',browser:browserName});
    }
  }
  for(const [w,p] of routes){
    const start=await page.evaluate(()=>performance.now());
    await page.evaluate(([w,p])=>window.__ICM_PRECISION_WORKBENCH__.navigate(w,p,false),[w,p]);
    if(w==='network'&&p==='schematic')await page.waitForSelector('#nsSvg');
    await page.waitForFunction(([w,p])=>{const r=window.__ICM_PRECISION_WORKBENCH__.route();return r.workspace===w&&r.page===p&&Boolean(document.querySelector('.pw-route-visible'));},[w,p]);
    const painted=await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(()=>r(performance.now())))));
    timings.push({type:'route_to_next_paint',route:w+'/'+p,elapsedMs:painted-start});
    await page.evaluate(()=>window.scrollTo(0,0));
    inventory.push(...await page.evaluate(route=>[...document.querySelectorAll('button,input,select,textarea,summary,[role="button"],[role="dialog"],dialog,a[href],.chart,.table-wrap')].map((el,index)=>({route,tag:el.tagName,id:el.id,classes:el.className?.baseVal??el.className,label:el.getAttribute('aria-label')||el.labels?.[0]?.textContent?.trim()||el.textContent?.trim().slice(0,120)||el.title,type:el.getAttribute('type'),role:el.getAttribute('role'),expanded:el.getAttribute('aria-expanded'),current:el.getAttribute('aria-current'),attributes:[...el.attributes].filter(a=>a.name.startsWith('data-')).map(a=>[a.name,a.value]),visible:Boolean(el.getClientRects().length)&&getComputedStyle(el).visibility!=='hidden'&&!el.closest('[hidden],[inert]'),state:'empty',disabled:Boolean(el.disabled),index})),w+'/'+p));
    await page.screenshot({path:path.join(out,w+'-'+p+'-empty.png'),fullPage:true});
    for(const summary of await page.locator('details > summary:visible').all()){
      if(await summary.evaluate(el=>Boolean(el.closest('[hidden],[inert]'))))continue;
      const label=(await summary.innerText()).trim(),route=w+'/'+p;
      const readOpen=()=>summary.evaluate(el=>el.parentElement.open);
      const initial=await readOpen();
      await summary.press('Enter');
      assert.equal(await readOpen(),!initial,`${route} / ${label} opens or closes with Enter`);
      await summary.press('Space');
      assert.equal(await readOpen(),initial,`${route} / ${label} restores its state with Space`);
      disclosures.push({route,label,initial,expected:'Enter toggles, Space restores',result:'passed',browser:browserName,viewport:page.viewportSize()});
    }
  }
  for(const width of widths){
    await page.setViewportSize({width,height:1000});
    for(const [w,p] of routes){
      await page.evaluate(([w,p])=>window.__ICM_PRECISION_WORKBENCH__.navigate(w,p,false),[w,p]);
      await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
      await page.screenshot({path:path.join(out,w+'-'+p+'-'+width+'.png')});
    }
  }
  await writeEvidence(path.join(out,'revision.json'),JSON.stringify(await page.evaluate(()=>({build:document.querySelector('meta[name="icm-build-sha"]')?.content,version:document.querySelector('#appVersion')?.textContent})),null,2));
  await writeEvidence(path.join(out,'inventory.json'),JSON.stringify(inventory,null,2));
  await writeEvidence(path.join(out,'disclosures.json'),JSON.stringify(disclosures,null,2));
  await writeEvidence(path.join(out,'navigation.json'),JSON.stringify(navigation,null,2));
  await writeEvidence(path.join(out,'performance.json'),JSON.stringify(timings,null,2));
  await writeEvidence(path.join(out,'errors.json'),JSON.stringify(errors,null,2));
  privacy.assertClean();
  if(errors.length)throw new Error(JSON.stringify(errors));
  console.log(`UIUX route inventory/screenshots: ${routes.length} routes, ${widths.length} desktop widths in ${browserName}; privacy clean`);
}finally{await context.close();await browser.close();}
