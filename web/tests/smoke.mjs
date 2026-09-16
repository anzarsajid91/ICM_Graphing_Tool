import { chromium } from 'playwright';
import path from 'node:path';

const root=process.cwd();
const browser=await chromium.launch({headless:true});
const page=await browser.newPage({viewport:{width:1440,height:1000},acceptDownloads:true});
const consoleErrors=[];
page.on('pageerror',e=>consoleErrors.push(String(e)));
page.on('console',m=>{ if(m.type()==='error') consoleErrors.push(m.text()); });

async function optionValue(selector,needle){
  return page.locator(`${selector} option`).evaluateAll((opts,n)=>{const o=opts.find(x=>x.textContent.includes(n));return o?.value||''},needle);
}

await page.goto('http://127.0.0.1:8000/',{waitUntil:'domcontentloaded'});
await page.waitForFunction(()=>document.querySelector('#engineStatus')?.textContent.includes('ready'),null,{timeout:120000});

await page.setInputFiles('#fileInput',[
  path.join(root,'examples/demo/observed.csv'),
  path.join(root,'examples/demo/model.csv'),
  path.join(root,'examples/demo/rainfall.csv'),
]);
await page.waitForFunction(()=>document.querySelectorAll('#poolBody tr').length===3 && document.querySelector('#poolSummary')?.textContent.includes('3 parsed successfully'),null,{timeout:60000});

const obs=await optionValue('#observedSelect','observed.csv — depth');
const modelDepth=await optionValue('#modelSelect','model.csv — depth');
const rain=await optionValue('#rainSelect','rainfall.csv — rainfall');
if(!obs||!modelDepth||!rain) throw new Error('Expected source-pool series options were not created');
await page.selectOption('#observedSelect',obs);
await page.selectOption('#modelSelect',[modelDepth]);
await page.selectOption('#rainSelect',rain);
await page.click('#applyMappingBtn');
await page.waitForSelector('#timeChart .main-svg',{timeout:60000});

await page.click('[data-tab="compare"]');
await page.click('#runCompareBtn');
await page.waitForFunction(()=>document.querySelectorAll('#scenarioBody tr').length===1 && document.querySelectorAll('#metricGrid .metric').length>=8,null,{timeout:60000});

await page.click('[data-tab="spills"]');
await page.fill('#obsThreshold','1.0');
await page.fill('#modelThreshold','1.0');
await page.click('#addExclusionBtn');
await page.fill('.ex-row [data-field="start"]','2026-01-01T00:08');
await page.fill('.ex-row [data-field="end"]','2026-01-01T00:10');
await page.fill('.ex-row [data-field="reason"]','Automated acceptance-test exclusion');
await page.click('#runSpillsBtn');
await page.waitForFunction(()=>document.querySelector('#obsSpillSummary')?.textContent.includes('12/24 spill count'),null,{timeout:60000});

await page.click('[data-tab="storage"]');
const level=await optionValue('#storageLevelSelect','model.csv — depth');
const flow=await optionValue('#storageFlowSelect','model.csv — flow');
await page.selectOption('#storageLevelSelect',level);
await page.selectOption('#storageFlowSelect',flow);
await page.fill('#storageThreshold','1.0');
await page.click('#runStorageBtn');
await page.waitForFunction(()=>document.querySelector('#storageSummary')?.textContent.includes('idealised required storage'),null,{timeout:60000});

await page.click('[data-tab="workspace"]');
const workspaceDownload=page.waitForEvent('download');
await page.click('#downloadWorkspaceBtn');
await workspaceDownload;
const reportDownload=page.waitForEvent('download');
await page.click('#downloadReportBtn');
await reportDownload;

const materialErrors=consoleErrors.filter(x=>!x.includes('favicon.ico'));
if(materialErrors.length) throw new Error(`Browser console/page errors: ${materialErrors.join(' | ')}`);
console.log('Browser acceptance path passed: engine, source pool, graph, compare, exclusion-aware spills, storage, workspace/report downloads.');
await browser.close();
