/* SPDX-FileCopyrightText: 2026 Anzar Sajid and other applicable rights holders
 * SPDX-License-Identifier: AGPL-3.0-only */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium,firefox} from 'playwright';
import {browserLaunchOptions,browserContextOptions} from './browser-environment.mjs';
import {installPrivacyGuard} from './privacy-network.mjs';

const engine=process.env.ICM_BROWSER||'chromium',base=process.env.ICM_BASE_URL||'http://127.0.0.1:8000/';
const browser=await (engine==='firefox'?firefox:chromium).launch(browserLaunchOptions());
const context=await browser.newContext({...browserContextOptions(),acceptDownloads:true,viewport:{width:1440,height:1000}});
const guard=installPrivacyGuard(context,base,{canaries:['HB-LOCAL-REVISION-REPORT']});
const page=await context.newPage(),errors=[];
page.on('pageerror',error=>errors.push(error.message));
const system=page.locator('#tab-pipe-system'),revisions=page.locator('#tab-assessment-revision');
async function calculate(inputs){
  await page.locator('button[data-workspace="hydraulics"]').click();
  await page.getByRole('tab',{name:'System curve',exact:true}).click();
  for(const [field,value] of Object.entries(inputs))await system.locator(`[name="${field}"]`).fill(String(value));
  await system.getByRole('button',{name:'Calculate',exact:true}).click();
  await system.getByRole('status').filter({hasText:/System curve calculated/}).waitFor({timeout:90000});
}
async function openRevisions(){
  await page.locator('button[data-workspace="reports"]').click();
  await page.getByRole('tab',{name:'Revision comparison',exact:true}).click();
  await revisions.getByLabel('Revision name',{exact:true}).waitFor();
}
const button=name=>revisions.getByRole('button',{name,exact:true});
const status=pattern=>revisions.locator('#hbAssessmentStatus').filter({hasText:pattern}).waitFor();
async function download(name){
  const [file]=await Promise.all([page.waitForEvent('download'),button(name).click()]);
  return fs.readFile(await file.path(),'utf8');
}
const upload=(side,packet)=>revisions.getByLabel('Open '+side+' snapshot',{exact:true}).setInputFiles({
  name:'synthetic-'+side+'.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(packet))});

const detrimentField=key=>page.locator(`#dtForm [data-key="${key}"]`);
async function runFloodAssessment(){
  await page.locator('#runDetrimentBtn').click();
  await page.locator('#dtStatus').filter({hasText:'Assessment complete'}).waitFor({timeout:90000});
}
async function openDetriment(){
  await page.locator('button[data-workspace="detriment"]').click();
  await page.getByRole('tab',{name:'Flooding detriment',exact:true}).click();
}
async function openStorage(){
  await page.locator('button[data-workspace="spills"]').click();
  await page.getByRole('tab',{name:'Storage assessment',exact:true}).click();
}
async function runStorage(){
  await page.locator('#runStorageBtn').click();
  await page.waitForFunction(()=>state.storage&&state.storageSignature===storageInputSignature()&&
    !document.body.classList.contains('operation-busy'),null,{timeout:90000});
}

try{
  await guard.navigate(page,base);
  await calculate({static_head_m:-1,flow_m3_s:.05,curve_max_m3_s:.15,diameter_m:.3,length_m:1000,
    darcy_factor:.02,minor_k:2,entrance_k:.5,exit_k:1});
  await openRevisions();
  await button('Capture baseline').click();await status(/invalid revision name/);
  await revisions.getByLabel('Revision name',{exact:true}).fill('Baseline HB-LOCAL-REVISION-REPORT');
  await revisions.getByLabel('Outstanding engineering action',{exact:true}).fill('Review pipe friction assumption');
  await button('Capture baseline').click();await status(/Baseline assessment captured/);
  const baseline=JSON.parse(await download('Download baseline snapshot'));
  assert.equal(baseline.records.find(row=>row.id==='calculation:pipeSystemForm').method,'steady-fixed-darcy-v1');
  const compare=button('Compare assessment snapshots');assert(await compare.isDisabled());
  await calculate({static_head_m:-2});
  await openRevisions();
  await revisions.getByLabel('Revision name',{exact:true}).fill('Proposed reviewed revision');
  await revisions.getByLabel('Revision review note',{exact:true}).fill('<script>synthetic report canary</script>');
  await revisions.getByLabel('Outstanding engineering action',{exact:true}).fill('Record updated survey');
  await button('Capture proposed').click();await status(/Proposed assessment captured/);
  await compare.click();await status(/Compared Baseline/);
  const filter=revisions.getByLabel('Change status',{exact:true});
  await filter.selectOption('Changed');
  const table=revisions.getByRole('table',{name:'Assessment changes',exact:true});
  await table.getByRole('row',{name:/Total required head.*Changed/}).waitFor();
  await table.getByRole('row',{name:/Review pipe friction assumption.*Record updated survey/}).waitFor();
  const audit=await download('Download revision audit CSV');
  assert.match(audit,/"Total required head \(m\)".*"Changed"/);
  assert.match(audit,/"Static head \(m\)".*"Changed"/);
  const html=await download('Download revision report');
  assert.match(html,/Assessment Revision Review/);
  assert.match(html,/&lt;script&gt;synthetic report canary&lt;\/script&gt;/);
  assert.doesNotMatch(html,/<script\b/);
  await filter.selectOption('');
  const next=button('Next page');
  if(await next.isEnabled()){
    await next.click();await revisions.locator('#hbAssessmentPage').filter({hasText:'Showing 31'}).waitFor();
    await button('Previous page').click();
  }
  const altered=JSON.parse(await download('Download proposed snapshot'));
  altered.records.find(row=>row.id==='calculation:pipeSystemForm').method='reviewed-other-method';
  await upload('proposed',{schema_version:99});await status(/supported assessment snapshot schema/);
  await upload('proposed',altered);await status(/Proposed snapshot opened locally/);
  await compare.click();await filter.selectOption('Not comparable');
  await table.getByRole('row',{name:/Total required head.*calculation method changed/}).waitFor();
  if(process.env.ICM_EVIDENCE_DIR){
    await fs.mkdir(process.env.ICM_EVIDENCE_DIR,{recursive:true});
    await revisions.screenshot({path:process.env.ICM_EVIDENCE_DIR+'/v3-revision-comparison-'+engine+'.png'});
  }
  await button('Clear baseline').click();await status(/Baseline snapshot cleared/);assert(await compare.isDisabled());
  await upload('baseline',baseline);await status(/Baseline snapshot opened locally/);assert(await compare.isEnabled());

  await page.locator('button[data-workspace="data"]').click();
  const times=[0,2,2,0,0,0].map((depth,index)=>`2026-01-01 00:${String(index*2).padStart(2,'0')}:00,${depth},0.1`);
  await page.setInputFiles('#fileInput',{name:'synthetic-storage-support.csv',mimeType:'text/csv',
    buffer:Buffer.from(['Timestamp,Depth (m),Flow (m3/s)',...times,''].join('\n'))});
  await page.waitForFunction(()=>window.__ICM_WORKBENCH__.stateSummary().readyFiles===1,null,{timeout:90000});
  await page.setInputFiles('#dtFileInput',['tests/fixtures/detriment/flood-a.csv','tests/fixtures/detriment/flood-b.csv']);
  await page.waitForFunction(()=>window.__ICM_WORKBENCH__.stateSummary().readyFiles===3,null,{timeout:90000});

  await openDetriment();
  await detrimentField('a.id').selectOption({label:'flood-a.csv'});
  await detrimentField('b.id').selectOption({label:'flood-b.csv'});
  await detrimentField('scope').fill('Synthetic matched design storms');
  await detrimentField('scope_confirmed').check();
  await detrimentField('threshold').fill('5');
  await runFloodAssessment();
  await page.getByRole('tab',{name:'Scenario comparison',exact:true}).click();
  const scenarios=page.locator('#tab-detriment-scenarios');
  await scenarios.getByLabel('Proposal 1 name',{exact:true}).fill('Expansion');
  await scenarios.getByLabel('I reviewed the shared proposal mapping and basis',{exact:true}).check();
  await scenarios.getByRole('button',{name:'Compare against baseline'}).click();
  await scenarios.getByRole('status').filter({hasText:'1 scenarios compared · 0 unavailable'}).waitFor({timeout:90000});
  await scenarios.getByText('Include category in combined register',{exact:true}).click();
  await scenarios.getByLabel('Baseline model revision',{exact:true}).fill('Synthetic baseline release');
  await scenarios.getByLabel('Report asset identity',{exact:true}).selectOption('node');
  await scenarios.getByRole('button',{name:'Use this category',exact:true}).click();
  await scenarios.getByRole('status').filter({hasText:'Flooding included'}).waitFor();

  // Use the same empty-mapping pathway as workspace restoration.
  await page.evaluate(async()=>{
    document.getElementById('observedSelect').value='';
    document.getElementById('modelSelect').selectedIndex=-1;
    document.getElementById('rainSelect').value='';
    await applyMapping({allowEmpty:true});
  });
  assert.deepEqual(await page.evaluate(()=>state.mapping),{observed:'',models:[],rain:''});

  await openStorage();
  for(const [selector,quantity] of [['#storageLevelSelect','depth'],['#storageFlowSelect','flow']]){
    const key=await page.locator(`${selector} option`).evaluateAll((options,term)=>
      options.find(option=>option.textContent.includes('synthetic-storage-support')&&option.textContent.toLowerCase().includes(term))?.value,quantity);
    assert(key);
    await page.selectOption(selector,key);
  }
  for(const [selector,unit] of [['#storageLevelUnit','m'],['#storageFlowUnit','m3/s'],['#storageThresholdUnit','m']])await page.selectOption(selector,unit);
  await page.locator('#storageThreshold').fill('1');
  await page.locator('#targetCount').fill('0');
  await runStorage();

  await page.locator('button[data-workspace="reports"]').click();
  await page.getByRole('tab',{name:'Report generation',exact:true}).click();
  const builder=page.locator('#pwReportBuilderSurface');
  await builder.getByLabel('Report template',{exact:true}).selectOption('spills');
  await builder.getByRole('checkbox',{name:'Full-period time series',exact:true}).uncheck();
  await builder.getByRole('button',{name:'Preview assessment report',exact:true}).click();
  const preview=builder.getByRole('dialog',{name:'Assessment report preview'}),frame=preview.frameLocator('iframe');
  await frame.getByRole('heading',{name:'Storage calculation sheet',exact:true}).waitFor();
  const inputs=frame.getByRole('table',{name:'Storage calculation inputs',exact:true});
  assert.match(await inputs.getByRole('row',{name:/Target compatibility count/}).innerText(),/\b0\b/);
  assert.match(await inputs.getByRole('row',{name:/Threshold/}).innerText(),/\b1 m\b/);
  const sources=frame.getByRole('table',{name:'Mapped storage sources',exact:true});
  assert.match(await sources.innerText(),/synthetic-storage-support\.csv.*[a-f0-9]{64}/s);
  assert.match(await frame.getByRole('table',{name:'Storage intermediate volumes',exact:true}).innerText(),/2026\s+24\s+24\s+100/);
  if(process.env.ICM_EVIDENCE_DIR){
    await frame.getByRole('heading',{name:'Storage calculation sheet',exact:true}).scrollIntoViewIfNeeded();
    await preview.screenshot({path:process.env.ICM_EVIDENCE_DIR+'/v3-storage-calculation-sheet-'+engine+'.png'});
  }
  const localReport=page.waitForEvent('download');
  await preview.getByRole('button',{name:'Download preview',exact:true}).click();
  const sheet=await fs.readFile(await (await localReport).path(),'utf8');
  assert.match(sheet,/Storage calculation sheet/);assert.match(sheet,/smallest capacity C/);assert.doesNotMatch(sheet,/<script\b/);
  await preview.getByRole('button',{name:'Close',exact:true}).click();
  await openRevisions();
  const assetId=revisions.getByLabel('Detriment asset ID (optional)',{exact:true});
  await assetId.fill('1');await button('Capture baseline').click();await status(/No current Detriment evidence matched/);
  await assetId.fill('001');await button('Capture baseline').click();await status(/Baseline assessment captured/);
  const reviewed=JSON.parse(await download('Download baseline snapshot'));
  const value=(record,group,key)=>record[group].find(field=>field.key===key).value;
  const assessment=reviewed.records.find(record=>record.id==='storage:episode:2026');
  assert.equal(value(assessment,'results','Required storage'),24);
  assert.equal(value(reviewed.records.find(record=>record.id==='storage:calendar:2026'),'results','Physical discharge'),24);
  const matched=reviewed.records.filter(record=>record.id.startsWith('detriment:'));
  assert.deepEqual(matched.map(record=>JSON.parse(record.id.slice(10))),[
    ['flooding','report','001',null],['flooding','node','001','Expansion']]);
  const [flood,typed]=matched;
  assert.equal(value(flood,'results','Change in flood volume'),6);
  assert.equal(value(flood,'results','Assessment status'),'detriment');
  assert.match(value(flood,'basis','Baseline extraction'),/"sha256":"[a-f0-9]{64}"/);
  assert.equal(value(typed,'basis','Reviewed common baseline revision'),'Synthetic baseline release');

  await openDetriment();await detrimentField('threshold').fill('6');await runFloodAssessment();
  await openStorage();await page.locator('#targetCount').fill('1');await runStorage();
  await openRevisions();await button('Capture proposed').click();await status(/Proposed assessment captured/);
  const changed=JSON.parse(await download('Download proposed snapshot'));
  assert.deepEqual(changed.records.filter(record=>record.id.startsWith('detriment:')).map(record=>record.id),[flood.id]);
  assert.equal(value(changed.records.find(record=>record.id===assessment.id),'results','Required storage'),0);
  await compare.click();await filter.selectOption('Not comparable');
  await table.getByRole('row',{name:/Required storage.*24 m³.*0 m³.*basis changed/}).waitFor();
  await table.getByRole('row',{name:/Change in flood volume.*6 m³.*6 m³.*basis changed/}).waitFor();
  const scopedAudit=await download('Download revision audit CSV');
  assert.match(scopedAudit,/"001 · Flood volume · Expansion","Evidence","Evidence record".*"Removed"/);
  if(process.env.ICM_EVIDENCE_DIR)await revisions.screenshot({path:process.env.ICM_EVIDENCE_DIR+'/v3-storage-and-flood-revision-'+engine+'.png'});
  await page.setViewportSize({width:1024,height:850});
  const changeTable=revisions.getByRole('region',{name:'Assessment change table'});
  await changeTable.focus();
  assert.equal(await changeTable.evaluate(element=>element===document.activeElement),true);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1),true);
  assert.deepEqual(errors,[]);guard.assertClean();console.log('ASSESSMENT_REVISION_PASS',engine);
}finally{await browser.close();}
