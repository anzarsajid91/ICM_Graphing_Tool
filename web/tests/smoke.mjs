import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';

const root=process.cwd();
const baseUrl=(process.env.ICM_BASE_URL||'http://127.0.0.1:8000/').replace(/\/?$/,'/');
const liveMode=Boolean(process.env.ICM_BASE_URL);
const browser=await chromium.launch({headless:true});
const context=await browser.newContext({viewport:{width:1440,height:1000},acceptDownloads:true,timezoneId:'Asia/Kolkata'});
const page=await context.newPage();
const consoleErrors=[];
const failedRequests=[];
let stage='startup';
page.on('pageerror',e=>consoleErrors.push(`pageerror: ${String(e)}`));
page.on('console',m=>{if(m.type()==='error')consoleErrors.push(`console: ${m.text()}`);});
page.on('requestfailed',r=>failedRequests.push(`${r.method()} ${r.url()} :: ${r.failure()?.errorText||'failed'}`));

async function optionValue(selector,needle){return page.locator(`${selector} option`).evaluateAll((opts,n)=>opts.find(x=>x.textContent.includes(n))?.value||'',needle);}
async function precisionRoute(workspace,subpage){
  await page.waitForFunction(()=>Boolean(window.__ICM_PRECISION_WORKBENCH__?.navigate),null,{timeout:30000});
  await page.evaluate(([w,p])=>window.__ICM_PRECISION_WORKBENCH__.navigate(w,p,false),[workspace,subpage]);
  await page.waitForFunction(([w,p])=>{const r=window.__ICM_PRECISION_WORKBENCH__?.route?.();return r?.workspace===w&&r?.page===p;},[workspace,subpage]);
}
async function clickTab(name){
  const routes={
    graph:['data','time-series'],
    compare:['verification','comparison'],
    'rain-events':['rainfall','events'],
    'data-health':['survey','data-health'],
    spills:['spills','results'],
    storage:['verification','storage'],
    workspace:['report','builder']
  };
  const next=routes[name];
  if(next){await precisionRoute(next[0],next[1]);return;}
  await page.locator(`[data-tab="${name}"]`).evaluate(el=>el.click());
}
async function downloadFrom(selector){const pending=page.waitForEvent('download');await page.click(selector);return pending;}
async function filePayload(filePath,name=path.basename(filePath)){return {name,mimeType:'text/csv',buffer:await fs.readFile(filePath)};}
async function captureEvidence(name){
  const dir=process.env.ICM_EVIDENCE_DIR;
  if(!dir)return;
  await fs.mkdir(dir,{recursive:true});
  await page.screenshot({path:path.join(dir,`${name}.png`),fullPage:false});
  await page.screenshot({path:path.join(dir,`${name}-full.png`),fullPage:true});
}
async function inspectReportHtml(html,minFigures=1){
  const p=await context.newPage();
  try{
    await p.setContent(html,{waitUntil:'domcontentloaded'});
    await p.waitForFunction(()=>[...document.images].every(x=>x.complete),null,{timeout:30000});
    const result=await p.evaluate((minFigures)=>{
      const root=document.documentElement;
      const figures=[...document.querySelectorAll('.figure img')];
      const zero=figures.filter(x=>x.getBoundingClientRect().width<=0||x.getBoundingClientRect().height<=0).length;
      return {
        overflow:root.scrollWidth-root.clientWidth,
        figures:figures.length,
        zero,
        headers:document.querySelectorAll('.report-header').length,
        tables:document.querySelectorAll('.table-wrap').length,
        minFigures,
      };
    },minFigures);
    const dir=process.env.ICM_EVIDENCE_DIR;
    if(dir){
      await fs.mkdir(dir,{recursive:true});
      await p.screenshot({path:path.join(dir,`report-${minFigures}-figures.png`),fullPage:true});
    }
    return result;
  }finally{await p.close();}
}
async function waitReady(){
  try{await page.waitForFunction(()=>window.__ICM_WORKBENCH__?.status==='ready'&&document.querySelector('#engineStatus')?.textContent.includes('ready'),null,{timeout:120000});}
  catch(err){const status=await page.locator('#engineStatus').textContent().catch(()=>'(missing)');const diag=await page.evaluate(()=>window.__ICM_WORKBENCH__||null).catch(()=>null);throw new Error(`Engine readiness failed. status=${status}; diagnostic=${JSON.stringify(diag)}; original=${err}`);}
}
function denseCsv(){
  const lines=['timestamp,level'];
  const base=Date.UTC(2026,0,1,0,0,0);
  for(let i=0;i<40000;i++){
    const stamp=new Date(base+i*60000).toISOString().replace('.000Z','');
    const level=(i%100>=25&&i%100<=45)?2.2:0.45;
    lines.push(`${stamp},${level}`);
  }
  return Buffer.from(lines.join('\n'),'utf8');
}
function rainfallR(values){
  return Buffer.from(`*CSTART\n2601010000 2601010006 2\n*CEND\n${values.join(' ')}\n`,'utf8');
}
function surveyFdv(monitor,flow,depth,velocity,count=200){
  const header=[
    `**IDENTIFIER: 1,${monitor}`,
    '**FIELD: 3,FLOW,DEPTH,VELOCITY',
    '**UNITS: 3,m3/s,m,m/s',
    '**CONSTANTS: 2,START,INTERVAL',
    '*CSTART',
    '2601050000 2',
    '*CEND',
  ];
  const data=Array.from({length:count},()=>`${flow} ${depth} ${velocity}`);
  return Buffer.from([...header,...data].join('\n')+'\n','utf8');
}
function surveyRainfallR(){
  const values=Array.from({length:200},(_,i)=>i<20?12:0);
  return Buffer.from(`*CSTART\n2601050000 2601050640 2\n*CEND\n${values.join(' ')}\n`,'utf8');
}
async function associationWorkbook(){
  const bytes=await page.evaluate(()=>{
    const wb=XLSX.utils.book_new();
    const ws=XLSX.utils.aoa_to_sheet([
      ['FDV_Name','RG','Pipe Diameter (mm)','Upstream Trace'],
      ['FM03','RG02',600,'FM01, FM02'],
      ['FM01','RG01',450,''],
      ['FM02','RG01',450,''],
    ]);
    XLSX.utils.book_append_sheet(wb,ws,'Associations');
    return Array.from(new Uint8Array(XLSX.write(wb,{type:'array',bookType:'xlsx'})));
  });
  return {name:'fm_rg_assoc.xlsx',mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',buffer:Buffer.from(bytes)};
}

try{
  stage='open application';
  await page.goto(baseUrl+(liveMode?`?live_verify=${Date.now()}`:''),{waitUntil:'domcontentloaded'});
  await waitReady();
  await page.waitForFunction(()=>Boolean(window.__ICM_PRECISION_WORKBENCH__?.navigate&&document.querySelector('.pw-rail')&&document.querySelector('.pw-inspector')),null,{timeout:30000});
  stage='Precision Workbench shell and responsive layout';
  const primaryLabels=await page.locator('.pw-primary-nav button').allTextContents();
  if(primaryLabels.map(x=>x.trim()).join('|')!=='Data|Survey|Rainfall|Verification|Spills|Report')throw new Error('Precision Workbench primary navigation mismatch: '+JSON.stringify(primaryLabels));
  for(const size of [{width:1366,height:768},{width:1487,height:1058},{width:1920,height:1080}]){
    await page.setViewportSize(size);
    await precisionRoute('data','sources');
    const layout=await page.evaluate(()=>({overflow:document.documentElement.scrollWidth-document.documentElement.clientWidth,rail:document.querySelector('.pw-rail')?.getBoundingClientRect().width,work:document.querySelector('.pw-workarea')?.getBoundingClientRect().width}));
    if(layout.overflow>1)throw new Error(`Document horizontal overflow at ${size.width}x${size.height}: ${JSON.stringify(layout)}`);
    if(!(layout.rail>0&&layout.work>0))throw new Error('Precision shell regions missing: '+JSON.stringify(layout));
  }
  await page.setViewportSize({width:1440,height:1000});
  await precisionRoute('data','sources');
  const architecture=await page.evaluate(()=>({
    execution:window.__ICM_WORKBENCH__?.execution,
    mainThreadPyodide:typeof loadPyodide,
    registryMounted:Boolean(window.ICMProjectRegistry&&document.querySelector('#domainRegistryPanel')),
    pageBuild:document.querySelector('meta[name="icm-build-sha"]')?.content||null,
    runtimeBuild:window.__ICM_WORKBENCH__?.buildToken||null,
    workerBuild:window.__ICM_WORKBENCH__?.workerBuildToken||null,
    localAssetUrls:[...document.querySelectorAll('script[src],link[href]')].map(el=>el.src||el.href).filter(url=>/\/assets\//.test(url)&&new URL(url).origin===location.origin),
  }));
  if(architecture.execution!=='web-worker'||architecture.mainThreadPyodide!=='undefined'||!architecture.registryMounted)throw new Error('Worker/domain architecture not active: '+JSON.stringify(architecture));
  if(!architecture.pageBuild||architecture.pageBuild!==architecture.runtimeBuild||architecture.pageBuild!==architecture.workerBuild)throw new Error('Page/runtime/worker release versions are not coherent: '+JSON.stringify(architecture));
  if(architecture.localAssetUrls.some(url=>!new URL(url).searchParams.get('v')))throw new Error('A local JS/CSS asset is not release-versioned: '+JSON.stringify(architecture.localAssetUrls));
  if(!((await page.locator('footer').textContent())||'').includes('© 2026 Anzar Sajid'))throw new Error('Live footer copyright missing');

  stage='source pool and collapsed file list';
  const observedPath=path.join(root,'examples/demo/observed.csv');
  const modelPath=path.join(root,'examples/demo/model.csv');
  const rainPath=path.join(root,'examples/demo/rainfall.csv');
  const observedPayload=await filePayload(observedPath);
  await page.setInputFiles('#fileInput',[
    observedPayload,
    await filePayload(modelPath),
    await filePayload(rainPath),
    {name:'auxiliary-observed.csv',mimeType:'text/csv',buffer:Buffer.from(observedPayload.buffer)},
    {name:'dense-observed.csv',mimeType:'text/csv',buffer:denseCsv()},
  ]);
  await page.waitForFunction(()=>document.querySelectorAll('#poolBody tr').length===5&&document.querySelector('#poolSummary')?.textContent.includes('5 parsed successfully'),null,{timeout:90000});
  if(await page.locator('#poolBody tr').count()!==5)throw new Error('Expected five source-pool rows');
  const registryAfterInitialLoad=await page.evaluate(()=>window.ICMProjectRegistry?.snapshot());
  if(!registryAfterInitialLoad||registryAfterInitialLoad.sources.length!==5||registryAfterInitialLoad.series.length<5)throw new Error('Canonical project registry did not classify the initial source pool: '+JSON.stringify(registryAfterInitialLoad));
  if(!registryAfterInitialLoad.sources.some(x=>x.role==='model')||!registryAfterInitialLoad.sources.some(x=>x.role==='rainfall'))throw new Error('Project registry role classification is incomplete: '+JSON.stringify(registryAfterInitialLoad.sources));
  await page.waitForFunction(()=>getComputedStyle(document.querySelectorAll('#poolBody tr')[3]).display==='none');
  if(!((await page.locator('#sourcePoolToggle').textContent())||'').includes('Show all 5'))throw new Error('Collapsed source pool should offer Show all 5');
  await page.click('#sourcePoolToggle');
  if(await page.locator('#poolBody tr').nth(4).evaluate(el=>getComputedStyle(el).display)==='none')throw new Error('Expanded source pool did not reveal all rows');
  await page.click('#sourcePoolToggle');

  stage='observed-only mapping without rainfall';
  await precisionRoute('data','series-mapping');
  const denseObserved=await optionValue('#observedSelect','dense-observed.csv — level');
  const rain=await optionValue('#rainSelect','rainfall.csv — rainfall');
  if(!denseObserved||!rain)throw new Error('Expected dense observed and rainfall series options');
  if((await page.inputValue('#obsColor')).toLowerCase()!=='#d32f2f')throw new Error('Observed default colour should be red');
  await page.selectOption('#observedSelect',denseObserved);
  await page.selectOption('#modelSelect',[]);
  await page.selectOption('#rainSelect','');
  await page.click('#applyMappingBtn');
  await page.waitForSelector('#timeChart .main-svg',{state:'attached',timeout:60000});
  await page.waitForFunction(()=>document.querySelector('#mappingStatus')?.textContent.includes('0 comparison scenario')&&document.querySelector('#mappingStatus')?.textContent.includes('rainfall not mapped'));
  const fullDensity=await page.evaluate(()=>window.__ICM_WORKBENCH__.lastGraphPointCounts?.observed);
  if(!fullDensity||fullDensity.raw!==40000||fullDensity.shown>15000||fullDensity.native!==false)throw new Error(`Full adaptive density incorrect: ${JSON.stringify(fullDensity)}`);
  const observedOnlyLayout=await page.evaluate(()=>{const chart=document.querySelector('#timeChart');return {traceCount:chart.data.length,hasRainTrace:chart.data.some(t=>t.yaxis==='y2'),hasY2:Boolean(chart.layout.yaxis2),hydDomain:chart.layout.yaxis.domain,observedColour:chart.data[0]?.line?.color};});
  if(observedOnlyLayout.traceCount!==1||observedOnlyLayout.hasRainTrace||observedOnlyLayout.hasY2||observedOnlyLayout.hydDomain[0]!==0||observedOnlyLayout.hydDomain[1]!==1)throw new Error(`Observed-only/no-rain graph layout incorrect: ${JSON.stringify(observedOnlyLayout)}`);
  if(String(observedOnlyLayout.observedColour).toLowerCase()!=='#d32f2f')throw new Error('Observed plotted trace should be red, got '+JSON.stringify(observedOnlyLayout.observedColour));

  stage='same-series observed and comparison mapping without rainfall';
  await page.selectOption('#modelSelect',[denseObserved]);
  await page.click('#applyMappingBtn');
  await page.waitForFunction(()=>document.querySelector('#mappingStatus')?.textContent.includes('1 comparison scenario')&&document.querySelector('#mappingStatus')?.textContent.includes('rainfall not mapped'));
  await page.waitForFunction(()=>document.querySelector('#timeChart')?.data?.length===2,null,{timeout:60000});
  const comparisonNoRainLayout=await page.evaluate(()=>{const chart=document.querySelector('#timeChart');return {traceCount:chart.data.length,hasRainTrace:chart.data.some(t=>t.yaxis==='y2'),hasY2:Boolean(chart.layout.yaxis2),hydDomain:chart.layout.yaxis.domain,observedColour:chart.data[0]?.line?.color,modelColour:chart.data[1]?.line?.color};});
  if(comparisonNoRainLayout.traceCount!==2||comparisonNoRainLayout.hasRainTrace||comparisonNoRainLayout.hasY2||comparisonNoRainLayout.hydDomain[0]!==0||comparisonNoRainLayout.hydDomain[1]!==1)throw new Error(`Observed+comparison/no-rain graph layout incorrect: ${JSON.stringify(comparisonNoRainLayout)}`);
  if(String(comparisonNoRainLayout.observedColour).toLowerCase()!=='#d32f2f')throw new Error('Observed comparison trace should remain red, got '+JSON.stringify(comparisonNoRainLayout.observedColour));
  if(String(comparisonNoRainLayout.modelColour).toLowerCase()!=='#5755d9')throw new Error('First model plotted trace should use #5755d9, got '+JSON.stringify(comparisonNoRainLayout.modelColour));

  stage='observed-only mapping with rainfall';
  await page.selectOption('#modelSelect',[]);
  await page.selectOption('#rainSelect',rain);
  await page.click('#applyMappingBtn');
  await page.waitForFunction(()=>document.querySelector('#mappingStatus')?.textContent.includes('0 comparison scenario')&&document.querySelector('#mappingStatus')?.textContent.includes('rainfall mapped'));
  await page.waitForFunction(()=>Boolean(document.querySelector('#timeChart')?.layout?.yaxis2),null,{timeout:60000});

  stage='graph threshold controls and rainfall top band';
  await precisionRoute('data','time-series');
  const standardLayout=await page.evaluate(()=>({
    focus:document.body.classList.contains('pw-focus-canvas'),
    rail:document.querySelector('.pw-rail')?.getBoundingClientRect().width||0,
    labelled:[...document.querySelectorAll('.pw-primary-nav .pw-nav-label')].every(x=>getComputedStyle(x).display!=='none')
  }));
  if(standardLayout.focus||standardLayout.rail<180||!standardLayout.labelled)throw new Error('Standard analytical layout must retain labelled navigation by default: '+JSON.stringify(standardLayout));
  await page.evaluate(()=>window.__ICM_PRECISION_WORKBENCH__.setFocus(true));
  const focusLayout=await page.evaluate(()=>({
    focus:document.body.classList.contains('pw-focus-canvas'),
    rail:document.querySelector('.pw-rail')?.getBoundingClientRect().width||0,
    work:document.querySelector('.pw-workarea')?.getBoundingClientRect().width||0,
    inspectorPosition:getComputedStyle(document.querySelector('.pw-inspector')).position,
    inspectorToggleVisible:getComputedStyle(document.querySelector('#pwInspectorToggle')).display!=='none'
  }));
  if(!focusLayout.focus||focusLayout.rail>90||focusLayout.work<1100||focusLayout.inspectorPosition!=='fixed'||!focusLayout.inspectorToggleVisible)throw new Error('Opt-in focus canvas did not maximise the graph work area: '+JSON.stringify(focusLayout));
  await page.waitForFunction(()=>document.querySelector('#timeChart')?.getBoundingClientRect().width>1000,null,{timeout:10000});
  await page.click('#pwInspectorToggle');
  await page.waitForFunction(()=>document.querySelector('#pwInspector')?.classList.contains('is-open'));
  await page.click('#pwInspectorClose');
  await page.waitForFunction(()=>!document.querySelector('#pwInspector')?.classList.contains('is-open'));
  await page.evaluate(()=>window.__ICM_PRECISION_WORKBENCH__.setFocus(false));
  await page.fill('#graphObsThreshold','1.5');
  await page.waitForFunction(()=>document.querySelector('#timeChart')?.layout?.shapes?.length>=1,null,{timeout:60000});
  const thresholdPresentation=await page.evaluate(()=>{const chart=document.querySelector('#timeChart');return{legendNames:(chart.data||[]).map(t=>t.name),annotations:(chart.layout.annotations||[]).map(a=>a.text)}}); 
  if(!thresholdPresentation.legendNames.includes('Observed spill level'))throw new Error(`Observed spill threshold is not represented in the top legend: ${JSON.stringify(thresholdPresentation)}`);
  if(thresholdPresentation.annotations.includes('Observed spill level'))throw new Error('Observed spill threshold label should not be stamped on the threshold line');
  const thresholdDashes=await page.evaluate(()=>document.querySelector('#timeChart').data.filter(t=>/spill (level|threshold)/i.test(t.name||'')).map(t=>t.line?.dash));
  if(thresholdDashes.length&&new Set(thresholdDashes).size!==1)throw new Error('Observed and model spill legend lines should use the same dashed style: '+JSON.stringify(thresholdDashes));
  const graphLayout=await page.evaluate(()=>({hyd:document.querySelector('#timeChart').layout.yaxis.domain,rain:document.querySelector('#timeChart').layout.yaxis2.domain,rainRange:document.querySelector('#timeChart').layout.yaxis2.range}));
  if(graphLayout.hyd[1]>.71||graphLayout.rain[0]<.78)throw new Error(`Rainfall is not isolated above hydraulic graph: ${JSON.stringify(graphLayout)}`);
  if(!(graphLayout.rainRange[0]>graphLayout.rainRange[1]))throw new Error(`Rainfall axis should be reversed top-down: ${JSON.stringify(graphLayout.rainRange)}`);
  await page.waitForFunction(()=>document.querySelectorAll('#graphStatistics tbody tr').length===2&&window.__ICM_WORKBENCH__.lastGraphStatistics?.length===2,null,{timeout:60000});
  const graphStatsLayout=await page.evaluate(()=>{const chart=document.querySelector('#timeChart').getBoundingClientRect(),stats=document.querySelector('#graphStatistics').getBoundingClientRect();return{chartBottom:chart.bottom,statsTop:stats.top,overflow:document.querySelector('#graphStatistics').scrollWidth-document.querySelector('#graphStatistics').clientWidth};});
  if(graphStatsLayout.statsTop<graphStatsLayout.chartBottom-1)throw new Error(`Graph statistics overlap the chart: ${JSON.stringify(graphStatsLayout)}`);
  const graphStatsText=await page.locator('#graphStatistics').textContent();
  if(!graphStatsText.includes('Minimum')||!graphStatsText.includes('Mean')||!graphStatsText.includes('Maximum')||!graphStatsText.includes('Unit'))throw new Error('Compact ICM-style graph statistics fields are missing');
  if(graphStatsText.includes('Median')||graphStatsText.includes('Integrated total')||graphStatsText.includes('Missing')||graphStatsText.includes('Status'))throw new Error('Graph statistics were not decluttered: '+graphStatsText);
  const noRangeSlider=await page.evaluate(()=>!document.querySelector('#timeChart')?.layout?.xaxis?.rangeslider?.visible);
  if(!noRangeSlider)throw new Error('Main graph overview/range slider should be removed');
  await captureEvidence('01-data-graph');

  stage='adaptive zoom restores native timestep';
  await page.evaluate(()=>Plotly.relayout(document.querySelector('#timeChart'),{'xaxis.range[0]':'2026-01-01T00:00:00','xaxis.range[1]':'2026-01-01T02:00:00'}));
  await page.waitForFunction(()=>window.__ICM_WORKBENCH__.lastGraphPointCounts?.observed?.native===true&&window.__ICM_WORKBENCH__.lastGraphPointCounts.observed.raw<=121,null,{timeout:60000});
  const zoomDensity=await page.evaluate(()=>window.__ICM_WORKBENCH__.lastGraphPointCounts.observed);
  if(zoomDensity.raw!==121||zoomDensity.shown!==zoomDensity.raw)throw new Error(`Zoomed window should show native points: ${JSON.stringify(zoomDensity)}`);

  const plotted=await page.evaluate(()=>document.querySelector('#timeChart').data[0]);
  if(plotted.x.length!==121||plotted.x[0]!=='2026-01-01T00:00:00'||plotted.x[120]!=='2026-01-01T02:00:00')throw new Error('Native source timestamps are incorrect');
  if(plotted.y[25]!==2.2||plotted.y[46]!==0.45)throw new Error('Native source values are incorrect');
  await page.evaluate(()=>Plotly.relayout(document.querySelector('#timeChart'),{'xaxis.autorange':true}));
  await page.waitForFunction(()=>window.__ICM_WORKBENCH__.lastGraphPointCounts?.observed?.raw===40000);

  stage='observed-only yearly spill calculation';
  await precisionRoute('spills','thresholds');
  if(await page.inputValue('#obsThreshold')!=='1.5')throw new Error('Graph observed threshold was not synchronised to spill calculation');
  await page.click('#runSpillsBtn');
  await page.waitForFunction(()=>document.querySelector('#spillRunStatus')?.textContent.includes('Completed in'),null,{timeout:60000});
  await precisionRoute('spills','results');
  await page.waitForSelector('#obsMonthly .v2-yearly-title',{timeout:60000});
  if(await page.locator('#obsMonthly tbody tr').count()<1)throw new Error('Observed yearly spill table missing');
  if(!((await page.locator('#spillComparison').textContent())||'').includes('model result is optional'))throw new Error('Observed-only spill workflow should not require a model');

  stage='map comparison scenario for calibration workflows';
  await precisionRoute('data','series-mapping');
  const obsDepth=await optionValue('#observedSelect','observed.csv — depth');
  const obsFlow=await optionValue('#ratingObsFlow','observed.csv — flow');
  const modelDepth=await optionValue('#modelSelect','model.csv — depth');
  const modelFlow=await optionValue('#ratingModelFlow','model.csv — flow');
  if(!obsDepth||!obsFlow||!modelDepth||!modelFlow)throw new Error('Expected demo depth/flow series options were not created');
  await page.selectOption('#observedSelect',obsDepth);
  await page.selectOption('#modelSelect',[modelDepth]);
  await page.selectOption('#rainSelect',rain);
  await page.click('#applyMappingBtn');
  await page.waitForFunction(()=>document.querySelector('#mappingStatus')?.textContent.includes('1 comparison scenario'));
  const modelColour=await page.inputValue('#modelColourControls .model-colour');
  const colourWidth=await page.locator('#modelColourControls .model-colour').evaluate(el=>el.getBoundingClientRect().width);
  if(modelColour.toLowerCase()!=='#5755d9')throw new Error(`First model default colour should be Precision Workbench purple-blue, got ${modelColour}`);
  if(colourWidth>90)throw new Error(`Model colour picker should be a compact swatch, width=${colourWidth}`);
  await clickTab('graph');
  await page.fill('#graphObsThreshold','1.0');
  await page.fill('#graphModelThreshold','1.0');
  await page.waitForFunction(()=>document.querySelector('#timeChart')?.layout?.shapes?.filter(x=>x.type==='line').length===2,null,{timeout:60000});

  stage='calibration comparison and diagnostics';
  await clickTab('compare');
  await page.click('#runCompareBtn');
  await page.waitForFunction(()=>document.querySelectorAll('#scenarioBody tr').length===1&&document.querySelectorAll('#metricGrid .metric').length>=10,null,{timeout:60000});
  const comparisonValidity=await page.evaluate(()=>window.__ICM_WORKBENCH__.lastComparisonValidity);
  if(!comparisonValidity||comparisonValidity.status!=='partial'||!(Number(comparisonValidity.coverage)>0&&Number(comparisonValidity.coverage)<1))throw new Error(`Comparison validity contract should expose the demo telemetry gap as partial support: ${JSON.stringify(comparisonValidity)}`);
  const metricText=await page.locator('#metricGrid').textContent();
  if(!metricText.includes('Calculation status')||!metricText.includes('Valid support'))throw new Error('Comparison validity cards are missing');
  for(const id of ['scatterChart','residualChart','cumulativeChart','exceedanceChart'])await page.waitForSelector(`#${id} .main-svg`,{timeout:60000});

  stage='depth-only agreement fit';
  await precisionRoute('verification','rating');
  const od=await optionValue('#ratingObsDepth','observed.csv — depth');
  const of=await optionValue('#ratingObsFlow','observed.csv — flow');
  const md=await optionValue('#ratingModelDepth','model.csv — depth');
  const mf=await optionValue('#ratingModelFlow','model.csv — flow');
  await page.selectOption('#ratingObsDepth',od);await page.selectOption('#ratingObsFlow','');await page.selectOption('#ratingModelDepth',md);await page.selectOption('#ratingModelFlow','');
  await page.click('#runRatingBtn');
  await page.waitForFunction(()=>document.querySelector('#ratingSummary')?.textContent.includes('Depth pairs'),null,{timeout:60000});
  await page.waitForFunction(()=>document.querySelector('#ratingChart')?.data?.length>=3,null,{timeout:60000});

  stage='flow-depth rating';
  await precisionRoute('verification','rating');
  await page.selectOption('#ratingObsFlow',of);await page.selectOption('#ratingModelFlow',mf);
  await page.click('#runRatingBtn');
  await page.waitForFunction(()=>document.querySelector('#ratingSummary')?.textContent.includes('Observed fit'),null,{timeout:60000});
  await page.waitForSelector('#ratingChart .main-svg',{timeout:60000});

  stage='dry weather flow';
  await precisionRoute('verification','dwf');
  const dwf=await optionValue('#dwfFlowSelect','observed.csv — flow');
  await page.selectOption('#dwfFlowSelect',dwf);
  await page.click('#runDwfBtn');
  await page.waitForSelector('#dwfSummary .summary-box',{timeout:60000});

  stage='rainfall event workflow and cumulative multi-R plot';
  await clickTab('rain-events');
  await page.setInputFiles('#fileInput',[
    {name:'storm-alpha.r',mimeType:'text/plain',buffer:rainfallR([6,12,0,3])},
    {name:'storm-beta.R',mimeType:'text/plain',buffer:rainfallR([3,3,3,3])},
  ]);
  await page.waitForFunction(()=>document.querySelectorAll('#poolBody tr').length===7&&window.__ICM_WORKBENCH__.lastCumulativeRainfall?.files===2,null,{timeout:90000});
  const cumulativeRain=await page.evaluate(()=>window.__ICM_WORKBENCH__.lastCumulativeRainfall);
  if(cumulativeRain.traces!==2)throw new Error(`Expected two cumulative rainfall traces: ${JSON.stringify(cumulativeRain)}`);
  const totals=[...cumulativeRain.totals].sort((a,b)=>a.file.localeCompare(b.file));
  if(Math.abs(Number(totals[0]?.total_mm)-0.7)>1e-9||Math.abs(Number(totals[1]?.total_mm)-0.4)>1e-9)throw new Error(`Unexpected cumulative rainfall totals: ${JSON.stringify(totals)}`);
  await page.waitForSelector('#cumulativeRainChart .main-svg',{timeout:60000});
  await page.waitForFunction(()=>window.__ICM_WORKBENCH__.lastRainfallQuality?.gauge_count===2,null,{timeout:60000});
  if(await page.locator('#multiGaugeRainTable tbody tr').count()!==2)throw new Error('Multi-gauge rainfall quality table should contain both .R gauges');

  await page.selectOption('#rainCriteriaMode','manual');
  await page.fill('#rainMinIntensity','1');
  await page.fill('#rainIntensityDuration','2');
  await page.fill('#rainEventDuration','4');
  await page.fill('#rainTotalDepth','0.1');
  await page.fill('#rainDryGap','4');
  await page.click('#runRainEventsBtn');
  await page.waitForFunction(()=>document.querySelector('#rainEventSummary')?.textContent.includes('qualifying events'),null,{timeout:60000});
  if(await page.locator('#rainEventBody tr').count()<1)throw new Error('Manual rainfall criteria should identify the demo event');

  stage='data health';
  await clickTab('data-health');
  await page.click('#runHealthBtn');
  await page.waitForFunction(()=>document.querySelectorAll('#healthBody tr').length>0,null,{timeout:60000});
  await captureEvidence('02-survey-data-health');
  const healthHead=await page.locator('#healthBody').evaluate(el=>el.closest('table')?.querySelector('thead')?.textContent||'');
  if(!healthHead.includes('Flatline')||!healthHead.includes('Out of range')||!healthHead.includes('Zero %'))throw new Error('Enhanced FDV flow-survey screening columns are missing');

  stage='association workbook and simplified survey navigation';
  await precisionRoute('survey','configuration');
  const navLabels=await page.locator('nav.tabs .tab').allTextContents();
  if(navLabels.join('|')!=='Data|Survey|Rainfall|Verification|Spills|Report')throw new Error('Unexpected simplified navigation: '+JSON.stringify(navLabels));
  if(await page.locator('.tab[data-tab="storage"]').count()!==0)throw new Error('Storage should be embedded under Verification, not exposed as a top-level tab');
  const workflowGuide=await page.locator('#workflowGuide').textContent();
  if(!workflowGuide.includes('Workflow')||!workflowGuide.includes('Survey')||!workflowGuide.includes('FSAT Event Response')||!workflowGuide.includes('volume balance'))throw new Error('Contextual Survey workflow guide is incomplete: '+workflowGuide);
  const activeTabStyle=await page.locator('.pw-primary-nav button[aria-current="page"]').evaluate(el=>({fontWeight:getComputedStyle(el).fontWeight,background:getComputedStyle(el).backgroundColor,color:getComputedStyle(el).color}));
  if(Number(activeTabStyle.fontWeight)<600||activeTabStyle.background==='rgba(0, 0, 0, 0)')throw new Error('Active Precision workspace does not visually stand out: '+JSON.stringify(activeTabStyle));
  await page.setInputFiles('#assocFileInput',await associationWorkbook());
  await page.waitForFunction(()=>window.__ICM_WORKBENCH__.survey?.association?.records?.length===3&&document.querySelectorAll('#surveyAssociationTable tbody > tr').length===3,null,{timeout:60000});
  if(await page.locator('#surveyAssociationTable tbody > tr').count()!==3)throw new Error('Association workbook did not produce three survey relationships');
  const assocText=await page.locator('#surveyAssociationPanel').textContent();
  if(!assocText.includes('authoritative')||!assocText.includes('FM03')||!assocText.includes('RG02'))throw new Error('Association precedence/context is not visible in Survey');
  const registryWithRelationships=await page.evaluate(()=>window.ICMProjectRegistry?.snapshot());
  if(!registryWithRelationships||registryWithRelationships.relationships.length<5||!registryWithRelationships.assets.some(x=>x.id==='FM03'))throw new Error('Association workbook was not projected into the project registry: '+JSON.stringify(registryWithRelationships));
  const assocLayout=await page.evaluate(()=>{const panel=document.querySelector('#surveyAssociationPanel').getBoundingClientRect();const wrap=document.querySelector('#surveyAssociationTable .survey-table-wrap').getBoundingClientRect();return{panelRight:panel.right,wrapRight:wrap.right};});
  if(assocLayout.wrapRight>assocLayout.panelRight+1)throw new Error('Survey association table escapes its panel: '+JSON.stringify(assocLayout));

  stage='professional FDV and rainfall assessment';
  await precisionRoute('survey','rainfall-response');
  const surveyDepth=await optionValue('#surveyDepthSelect','observed.csv — depth');
  const surveyVelocity=await optionValue('#surveyVelocitySelect','observed.csv — velocity');
  const surveyFlow=await optionValue('#surveyFlowSelect','observed.csv — flow');
  const surveyRain=await optionValue('#surveyRainSelect','rainfall.csv — rainfall');
  if(!surveyDepth||!surveyVelocity||!surveyFlow||!surveyRain)throw new Error('Professional survey mapping options are missing');
  await page.selectOption('#surveyDepthSelect',surveyDepth);
  await page.selectOption('#surveyVelocitySelect',surveyVelocity);
  await page.selectOption('#surveyFlowSelect',surveyFlow);
  await page.selectOption('#surveyRainSelect',surveyRain);
  await page.selectOption('#surveyDepthUnit','m');
  await page.selectOption('#surveyVelocityUnit','m/s');
  await page.selectOption('#surveyFlowUnit','m3/s');
  await page.selectOption('#surveyPopulation','under50');
  await page.click('#runProfessionalSurveyBtn');
  await page.waitForFunction(()=>document.querySelector('#professionalSurveyStatus')?.textContent.includes('Assessment complete'),null,{timeout:90000});
  const professional=await page.evaluate(()=>window.__ICM_WORKBENCH__.lastProfessionalSurvey);
  if(!professional?.network||professional.network.gauge_count<2)throw new Error(`Professional rainfall network assessment missing: ${JSON.stringify(professional)}`);
  if(!professional?.monitor?.weeks?.length)throw new Error(`Professional weekly monitor assessment missing: ${JSON.stringify(professional)}`);
  if(await page.locator('#professionalWeeklyBody tr').count()<1)throw new Error('Professional weekly monitor table is empty');
  if(!((await page.locator('#professionalSurveyMethod').textContent())||'').includes('18 h'))throw new Error('Professional assessment methodology is not exposed in the UI');

  stage='complete association-driven survey assessment';
  await precisionRoute('survey','rainfall-response');
  await page.setInputFiles('#fileInput',[
    {name:'FM01.fdv',mimeType:'text/plain',buffer:surveyFdv('FM01',0.10,0.20,0.40)},
    {name:'FM02.fdv',mimeType:'text/plain',buffer:surveyFdv('FM02',0.10,0.20,0.40)},
    {name:'FM03.fdv',mimeType:'text/plain',buffer:surveyFdv('FM03',0.25,0.30,0.50)},
    {name:'RG01.r',mimeType:'text/plain',buffer:surveyRainfallR()},
    {name:'RG02.r',mimeType:'text/plain',buffer:surveyRainfallR()},
  ]);
  await page.waitForFunction(()=>document.querySelectorAll('#poolBody tr').length===12,null,{timeout:90000});
  await page.waitForFunction(()=>document.querySelector('#surveyAssociationSummary')?.textContent.includes('3/3'),null,{timeout:60000});
  await page.selectOption('#surveyPopulation','under50');
  await page.click('#runCompleteSurveyBtn');
  await page.waitForFunction(()=>document.querySelector('#completeSurveyStatus')?.textContent.includes('Complete survey assessment calculated'),null,{timeout:120000});
  const schematic=await page.evaluate(()=>({nodes:document.querySelectorAll('#surveyNetworkSchematic .schematic-monitor').length,pipes:document.querySelectorAll('#surveyNetworkSchematic .schematic-pipe-inner').length,text:document.querySelector('#surveyNetworkSchematic')?.textContent||''}));
  if(schematic.nodes<3||schematic.pipes<2||!schematic.text.includes('Association schematic'))throw new Error('Association-driven flow monitor schematic is incomplete: '+JSON.stringify(schematic));
  const completeToggle=page.locator('#completeSurveyPanel .tool-collapse-toggle').first();
  if(await completeToggle.count()){
    await completeToggle.click();
    if(!(await page.locator('#completeSurveyPanel').evaluate(el=>el.classList.contains('tool-collapsed'))))throw new Error('Complete Survey section did not collapse');
    await completeToggle.click();
  }
  const completeSurvey=await page.evaluate(()=>window.__ICM_WORKBENCH__.survey?.batch);
  if(!completeSurvey||completeSurvey.monitors?.length!==3)throw new Error('Complete survey did not assess all association-workbook monitors: '+JSON.stringify(completeSurvey));
  if(!completeSurvey.source_policy?.association_workbook_authoritative)throw new Error('Association workbook precedence is not explicit in complete survey result');
  const fm03Balance=(completeSurvey.volume_balance?.rows||[]).find(x=>x.downstream_monitor==='FM03');
  if(!fm03Balance||fm03Balance.rag!=='Green'||fm03Balance.legacy_fsat_status!=='OK')throw new Error('Expected FM03 downstream volume balance to reconcile Green/OK: '+JSON.stringify(fm03Balance));
  if(!((await page.locator('#surveyBalanceTable').textContent())||'').includes('Likely source / first check'))throw new Error('Volume-balance diagnostic recommendation column is missing');
  // Capture Data Health again with representative FM/RG survey sources populated.
  await precisionRoute('survey','data-health');
  await page.click('#runHealthBtn');
  await page.waitForFunction(()=>document.querySelectorAll('#healthBody tr').length>=10,null,{timeout:120000});
  await captureEvidence('02-survey-data-health');
  await precisionRoute('survey','flow-continuity');
  await captureEvidence('03-survey-flow-continuity');

  stage='FDV automatic multi-variable graph';
  await precisionRoute('data','series-mapping');
  const fmDepth=await optionValue('#observedSelect','FM01.fdv — depth');
  if(!fmDepth)throw new Error('FM01 FDV depth option missing');
  await page.selectOption('#observedSelect',fmDepth);
  await page.selectOption('#modelSelect',[]);
  await page.click('#applyMappingBtn');
  await page.waitForFunction(()=>window.__ICM_WORKBENCH__.lastGraphMode==='fdv-multi-variable',null,{timeout:60000});
  const fdvGraph=await page.evaluate(()=>{const chart=document.querySelector('#timeChart');return{names:chart.data.map(t=>t.name),axes:chart.data.filter(t=>/^Observed /.test(t.name||'')).map(t=>t.yaxis||'y'),hasY3:Boolean(chart.layout.yaxis3),hasY4:Boolean(chart.layout.yaxis4),stats:[...document.querySelectorAll('#graphStatistics tbody tr')].map(r=>r.textContent)}}); 
  if(!fdvGraph.names.some(x=>/Observed depth/i.test(x))||!fdvGraph.names.some(x=>/Observed flow/i.test(x))||!fdvGraph.names.some(x=>/Observed velocity/i.test(x))||!fdvGraph.hasY3||!fdvGraph.hasY4)throw new Error('FDV graph did not auto-expand depth/flow/velocity with independent scaling: '+JSON.stringify(fdvGraph));
  if(fdvGraph.stats.length<3)throw new Error('FDV graph should expose compact statistics for all three hydraulic variables');
  // Restore the comparison mapping used by the remainder of the acceptance workflow.
  await page.selectOption('#observedSelect',obsDepth);
  await page.selectOption('#modelSelect',[modelDepth]);
  await page.selectOption('#rainSelect',rain);
  await page.click('#applyMappingBtn');
  await page.waitForFunction(()=>document.querySelector('#mappingStatus')?.textContent.includes('1 comparison scenario'),null,{timeout:60000});
  stage='spill exclusions in Asia/Kolkata and annual comparison';
  await precisionRoute('spills','thresholds');
  await page.fill('#obsThreshold','1.0');
  await page.fill('#modelThreshold','1.0');
  await page.click('#addExclusionBtn');
  await page.fill('.ex-row [data-field="start"]','2026-01-01T00:08');
  await page.fill('.ex-row [data-field="end"]','2026-01-01T00:10');
  await page.fill('.ex-row [data-field="reason"]','Automated acceptance-test exclusion');
  await page.click('#runSpillsBtn');
  await page.waitForFunction(()=>document.querySelector('#spillRunStatus')?.textContent.includes('Completed in'),null,{timeout:60000});
  await page.waitForFunction(()=>!document.body.classList.contains('operation-busy'),null,{timeout:10000});
  const exclusionLayout=await page.evaluate(()=>{const row=document.querySelector('.ex-row');const start=row?.querySelector('label:nth-of-type(2)')?.getBoundingClientRect();const reason=row?.querySelector('label:nth-of-type(5)')?.getBoundingClientRect();const check=row?.querySelector('input[type="checkbox"]')?.getBoundingClientRect();return{reasonBelow:Boolean(start&&reason&&reason.top>start.top+4),checkboxWidth:check?.width||0};});
  if(!exclusionLayout.reasonBelow||exclusionLayout.checkboxWidth>22)throw new Error('Exclusion editor did not resolve to the intended two-row hierarchy: '+JSON.stringify(exclusionLayout));
  await captureEvidence('04-spill-thresholds-exclusions');
  await precisionRoute('spills','results');
  await page.waitForSelector('#obsMonthly .v2-yearly-title',{timeout:60000});
  await page.waitForSelector('#modelMonthly .v2-yearly-title',{timeout:60000});
  if(await page.locator('#spillComparison tbody tr').count()<1)throw new Error('Annual observed/model spill comparison missing');
  const spillDiag=await page.evaluate(()=>window.__ICM_WORKBENCH__.lastSpills);
  if(!spillDiag?.observed)throw new Error(`Observed spill diagnostic missing: ${JSON.stringify(spillDiag)}`);
  if(Math.abs(Number(spillDiag.observed.excluded_seconds)-120)>0.001)throw new Error(`Expected 120 seconds excluded in model clock, got ${JSON.stringify(spillDiag)}`);
  if(!spillDiag.observed.yearly?.length)throw new Error('Yearly spill summary missing from browser diagnostic');
  console.log('NUMERICAL_PARITY '+JSON.stringify({rainfall_totals_mm:totals.map(x=>Number(x.total_mm)),fm03_balance_ratio:Number(fm03Balance.balance_ratio),fm03_rag:fm03Balance.rag,fm03_legacy:fm03Balance.legacy_fsat_status,excluded_seconds:Number(spillDiag.observed.excluded_seconds)}));

  stage='storage and monthly volume';
  await precisionRoute('verification','storage');
  await page.locator('#tab-storage').scrollIntoViewIfNeeded();
  const level=await optionValue('#storageLevelSelect','model.csv — depth');
  const flow=await optionValue('#storageFlowSelect','model.csv — flow');
  await page.selectOption('#storageLevelSelect',level);await page.selectOption('#storageFlowSelect',flow);
  await page.selectOption('#storageLevelUnit','m');await page.selectOption('#storageFlowUnit','m3/s');
  await page.fill('#storageThreshold','1.0');
  await page.click('#runStorageBtn');
  await page.waitForFunction(()=>Boolean(window.__ICM_WORKBENCH__.lastStorage),null,{timeout:60000});
  await page.waitForFunction(()=>document.querySelector('#storageSummary')?.textContent.trim().length>0&&document.querySelector('#monthlyVolume')?.textContent.trim().length>0,null,{timeout:60000});

  stage='workspace persistence and reports';
  await precisionRoute('report','workspace');
  await page.fill('#workspaceName','Acceptance workspace');
  await page.click('#saveNamedWorkspaceBtn');
  await page.waitForFunction(()=>[...document.querySelectorAll('#namedWorkspaceSelect option')].some(o=>o.textContent==='Acceptance workspace'));

  const workspaceDownload=await downloadFrom('#downloadWorkspaceBtn');
  const workspacePath=await workspaceDownload.path();
  const workspace=JSON.parse(await fs.readFile(workspacePath,'utf8'));
  if(workspace.schema_version!==3||workspace.time_basis!=='model clock/unspecified')throw new Error(`Unexpected workspace schema/time basis: ${JSON.stringify(workspace)}`);
  if(workspace.exclusions?.[0]?.start!=='2026-01-01T00:08')throw new Error(`Exclusion wall clock shifted in Asia/Kolkata: ${JSON.stringify(workspace.exclusions)}`);
  if(workspace.exclusions?.[0]?.end!=='2026-01-01T00:10')throw new Error(`Exclusion end shifted in Asia/Kolkata: ${JSON.stringify(workspace.exclusions)}`);

  // A workspace must not advertise completion before its asynchronous mapping
  // and graph restoration has actually finished.
  await page.evaluate(()=>{
    const original=window.ICMGraph.applyMapping;
    const status=document.querySelector('#workspaceStatus');
    window.__workspaceRestoreProbe={completed:false,prematureLoaded:false};
    const observer=new MutationObserver(()=>{
      if(status?.textContent.includes('Workspace loaded.')&&!window.__workspaceRestoreProbe.completed){
        window.__workspaceRestoreProbe.prematureLoaded=true;
      }
    });
    if(status)observer.observe(status,{childList:true,subtree:true,characterData:true});
    window.ICMGraph.applyMapping=async function(...args){
      await new Promise(resolve=>setTimeout(resolve,300));
      try{return await original.apply(this,args);}
      finally{
        window.__workspaceRestoreProbe.completed=true;
        window.ICMGraph.applyMapping=original;
      }
    };
  });
  await page.setInputFiles('#workspaceInput',workspacePath);
  await page.waitForFunction(()=>document.querySelector('#workspaceStatus')?.textContent.includes('Workspace loaded.'),null,{timeout:60000});
  await page.waitForFunction(()=>!document.body.classList.contains('operation-busy'),null,{timeout:10000});
  const restoreReady=await page.evaluate(()=>({
    mappingCompleted:Boolean(window.__workspaceRestoreProbe?.completed),
    prematureLoaded:Boolean(window.__workspaceRestoreProbe?.prematureLoaded),
    observedMapped:Boolean(state.mapping.observed),
    plottedTraces:Array.isArray(document.querySelector('#timeChart')?.data)?document.querySelector('#timeChart').data.length:0,
  }));
  if(!restoreReady.mappingCompleted||restoreReady.prematureLoaded||!restoreReady.observedMapped||restoreReady.plottedTraces<1)throw new Error(`Workspace announced loaded before restoration completed: ${JSON.stringify(restoreReady)}`);

  // Workspace import intentionally invalidates calculated snapshots. Recalculate every
  // analysis used by the report rather than weakening stale-result export guards.
  await clickTab('compare');
  await page.click('#runCompareBtn');
  await page.waitForFunction(()=>Boolean(state.comparisonSnapshot)&&state.comparisonSnapshot.signature===analysisSignature());
  await precisionRoute('spills','thresholds');
  await page.click('#runSpillsBtn');
  await page.waitForFunction(()=>Boolean(state.spillSnapshot)&&state.spillSnapshot.signature===analysisSignature(),null,{timeout:60000});
  await precisionRoute('spills','results');
  const spillLayout=await page.evaluate(()=>{const panel=document.querySelector('#tab-spills .panel')?.getBoundingClientRect();const wraps=[...document.querySelectorAll('#tab-spills .two-col .table-wrap')].map(x=>x.getBoundingClientRect());return {panelRight:panel?.right||0,wraps:wraps.map(x=>({left:x.left,right:x.right,width:x.width}))};});
  if(spillLayout.wraps.some(x=>x.right>spillLayout.panelRight+1))throw new Error(`Spill yearly tables escape the panel: ${JSON.stringify(spillLayout)}`);
  // File/exclusion changes correctly invalidate survey snapshots. Re-run both the
  // legacy single-monitor assessment and the association-driven complete survey
  // so report assertions exercise fresh, auditable results.
  await precisionRoute('survey','rainfall-response');
  await page.click('#runProfessionalSurveyBtn');
  await page.waitForFunction(()=>Boolean(window.__ICM_WORKBENCH__.lastProfessionalSurvey),null,{timeout:120000});
  await page.click('#runCompleteSurveyBtn');
  await page.waitForFunction(()=>Boolean(window.__ICM_WORKBENCH__.survey?.batch),null,{timeout:120000});

  // Regression guard for live-regression #11: presentation-only rerenders must
  // not invalidate a fresh engineering result when the exclusion state is unchanged.
  const surveyBeforeExclusionRerender=await page.evaluate(()=>({
    batch:Boolean(window.__ICM_WORKBENCH__.survey?.batch),
    balance:Boolean(window.__ICM_WORKBENCH__.survey?.balance),
    exclusions:JSON.stringify(state.exclusions||[]),
  }));
  await page.evaluate(()=>renderExclusions());
  await page.waitForTimeout(0);
  const surveyAfterExclusionRerender=await page.evaluate(()=>({
    batch:Boolean(window.__ICM_WORKBENCH__.survey?.batch),
    balance:Boolean(window.__ICM_WORKBENCH__.survey?.balance),
    exclusions:JSON.stringify(state.exclusions||[]),
  }));
  if(!surveyAfterExclusionRerender.batch||!surveyAfterExclusionRerender.balance||surveyAfterExclusionRerender.exclusions!==surveyBeforeExclusionRerender.exclusions)throw new Error(`DOM-only exclusion rerender invalidated unchanged survey results: ${JSON.stringify({before:surveyBeforeExclusionRerender,after:surveyAfterExclusionRerender})}`);

  // Regression guard: rendering the source table is presentation-only and must not
  // invalidate source-dependent engineering results when state.files is unchanged.
  const sourceResultBeforeDomRender=await page.evaluate(()=>({
    professional:Boolean(window.__ICM_WORKBENCH__.lastProfessionalSurvey),
    complete:Boolean(window.__ICM_WORKBENCH__.survey?.batch),
    balance:Boolean(window.__ICM_WORKBENCH__.survey?.balance),
    fileCount:state.files.size,
  }));
  await page.evaluate(()=>renderPool());
  await page.waitForTimeout(0);
  const sourceResultAfterDomRender=await page.evaluate(()=>({
    professional:Boolean(window.__ICM_WORKBENCH__.lastProfessionalSurvey),
    complete:Boolean(window.__ICM_WORKBENCH__.survey?.batch),
    balance:Boolean(window.__ICM_WORKBENCH__.survey?.balance),
    fileCount:state.files.size,
  }));
  if(!sourceResultAfterDomRender.professional||!sourceResultAfterDomRender.complete||!sourceResultAfterDomRender.balance||sourceResultAfterDomRender.fileCount!==sourceResultBeforeDomRender.fileCount)throw new Error(`DOM-only source-pool rerender invalidated unchanged results: ${JSON.stringify({before:sourceResultBeforeDomRender,after:sourceResultAfterDomRender})}`);

  await clickTab('workspace');
  await page.waitForSelector('#reportPreflight',{timeout:10000});
  const readinessExpected={
    comparison:'Fresh',
    spill:'Fresh',
    'professional-survey':'Fresh',
    'complete-survey':'Fresh',
    'survey-association':'Loaded',
  };
  for(const [key,expected] of Object.entries(readinessExpected)){
    const item=page.locator(`#reportPreflight [data-result="${key}"]`);
    if(await item.count()!==1)throw new Error(`Report readiness row missing for ${key}`);
    const value=(await item.locator('.report-readiness-state').textContent())||'';
    if(value.trim()!==expected)throw new Error(`Report readiness for ${key} expected ${expected}, got ${value}`);
  }
  const reportSpacing=await page.evaluate(()=>{const top=document.querySelector('#namedWorkspaceSelect')?.closest('.actions')?.getBoundingClientRect();const bottom=document.querySelector('.report-actions')?.getBoundingClientRect();return{gap:top&&bottom?bottom.top-top.bottom:null};});
  if(reportSpacing.gap!=null&&reportSpacing.gap<8)throw new Error('Report action controls are still crowded: '+JSON.stringify(reportSpacing));
  await captureEvidence('05-report-workspace');
  const reportDownload=await downloadFrom('#downloadReportBtn');
  const report=await fs.readFile(await reportDownload.path(),'utf8');
  if(!report.includes('© 2026 Anzar Sajid'))throw new Error('Report copyright missing');
  if(!report.includes('Audit appendix'))throw new Error('Report audit appendix missing');
  if(!report.includes('project_registry')||!report.includes('web-worker'))throw new Error('Report audit appendix is missing canonical project registry / worker execution provenance');
  if(!report.includes('report-header')||!report.includes('Assessment configuration')||!report.includes('Project data context')||!report.includes('Source provenance'))throw new Error('Professional assessment report structure missing');
  if(!report.includes('Graph statistics')||!report.includes('Minimum')||!report.includes('Mean')||!report.includes('Maximum'))throw new Error('Assessment report compact graph statistics missing');
  if(report.includes('<th>Median</th>')||report.includes('<th>Integrated total</th>'))throw new Error('Assessment report graph statistics were not simplified');
  if(!report.includes('Professional flow-survey / rainfall assessment')||!report.includes('professional_flow_survey'))throw new Error('Professional flow-survey assessment missing from report/audit appendix');
  if(!report.includes('Complete flow-survey context')||!report.includes('Flow continuity / volume balance')||!report.includes('fm_rg_assoc.xlsx'))throw new Error('Association-driven complete survey context missing from exported report');
  if(!report.includes('report-grid')||!report.includes('table-wrap'))throw new Error('Professional report layout classes missing');
  const reportLayout=await inspectReportHtml(report,3);
  if(reportLayout.headers!==1||reportLayout.figures<reportLayout.minFigures||reportLayout.zero||reportLayout.overflow>2)throw new Error(`Assessment report visual containment failed: ${JSON.stringify(reportLayout)}`);
  await page.fill('#reportYear','2026');
  const fourDownload=await downloadFrom('#downloadFourPeriodBtn');
  const fourReport=await fs.readFile(await fourDownload.path(),'utf8');
  if(!fourReport.includes('Four-Period Report')||!fourReport.includes('separate rainfall band'))throw new Error('Four-period report methodology/layout note missing');
  if((fourReport.match(/class="report-page"/g)||[]).length!==4)throw new Error('Four-period report should contain four print-safe period pages');
  if(!fourReport.includes('A4 landscape'))throw new Error('Four-period report should use landscape print layout');
  if((fourReport.match(/Period statistics/g)||[]).length!==4)throw new Error('Four-period report must include statistics for every graph period');
  const fourLayout=await inspectReportHtml(fourReport,4);
  if(fourLayout.headers!==1||fourLayout.figures!==4||fourLayout.zero||fourLayout.overflow>2)throw new Error(`Four-period report visual containment failed: ${JSON.stringify(fourLayout)}`);
  const manifestDownload=await downloadFrom('#downloadManifestBtn');
  const manifestCsv=await fs.readFile(await manifestDownload.path(),'utf8');
  if(!manifestCsv.startsWith('workflow_role,asset_id,domain_role,file,column,quantity,unit,sha256,size,format'))throw new Error('Provenance manifest is missing canonical domain fields');

  stage='simulated-series auxiliary column filtering';
  await page.setInputFiles('#fileInput',{name:'simulated-export.csv',mimeType:'text/csv',buffer:Buffer.from('timestamp,Seconds,Dummy Nodes\n2026-02-01T00:00:00,0,1.0\n2026-02-01T00:01:00,60,1.1\n')});
  await page.waitForFunction(()=>[...document.querySelectorAll('#poolBody tr')].some(r=>r.textContent.includes('simulated-export.csv')&&r.textContent.includes('Ready')),null,{timeout:60000});
  await page.waitForFunction(()=>[...document.querySelectorAll('#modelSelect option')].filter(o=>o.textContent.includes('simulated-export.csv')).length===1,null,{timeout:60000});
  const simOptions=await page.locator('#modelSelect option').evaluateAll(opts=>opts.filter(o=>o.textContent.includes('simulated-export.csv')).map(o=>o.textContent));
  if(simOptions.length!==1||simOptions.some(x=>/—\s*Seconds\b/i.test(x)))throw new Error('Simulated export should expose one user series and hide auxiliary Seconds: '+JSON.stringify(simOptions));

  stage='multi-file drag and drop regression';
  const beforeDrop=await page.locator('#poolBody tr').count();
  await page.evaluate(()=>{
    window.__sourcePoolEventEvidence={count:0,details:[]};
    window.addEventListener('icm:source-pool-changed',event=>{
      window.__sourcePoolEventEvidence.count+=1;
      window.__sourcePoolEventEvidence.details.push(event.detail||null);
    });
    const textA='timestamp,depth\n2026-02-01T00:00:00,0.2\n2026-02-01T00:15:00,0.3\n';
    const textB='timestamp,depth\n2026-02-01T00:00:00,0.4\n2026-02-01T00:15:00,0.5\n';
    const a=new File([textA],'drag-a.csv',{type:'text/csv',lastModified:1770000000000});
    const b=new File([textB],'drag-b.csv',{type:'text/csv',lastModified:1770000001000});
    const event=new Event('drop',{bubbles:true,cancelable:true});
    Object.defineProperty(event,'dataTransfer',{value:{
      items:[{getAsFile:()=>a}],
      files:[a,b],
    }});
    document.querySelector('#dropzone').dispatchEvent(event);
  });
  await page.waitForFunction(expected=>document.querySelectorAll('#poolBody tr').length===expected,beforeDrop+2,{timeout:90000});
  await page.waitForFunction(()=>[...document.querySelectorAll('#poolBody tr')].slice(-2).every(row=>row.textContent.includes('Ready')),null,{timeout:90000});
  await page.waitForFunction(()=>document.querySelector('#globalOperation')?.hidden===true&&!document.body.classList.contains('operation-busy'),null,{timeout:10000});
  const operationUi=await page.evaluate(()=>({exists:Boolean(document.querySelector('#globalOperation')),hidden:document.querySelector('#globalOperation')?.hidden,bodyBusy:document.body.classList.contains('operation-busy')}));
  if(!operationUi.exists||operationUi.hidden!==true||operationUi.bodyBusy)throw new Error('Global operation indicator did not return to an idle state: '+JSON.stringify(operationUi));
  const sourceEventEvidence=await page.evaluate(()=>({
    events:window.__sourcePoolEventEvidence,
    professional:Boolean(window.__ICM_WORKBENCH__.lastProfessionalSurvey),
    complete:Boolean(window.__ICM_WORKBENCH__.survey?.batch),
    balance:Boolean(window.__ICM_WORKBENCH__.survey?.balance),
  }));
  if(sourceEventEvidence.events?.count!==1||sourceEventEvidence.events?.details?.[0]?.reason!=='ingest')throw new Error('Real multi-file ingestion must emit exactly one source-pool state event: '+JSON.stringify(sourceEventEvidence));
  if(sourceEventEvidence.professional||sourceEventEvidence.complete||sourceEventEvidence.balance)throw new Error('Real source-pool change did not invalidate source-dependent survey results: '+JSON.stringify(sourceEventEvidence));

  stage='final browser diagnostics';
  const diag=await page.evaluate(()=>window.__ICM_WORKBENCH__);
  const materialErrors=consoleErrors.filter(x=>!x.includes('favicon.ico'));
  if(materialErrors.length)throw new Error(`Browser console/page errors: ${materialErrors.join(' | ')}`);
  if(diag.errors?.length)throw new Error(`Workbench recorded operation errors: ${JSON.stringify(diag.errors)}`);
  if(failedRequests.filter(x=>!x.includes('favicon.ico')).length)throw new Error(`Failed browser requests: ${failedRequests.join(' | ')}`);
  await captureEvidence('06-final-state');

  console.log(`${liveMode?'Live Pages':'Local artifact'} browser acceptance passed at ${baseUrl}: hardened multi-file drag/drop, auxiliary column filtering, FDV depth/flow/velocity auto-graphing, dense adaptive zoom, no range slider, compact statistics/reports, unified spill dash style, survey schematic, collapsible workflows, survey assessment, spills, storage and workspace outputs.`);
} catch(err) {
  const status=await page.locator('#engineStatus').textContent().catch(()=>'(missing)');
  const diag=await page.evaluate(()=>window.__ICM_WORKBENCH__||null).catch(()=>null);
  console.error(`ACCEPTANCE FAILURE at stage: ${stage}`);
  console.error(`Engine status: ${status}`);
  console.error(`Workbench diagnostic: ${JSON.stringify(diag)}`);
  console.error(`Console errors: ${JSON.stringify(consoleErrors)}`);
  console.error(`Failed requests: ${JSON.stringify(failedRequests)}`);
  await page.screenshot({path:process.env.ICM_FAILURE_SCREENSHOT||'/tmp/icm-workbench-failure.png',fullPage:true}).catch(()=>{});
  throw err;
} finally {
  await browser.close();
}
