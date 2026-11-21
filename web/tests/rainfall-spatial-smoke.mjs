import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium,firefox} from 'playwright';
import {browserLaunchOptions,browserContextOptions} from './browser-environment.mjs';
import {installPrivacyGuard} from './privacy-network.mjs';
import XLSX from '../vendor/sheetjs-0.20.3/xlsx.full.min.js';

const base=process.env.ICM_BASE_URL||'http://127.0.0.1:8000/',engine=process.env.ICM_BROWSER||'chromium';
const browser=await (engine==='firefox'?firefox:chromium).launch(browserLaunchOptions());
const context=await browser.newContext({...browserContextOptions(),acceptDownloads:true,viewport:{width:1280,height:960}});
const guard=installPrivacyGuard(context,base,{canaries:['SYNTHETIC-SPATIAL-GAUGE','SYNTHETIC-INTERVAL-DEPTH','SYNTHETIC-SITE-REVIEW']});
const page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));
const dialog=page.getByRole('dialog',{name:'Compare rain gauges'}),status=dialog.getByRole('status');
const suitability=page.getByRole('dialog',{name:'Review verification suitability'});
const suitabilityLauncher=page.getByRole('button',{name:'Review verification suitability',exact:true});
const open=async()=>{await page.locator('button[data-workspace="survey"]').click();
  await page.getByRole('tab',{name:'Rainfall check',exact:true}).click();await page.getByRole('button',{name:'Compare rain gauges',exact:true}).click();};
const upload=(name,header,values)=>({name,mimeType:'text/csv',buffer:Buffer.from('Timestamp,'+header+'\n'+values.map((value,i)=>
  '2025-01-01 00:'+String(i).padStart(2,'0')+':00,'+value).join('\n'))});

try{
  await guard.navigate(page,base);await open();
  await status.getByText('Import at least two observed rainfall channels',{exact:false}).waitFor();
  await dialog.getByRole('button',{name:'Close comparison'}).click();
  await suitabilityLauncher.click();
  await suitability.getByRole('status').getByText('Run a current complete Flow Survey assessment',{exact:false}).waitFor();
  await suitability.getByRole('button',{name:'Close review',exact:true}).click();
  await page.locator('button[data-workspace="data"]').click();
  await page.setInputFiles('#fileInput',[
    upload('=SYNTHETIC-SPATIAL-GAUGE.csv','Rainfall (mm/h)',[0,120,240,0,0]),
    upload('SYNTHETIC-INTERVAL-DEPTH.csv','Rainfall (mm)',[0,4,0,8,0]),
    upload('SYNTHETIC-partial-gauge.csv','Rainfall (mm/h)',[0,120,-30,'',0]),
  ]);
  await page.waitForFunction(()=>window.__ICM_WORKBENCH__.stateSummary().readyFiles===3,null,{timeout:90000});
  await open();
  const select=(i)=>dialog.getByRole('combobox',{name:'Gauge '+i,exact:true});
  const pick=async (i,name)=>select(i).selectOption(await select(i).locator('option').filter({hasText:name}).getAttribute('value'));
  await pick(1,'=SYNTHETIC-SPATIAL-GAUGE.csv');await pick(2,'SYNTHETIC-INTERVAL-DEPTH.csv');
  assert.equal(await select(2).locator('option').filter({hasText:'=SYNTHETIC-SPATIAL-GAUGE.csv'}).evaluate(option=>option.disabled),true);
  await dialog.getByLabel('Project-clock start').fill('2025-01-01T00:00');
  await dialog.getByLabel('Project-clock end').fill('2025-01-01T00:04');
  await dialog.getByLabel('Comparison interval (s)',{exact:true}).fill('60');
  await dialog.getByLabel('Maximum source gap (s)',{exact:true}).fill('60');
  await dialog.getByLabel('Review intensities above (mm/h, optional)',{exact:true}).fill('300');
  await dialog.getByRole('checkbox',{name:/Confirm all gauges/}).check();
  const run=dialog.getByRole('button',{name:'Compare rainfall',exact:true});
  await run.click();await status.getByText('Rainfall comparison ready.',{exact:false}).waitFor({timeout:90000});
  const totals=dialog.getByRole('table',{name:'Gauge coverage and event totals'}),pairs=dialog.getByRole('table',{name:'Pairwise rainfall timing and agreement'});
  const cells=async (table,i)=>table.locator('tbody tr').nth(i).locator('td').allTextContents();
  assert.deepEqual((await cells(totals,0)).slice(1),['100%','6','6','0','0 negative source sample(s) · 0 intense complete bin(s)']);
  assert.deepEqual((await cells(totals,1)).slice(1),['100%','12','12','0','0 negative source sample(s) · 1 intense complete bin(s)']);
  assert.deepEqual((await cells(pairs,0)).slice(1),['4','-0.45455','60']);
  assert.match(await dialog.locator('#hbRainSpatialVariation').innerText(),/33\.333%/);
  const chart=dialog.locator('#hbRainSpatialPlot');
  assert.deepEqual(await chart.evaluate(plot=>plot.data.map(data=>data.y)),[[0,0,2,6,6],[0,0,4,4,12]]);
  await dialog.getByRole('button',{name:'Add a gauge',exact:true}).click();
  assert(await select(3).evaluate(select=>select===document.activeElement));
  await pick(3,'SYNTHETIC-partial-gauge.csv');assert(await totals.isHidden());
  await run.click();await status.getByText('Rainfall comparison ready.',{exact:false}).waitFor();
  assert.deepEqual((await cells(totals,2)).slice(1),['50%','2','Unavailable','2','1 negative source sample(s) · 0 intense complete bin(s)']);
  assert.deepEqual((await cells(pairs,1)).slice(1),['2','Unavailable','Unavailable']);
  assert.deepEqual(await chart.evaluate(plot=>plot.data[2].y),[0,0,2,null,null]);
  assert.match(await dialog.locator('#hbRainSpatialVariation').innerText(),/Unavailable/);
  const requested=page.waitForEvent('download');await dialog.getByRole('button',{name:'Download rainfall comparison CSV'}).click();
  const csv=await fs.readFile(await (await requested).path(),'utf8');
  assert.match(csv,/'=SYNTHETIC-SPATIAL-GAUGE\.csv/);assert.match(csv,/"rainfall-spatial-support-v1"/);
  assert.match(csv,/"2025-01-01T00:03:00","2025-01-01T00:04:00","","0","","false"/);
  if(process.env.ICM_EVIDENCE_DIR){await fs.mkdir(process.env.ICM_EVIDENCE_DIR,{recursive:true});
    await dialog.screenshot({path:process.env.ICM_EVIDENCE_DIR+'/v3-rainfall-spatial-'+engine+'.png'});}
  await dialog.getByRole('button',{name:'Remove gauge 3'}).click();assert(await totals.isHidden());
  await dialog.getByLabel('Project-clock end').fill('2025-01-09T00:04');
  await run.click();await status.getByText('10,000 bins',{exact:false}).waitFor();assert(await run.isEnabled());
  await dialog.getByLabel('Project-clock end').fill('2025-01-01T00:04');
  await dialog.getByLabel('Maximum source gap (s)',{exact:true}).fill('30');
  await run.click();await status.getByText('Rainfall comparison ready.',{exact:false}).waitFor();
  assert.deepEqual((await cells(totals,0)).slice(1,5),['0%','Unavailable','Unavailable','4']);
  await page.keyboard.press('Escape');assert(await dialog.isHidden());

  const nativeRain=(name,rate)=>({name:name+'.R',mimeType:'text/plain',buffer:Buffer.from(
    '**FIELD: 1,RAINFALL\n**UNITS: 1,mm/h\n*CSTART\n2501010000 2501010400 5\n*CEND\n'+
    Array.from({length:48},(_,i)=>i>=6&&i<24?String(rate):'0').join(' ')+'\n')});
  const nativeFdv=name=>({name:name+'.fdv',mimeType:'text/plain',buffer:Buffer.from('**IDENTIFIER: 1,'+name+
    '\n**FIELD: 3,FLOW,DEPTH,VELOCITY\n**UNITS: 3,m3/s,m,m/s\n**CONSTANTS: 2,START,INTERVAL\n*CSTART\n2501010000 5\n*CEND\n'+
    Array.from({length:49},(_,i)=>i>=6&&i<24?'0.20 0.25 0.65':'0.03 0.08 0.25').join('\n')+'\n')});
  await page.locator('button[data-workspace="data"]').click();
  await page.setInputFiles('#fileInput',[nativeRain('RG01',12),nativeRain('RG02',10),nativeFdv('FM01'),nativeFdv('FM02')]);
  await page.waitForFunction(()=>window.__ICM_WORKBENCH__.stateSummary().readyFiles===7,null,{timeout:90000});
  const book=XLSX.utils.book_new();XLSX.utils.book_append_sheet(book,XLSX.utils.aoa_to_sheet([
    ['FDV_Name','RG','Pipe Diameter (mm)','Upstream Trace'],['FM01','RG01',450,''],['FM02','RG02',600,'']]),'Associations');
  await page.setInputFiles('#assocFileInput',{name:'fm_rg_assoc.xlsx',mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    buffer:Buffer.from(XLSX.write(book,{type:'array',bookType:'xlsx'}))});
  await page.waitForFunction(()=>window.__ICM_WORKBENCH__.survey.association?.records?.length===2,null,{timeout:90000});
  await page.locator('button[data-workspace="survey"]').click();await page.getByRole('tab',{name:'FDV check',exact:true}).click();
  const complete=page.locator('#completeSurveyPanel');
  if(await complete.evaluate(item=>item.classList.contains('tool-collapsed')))await complete.locator('.tool-collapse-toggle').first().click();
  await page.locator('#runCompleteSurveyBtn').click();
  await page.locator('#completeSurveyStatus').getByText('Complete survey assessment calculated.',{exact:false}).waitFor({timeout:120000});
  const initial=await page.evaluate(()=>JSON.stringify(window.__ICM_WORKBENCH__.survey.batch.network.candidate_wapug_events));
  assert(JSON.parse(initial).some(row=>row.qualifies_network_wapug));
  await open();
  const windowChoice=dialog.getByRole('combobox',{name:'Assessment window',exact:true});
  const qualified=windowChoice.locator('option').filter({hasText:'Network qualified'}).first();
  await windowChoice.selectOption(await qualified.getAttribute('value'));
  assert.match(await dialog.getByLabel('Project-clock start').inputValue(),/^2025-01-01T/);
  await pick(1,'RG01');await pick(2,'RG02');
  await dialog.getByLabel('Comparison interval (s)',{exact:true}).fill('300');
  await dialog.getByLabel('Maximum source gap (s)',{exact:true}).fill('450');
  await run.click();await status.getByText('WAPUG selection and qualification are unchanged.',{exact:false}).waitFor();
  assert.equal(await page.evaluate(()=>JSON.stringify(window.__ICM_WORKBENCH__.survey.batch.network.candidate_wapug_events)),initial);
  await dialog.getByRole('button',{name:'Close comparison'}).click();
  await suitabilityLauncher.click();
  const reviewStatus=suitability.getByRole('status'),screen=suitability.getByRole('button',{name:'Screen this monitor and period',exact:true});
  await suitability.getByRole('combobox',{name:'Survey monitor',exact:true}).selectOption('FM01');
  const suitabilityWindow=suitability.getByRole('combobox',{name:'Current rainfall event',exact:true});
  await suitabilityWindow.selectOption(await suitabilityWindow.locator('option').filter({hasText:'Network qualified'}).getAttribute('value'));
  await screen.click();await reviewStatus.getByText('Suitability screen ready.',{exact:true}).waitFor();
  await suitability.getByRole('heading',{name:'Hold for review',exact:true}).waitFor();
  assert.match(await suitability.getByRole('row',{name:/Depth instrument range/}).innerText(),/Review missing/);
  await suitability.getByRole('combobox',{name:'Measurement review',exact:true}).selectOption('reviewed');
  await screen.click();await reviewStatus.getByText('Record the site or instrument evidence',{exact:false}).waitFor();
  await suitability.getByRole('textbox',{name:'Site or instrument evidence',exact:true}).fill('=SYNTHETIC-SITE-REVIEW');
  const geometry=suitability.locator('details>summary');await geometry.press('Enter');assert(!(await suitability.locator('details').evaluate(item=>item.open)));
  await geometry.press('Space');assert(await suitability.locator('details').evaluate(item=>item.open));
  for(const [name,value] of Object.entries({depth_min:'.02',depth_max:'.20',velocity_min:'-.2',velocity_max:'1',gap:'450'}))
    await suitability.locator('[name='+name+']').fill(value);
  await screen.click();await reviewStatus.getByText('Suitability screen ready.',{exact:true}).waitFor();
  assert.match(await suitability.getByRole('row',{name:/Depth instrument range/}).innerText(),/Below requirement|Unavailable/);
  await suitability.locator('[name=depth_max]').fill('.9');
  await suitability.getByRole('checkbox',{name:'Require measured flow coverage',exact:true}).uncheck();
  await screen.click();await reviewStatus.getByText('Suitability screen ready.',{exact:true}).waitFor();
  await suitability.getByRole('heading',{name:'Candidate for verification',exact:true}).waitFor();
  assert.match(await suitability.getByRole('row',{name:/Measured flow coverage|Flow coverage/}).innerText(),/Optional/);
  assert.match(await suitability.getByRole('row',{name:/Mapped rainfall coverage/}).innerText(),/RG01.*100\.0%.*Meets/s);
  const auditRequest=page.waitForEvent('download');await suitability.getByRole('button',{name:'Download suitability audit CSV',exact:true}).click();
  const audit=await fs.readFile(await (await auditRequest).path(),'utf8');
  assert.match(audit,/'=SYNTHETIC-SITE-REVIEW/);assert.match(audit,/Candidate for verification/);assert.match(audit,/[a-f0-9]{64}/);
  if(process.env.ICM_EVIDENCE_DIR)await suitability.screenshot({path:process.env.ICM_EVIDENCE_DIR+'/v3-survey-suitability-'+engine+'.png'});
  await page.setViewportSize({width:960,height:760});
  assert(await suitability.evaluate(element=>element.scrollWidth===element.clientWidth),'Review dialog fits the narrow desktop viewport');
  assert(await suitability.getByRole('button',{name:'Close review',exact:true}).evaluate(element=>{
    const rect=element.getBoundingClientRect();return rect.top>=0&&rect.bottom<innerHeight;
  }),'Close action remains visible while reading the narrow results');
  await page.keyboard.press('Escape');assert(await suitability.isHidden());
  await page.locator('button[data-workspace="graphs"]').click();
  await page.getByRole('tab',{name:'Verification matrix',exact:true}).click();
  const matrix=page.locator('#tab-verification-matrix');
  await matrix.locator('#hbVerifyEvents input:checked').first().waitFor();
  assert.equal(await matrix.getByRole('combobox',{name:'Rainfall evidence',exact:true}).inputValue(),'survey');
  assert.equal(await matrix.locator('#hbVerifyEvents input:checked').count(),JSON.parse(initial).filter(row=>row.qualifies_network_wapug).length);
  await page.locator('button[data-workspace="spills"]').click();
  await page.locator('#addExclusionBtn').click();
  const exclusion=page.locator('#exclusionRows .ex-row').first();
  await exclusion.locator('[data-field=scope]').selectOption('survey:gauge:RG01:rainfall');
  await exclusion.locator('[data-field=start]').fill('2025-01-01T00:40');
  await exclusion.locator('[data-field=end]').fill('2025-01-01T00:50');
  await exclusion.locator('[data-field=reason]').fill('Synthetic logger inspection');
  await exclusion.locator('[data-field=reason]').press('Tab');
  await open();
  assert.equal(await windowChoice.locator('option').count(),1,'A changed gauge exclusion invalidates the offered WAPUG assessment');
  await run.click();await status.getByText('Rainfall comparison ready.',{exact:false}).waitFor();
  assert.deepEqual((await cells(totals,0)).slice(1,5),['88.889%','16','Unavailable','2']);
  assert.deepEqual((await cells(totals,1)).slice(1,5),['100%','15','15','0']);
  await dialog.getByRole('button',{name:'Close comparison'}).click();
  await suitabilityLauncher.click();
  await reviewStatus.getByText('Run a current complete Flow Survey assessment',{exact:false}).waitFor();
  assert(await screen.isDisabled());await suitability.getByRole('button',{name:'Close review',exact:true}).click();
  assert.deepEqual(errors,[]);guard.assertClean();console.log('RAINFALL_AND_SUITABILITY_PASS '+engine);
}finally{await browser.close();}
