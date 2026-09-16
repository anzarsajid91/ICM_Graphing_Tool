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
async function waitReady(){
  try{await page.waitForFunction(()=>window.__ICM_WORKBENCH__?.status==='ready'&&document.querySelector('#engineStatus')?.textContent.includes('ready'),null,{timeout:120000});}
  catch(err){const status=await page.locator('#engineStatus').textContent().catch(()=>'(missing)');const diag=await page.evaluate(()=>window.__ICM_WORKBENCH__||null).catch(()=>null);throw new Error(`Engine readiness failed. status=${status}; diagnostic=${JSON.stringify(diag)}; original=${err}`);}
}

try{
  stage='open application';
  await page.goto('http://127.0.0.1:8000/',{waitUntil:'domcontentloaded'});
  await waitReady();

  stage='source pool';
  await page.setInputFiles('#fileInput',[
    path.join(root,'examples/demo/observed.csv'),
    path.join(root,'examples/demo/model.csv'),
    path.join(root,'examples/demo/rainfall.csv'),
  ]);
  await page.waitForFunction(()=>document.querySelectorAll('#poolBody tr').length===3&&document.querySelector('#poolSummary')?.textContent.includes('3 parsed successfully'),null,{timeout:60000});
  if(await page.locator('#poolBody tr').count()!==3)throw new Error('Expected exactly three source-pool rows');

  stage='mapping and graph';
  const obsDepth=await optionValue('#observedSelect','observed.csv — depth');
  const obsFlow=await optionValue('#ratingObsFlow','observed.csv — flow');
  const modelDepth=await optionValue('#modelSelect','model.csv — depth');
  const modelFlow=await optionValue('#ratingModelFlow','model.csv — flow');
  const rain=await optionValue('#rainSelect','rainfall.csv — rainfall');
  if(!obsDepth||!obsFlow||!modelDepth||!modelFlow||!rain)throw new Error('Expected depth/flow/rainfall series options were not created');
  await page.selectOption('#observedSelect',obsDepth);
  await page.selectOption('#modelSelect',[modelDepth]);
  await page.selectOption('#rainSelect',rain);
  await page.click('#applyMappingBtn');
  await page.waitForSelector('#timeChart .main-svg',{timeout:60000});

  stage='calibration comparison and diagnostics';
  await clickTab('compare');
  await page.click('#runCompareBtn');
  await page.waitForFunction(()=>document.querySelectorAll('#scenarioBody tr').length===1&&document.querySelectorAll('#metricGrid .metric').length>=8,null,{timeout:60000});
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

  stage='rainfall event workflow';
  await clickTab('rain-events');
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

  stage='spill exclusions in Asia/Kolkata';
  await clickTab('spills');
  await page.fill('#obsThreshold','1.0');
  await page.fill('#modelThreshold','1.0');
  await page.click('#addExclusionBtn');
  await page.fill('.ex-row [data-field="start"]','2026-01-01T00:08');
  await page.fill('.ex-row [data-field="end"]','2026-01-01T00:10');
  await page.fill('.ex-row [data-field="reason"]','Automated acceptance-test exclusion');
  await page.click('#runSpillsBtn');
  await page.waitForFunction(()=>document.querySelector('#obsSpillSummary')?.textContent.includes('12/24 spill count'),null,{timeout:60000});
  const spillDiag=await page.evaluate(()=>window.__ICM_WORKBENCH__.lastSpills);
  if(!spillDiag?.observed)throw new Error(`Observed spill diagnostic missing: ${JSON.stringify(spillDiag)}`);
  if(Math.abs(Number(spillDiag.observed.excluded_seconds)-120)>0.001)throw new Error(`Expected 120 seconds excluded in model clock, got ${JSON.stringify(spillDiag)}`);

  stage='storage and monthly volume';
  await clickTab('storage');
  const level=await optionValue('#storageLevelSelect','model.csv — depth');
  const flow=await optionValue('#storageFlowSelect','model.csv — flow');
  await page.selectOption('#storageLevelSelect',level);await page.selectOption('#storageFlowSelect',flow);
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
  await page.waitForFunction(()=>document.querySelector('#workspaceStatus')?.textContent.includes('3/3 source fingerprint'),null,{timeout:60000});

  await downloadFrom('#downloadReportBtn');
  await page.fill('#reportYear','2026');
  await downloadFrom('#downloadFourPeriodBtn');
  await downloadFrom('#downloadManifestBtn');

  stage='final browser diagnostics';
  const diag=await page.evaluate(()=>window.__ICM_WORKBENCH__);
  const materialErrors=consoleErrors.filter(x=>!x.includes('favicon.ico'));
  if(materialErrors.length)throw new Error(`Browser console/page errors: ${materialErrors.join(' | ')}`);
  if(diag.errors?.length)throw new Error(`Workbench recorded operation errors: ${JSON.stringify(diag.errors)}`);
  if(failedRequests.filter(x=>!x.includes('favicon.ico')).length)throw new Error(`Failed browser requests: ${failedRequests.join(' | ')}`);

  console.log('Browser acceptance passed in Asia/Kolkata: engine, common source pool, graph, metrics, residual/cumulative/exceedance, rating, DWF, rainfall events, data health, model-clock exclusions, spills, storage/monthly volume, workspace reload and all report/provenance downloads.');
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
