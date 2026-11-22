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
  assert.deepEqual(errors,[]);guard.assertClean();console.log('ASSESSMENT_REVISION_PASS',engine);
}finally{await browser.close();}
