// Browser regressions for route scroll memory, the shared HB toggle, and both
// schematic cameras. Synthetic survey results isolate UI behaviour from engines.
import {chromium,firefox} from 'playwright';
import {browserLaunchOptions,browserContextOptions} from './browser-environment.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const base=process.env.ICM_BASE_URL||'http://127.0.0.1:8000/';
const browserName=process.env.ICM_BROWSER||'chromium';
const browser=await (browserName==='firefox'?firefox:chromium).launch(browserLaunchOptions());
const context=await browser.newContext({...browserContextOptions(),viewport:{width:1440,height:1000}});
const page=await context.newPage(),errors=[],evidence={browser:browserName,scroll:[],zoom:[],navigation:[]};
page.on('pageerror',error=>errors.push(error.message));
page.on('console',message=>{if(message.type()==='error'&&!message.text().includes('favicon.ico'))errors.push(message.text());});
const settle=()=>page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
const navigate=async(workspace,tab,push=false)=>{await page.evaluate(([w,t,p])=>window.__ICM_PRECISION_WORKBENCH__.navigate(w,t,p),[workspace,tab,push]);await settle();};
try{
  await page.goto(base,{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.__ICM_PRECISION_WORKBENCH__?.navigate&&window.__ICM_WORKBENCH__?.workflow26,null,{timeout:30000});
  assert.match(await page.title(),/Hydra Bench/);
  assert((await page.locator('body').innerText()).length>100);
  // Give every route sufficient height to distinguish independent positions.
  // The navigation and actual document scroller are used without mocking them.
  await page.evaluate(()=>document.querySelector('main.shell').style.minHeight='3600px');
  const routes=await page.evaluate(()=>Object.entries(window.__ICM_PRECISION_WORKBENCH__.routes).flatMap(([w,s])=>Object.keys(s.pages).map(t=>[w,t])));
  for(const [index,[workspace,tab]] of routes.entries()){
    await navigate(workspace,tab);
    assert(Math.abs(await page.evaluate(()=>scrollY))<2,'First visit starts at the top: '+workspace+'/'+tab);
    const y=170+index*45;
    await page.evaluate(y=>window.scrollTo({top:y,behavior:'instant'}),y);await settle();
    evidence.scroll.push({workspace,tab,y});
  }
  for(const row of [...evidence.scroll].reverse()){
    await navigate(row.workspace,row.tab);
    assert(Math.abs(await page.evaluate(()=>scrollY)-row.y)<2,'Independent position restores: '+row.workspace+'/'+row.tab);
  }
  await navigate('data','time-series',true);
  await page.evaluate(()=>window.scrollTo({top:420,behavior:'instant'}));
  await navigate('spills','assessment',true);
  await page.evaluate(()=>window.scrollTo({top:710,behavior:'instant'}));
  await page.goBack();await page.waitForFunction(()=>window.__ICM_PRECISION_WORKBENCH__.route().workspace==='data'&&Math.abs(scrollY-420)<2);
  await page.goForward();await page.waitForFunction(()=>window.__ICM_PRECISION_WORKBENCH__.route().workspace==='spills'&&Math.abs(scrollY-710)<2);
  // Late content must not permanently clamp a remembered route offset.
  await navigate('about','overview');
  await page.evaluate(()=>{document.querySelector('main.shell').style.minHeight='';document.querySelector('#tab-spills').style.height='200px';document.querySelector('#tab-spills').style.overflow='hidden';});
  await page.evaluate(()=>{
    window.__ICM_PRECISION_WORKBENCH__.navigate('spills','assessment',false);
    setTimeout(()=>{document.querySelector('main.shell').style.minHeight='3600px';document.querySelector('#tab-spills').style.height='';document.querySelector('#tab-spills').style.overflow='';},80);
  });
  await page.waitForFunction(()=>Math.abs(scrollY-710)<2);
  await page.evaluate(()=>window.scrollTo({top:0,behavior:'instant'}));
  const width=()=>page.locator('.pw-rail').evaluate(el=>el.getBoundingClientRect().width);
  for(const size of [1440,780]){
    await page.setViewportSize({width:size,height:1000});await settle();
    for(const [workspace,tab] of routes){
      await navigate(workspace,tab);
      await page.evaluate(()=>window.scrollTo({top:0,behavior:'instant'}));
      const before=await width();
      await page.click('#pwBrandToggle');await settle();
      const after=await width();
      assert((before<100&&after>180)||(before>180&&after<100),'HB toggles actual rail width on '+workspace+'/'+tab+' at '+size);
      assert.equal(await page.locator('#pwBrandToggle').getAttribute('aria-expanded'),String(after>100));
      await page.click('#pwBrandToggle');await settle();
      evidence.navigation.push({workspace,tab,viewport:size,before,after});
    }
  }
  await page.setViewportSize({width:1440,height:1000});
  await page.evaluate(()=>window.__ICM_PRECISION_WORKBENCH__.setFocus(true));
  assert(await width()<100);
  await page.click('#pwBrandToggle');await settle();
  assert(await width()>180,'HB can expand navigation from Focus canvas');
  assert.equal(await page.evaluate(()=>window.__ICM_PRECISION_WORKBENCH__.focus()),false);
  await page.focus('#pwBrandToggle');await page.keyboard.press('Enter');await settle();assert(await width()<100);
  await page.keyboard.press('Space');await settle();assert(await width()>180);
  await page.reload({waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.__ICM_PRECISION_WORKBENCH__?.navigate&&window.__ICM_WORKBENCH__?.workflow26);
  assert(await width()>180,'Navigation preference survives reload');
  await page.evaluate(()=>{
    const wb=window.__ICM_WORKBENCH__,s=wb.survey,names=Array.from({length:9},(_,i)=>'FM'+String(i+1).padStart(2,'0'));
    s.association={records:names.map((monitor,i)=>({monitor,rain_gauge:'RG'+String(i%3+1).padStart(2,'0'),diameter_mm:600,upstream:i?[names[i-1]]:[]}))};
    s.batch={monitors:names.map(monitor=>({monitor,status:'complete',rain_gauge:'RG01',diameter_mm:600,weekly:{weeks:[{week_ending:'2026-09-06',rag:'Green',decision_path:'UI fixture'}]},event_response:{rows:[]},contracts:{}})),network:{gauge_count:3,criteria:{},gauge_summary:['RG01','RG02','RG03'].map(gauge=>({gauge,status:'Green'})),gauge_weekly:['RG01','RG02','RG03'].map(gauge=>({gauge,week_ending:'2026-09-06',rag:'Green'})),candidate_wapug_events:[],qualified_wapug_events:[]},volume_balance:{rows:[],summary:{}},analysis_controls:{}};
    s.batchSignature=wb.surveyDependencySignature('complete');wb.workflow26.render();
  });
  for(const size of [1440,1280,780]){
    await page.setViewportSize({width:size,height:1000});
    for(const suffix of ['fdv','rain']){
      await navigate('survey',suffix==='fdv'?'fdv-check':'rainfall-check');
      const viewport=page.locator('#assessmentSchematicViewport-'+suffix),node=viewport.locator(suffix==='fdv'?'[data-survey-node]':'[data-survey-gauge]').first();
      const zoomIn=page.locator('[data-schematic-zoom="1"][data-schematic-kind="'+suffix+'"]'),zoomOut=page.locator('[data-schematic-zoom="-1"][data-schematic-kind="'+suffix+'"]'),fit=page.locator('[data-schematic-fit][data-schematic-kind="'+suffix+'"]');
      await fit.click();await settle();
      const initial=await node.evaluate(el=>el.getBoundingClientRect().width);
      await zoomIn.click();await settle();const enlarged=await node.evaluate(el=>el.getBoundingClientRect().width);
      assert(enlarged>initial*1.2,'Nodes visibly enlarge in '+suffix+' at '+size);
      assert.equal(await page.locator('#assessmentZoom-'+suffix).innerText(),'125%');
      await zoomOut.click();await settle();assert(Math.abs((await node.evaluate(el=>el.getBoundingClientRect().width))-initial)<2);
      for(let i=0;i<12;i++)await zoomIn.click();
      assert(await zoomIn.isDisabled(),'Zoom limit disables +');assert.equal(await page.locator('#assessmentZoom-'+suffix).innerText(),'400%');
      await viewport.scrollIntoViewIfNeeded();
      const box=await viewport.boundingBox();
      await page.mouse.move(box.x+box.width*.7,box.y+box.height*.7);await page.mouse.down();await page.mouse.move(box.x+box.width*.4,box.y+box.height*.4,{steps:8});await page.mouse.up();
      const pan=await viewport.evaluate(el=>({x:el.scrollLeft,y:el.scrollTop}));assert(pan.x>20&&pan.y>20,'Zoomed schematic pans in both axes');
      await fit.click();await settle();assert.deepEqual(await viewport.evaluate(el=>[el.scrollLeft,el.scrollTop]),[0,0]);
      await zoomIn.click();await navigate('data','time-series');await navigate('survey',suffix==='fdv'?'fdv-check':'rainfall-check');
      assert.equal(await page.locator('#assessmentZoom-'+suffix).innerText(),'125%');assert((await node.evaluate(el=>el.getBoundingClientRect().width))>initial*1.2,'Zoom survives hidden route and re-entry');
      await fit.click();await node.click();
      assert((await page.locator('#assessmentDrawer-'+suffix).innerText()).includes(suffix==='fdv'?'FM01':'RG01'));
      evidence.zoom.push({suffix,viewport:size,initial,enlarged,pan});
    }
  }
  // Weekly drafts remain local while the camera and route change.
  await navigate('survey','fdv-check');await page.locator('#assessmentSchematic-fdv [data-survey-node="FM01"]').click();await page.locator('#assessmentDrawer-fdv [data-drawer-tab="audit"]').click();
  const comment=page.locator('#assessmentDrawer-fdv .weekly-comment');await comment.fill('Camera regression draft');
  await page.locator('[data-schematic-zoom="1"][data-schematic-kind="fdv"]').click();
  await navigate('survey','rainfall-check');await navigate('survey','fdv-check');assert.equal(await comment.inputValue(),'Camera regression draft');
  await page.setViewportSize({width:390,height:844});await page.click('#pwRailToggle');assert(await page.locator('.pw-rail').evaluate(el=>el.classList.contains('is-open')));await page.click('#pwBrandToggle');assert.equal(await page.locator('.pw-rail').evaluate(el=>el.classList.contains('is-open')),false);
  assert.deepEqual(errors,[]);
  evidence.url=page.url();evidence.errors=errors;
  if(process.env.ICM_EVIDENCE_DIR){const dir=process.env.ICM_EVIDENCE_DIR+'/workspace-interactions';await fs.mkdir(dir,{recursive:true});await fs.writeFile(dir+'/'+browserName+'.json',JSON.stringify(evidence,null,2));await page.setViewportSize({width:1440,height:1000});await navigate('survey','fdv-check');await page.locator('#assessmentSchematicViewport-fdv').scrollIntoViewIfNeeded();await page.screenshot({path:dir+'/'+browserName+'.png',fullPage:false});}
  console.log('WORKSPACE_INTERACTIONS_PASS '+JSON.stringify(evidence));
}finally{await browser.close();}
