import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium,firefox} from 'playwright';
import {browserLaunchOptions,browserContextOptions} from './browser-environment.mjs';
import {installPrivacyGuard} from './privacy-network.mjs';

const engine=process.env.ICM_BROWSER||'chromium',base=process.env.ICM_BASE_URL||'http://127.0.0.1:8000/';
const browser=await (engine==='firefox'?firefox:chromium).launch(browserLaunchOptions());
const context=await browser.newContext({...browserContextOptions(),acceptDownloads:true,viewport:{width:1280,height:950}});
const guard=installPrivacyGuard(context,base,{canaries:['SYNTHETIC-VERIFY-MONITOR','SYNTHETIC-MATRIX-COMMENT','SYNTHETIC-BASELINE-REVISION']});
const page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));
const root=page.locator('#tab-verification-matrix'),status=root.locator('#hbVerifyStatus');
const open=async()=>{await page.locator('button[data-workspace="graphs"]').click();await page.getByRole('tab',{name:'Verification matrix',exact:true}).click();};
const time=i=>new Date(Date.UTC(2025,0,1,0,i)).toISOString().slice(0,19);
const hydraulics=(file,base,peak,peakDepth=.4)=>({name:file+'.csv',mimeType:'text/csv',buffer:Buffer.from('Timestamp,Flow (m3/s),Depth (m)\n'+
  Array.from({length:71},(_,i)=>time(i)+','+(i%6===2?peak:base)+','+(i%6===2?peakDepth:.2)).join('\n'))});
const rain={name:'matrix-rain.R',mimeType:'text/plain',buffer:Buffer.from('**FIELD: 1,RAINFALL\n**UNITS: 1,mm/h\n*CSTART\n'+
  '2501010000 2501010112 1\n*CEND\n'+Array.from({length:72},(_,i)=>[1,2].includes(i%6)?'60':'0').join(' ')+'\n')};

try{
  await guard.navigate(page,base);await open();
  await status.getByText('Calculate a current qualifying rainfall event set',{exact:false}).waitFor();
  await page.locator('button[data-workspace="data"]').click();
  await page.setInputFiles('#fileInput',[hydraulics('=SYNTHETIC-VERIFY-MONITOR-A',1,2,.6),hydraulics('SYNTHETIC-VERIFY-MONITOR-B',2,4),
    hydraulics('SYNTHETIC-model-A',1,2.2,.8),hydraulics('SYNTHETIC-model-B',2,3.99),hydraulics('SYNTHETIC-model-C',1,1.9),rain]);
  await page.waitForFunction(()=>window.__ICM_WORKBENCH__.stateSummary().readyFiles===6,null,{timeout:90000});
  const selectRain=page.locator('#rainSelect');
  await selectRain.selectOption(await selectRain.locator('option').filter({hasText:'matrix-rain.R'}).getAttribute('value'));
  const apply=page.locator('#applyMapping');if(await apply.count())await apply.click();
  await page.locator('#rainCriteriaMode').selectOption('manual');
  for(const [id,value] of Object.entries({rainMinIntensity:'1',rainIntensityDuration:'1',rainEventDuration:'2',rainTotalDepth:'.1',rainDryGap:'2'}))
    await page.locator('#'+id).fill(value);
  await page.locator('#runRainEventsBtn').click();
  await page.waitForFunction(()=>rainEventsFresh()&&state.rainEvents.length===12&&!document.body.classList.contains('operation-busy'),null,{timeout:90000});
  await open();await root.getByRole('combobox',{name:'Rainfall evidence',exact:true}).selectOption('data');
  assert.equal(await root.locator('#hbVerifyEvents input:checked').count(),12);
  await root.getByRole('button',{name:'Clear selection',exact:true}).click();assert.equal(await root.locator('#hbVerifyEvents input:checked').count(),0);
  await root.getByRole('button',{name:'Select all',exact:true}).click();assert.equal(await root.locator('#hbVerifyEvents input:checked').count(),12);
  const select=async (caption,source)=>{
    const menu=root.getByRole('combobox',{name:caption,exact:true});
    await menu.selectOption(await menu.locator('option').filter({hasText:source}).getAttribute('value'));
  };
  await select('Observed record 1','SYNTHETIC-VERIFY-MONITOR-A');await select('Modelled scenario 1','SYNTHETIC-model-A');
  await root.getByRole('button',{name:'Add pairing',exact:true}).click();
  assert(await root.getByRole('combobox',{name:'Observed record 2',exact:true}).evaluate(field=>field===document.activeElement));
  await select('Observed record 2','SYNTHETIC-VERIFY-MONITOR-B');await select('Modelled scenario 2','SYNTHETIC-model-B');
  for(const [name,value] of Object.entries({gap:'60',minimum_coverage_percent:'90',peak_offset_minutes:'.5',flow_peak_error_percent:'10',
    flow_volume_error_percent:'5',flow_peak_floor_m3_s:'.0001',flow_volume_floor_m3:'.01'}))await root.locator('[name='+name+']').fill(value);
  await root.getByRole('checkbox',{name:/Confirm each pair/}).check();
  const run=root.getByRole('button',{name:'Calculate verification matrix',exact:true});await run.click();
  await status.getByText('Verification matrix ready. 24 comparisons · 0 unavailable.',{exact:true}).waitFor({timeout:90000});
  const table=root.getByRole('table',{name:'Verification matrix',exact:true});
  assert.equal(await table.locator('tbody tr').count(),20);
  const row=table.locator('tbody tr').first();
  assert.match(await row.innerText(),/100% · Meets.*10% · Meets.*6\.66667% · Outside tolerance.*0 min · Meets/s);
  assert.equal(await row.getByRole('button',{name:/Review SYNTHETIC-model-A/}).evaluate(button=>getComputedStyle(button).whiteSpace),'nowrap');
  await root.getByRole('button',{name:'Next page',exact:true}).click();assert.equal(await table.locator('tbody tr').count(),4);
  await root.getByRole('button',{name:'Previous page',exact:true}).click();assert.equal(await table.locator('tbody tr').count(),20);
  await root.getByRole('combobox',{name:'Filter outcomes',exact:true}).selectOption('outside');assert.equal(await table.locator('tbody tr').count(),12);
  await row.getByRole('button',{name:/Review SYNTHETIC-model-A/}).click();
  const detail=root.getByRole('region',{name:'Selected comparison evidence'});
  assert.match(await detail.innerText(),/120 of 120 s supported.*Observed peak 2.*Modelled peak 2\.2/s);
  await detail.getByRole('textbox',{name:'Engineer comment',exact:true}).fill('=SYNTHETIC-MATRIX-COMMENT');
  await detail.getByRole('button',{name:'Plot event records',exact:true}).click();
  await detail.getByRole('status').getByText('Displayed samples are for context.',{exact:false}).waitFor();
  assert.deepEqual(await detail.locator('#hbVerifyPlot').evaluate(plot=>plot.data.map(trace=>trace.y)),[[1,2,1],[1,2.2,1]]);
  const requested=page.waitForEvent('download');await root.getByRole('button',{name:'Download matrix audit CSV',exact:true}).click();
  const csv=await fs.readFile(await (await requested).path(),'utf8');
  assert.match(csv,/'=SYNTHETIC-MATRIX-COMMENT/);assert.match(csv,/'=SYNTHETIC-VERIFY-MONITOR-A\.csv/);
  assert.match(csv,/"6\.666666666666667","%","5","Outside tolerance"/);
  if(process.env.ICM_EVIDENCE_DIR){await fs.mkdir(process.env.ICM_EVIDENCE_DIR,{recursive:true});
    await page.screenshot({path:process.env.ICM_EVIDENCE_DIR+'/v3-verification-matrix-'+engine+'.png'});}

  const investigate=detail.getByRole('button',{name:'Investigate calibration',exact:true});await investigate.click();
  const calibration=detail.getByRole('region',{name:'Calibration investigation',exact:true}),calibrationStatus=calibration.getByRole('status');
  const calibrate=calibration.getByRole('button',{name:'Review calibration evidence',exact:true});
  await calibrate.click();await calibrationStatus.getByText('Calibration evidence ready.',{exact:true}).waitFor();
  const evidence=calibration.getByRole('table',{name:'Calibration evidence by phase',exact:true});
  assert.match(await evidence.getByRole('row',{name:/Preceding dry-period mean flow/}).innerText(),/Withheld/);
  for(const [name,value] of Object.entries({pre_start:'2025-01-01T00:00',pre_end:'2025-01-01T00:01',
    post_start:'2025-01-01T00:03',post_end:'2025-01-01T00:04',dry_rain_mm:'0'}))await calibration.locator('[name='+name+']').fill(value);
  await calibrate.click();await calibrationStatus.getByText('Confirm the appropriate rainfall source',{exact:false}).waitFor();
  await calibration.getByRole('checkbox',{name:/Reviewed the gauge/}).check();
  await calibration.locator('[name=pre_end]').fill('2025-01-01T00:02');
  await calibrate.click();await calibrationStatus.getByText('The preceding period must end by the start',{exact:false}).waitFor();
  await calibration.locator('[name=pre_end]').fill('2025-01-01T00:01');
  await calibration.getByText('Paired depth evidence',{exact:true}).click();
  await select('Observed depth','SYNTHETIC-VERIFY-MONITOR-A');await select('Modelled depth','SYNTHETIC-model-A');
  await calibration.getByRole('checkbox',{name:/Confirmed the same site/}).check();
  await calibration.getByText('Optional project tolerances',{exact:true}).click();
  for(const [name,value] of Object.entries({dry_mean_m3_s:'.02',storm_excess_m3:'10',recovery_mean_m3_s:'.02',depth_difference_m:'.1'}))
    await calibration.locator('[name='+name+']').fill(value);
  await calibrate.click();await calibrationStatus.getByText('Calibration evidence ready.',{exact:true}).waitFor();
  assert.match(await calibration.locator('#hbCalibrationCoverage').innerText(),/0 mm · 60 of 60 s supported/);
  assert.match(await calibration.locator('#hbCalibrationHydraulicSupport').innerText(),/Storm depth 120 of 120 s supported/);
  assert.match(await evidence.getByRole('row',{name:/Storm volume above preceding mean/}).innerText(),/60 m³.*72 m³.*12 m³.*Review difference/s);
  assert.match(await evidence.getByRole('row',{name:/Paired depth peaks/}).innerText(),/0\.6 m.*0\.8 m.*0\.2 m.*Review difference/s);
  assert.match(await evidence.getByRole('row',{name:/Recovery flow above preceding mean/}).innerText(),/0 m³\/s.*Within review range/s);
  const calibrationRequested=page.waitForEvent('download');await calibration.getByRole('button',{name:'Download calibration evidence CSV',exact:true}).click();
  const calibrationAudit=await fs.readFile(await (await calibrationRequested).path(),'utf8');
  assert.match(calibrationAudit,/verification-phase-investigation-v1/);assert.match(calibrationAudit,/'=SYNTHETIC-VERIFY-MONITOR-A\.csv/);
  assert.match(calibrationAudit,/"Preceding flow","60","60","0"/);
  assert.match(calibrationAudit,/"Storm volume above preceding mean","60","72","m³","12","m³","10","Review difference"/);
  if(process.env.ICM_EVIDENCE_DIR)await calibration.screenshot({path:process.env.ICM_EVIDENCE_DIR+'/v3-calibration-investigation-'+engine+'.png'});
  await calibration.getByRole('button',{name:'Close investigation',exact:true}).click();
  assert(await calibration.isHidden());assert(await investigate.evaluate(button=>button===document.activeElement));

  const tracking=root.getByRole('region',{name:'Scenario revision tracking'}),revisionStatus=tracking.getByRole('status');
  await tracking.getByRole('textbox',{name:'Revision name',exact:true}).fill('=SYNTHETIC-BASELINE-REVISION');
  await tracking.getByRole('button',{name:'Use current as baseline',exact:true}).click();
  await revisionStatus.getByText('Baseline ready.',{exact:false}).waitFor();
  const snapshotRequested=page.waitForEvent('download');await tracking.getByRole('button',{name:'Save verification snapshot',exact:true}).click();
  const snapshotPath=await (await snapshotRequested).path(),snapshot=JSON.parse(await fs.readFile(snapshotPath,'utf8'));
  assert.equal(snapshot.schema,'hydra-verification-snapshot-v1');assert.equal(snapshot.rows.length,24);
  assert.equal(snapshot.rows[0].comment,'=SYNTHETIC-MATRIX-COMMENT');
  assert.equal(snapshot.rows[0].evidence.observed_volume_m3,180);assert.match(snapshot.rows[0].rainfall_provenance,/^[a-f0-9]{64}$/);
  await tracking.getByRole('button',{name:'Clear baseline',exact:true}).click();
  assert(await tracking.getByRole('button',{name:'Compare with baseline',exact:true}).isDisabled());
  await tracking.getByLabel('Open baseline snapshot').setInputFiles({name:'review.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(snapshot))});
  await revisionStatus.getByText('Baseline ready.',{exact:false}).waitFor();
  await tracking.getByLabel('Open baseline snapshot').setInputFiles({name:'bad.json',mimeType:'application/json',buffer:Buffer.from('{')});
  await revisionStatus.getByText('The selected file is not a readable verification snapshot.',{exact:true}).waitFor();
  assert.match(await tracking.locator('#hbRevisionBaseline').innerText(),/SYNTHETIC-BASELINE-REVISION.*24 saved comparisons/);
  await select('Modelled scenario 1','SYNTHETIC-model-C');
  await tracking.getByRole('textbox',{name:'Revision name',exact:true}).fill('Proposal C');
  await run.click();await status.getByText('Verification matrix ready. 24 comparisons · 0 unavailable.',{exact:true}).waitFor();
  await tracking.getByRole('button',{name:'Compare with baseline',exact:true}).click();
  await revisionStatus.getByText('Revision comparison ready.',{exact:true}).waitFor();
  const revisionTable=tracking.getByRole('table',{name:'Verification change by criterion',exact:true});
  assert.match(await revisionTable.locator('tbody tr').first().innerText(),/Peak error.*10.*-5.*Improved.*SYNTHETIC-MATRIX-COMMENT/s);
  await tracking.getByRole('combobox',{name:'Filter revision results',exact:true}).selectOption('Improved');
  assert.equal(await revisionTable.locator('tbody tr').count(),20);
  await tracking.getByRole('button',{name:'Next revisions page',exact:true}).click();assert.equal(await revisionTable.locator('tbody tr').count(),4);
  await tracking.getByRole('button',{name:'Previous revisions page',exact:true}).click();assert.equal(await revisionTable.locator('tbody tr').count(),20);
  const revisionsRequested=page.waitForEvent('download');await tracking.getByRole('button',{name:'Download revision comparison CSV',exact:true}).click();
  const revisionsAudit=await fs.readFile(await (await revisionsRequested).path(),'utf8');
  assert.match(revisionsAudit,/'=SYNTHETIC-BASELINE-REVISION/);assert.match(revisionsAudit,/'=SYNTHETIC-MATRIX-COMMENT/);assert.match(revisionsAudit,/"Unchanged"/);
  if(process.env.ICM_EVIDENCE_DIR)await tracking.screenshot({path:process.env.ICM_EVIDENCE_DIR+'/v3-verification-revisions-'+engine+'.png'});
  await root.locator('[name=flow_volume_error_percent]').fill('4');
  assert(await revisionTable.isHidden());
  await run.click();await status.getByText('Verification matrix ready. 24 comparisons · 0 unavailable.',{exact:true}).waitFor();
  await tracking.getByRole('button',{name:'Compare with baseline',exact:true}).click();
  await revisionStatus.getByText('Revision comparison ready.',{exact:true}).waitFor();
  assert.match(await revisionTable.locator('tbody tr').first().innerText(),/Not comparable.*same project basis/s);

  await root.getByRole('button',{name:'Remove pairing 2',exact:true}).click();assert(await table.isHidden());
  await page.evaluate(()=>{const invoke=engine.call.bind(engine);engine.call=async (name,...args)=>{
    const data=await invoke(name,...args);if(name==='verification_matrix_event')await new Promise(resolve=>setTimeout(resolve,400));return data;};});
  await run.click();await root.getByRole('button',{name:'Cancel calculation',exact:true}).click();
  await status.getByText('Calculation cancelled.',{exact:false}).waitFor();assert(await table.isHidden());
  await root.getByRole('combobox',{name:'Hydraulic quantity',exact:true}).selectOption('depth');
  assert(await root.locator('[name=depth_peak_error_m]').isVisible());assert(await root.locator('[name=flow_peak_error_percent]').isHidden());
  assert.equal(await root.getByRole('combobox',{name:'Observed record 1',exact:true}).inputValue(),'');
  assert.deepEqual(errors,[]);guard.assertClean();console.log('VERIFICATION_MATRIX_PASS '+engine);
}finally{await browser.close();}
