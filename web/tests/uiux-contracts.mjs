// Synthetic/no-data presentation contracts; full engineering journeys remain in existing smoke suites.
import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {installPrivacyGuard} from './privacy-network.mjs';
const base=process.env.ICM_BASE_URL||'http://127.0.0.1:8000/';
const browser=await chromium.launch(),context=await browser.newContext({viewport:{width:1440,height:1000}});
const privacy=installPrivacyGuard(context,base),page=await context.newPage(),errors=[];
page.on('pageerror',e=>errors.push(e.message));
const painted=()=>page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
try{
 await page.goto(base,{waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>Boolean(window.__ICM_PRECISION_WORKBENCH__));
 const fonts=await page.evaluate(async()=>{const loaded=[];for(const weight of [400,500,600]){const faces=await document.fonts.load(weight+' 14px Inter','Hydra Bench 0123456789');loaded.push(faces.some(f=>f.family.replaceAll('"','')==='Inter'&&f.status==='loaded'));}return {loaded,family:getComputedStyle(document.body).fontFamily,numeric:getComputedStyle(document.body).fontVariantNumeric};});
 assert.deepEqual(fonts.loaded,[true,true,true],'Bundled Inter loaded at all three weights');assert.match(fonts.family,/Inter/);assert.equal(fonts.numeric,'tabular-nums');
 await page.evaluate(()=>window.HydraDesign.prepareReportFont());
 const offline=await context.newPage();await context.setOffline(true);
 try{await offline.setContent(await page.evaluate(()=>reportShell('Synthetic font export','Offline typography','<p>0123456789 · hydraulic units</p>')));assert.equal(await offline.evaluate(async()=>{await document.fonts.load('400 14px Inter');return [...document.fonts].some(f=>f.family==='Inter'&&f.status==='loaded');}),true,'Portable local report retains Inter offline');}finally{await context.setOffline(false);await offline.close();}
 assert.equal(await page.locator('#scatterChart').evaluate(el=>getComputedStyle(el,'::before').content),'none','Plot instructions are absent from Data');
 await page.evaluate(()=>window.__ICM_PRECISION_WORKBENCH__.navigate('graphs','comparison',false));
 assert.match(await page.locator('#scatterChart').evaluate(el=>getComputedStyle(el,'::before').content),/Assign observed/,'Empty comparison explains its next action');
 await page.evaluate(()=>window.__ICM_PRECISION_WORKBENCH__.navigate('data','time-series',false));
 await page.evaluate(()=>window.__ICM_PRECISION_WORKBENCH__.navigate('reports','report-generation',false));
 for(const [id,name] of [['reportIncludeTimeSeries','Full-period time series'],['reportIncludeSpillsStorage','Spills & storage'],['reportIncludeComparison','Comparison diagnostics'],['reportIncludeSurvey','Flow-survey evidence']]){
  const control=page.getByRole('checkbox',{name,exact:true});assert.equal(await control.count(),1);assert.equal(await control.getAttribute('id'),id);
 }
 await page.evaluate(()=>window.__ICM_PRECISION_WORKBENCH__.navigate('reports','workspace',false));
 assert.equal(await page.getByRole('combobox',{name:'Saved workspace',exact:true}).getAttribute('id'),'namedWorkspaceSelect');
 await page.evaluate(()=>window.__ICM_PRECISION_WORKBENCH__.navigate('data','time-series',false));
 const toggle=page.locator('#pwInspectorToggle');
 assert.equal(await toggle.getAttribute('aria-controls'),'pwInspector');
 assert.equal(await toggle.getAttribute('aria-expanded'),'true');
 await page.locator('#pwInspectorClose').click();
 assert.equal(await toggle.getAttribute('aria-expanded'),'false');
 assert.equal(await page.locator('#pwInspector').evaluate(el=>el.inert),true);
 assert.equal(await toggle.evaluate(el=>document.activeElement===el),true);
 await toggle.click();assert.equal(await toggle.getAttribute('aria-expanded'),'true');
 await page.setViewportSize({width:1024,height:1000});await painted();
 // An already open docked inspector stays open when it becomes an overlay.
 assert.equal(await toggle.getAttribute('aria-expanded'),'true');
 await page.locator('#pwInspectorClose').press('Escape');
 assert.equal(await toggle.getAttribute('aria-expanded'),'false');
 await toggle.click();assert.equal(await page.locator('#pwInspectorClose').evaluate(el=>document.activeElement===el),true);
 await page.locator('#pwInspectorClose').press('Escape');
 assert.equal(await toggle.getAttribute('aria-expanded'),'false');
 assert.equal(await toggle.evaluate(el=>document.activeElement===el),true);
 await page.setViewportSize({width:390,height:900});await painted();
 await page.locator('#pwRailToggle').click();
 assert.equal(await page.locator('#pwNavigation').evaluate(el=>el.inert),false);
 await page.locator('.pw-primary-nav button[data-workspace="survey"]').click();
 assert.equal(await page.locator('#pwNavigation').evaluate(el=>el.inert),true);
 assert.equal(await page.locator('#pwSecondaryNav button[aria-current="page"]').evaluate(el=>document.activeElement===el),true);
 const tabs=page.locator('#pwSecondaryNav');
 await tabs.locator('button[aria-current="page"]').press('ArrowRight');await painted();
 assert.equal(await page.evaluate(()=>window.__ICM_PRECISION_WORKBENCH__.route().page),'rainfall-check');
 assert.equal(await tabs.locator('button[aria-current="page"]').evaluate(el=>document.activeElement===el),true);
 const alignment=await page.evaluate(()=>{const active=document.querySelector('#pwSecondaryNav button[aria-current="page"]'),pill=document.querySelector('.pw-tab-indicator');return {left:active.offsetLeft,pillLeft:parseFloat(pill.style.left),width:active.offsetWidth,pillWidth:parseFloat(pill.style.width)};});
 assert.equal(alignment.left,alignment.pillLeft);assert.equal(alignment.width,alignment.pillWidth);
 await page.emulateMedia({reducedMotion:'reduce'});
 await tabs.locator('button[data-page="monthly-review"]').click();await painted();
 assert.equal(await page.locator('.pw-tab-indicator').evaluate(el=>el.getAnimations().length),0);
 // Contrast of centrally governed text/control/focus tokens against actual surfaces.
 const tokenColours=await page.evaluate(()=>{const s=getComputedStyle(document.documentElement);return Object.fromEntries(['text','muted','control-border','focus','surface','soft'].map(x=>[x,s.getPropertyValue('--hb-'+x).trim()]));});
 const luminance=hex=>{const v=hex.replace('#','').match(/../g).map(x=>parseInt(x,16)/255).map(x=>x<=.04045?x/12.92:((x+.055)/1.055)**2.4);return .2126*v[0]+.7152*v[1]+.0722*v[2];};
 const contrast=(a,b)=>{const x=luminance(a),y=luminance(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);};
 for(const surface of ['surface','soft']){assert.ok(contrast(tokenColours.text,tokenColours[surface])>=4.5);assert.ok(contrast(tokenColours.muted,tokenColours[surface])>=4.5);assert.ok(contrast(tokenColours['control-border'],tokenColours[surface])>=3);assert.ok(contrast(tokenColours.focus,tokenColours[surface])>=3);}
 assert.deepEqual(errors,[]);privacy.assertClean();
 console.log('UIUX contracts passed: inspector, mobile focus, keyboard pill, reduced motion, governed token contrast.');
}finally{await browser.close();}
