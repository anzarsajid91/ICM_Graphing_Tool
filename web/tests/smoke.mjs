import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';

const root=process.cwd();
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
async function clickTab(name){await page.click(`[data-tab="${name}"]`);}
async function downloadFrom(selector){const pending=page.waitForEvent('download');await page.click(selector);return pending;}
async function filePayload(filePath,name=path.basename(filePath)){return {name,mimeType:'text/csv',buffer:await fs.readFile(filePath)};}
async function inspectReportHtml(html,minFigures=1){
  const p=await context.newPage();
  try{
    await p.setContent(html,{waitUntil:'domcontentloaded'});
    await p.waitForFunction(()=>[...document.images].every(x=>x.complete),null,{timeout:30000});
    return await p.evaluate((minFigures)=>{
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
  }finally{await p.close();}
}
async function waitReady(){
  try{await page.waitForFunction(()=>window.__ICM_WORKBENCH__?.status==='ready'&&document.querySelector('#engineStatus')?.textContent.includes('ready'),null,{timeout:120000});}
  catch(err){const status=await page.locator('#engineStatus').textContent().catch(()=>'(missing)');const diag=await page.evaluate(()=>window.__ICM_WORKBENCH__||null).catch(()=>null);throw new Error(`Engine readiness failed. status=${status}; diagnostic=${JSON.stringify(diag)}; original=${err}`);}
}
function denseCsv(){
  const lines=['timestamp,level'];
  const base=Date.UTC(2026,0,1,0,0,0);
  for(let i=0;i<12000;i++){
    const stamp=new Date(base+i*60000).toISOString().replace('.000Z','');
    const level=(i%100>=25&&i%100<=45)?2.2:0.45;
    lines.push(`${stamp},${level}`);
  }
  return Buffer.from(lines.join('\n'),'utf8');
}
function rainfallR(values){
  return Buffer.from(`*CSTART\n2601010000 2601010006 2\n*CEND\n${values.join(' ')}\n`,'utf8');
}

try{
  stage='open application';
  await page.goto('http://127.0.0.1:8000/',{waitUntil:'domcontentloaded'});
  await waitReady();
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
  await page.waitForFunction(()=>getComputedStyle(document.querySelectorAll('#poolBody tr')[3]).display==='none');
  if(!((await page.locator('#sourcePoolToggle').textContent())||'').includes('Show all 5'))throw new Error('Collapsed source pool should offer Show all 5');
  await page.click('#sourcePoolToggle');
  if(await page.locator('#poolBody tr').nth(4).evaluate(el=>getComputedStyle(el).display)==='none')throw new Error('Expanded source pool did not reveal all rows');
  await page.click('#sourcePoolToggle');

  stage='observed-only mapping without rainfall';
  const denseObserved=await optionValue('#observedSelect','dense-observed.csv — level');
  const rain=await optionValue('#rainSelect','rainfall.csv — rainfall');
  if(!denseObserved||!rain)throw new Error('Expected dense observed and rainfall series options');
  if((await page.inputValue('#obsColor')).toLowerCase()!=='#d32f2f')throw new Error('Observed default colour should be red');
  await page.selectOption('#observedSelect',denseObserved);
  await page.selectOption('#modelSelect',[]);
  await page.selectOption('#rainSelect','');
  await page.click('#applyMappingBtn');
  await page.waitForSelector('#timeChart .main-svg',{timeout:60000});
  await page.waitForFunction(()=>document.querySelector('#mappingStatus')?.textContent.includes('0 comparison scenario')&&document.querySelector('#mappingStatus')?.textContent.includes('rainfall not mapped'));
  const fullDensity=await page.evaluate(()=>window.__ICM_WORKBENCH__.lastGraphPointCounts?.observed);
  if(!fullDensity||fullDensity.raw!==12000||fullDensity.shown>5000||fullDensity.native!==false)throw new Error(`Full adaptive density incorrect: ${JSON.stringify(fullDensity)}`);
  const observedOnlyLayout=await page.evaluate(()=>{const chart=document.querySelector('#timeChart');return {traceCount:chart.data.length,hasRainTrace:chart.data.some(t=>t.yaxis==='y2'),hasY2:Boolean(chart.layout.yaxis2),hydDomain:chart.layout.yaxis.domain};});
  if(observedOnlyLayout.traceCount!==1||observedOnlyLayout.hasRainTrace||observedOnlyLayout.hasY2||observedOnlyLayout.hydDomain[0]!==0||observedOnlyLayout.hydDomain[1]!==1)throw new Error(`Observed-only/no-rain graph layout incorrect: ${JSON.stringify(observedOnlyLayout)}`);

  stage='same-series observed and comparison mapping without rainfall';
  await page.selectOption('#modelSelect',[denseObserved]);
  await page.click('#applyMappingBtn');
  await page.waitForFunction(()=>document.querySelector('#mappingStatus')?.textContent.includes('1 comparison scenario')&&document.querySelector('#mappingStatus')?.textContent.includes('rainfall not mapped'));
  await page.waitForFunction(()=>document.querySelector('#timeChart')?.data?.length===2,null,{timeout:60000});
  const comparisonNoRainLayout=await page.evaluate(()=>{const chart=document.querySelector('#timeChart');return {traceCount:chart.data.length,hasRainTrace:chart.data.some(t=>t.yaxis==='y2'),hasY2:Boolean(chart.layout.yaxis2),hydDomain:chart.layout.yaxis.domain};});
  if(comparisonNoRainLayout.traceCount!==2||comparisonNoRainLayout.hasRainTrace||comparisonNoRainLayout.hasY2||comparisonNoRainLayout.hydDomain[0]!==0||comparisonNoRainLayout.hydDomain[1]!==1)throw new Error(`Observed+comparison/no-rain graph layout incorrect: ${JSON.stringify(comparisonNoRainLayout)}`);

  stage='observed-only mapping with rainfall';
  await page.selectOption('#modelSelect',[]);
  await page.selectOption('#rainSelect',rain);
  await page.click('#applyMappingBtn');
  await page.waitForFunction(()=>document.querySelector('#mappingStatus')?.textContent.includes('0 comparison scenario')&&document.querySelector('#mappingStatus')?.textContent.includes('rainfall mapped'));
  await page.waitForFunction(()=>Boolean(document.querySelector('#timeChart')?.layout?.yaxis2),null,{timeout:60000});

  stage='graph threshold controls and rainfall top band';
  await page.fill('#graphObsThreshold','1.5');
  await page.waitForFunction(()=>document.querySelector('#timeChart')?.layout?.shapes?.length>=1,null,{timeout:60000});
  const graphLayout=await page.evaluate(()=>({hyd:document.querySelector('#timeChart').layout.yaxis.domain,rain:document.querySelector('#timeChart').layout.yaxis2.domain,rainRange:document.querySelector('#timeChart').layout.yaxis2.range}));
  if(graphLayout.hyd[1]>.71||graphLayout.rain[0]<.78)throw new Error(`Rainfall is not isolated above hydraulic graph: ${JSON.stringify(graphLayout)}`);
  if(!(graphLayout.rainRange[0]>graphLayout.rainRange[1]))throw new Error(`Rainfall axis should be reversed top-down: ${JSON.stringify(graphLayout.rainRange)}`);
  await page.waitForFunction(()=>document.querySelectorAll('#graphStatistics tbody tr').length===2&&window.__ICM_WORKBENCH__.lastGraphStatistics?.length===2,null,{timeout:60000});
  const graphStatsLayout=await page.evaluate(()=>{const chart=document.querySelector('#timeChart').getBoundingClientRect(),stats=document.querySelector('#graphStatistics').getBoundingClientRect();return{chartBottom:chart.bottom,statsTop:stats.top,overflow:document.querySelector('#graphStatistics').scrollWidth-document.querySelector('#graphStatistics').clientWidth};});
  if(graphStatsLayout.statsTop<graphStatsLayout.chartBottom-1)throw new Error(`Graph statistics overlap the chart: ${JSON.stringify(graphStatsLayout)}`);
  const graphStatsText=await page.locator('#graphStatistics').textContent();
  if(!graphStatsText.includes('Minimum')||!graphStatsText.includes('Mean')||!graphStatsText.includes('Integrated total'))throw new Error('ICM-style graph statistics fields are missing');

  stage='adaptive zoom restores native timestep';
  await page.evaluate(()=>Plotly.relayout(document.querySelector('#timeChart'),{'xaxis.range[0]':'2026-01-01T00:00:00','xaxis.range[1]':'2026-01-01T02:00:00'}));
  await page.waitForFunction(()=>window.__ICM_WORKBENCH__.lastGraphPointCounts?.observed?.native===true&&window.__ICM_WORKBENCH__.lastGraphPointCounts.observed.raw<=121,null,{timeout:60000});
  const zoomDensity=await page.evaluate(()=>window.__ICM_WORKBENCH__.lastGraphPointCounts.observed);
  if(zoomDensity.raw!==121||zoomDensity.shown!==zoomDensity.raw)throw new Error(`Zoomed window should show native points: ${JSON.stringify(zoomDensity)}`);

  const plotted=await page.evaluate(()=>document.querySelector('#timeChart').data[0]);
  if(plotted.x.length!==121||plotted.x[0]!=='2026-01-01T00:00:00'||plotted.x[120]!=='2026-01-01T02:00:00')throw new Error('Native source timestamps are incorrect');
  if(plotted.y[25]!==2.2||plotted.y[46]!==0.45)throw new Error('Native source values are incorrect');
  await page.evaluate(()=>Plotly.relayout(document.querySelector('#timeChart'),{'xaxis.autorange':true}));
  await page.waitForFunction(()=>window.__ICM_WORKBENCH__.lastGraphPointCounts?.observed?.raw===12000);

  stage='observed-only yearly spill calculation';
  await clickTab('spills');
  if(await page.inputValue('#obsThreshold')!=='1.5')throw new Error('Graph observed threshold was not synchronised to spill calculation');
  await page.click('#runSpillsBtn');
  await page.waitForFunction(()=>document.querySelector('#spillRunStatus')?.textContent.includes('Completed in'),null,{timeout:60000});
  await page.waitForSelector('#obsMonthly .v2-yearly-title',{timeout:60000});
  if(await page.locator('#obsMonthly tbody tr').count()<1)throw new Error('Observed yearly spill table missing');
  if(!((await page.locator('#spillComparison').textContent())||'').includes('model result is optional'))throw new Error('Observed-only spill workflow should not require a model');

  stage='map comparison scenario for calibration workflows';
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
  if(modelColour.toLowerCase()!=='#5b5bd6')throw new Error(`First model default colour should be indigo-blue, got ${modelColour}`);
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

  stage='flow-depth rating';
  const od=await optionValue('#ratingObsDepth','observed.csv — depth');
  const of=await optionValue('#ratingObsFlow','observed.csv — flow');
  const md=await optionValue('#ratingModelDepth','model.csv — depth');
  const mf=await optionValue('#ratingModelFlow','model.csv — flow');
  await page.selectOption('#ratingObsDepth',od);await page.selectOption('#ratingObsFlow',of);await page.selectOption('#ratingModelDepth',md);await page.selectOption('#ratingModelFlow',mf);
  await page.click('#runRatingBtn');
  await page.waitForSelector('#ratingSummary .summary-box',{timeout:60000});
  await page.waitForSelector('#ratingChart .main-svg',{timeout:60000});

  stage='dry weather flow';
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
  const healthHead=await page.locator('#healthBody').evaluate(el=>el.closest('table')?.querySelector('thead')?.textContent||'');
  if(!healthHead.includes('Flatline')||!healthHead.includes('Out of range')||!healthHead.includes('Zero %'))throw new Error('Enhanced FDV flow-survey screening columns are missing');

  stage='professional FDV and rainfall assessment';
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

  stage='spill exclusions in Asia/Kolkata and annual comparison';
  await clickTab('spills');
  await page.fill('#obsThreshold','1.0');
  await page.fill('#modelThreshold','1.0');
  await page.click('#addExclusionBtn');
  await page.fill('.ex-row [data-field="start"]','2026-01-01T00:08');
  await page.fill('.ex-row [data-field="end"]','2026-01-01T00:10');
  await page.fill('.ex-row [data-field="reason"]','Automated acceptance-test exclusion');
  await page.click('#runSpillsBtn');
  await page.waitForFunction(()=>document.querySelector('#spillRunStatus')?.textContent.includes('Completed in'),null,{timeout:60000});
  await page.waitForSelector('#obsMonthly .v2-yearly-title',{timeout:60000});
  await page.waitForSelector('#modelMonthly .v2-yearly-title',{timeout:60000});
  if(await page.locator('#spillComparison tbody tr').count()<1)throw new Error('Annual observed/model spill comparison missing');
  const spillDiag=await page.evaluate(()=>window.__ICM_WORKBENCH__.lastSpills);
  if(!spillDiag?.observed)throw new Error(`Observed spill diagnostic missing: ${JSON.stringify(spillDiag)}`);
  if(Math.abs(Number(spillDiag.observed.excluded_seconds)-120)>0.001)throw new Error(`Expected 120 seconds excluded in model clock, got ${JSON.stringify(spillDiag)}`);
  if(!spillDiag.observed.yearly?.length)throw new Error('Yearly spill summary missing from browser diagnostic');

  stage='storage and monthly volume';
  await clickTab('storage');
  const level=await optionValue('#storageLevelSelect','model.csv — depth');
  const flow=await optionValue('#storageFlowSelect','model.csv — flow');
  await page.selectOption('#storageLevelSelect',level);await page.selectOption('#storageFlowSelect',flow);
  await page.selectOption('#storageLevelUnit','m');await page.selectOption('#storageFlowUnit','m3/s');
  await page.fill('#storageThreshold','1.0');
  await page.click('#runStorageBtn');
  await page.waitForFunction(()=>Boolean(window.__ICM_WORKBENCH__.lastStorage),null,{timeout:60000});
  await page.waitForFunction(()=>document.querySelector('#storageSummary')?.textContent.trim().length>0&&document.querySelector('#monthlyVolume')?.textContent.trim().length>0,null,{timeout:60000});

  stage='workspace persistence and reports';
  await clickTab('workspace');
  await page.fill('#workspaceName','Acceptance workspace');
  await page.click('#saveNamedWorkspaceBtn');
  await page.waitForFunction(()=>[...document.querySelectorAll('#namedWorkspaceSelect option')].some(o=>o.textContent==='Acceptance workspace'));

  const workspaceDownload=await downloadFrom('#downloadWorkspaceBtn');
  const workspacePath=await workspaceDownload.path();
  const workspace=JSON.parse(await fs.readFile(workspacePath,'utf8'));
  if(workspace.schema_version!==3||workspace.time_basis!=='model clock/unspecified')throw new Error(`Unexpected workspace schema/time basis: ${JSON.stringify(workspace)}`);
  if(workspace.exclusions?.[0]?.start!=='2026-01-01T00:08')throw new Error(`Exclusion wall clock shifted in Asia/Kolkata: ${JSON.stringify(workspace.exclusions)}`);
  if(workspace.exclusions?.[0]?.end!=='2026-01-01T00:10')throw new Error(`Exclusion end shifted in Asia/Kolkata: ${JSON.stringify(workspace.exclusions)}`);

  await page.setInputFiles('#workspaceInput',workspacePath);
  await page.waitForFunction(()=>document.querySelector('#workspaceStatus')?.textContent.includes('source fingerprint'),null,{timeout:60000});

  // Workspace import intentionally invalidates calculated snapshots. Recalculate every
  // analysis used by the report rather than weakening stale-result export guards.
  await clickTab('compare');
  await page.click('#runCompareBtn');
  await page.waitForFunction(()=>Boolean(state.comparisonSnapshot)&&state.comparisonSnapshot.signature===analysisSignature());
  await clickTab('spills');
  await page.click('#runSpillsBtn');
  await page.waitForFunction(()=>Boolean(state.spillSnapshot)&&state.spillSnapshot.signature===analysisSignature(),null,{timeout:60000});
  const spillLayout=await page.evaluate(()=>{const panel=document.querySelector('#tab-spills .panel')?.getBoundingClientRect();const wraps=[...document.querySelectorAll('#tab-spills .two-col .table-wrap')].map(x=>x.getBoundingClientRect());return {panelRight:panel?.right||0,wraps:wraps.map(x=>({left:x.left,right:x.right,width:x.width}))};});
  if(spillLayout.wraps.some(x=>x.right>spillLayout.panelRight+1))throw new Error(`Spill yearly tables escape the panel: ${JSON.stringify(spillLayout)}`);
  await clickTab('workspace');
  const reportDownload=await downloadFrom('#downloadReportBtn');
  const report=await fs.readFile(await reportDownload.path(),'utf8');
  if(!report.includes('© 2026 Anzar Sajid'))throw new Error('Report copyright missing');
  if(!report.includes('Audit appendix'))throw new Error('Report audit appendix missing');
  if(!report.includes('report-header')||!report.includes('Assessment configuration')||!report.includes('Source provenance'))throw new Error('Professional assessment report structure missing');
  if(!report.includes('Graph statistics')||!report.includes('Integrated total'))throw new Error('Assessment report graph statistics missing');
  if(!report.includes('Professional flow-survey / rainfall assessment')||!report.includes('professional_flow_survey'))throw new Error('Professional flow-survey assessment missing from report/audit appendix');
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
  await downloadFrom('#downloadManifestBtn');

  stage='final browser diagnostics';
  const diag=await page.evaluate(()=>window.__ICM_WORKBENCH__);
  const materialErrors=consoleErrors.filter(x=>!x.includes('favicon.ico'));
  if(materialErrors.length)throw new Error(`Browser console/page errors: ${materialErrors.join(' | ')}`);
  if(diag.errors?.length)throw new Error(`Workbench recorded operation errors: ${JSON.stringify(diag.errors)}`);
  if(failedRequests.filter(x=>!x.includes('favicon.ico')).length)throw new Error(`Failed browser requests: ${failedRequests.join(' | ')}`);

  console.log('Browser acceptance passed: copyright footer, collapsed source pool, observed-only workflow, threshold overlays, separated rainfall band, adaptive native-resolution zoom, comparison diagnostics, multi-R cumulative rainfall, annual spills/exclusions, storage, workspace and reports.');
} catch(err) {
  const status=await page.locator('#engineStatus').textContent().catch(()=>'(missing)');
  const diag=await page.evaluate(()=>window.__ICM_WORKBENCH__||null).catch(()=>null);
  console.error(`ACCEPTANCE FAILURE at stage: ${stage}`);
  console.error(`Engine status: ${status}`);
  console.error(`Workbench diagnostic: ${JSON.stringify(diag)}`);
  console.error(`Console errors: ${JSON.stringify(consoleErrors)}`);
  console.error(`Failed requests: ${JSON.stringify(failedRequests)}`);
  await page.screenshot({path:'/tmp/icm-workbench-failure.png',fullPage:true}).catch(()=>{});
  throw err;
} finally {
  await browser.close();
}
