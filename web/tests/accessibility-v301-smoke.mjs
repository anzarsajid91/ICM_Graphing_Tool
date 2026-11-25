// DE-05/06/09/12: desktop browser assertions over real app controls and local synthetic data.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium,firefox} from 'playwright';
import {browserLaunchOptions,browserContextOptions} from './browser-environment.mjs';
import {installPrivacyGuard} from './privacy-network.mjs';
import {writeEvidence} from './evidence-output.mjs';
const base=process.env.ICM_BASE_URL||'http://127.0.0.1:8015/';
const evidence=process.env.ICM_EVIDENCE_DIR||'/tmp/hydra-v301-accessibility';
const browsers=process.env.ICM_BROWSER?[process.env.ICM_BROWSER]:['chromium','firefox'];
const records=[];let failures=0;
for(const name of browsers){
 const browser=await ({chromium,firefox}[name]).launch(browserLaunchOptions());
 const context=await browser.newContext({...browserContextOptions(),viewport:{width:1440,height:1000},acceptDownloads:true});
 const guard=installPrivacyGuard(context,base),page=await context.newPage(),errors=[];
 page.on('pageerror',error=>errors.push(error.message));
 const nav=async route=>{await page.evaluate(route=>window.__ICM_PRECISION_WORKBENCH__.navigate(...route.split('/'),false),route);await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));};
 const run=async(id,fn)=>{try{const result=await fn();records.push({browser:name,id,status:'PASS',result});}catch(error){failures++;records.push({browser:name,id,status:'FAIL',error:String(error),stack:error.stack});console.error(name+' '+id+': '+error.stack);}};
 const shot=async label=>writeEvidence(evidence+'/'+name+'-'+label+'.png',await page.screenshot({fullPage:false}));
 try{
  await guard.navigate(page,base);await page.waitForFunction(()=>window.__ICM_PRECISION_WORKBENCH__?.navigate);
  await run('DE-12',async()=>{
   await page.keyboard.press('Tab');assert.equal(await page.locator(':focus').innerText(),'Skip to workspace');
   await page.keyboard.press('Enter');assert.equal(await page.locator(':focus').getAttribute('id'),'pwPageTitle');
   const results=[];
   for(const width of [1440,1024]){
    await page.setViewportSize({width,height:1000});
    for(const route of ['data/time-series','reports/report-generation','survey/fdv-check']){
     await nav(route);await page.locator('.pw-skip-link').focus();await page.keyboard.press('Enter');
     assert.equal(await page.locator(':focus').getAttribute('id'),'pwPageTitle');
     const heading=await page.locator('#pwPageTitle').evaluate(el=>({title:el.textContent,top:el.getBoundingClientRect().top,outline:getComputedStyle(el).outlineStyle}));
     assert.ok(heading.top>=0&&heading.top<1000);assert.notEqual(heading.outline,'none');
     results.push({width,route,...heading});
    }
    await page.locator('#pwBrandToggle').click();await page.locator('.pw-skip-link').focus();await page.keyboard.press('Enter');assert.equal(await page.locator(':focus').getAttribute('id'),'pwPageTitle');
    await page.locator('#pwBrandToggle').click();
   }
   return {firstTab:true,results,screenshot:await shot('skip-workspace')};
  });
  await run('DE-05',async()=>{
   const results=[];
   const bounds=locator=>locator.evaluate(el=>{const r=el.getBoundingClientRect(),clipped=[];for(let p=el.parentElement;p;p=p.parentElement){const s=getComputedStyle(p),b=p.getBoundingClientRect();if(/hidden|clip|auto|scroll/.test(s.overflowX)&& (r.left<b.left-1||r.right>b.right+1))clipped.push({id:p.id,axis:'x'});if(/hidden|clip|auto|scroll/.test(s.overflowY)&&(r.top<b.top-1||r.bottom>b.bottom+1))clipped.push({id:p.id,axis:'y'});}return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,viewport:innerWidth,hit:el.contains(document.elementFromPoint(r.left+r.width/2,r.top+r.height/2)),clipped};});
   for(const width of [1440,1366,1024,683]){
    // 683 CSS px is reflow coverage equivalent to a 1366 window at 200%;
    // native browser zoom is recorded separately and is not claimed here.
    await page.setViewportSize({width,height:1000});await nav('reports/report-generation');
    const report=page.locator('#pwReportOptions'),button=report.locator('.tool-collapse-toggle').first();
    await button.scrollIntoViewIfNeeded();await button.focus();const b=await bounds(button);assert.equal(b.clipped.length,0);assert.ok(b.hit&&b.left>=0&&b.right<=width);
    const before=await report.evaluate(el=>el.classList.contains('tool-collapsed'));await button.press('Enter');assert.notEqual(await report.evaluate(el=>el.classList.contains('tool-collapsed')),before);await button.click();assert.equal(await report.evaluate(el=>el.classList.contains('tool-collapsed')),before);
    await nav('data/time-series');const event=page.locator('#pwTimeSeriesEventSurface');if(!(await event.evaluate(el=>el.open)))await event.locator(':scope > summary').click();
    const duration=page.locator('#rainEventDuration');await duration.scrollIntoViewIfNeeded();await duration.focus();const d=await bounds(duration);assert.equal(d.clipped.length,0);assert.ok(d.hit&&d.right<=width);
    await duration.fill('61');assert.equal(await duration.inputValue(),'61');await duration.fill('60');results.push({width,report:b,rainfall:d});
   }
   return {results,nativeBrowserZoom:'NOT EXECUTED: CSS viewport reflow only; screen-reader speech not evaluated',screenshot:await shot('reflow-683')};
  });
  await page.setViewportSize({width:1440,height:1000});await nav('data/time-series');
  await run('DE-06',async()=>{
   const csv=(name,values)=>({name,mimeType:'text/csv',buffer:Buffer.from('timestamp,Depth (mm)\n2026-01-01T00:00:00,'+values[0]+'\n2026-01-01T00:07:00,'+values[1]+'\n2026-01-01T00:15:00,'+values[2]+'\n')});
   await page.setInputFiles('#fileInput',[csv('Keyboard-observed.csv',[0,'',-400]),csv('Keyboard-model.csv',[100,200,300])]);
   await page.waitForFunction(()=>[...state.files.values()].filter(file=>file.status==='ready').length===2,null,{timeout:120000});
   const option=async(selector,needle)=>page.locator(selector+' option').evaluateAll((options,needle)=>options.find(o=>o.textContent.includes(needle))?.value,needle);
   await page.selectOption('#observedSelect',await option('#observedSelect','Keyboard-observed.csv'));
   await page.selectOption('#modelSelect',[await option('#modelSelect','Keyboard-model.csv')]);
   await page.click('#applyMappingBtn');await page.waitForFunction(()=>window.__ICM_WORKBENCH__?.lastExactPoint?.count===3,null,{timeout:120000});
   const trace=page.locator('#v2PointTrace'),next=page.locator('#v2PointNext'),position=page.locator('#v2PointPosition'),readout=page.locator('#v2PointInspectorValue');
   await trace.selectOption({label:(await trace.locator('option').allTextContents()).find(x=>x.includes('Keyboard-observed.csv'))});
   await page.waitForFunction(()=>window.__ICM_WORKBENCH__.lastExactPoint?.index===0&&window.__ICM_WORKBENCH__.lastExactPoint?.display_value===0);
   const samples=[await readout.innerText()];assert.match(samples[0],/project clock.*Keyboard-observed.csv.*\| 0 mm/);
   await next.focus();await next.press('Enter');await page.waitForFunction(()=>window.__ICM_WORKBENCH__.lastExactPoint?.index===1);assert.equal(await page.locator(':focus').getAttribute('id'),'v2PointNext');samples.push(await readout.innerText());assert.match(samples[1],/00:07:00.*Missing mm/);
   await next.press('Enter');await page.waitForFunction(()=>window.__ICM_WORKBENCH__.lastExactPoint?.index===2);samples.push(await readout.innerText());assert.match(samples[2],/00:15:00.*-400 mm/);
   await trace.focus();await trace.press('End');await trace.press('Enter');await page.waitForFunction(()=>window.__ICM_WORKBENCH__.lastExactPoint?.index===0&&window.__ICM_WORKBENCH__.lastExactPoint?.display_value===100);assert.match(await readout.innerText(),/Keyboard-model.csv.*100 mm/);
   // Copy via actual control then native paste checks the local clipboard in both browsers.
   await page.locator('#v2PointInspectorCopy').click();const copied=await readout.innerText();
   await page.evaluate(()=>{const probe=document.createElement('textarea');probe.id='clipboardTestProbe';probe.setAttribute('aria-label','Synthetic clipboard check');document.body.append(probe);});
   await page.locator('#clipboardTestProbe').focus();await page.keyboard.press('Control+v');assert.equal(await page.locator('#clipboardTestProbe').inputValue(),copied);await page.locator('#clipboardTestProbe').evaluate(el=>el.remove());
   // Native cohort is restricted to current graph window, not rendered gap separators.
   await page.evaluate(async()=>{await Plotly.relayout('timeChart',{'xaxis.range':['2026-01-01T00:07:00','2026-01-01T00:15:00']});});
   await page.waitForFunction(()=>window.__ICM_WORKBENCH__.lastExactPoint?.count===2,null,{timeout:120000});
   assert.equal(await position.getAttribute('max'),'2');
   return {samples,identicalTimestampDifferentTrace:await readout.innerText(),clipboard:copied,cohort:await page.locator('#v2PointCohort').innerText(),screenshot:await shot('exact-point')};
  });
  await run('DE-09',async()=>{
   await nav('network/simulation-results');const panel=page.locator('#tab-simulation-results');await panel.getByLabel('Local results CSV').waitFor();
   await panel.getByLabel('Local results CSV').setInputFiles({name:'keyboard-simulation.csv',mimeType:'text/csv',buffer:Buffer.from('Time,00127.B\r\n,L/s\r\n2025-01-01 00:00:00,0\r\n2025-01-01 00:07:00,#N/A\r\n2025-01-01 00:15:00,-400\r\n')});
   await panel.getByText('Preview ready.',{exact:false}).waitFor();
   for(const [label,value] of Object.entries({'Simulation ID':'Synthetic keyboard','Model revision':'Synthetic v1','Scenario':'Baseline','Event':'Irregular keyboard','Optional missing-value token':'#N/A','Source result attribute':'DS flow'}))await panel.getByLabel(label,{exact:true}).fill(value);
   for(const [label,value] of [['Asset type','link'],['Link table','conduit'],['Result quantity','flow'],['Link end','downstream'],['Source unit','L/s']])await panel.getByLabel(label,{exact:true}).selectOption(value);
   await panel.getByLabel('The next record contains units').check();await panel.getByLabel('The file contains instantaneous samples on the confirmed project clock').check();
   await panel.getByLabel('Mapping 1 CSV column number').fill('2');await panel.getByLabel('Mapping 1 Node or upstream ID').fill('00127');await panel.getByLabel('Mapping 1 Link suffix').fill('B');
   await panel.getByRole('button',{name:'Index simulation results',exact:true}).click();await panel.locator('#hbResultImportStatus').filter({hasText:'3 timestamps indexed'}).waitFor({timeout:30000});
   const slider=panel.locator('#hbResultTime'),accessible=()=>slider.getAttribute('aria-valuetext'),samples=[];
   await slider.focus();await slider.press('Home');await page.waitForFunction(()=>document.querySelector('#hbResultTime').getAttribute('aria-valuetext')?.includes('00:00:00.000'));samples.push(await accessible());assert.match(samples[0],/00127.B.*0 m³\/s/);
   await slider.press('ArrowRight');await page.waitForFunction(()=>document.querySelector('#hbResultTime').getAttribute('aria-valuetext')?.includes('Missing'));samples.push(await accessible());assert.match(samples[1],/00:07:00.000.*Missing m³\/s/);
   await panel.getByRole('button',{name:'Next sample',exact:true}).click();await page.waitForFunction(()=>document.querySelector('#hbResultTime').getAttribute('aria-valuetext')?.includes('-0.4'));samples.push(await accessible());assert.match(samples[2],/00:15:00.000.*-0.4 m³\/s/);
   await panel.getByRole('button',{name:'Previous sample',exact:true}).click();await page.waitForFunction(()=>document.querySelector('#hbResultTime').getAttribute('aria-valuetext')?.includes('Missing'));
   const before=await panel.locator('#hbResultSampleAnnouncement').innerText();await panel.getByRole('button',{name:'Play',exact:true}).click();await page.waitForFunction(()=>document.querySelector('#hbResultTime').value==='2');assert.equal(await panel.locator('#hbResultSampleAnnouncement').innerText(),before,'Automatic playback must not repeatedly announce samples');
   await slider.focus();await slider.press('Home');await page.waitForFunction(()=>document.querySelector('#hbResultTime').value==='0');await panel.getByRole('button',{name:'Play',exact:true}).click();await panel.getByRole('button',{name:'Pause',exact:true}).click();assert.match(await panel.locator('#hbResultSampleAnnouncement').innerText(),/^Paused\./);
   return {samples,announcement:await panel.locator('#hbResultSampleAnnouncement').innerText(),speech:'NOT TESTED',screenshot:await shot('simulation-accessible-value')};
  });
  guard.assertClean();assert.deepEqual(errors,[]);
 }catch(error){failures++;records.push({browser:name,id:'environment',status:'FAIL',error:String(error),errors});}
 finally{await browser.close();}
}
console.log('EVIDENCE '+await writeEvidence(evidence+'/results.json',JSON.stringify({base,records,limitations:['Native desktop browser200% zoom and screen-reader speech require separate validation.']},null,2)));
console.log(JSON.stringify({passed:records.filter(x=>x.status==='PASS').length,failed:failures}));if(failures)process.exitCode=1;
