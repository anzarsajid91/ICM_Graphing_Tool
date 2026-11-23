import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium,firefox} from 'playwright';
import {browserLaunchOptions,browserContextOptions} from './browser-environment.mjs';
import {installPrivacyGuard} from './privacy-network.mjs';

const engine=process.env.ICM_BROWSER||'chromium',base=process.env.ICM_BASE_URL||'http://127.0.0.1:8000/';
const browser=await (engine==='firefox'?firefox:chromium).launch(browserLaunchOptions());
const context=await browser.newContext({...browserContextOptions(),acceptDownloads:true,viewport:{width:1240,height:920}});
const guard=installPrivacyGuard(context,base,{canaries:['SYNTHETIC-BASE-SCENARIO','SYNTHETIC-PROPOSED-A','SYNTHETIC-PROPOSED-B','SYNTHETIC-ASSET-42']});
const page=await context.newPage(),errors=[];
page.on('pageerror',error=>errors.push(error.message));
const panel=page.getByRole('dialog',{name:'Compare spill scenarios'});
const select=async(control,label)=>control.selectOption(await control.locator('option').filter({hasText:label}).getAttribute('value'));
const combo=name=>panel.getByRole('combobox',{name,exact:true});
const field=name=>panel.getByLabel(name,{exact:true});
const status=panel.getByRole('status');
const file=(name,duration,missing=false)=>{
  const rows=['Timestamp,Depth (m),Flow (m3/s)'];
  for(let i=0;i<=182;i++){
    const clock=new Date(Date.UTC(2024,9,1+i)).toISOString().slice(0,-5),day=clock.slice(0,10);
    const high=['2024-10-02','2025-01-02'].includes(day)||(duration===2&&['2024-10-03','2025-01-03'].includes(day));
    rows.push(clock+','+(missing&&day==='2025-02-10'?'':high?'2':'0')+',0.1');
  }
  return {name,mimeType:'text/csv',buffer:Buffer.from(rows.join('\n'))};
};

try{
  await guard.navigate(page,base);
  await page.locator('button[data-workspace="data"]').click();
  await page.setInputFiles('#fileInput',[file('=SYNTHETIC-BASE-SCENARIO.csv',1),file('SYNTHETIC-PROPOSED-A.csv',2),file('SYNTHETIC-PROPOSED-B.csv',2,true)]);
  await page.waitForFunction(()=>window.__ICM_WORKBENCH__.stateSummary().readyFiles===3,null,{timeout:90000});
  await page.locator('button[data-workspace="spills"]').click();
  const launch=page.getByRole('button',{name:'Compare spill scenarios',exact:true});await launch.click();await panel.waitFor();
  await field('Common baseline name').fill('Baseline development');
  await field('Start on project clock').fill('2024-10-01T00:00');
  await field('End on project clock').fill('2025-04-01T00:00');
  await field('Maximum valid gap (s)').fill('86400');
  await field('Asset 1 ID').fill('SYNTHETIC-ASSET-42');await field('Asset 1 threshold (m)').fill('1');
  await select(combo('Asset 1 baseline threshold channel'),'SYNTHETIC-BASE-SCENARIO');
  await select(combo('Asset 1 baseline discharge flow'),'SYNTHETIC-BASE-SCENARIO');
  await field('Asset 1 baseline flow belongs to this overflow and scenario').check();
  await select(combo('Asset 1 proposed 1 threshold channel'),'SYNTHETIC-PROPOSED-A');
  await select(combo('Asset 1 proposed 1 discharge flow'),'SYNTHETIC-PROPOSED-A');
  await field('Asset 1 proposed 1 flow belongs to this overflow and scenario').check();
  await field('Asset 1 proposed 1 name').fill('Development A');
  await panel.getByRole('button',{name:'Add proposed scenario',exact:true}).click();
  await panel.getByRole('button',{name:'Remove proposed scenario',exact:true}).last().click();
  await panel.getByRole('button',{name:'Add proposed scenario',exact:true}).click();
  await select(combo('Asset 1 proposed 3 threshold channel'),'SYNTHETIC-PROPOSED-B');
  await field('Asset 1 proposed 3 name').fill('Development B');
  await panel.getByRole('button',{name:'Add asset',exact:true}).click();
  await panel.getByRole('button',{name:'Remove asset',exact:true}).last().click();
  await panel.getByRole('button',{name:'Add asset',exact:true}).click();
  await field('Asset 3 ID').fill('SYNTHETIC-ASSET-43');await field('Asset 3 threshold (m)').fill('1');
  await select(combo('Asset 3 baseline threshold channel'),'SYNTHETIC-BASE-SCENARIO');
  await select(combo('Asset 3 proposed 1 threshold channel'),'SYNTHETIC-PROPOSED-A');
  await field('Asset 3 proposed 1 name').fill('Development A');
  await panel.getByRole('checkbox',{name:/I reviewed the asset associations/}).check();
  const submit=panel.getByRole('button',{name:'Compare against baseline'});
  await submit.click();await status.getByText('Comparison ready.',{exact:false}).waitFor({timeout:60000});
  const rows=panel.getByRole('table').locator('tbody tr');
  assert.equal(await rows.count(),6);
  const first=await rows.first().locator('td').allTextContents();
  assert.deepEqual(first.slice(2,5),['2 → 3 · Δ 1','24 → 48 · Δ 24','8,640 → 17,280 · Δ 8,640']);
  await combo('Filter asset').selectOption('SYNTHETIC-ASSET-42');await combo('Filter year').selectOption('2025');
  assert.equal(await rows.count(),2);
  assert.match(await rows.last().innerText(),/lacks valid level support/);
  const download=page.waitForEvent('download');await panel.getByRole('button',{name:'Download comparison CSV'}).click();
  const csv=await fs.readFile(await (await download).path(),'utf8');
  assert.match(csv,/'=SYNTHETIC-BASE-SCENARIO\.csv/);assert.match(csv,/reviewed-common-period-spill-scenarios-v1/);
  assert.match(csv,/Applied exclusions/);
  if(process.env.ICM_EVIDENCE_DIR){await fs.mkdir(process.env.ICM_EVIDENCE_DIR,{recursive:true});
    await panel.getByRole('table').screenshot({path:process.env.ICM_EVIDENCE_DIR+'/v3-spill-scenarios-'+engine+'.png'});}

  await field('End on project clock').fill('2035-04-01T00:00');assert(await panel.getByRole('table').isHidden());
  await submit.click();await status.getByText('Comparison ready.',{exact:false}).waitFor({timeout:60000});
  await panel.getByText('Showing 1–25 of 36 comparisons.').waitFor();
  await panel.getByRole('button',{name:'Next page',exact:true}).click();
  await panel.getByText('Showing 26–36 of 36 comparisons.').waitFor();
  await panel.getByRole('button',{name:'Previous page',exact:true}).click();
  await panel.getByText('Showing 1–25 of 36 comparisons.').waitFor();
  await panel.getByRole('button',{name:'Close comparison',exact:true}).click();
  assert(await panel.isHidden());
  assert.deepEqual(errors,[]);guard.assertClean();
  console.log('SPILL_SCENARIOS_PASS '+engine);
}finally{await browser.close();}
