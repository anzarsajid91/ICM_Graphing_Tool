import {chromium} from 'playwright';import {browserLaunchOptions,browserContextOptions} from './browser-environment.mjs';import fs from 'node:fs/promises';import assert from 'node:assert/strict';
const root=process.cwd(),baseUrl=process.env.ICM_BASE_URL||'http://127.0.0.1:8000/',evidence=(process.env.ICM_EVIDENCE_DIR||'/tmp/icm-pr-evidence')+'/schematic-weekly-review';await fs.mkdir(evidence,{recursive:true});
const browser=await chromium.launch(browserLaunchOptions());
const context=await browser.newContext({viewport:{width:1440,height:1000},acceptDownloads:true,...browserContextOptions()});const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
try{
 await page.goto(baseUrl,{waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>window.__ICM_PRECISION_WORKBENCH__?.navigate&&(window.__ICM_WORKBENCH__?.status==='ready'||(window.__ICM_WORKBENCH__?.deferredEngine&&window.__ICM_WORKBENCH__?.status==='idle')),null,{timeout:90000});
 assert((await page.title()).includes('Hydra Bench'));assert((await page.locator('.pw-primary-nav').innerText()).includes('Plots'));
 console.log('STEP import supplied FDV/rain/workbook');
 await page.setInputFiles('#fileInput',[...['FM7413','FM8356','FM8095','FM7424','FM9320','FM2830','FM2961','FM8722','FM7307'].map(n=>root+'/reference/current-tool/sample-data/fdv/'+n+'.fdv'),...['RG5097','RG4922','RG6324','RG4977'].map(n=>root+'/reference/current-tool/sample-data/rainfall/'+n+'.R'),root+'/reference/current-tool/sample-data/rainfall/fm_rg_assoc.xlsx']);
 await page.waitForFunction(()=>state.files.size===13&&[...state.files.values()].every(x=>x.status==='ready'),null,{timeout:180000});
 const options=await page.locator('#observedSelect option').allTextContents();assert.equal(options.filter(s=>s.includes('FM7413.fdv')).length,1);assert(options.find(s=>s.includes('FM7413.fdv')).includes('FDV'));
 const fm01=await page.locator('#observedSelect option').evaluateAll(opts=>opts.find(o=>o.textContent.includes('FM7413.fdv'))?.value);
 await page.selectOption('#observedSelect',fm01);await page.selectOption('#rainSelect',await page.locator('#rainSelect option').evaluateAll(opts=>opts.find(o=>o.textContent.includes('RG5097.R'))?.value));await page.click('#applyMappingBtn');
 await page.waitForFunction(()=>window.__ICM_WORKBENCH__.lastPanelOrder?.join('|')==='rainfall|flow|depth|velocity',null,{timeout:60000});
 await page.evaluate(()=>window.__ICM_PRECISION_WORKBENCH__.navigate('survey','fdv-check',false));
 assert.equal((await page.locator('#pwSecondaryNav button').allTextContents()).join('|'),'FDV Check|Rainfall Check|Volume Balance|Monthly Review');
 console.log('STEP assessment settings remain clickable at desktop and narrow widths');
 for(const width of [1440,780]){
  await page.setViewportSize({width,height:1000});await page.locator('#surveyAssessmentSettings > summary').click();
  const toggle=page.locator('#surveyAssociationPanel > .subhead .tool-collapse-toggle');await toggle.click();assert(await page.locator('#surveyAssociationPanel .tool-collapse-body').isVisible());await toggle.click();
  assert(await page.locator('#surveyAssessmentSettings #gapInput').isVisible());await page.fill('#gapInput','901');await page.fill('#gapInput','900');
  await page.locator('#surveyAssessmentSettings > summary').click();
 }
 await page.setViewportSize({width:1440,height:1000});
 await page.evaluate(()=>window.__ICM_PRECISION_WORKBENCH__.navigate('data','time-series',false));assert(await page.locator('.mapping-panel #gapInput').isVisible());
 await page.evaluate(()=>window.__ICM_PRECISION_WORKBENCH__.navigate('survey','fdv-check',false));assert.equal(await page.locator('#gapInput').count(),1);
 await page.click('#runCompleteSurveyBtn');
 await page.waitForFunction(()=>window.__ICM_WORKBENCH__.survey.batch&&window.__ICM_WORKBENCH__.surveyFresh('complete'),null,{timeout:600000});
 const current=await page.evaluate(()=>({monitors:window.__ICM_WORKBENCH__.survey.batch.monitors.length,weeks:window.__ICM_WORKBENCH__.survey.batch.monitors.find(m=>m.monitor==='FM7413').weekly.weeks.length,gaugeWeeks:window.__ICM_WORKBENCH__.survey.batch.network.gauge_weekly.length}));await fs.writeFile(evidence+'/assessment.json',JSON.stringify(await page.evaluate(()=>window.__ICM_WORKBENCH__.survey.batch)));console.log('REFERENCE',JSON.stringify(current));assert.equal(current.monitors,9);assert(current.weeks>1);assert(current.gaugeWeeks>1);
 await page.locator('#assessmentSchematic-fdv').scrollIntoViewIfNeeded();
 await page.screenshot({path:evidence+'/fdv-schematic.png',fullPage:false});
 assert(await page.locator('#assessmentSchematic-fdv [data-survey-node="FM7413"]').isVisible());
 assert(!await page.locator('#pwInspector').isVisible());assert(!await page.locator('#pwDataHealthSummary .tool-collapse-body').isVisible());
 assert(await page.locator('#assessmentMatrix-fdv .w26-week-matrix').isVisible());
 assert((await page.locator('#assessmentMatrix-fdv [data-matrix-cell]').count())>1);
 await page.locator('#assessmentSchematic-fdv [data-survey-node="FM7413"]').click();
 assert(await page.locator('#assessmentDrawer-fdv').isVisible());
 assert((await page.locator('#assessmentDrawer-fdv').innerText()).includes('FM7413'));
 assert.equal(await page.locator('#assessmentPopup').isVisible(),false);
 // Drag pans both axes; an ordinary click still selects the node.
 async function checkPan(suffix){
  const viewport=page.locator('#assessmentSchematicViewport-'+suffix);
  await viewport.scrollIntoViewIfNeeded();
  for(let i=0;i<5;i++)await page.locator('[data-schematic-zoom="1"][data-schematic-kind="'+suffix+'"]').click();
  await viewport.scrollIntoViewIfNeeded();
  const box=await viewport.boundingBox();
  await page.mouse.move(box.x+box.width*.7,box.y+box.height*.7);await page.mouse.down();
  await page.mouse.move(box.x+box.width*.4,box.y+box.height*.4,{steps:8});await page.mouse.up();
  const position=await viewport.evaluate(el=>({x:el.scrollLeft,y:el.scrollTop}));
  assert(position.x>20&&position.y>20,'Drag moves the '+suffix+' schematic on both axes');
  await page.locator('[data-schematic-fit][data-schematic-kind="'+suffix+'"]').click();
  assert.deepEqual(await viewport.evaluate(el=>[el.scrollLeft,el.scrollTop]),[0,0]);
 }
 await checkPan('fdv');

 await page.screenshot({path:evidence+'/week-matrix-drawer.png',fullPage:false});
 // The schematic initially selects the first full week, which can be the
 // second matrix column when the survey starts midweek. Review two explicit
 // matrix weeks so this journey verifies restoration of distinct records.
 await page.locator('#assessmentMatrix-fdv [data-week-name="FM7413"]').first().click();
 await page.locator('#assessmentDrawer-fdv [data-drawer-tab="audit"]').click();
 await page.locator('#assessmentDrawer-fdv [data-drawer-tab="weekly"]').click();
 const weekEdit=page.locator('#assessmentDrawer-fdv [data-week-edit]').nth(1),editedKey=await weekEdit.getAttribute('data-week-edit');
 await weekEdit.click();
 assert.equal(await page.locator('#assessmentDrawer-fdv .weekly-editor').getAttribute('data-week-key'),editedKey);
 await page.locator('#assessmentMatrix-fdv [data-week-name="FM7413"]').first().click();
 const editor=page.locator('#assessmentDrawer-fdv .weekly-editor');await editor.locator('.weekly-comment').fill('Draft survives zoom and navigation.');
 await page.locator('[data-schematic-zoom="1"][data-schematic-kind="fdv"]').click();
 assert.equal(await editor.locator('.weekly-comment').inputValue(),'Draft survives zoom and navigation.');
 await page.locator('#assessmentDrawer-fdv [data-drawer-tab="overview"]').click();
 await page.locator('#assessmentDrawer-fdv [data-drawer-tab="audit"]').click();
 assert.equal(await editor.locator('.weekly-comment').inputValue(),'Draft survives zoom and navigation.');
 const firstWeek=page.locator('#assessmentMatrix-fdv [data-week-name="FM7413"]');
 await firstWeek.nth(1).click();assert.equal(await editor.locator('.weekly-comment').inputValue(),'');
 await firstWeek.first().click();assert.equal(await editor.locator('.weekly-comment').inputValue(),'Draft survives zoom and navigation.');
 await editor.locator('.weekly-comment').fill('');
 for(const width of [1440,1024]){
  await page.setViewportSize({width,height:1000});
  assert(await editor.evaluate(el=>[...el.querySelectorAll('input,select,textarea')].every(field=>field.getBoundingClientRect().right<=el.getBoundingClientRect().right+1)),'Editor fields fit the drawer');
 }
 await page.setViewportSize({width:1440,height:1000});
 await editor.locator('.weekly-rating').selectOption('auto');await editor.locator('.weekly-reviewer').fill('Anzar');await editor.locator('[data-week-note="Tidal impact noted."]').click();await editor.locator('[data-week-save]').click();
 await page.waitForFunction(()=>Object.values(window.__ICM_WORKBENCH__.survey.reviews).some(r=>r.kind==='monitor-week'&&r.reason==='Tidal impact noted.'&&r.reviewer==='Anzar'));
 assert.equal(await page.locator('#assessmentDrawer-fdv .weekly-editor .weekly-comment').inputValue(),'Tidal impact noted.');
 const fm01Cells=page.locator('#assessmentMatrix-fdv [data-week-name="FM7413"]');assert((await fm01Cells.count())>1);await fm01Cells.nth(1).click();await page.locator('#assessmentDrawer-fdv [data-drawer-tab="audit"]').click();
 const secondEditor=page.locator('#assessmentDrawer-fdv .weekly-editor');await secondEditor.locator('.weekly-reviewer').fill('Reviewer B');await secondEditor.locator('.weekly-comment').fill('Pumping influence noted.');await secondEditor.locator('[data-week-save]').click();
 await page.evaluate(async()=>{
   const wb=window.__ICM_WORKBENCH__,snapshot=workspaceObject(),batch=JSON.parse(JSON.stringify(wb.survey.batch)),signature=wb.survey.batchSignature;
   wb.survey.reviews={};await applyWorkspace(snapshot);
   if(Object.keys(wb.survey.reviews).length!==2)throw new Error('Weekly reviews did not survive workspace reload.');
   wb.survey.batch=batch;wb.survey.batchSignature=signature;wb.workflow26.render();
   const first=batch.monitors.find(m=>m.monitor==='FM7413').weekly.weeks[0];
   if(!wb.workflow26.reviewedWeekState('monitor-week','FM7413',first).review_current)throw new Error('Same-source review did not remain current after restore.');
 });
 await page.evaluate(()=>window.__ICM_WORKBENCH__.workflow26.selectMonitor('FM7413'));
 const weekData=await page.evaluate(()=>Object.values(window.__ICM_WORKBENCH__.survey.reviews).filter(r=>r.kind==='monitor-week').map(r=>({week:r.week_ending,reason:r.reason,reviewer:r.reviewer})));assert.equal(weekData.length,2);assert.notEqual(weekData[0].week,weekData[1].week);
 await page.screenshot({path:evidence+'/weekly-review.png',fullPage:false});
 await page.evaluate(()=>window.__ICM_PRECISION_WORKBENCH__.navigate('survey','rainfall-check',false));assert(await page.locator('#assessmentMatrix-rain .w26-week-matrix').isVisible());await checkPan('rain');await page.locator('#assessmentSchematic-rain [data-survey-gauge="RG5097"]').click();assert((await page.locator('#assessmentDrawer-rain').innerText()).includes('RG5097'));await page.locator('#assessmentDrawer-rain [data-drawer-tab="audit"]').click();await page.locator('#assessmentDrawer-rain .weekly-reviewer').fill('Rain reviewer');await page.locator('#assessmentDrawer-rain .weekly-comment').fill('Gauge inspection completed.');await page.locator('#assessmentDrawer-rain [data-week-save]').click();
 await page.evaluate(()=>window.__ICM_PRECISION_WORKBENCH__.navigate('survey','monthly-review',false));assert(await page.locator('#surveyMonthlyReview').isVisible());assert(!await page.locator('#completeSurveyPanel').isVisible());assert((await page.locator('#surveyMonthlyReviewBody').innerText()).includes('Tidal impact noted.'));
 const popupPromise=page.waitForEvent('popup');await page.click('#surveyMonthlyPdfBtn');const printable=await popupPromise;await printable.waitForLoadState();assert((await printable.locator('body').innerText()).includes('Pumping influence noted.'));await printable.pdf({path:evidence+'/monthly.pdf',format:'A4',landscape:true,printBackground:true});await printable.close();
 await page.screenshot({path:evidence+'/monthly-review.png',fullPage:false});
 console.log('STEP model selectors and route boundaries');
 await page.evaluate(()=>window.__ICM_PRECISION_WORKBENCH__.navigate('data','time-series',false));
 const csv=['timestamp,Depth (m),Flow (m3/s)',...Array.from({length:72},(_,i)=>`2013-05-24T${String(Math.floor(i/6)).padStart(2,'0')}:${String(i%6*10).padStart(2,'0')}:00,${.4+i/1000},${.01+i/10000}`)].join('\n');
 await page.setInputFiles('#fileInput',{name:'Model Scenario.csv',mimeType:'text/csv',buffer:Buffer.from(csv)});await page.waitForFunction(()=>[...state.files.values()].some(x=>x.file.name==='Model Scenario.csv'&&x.status==='ready'),null,{timeout:60000});
 const modelDepth=await page.locator('#modelSelect option').evaluateAll(opts=>opts.find(o=>o.textContent.includes('Model Scenario.csv')&&o.textContent.includes('Depth'))?.value);assert(modelDepth);await page.selectOption('#modelSelect',[modelDepth]);
 assert((await page.locator('#ratingModelDepth option').allTextContents()).some(x=>x.includes('Model Scenario.csv')));assert(!(await page.locator('#ratingModelDepth option').allTextContents()).some(x=>x.includes('FM7413.fdv')));
 for(const tab of ['rating','dwf']){await page.evaluate(t=>window.__ICM_PRECISION_WORKBENCH__.navigate('graphs',t,false),tab);assert(!await page.locator('#scenarioComparisonTable').isVisible());}
 await page.evaluate(()=>window.__ICM_PRECISION_WORKBENCH__.navigate('graphs','comparison',false));assert(await page.locator('#scenarioComparisonTable').isVisible());
 console.log('STEP observed and modelled columns in the same CSV');
 await page.evaluate(()=>window.__ICM_PRECISION_WORKBENCH__.navigate('data','time-series',false));
 await page.setInputFiles('#fileInput',{name:'Shared source.csv',mimeType:'text/csv',buffer:Buffer.from(csv.replace('Depth (m),Flow (m3/s)','Depth (m),Level (m)'))});await page.waitForFunction(()=>[...state.files.values()].some(x=>x.file.name==='Shared source.csv'&&x.status==='ready'),null,{timeout:60000});
 const sharedObserved=await page.locator('#observedSelect option').evaluateAll(opts=>opts.find(o=>o.textContent.includes('Shared source.csv')&&o.textContent.includes('Depth'))?.value),sharedModel=await page.locator('#modelSelect option').evaluateAll(opts=>opts.find(o=>o.textContent.includes('Shared source.csv')&&o.textContent.includes('Level'))?.value);assert(sharedObserved&&sharedModel);
 await page.selectOption('#observedSelect',sharedObserved);await page.selectOption('#modelSelect',[sharedModel]);
 assert((await page.locator('#ratingModelDepth option').evaluateAll(opts=>opts.map(o=>o.value))).includes(sharedModel));assert(!(await page.locator('#ratingObsDepth option').evaluateAll(opts=>opts.map(o=>o.value))).includes(sharedModel));
 await page.selectOption('#observedSelect',fm01);
 console.log('STEP annual HTML and Plotly PNG');
 await page.evaluate(()=>window.__ICM_PRECISION_WORKBENCH__.navigate('data','time-series',false));await page.selectOption('#modelSelect',[]);await page.click('#applyMappingBtn');await page.waitForFunction(()=>window.__ICM_WORKBENCH__.lastPanelOrder?.join('|')==='rainfall|flow|depth|velocity',null,{timeout:60000});
 await page.evaluate(()=>window.__ICM_PRECISION_WORKBENCH__.navigate('reports','report-generation',false));await page.fill('#reportYear','2028');const downloadPromise=page.waitForEvent('download',{timeout:180000});await page.click('#downloadFourPeriodBtn');const download=await downloadPromise;await download.saveAs(evidence+'/annual.html');
 const report=await context.newPage();await report.goto('file://'+evidence+'/annual.html');await report.waitForFunction(()=>document.querySelector('#period-graph-0')?._fullLayout,null,{timeout:60000});
 const config=await report.locator('#period-graph-0').evaluate(el=>({image:el._context.toImageButtonOptions,height:el._fullLayout.height,rain:el.data.filter(t=>t.type==='bar').map(t=>({yaxis:t.yaxis,max:Math.max(...t.y.filter(Number.isFinite))}))}));console.log('EXPORT',JSON.stringify(config));assert.equal(config.image.width,1600);assert.equal(config.image.height,config.height);assert(config.rain.some(t=>t.max>0));
 await report.waitForFunction(()=>[...document.querySelectorAll('.report-plot')].every(el=>el.querySelector('.modebar-btn')),null,{timeout:120000});const imagePromise=report.waitForEvent('download',{timeout:120000});imagePromise.catch(()=>{});await report.locator('#period-graph-0 .modebar-btn[data-title="Download plot as a PNG"]').click({timeout:120000});const image=await imagePromise;await image.saveAs(evidence+'/annual.png');const imageEvidence=await report.evaluate(async(dataUrl)=>{
 const plot=document.querySelector('#period-graph-0'),layout=plot._fullLayout,im=new Image();im.src=dataUrl;await im.decode();
 const canvas=document.createElement('canvas');canvas.width=im.naturalWidth;canvas.height=im.naturalHeight;const ctx=canvas.getContext('2d');ctx.drawImage(im,0,0);
 const scale=im.naturalWidth/1600,margin=layout.margin,domain=layout.yaxis2.domain;
 const top=Math.floor((margin.t+(1-domain[1])*(layout.height-margin.t-margin.b))*scale),bottom=Math.ceil((margin.t+(1-domain[0])*(layout.height-margin.t-margin.b))*scale);
 const rgba=ctx.getImageData(Math.ceil(margin.l*scale),top,Math.floor(im.naturalWidth-(margin.l+margin.r)*scale),bottom-top).data;
 let colouredPixels=0;for(let i=0;i<rgba.length;i+=4)if(rgba[i+2]>rgba[i]+30&&rgba[i+2]>rgba[i+1]+10)colouredPixels++;
 return {width:im.naturalWidth,height:im.naturalHeight,rainfallColouredPixels:colouredPixels};
},'data:image/png;base64,'+(await fs.readFile(evidence+'/annual.png')).toString('base64'));
 assert.equal(imageEvidence.width,3200);assert.equal(imageEvidence.height,config.height*2);assert(imageEvidence.rainfallColouredPixels>100,'Export must retain visible rainfall pixels in the rainfall panel');
await report.screenshot({path:evidence+'/annual-html.png',fullPage:false});await report.close();
 await page.setViewportSize({width:780,height:900});await page.evaluate(()=>window.__ICM_PRECISION_WORKBENCH__.navigate('survey','fdv-check',false));assert(await page.locator('#assessmentMatrix-fdv').isVisible());assert(await page.locator('#assessmentDrawer-fdv').isVisible());await page.screenshot({path:evidence+'/narrow.png',fullPage:false});
 assert.equal(errors.length,0,errors.join('\n'));await fs.writeFile(evidence+'/result.json',JSON.stringify({current,weekData,config,imageEvidence,errors},null,2));console.log('PASS schematic/weekly/PDF/selectors/export browser acceptance');
}catch(error){console.log('FAIL STATE',await page.evaluate(()=>({status:document.getElementById('workspaceStatus')?.textContent,mapping:state.mapping,errors:window.__ICM_WORKBENCH__?.lastError})));await page.screenshot({path:evidence+'/failure.png',fullPage:false});throw error;}finally{await browser.close();}
