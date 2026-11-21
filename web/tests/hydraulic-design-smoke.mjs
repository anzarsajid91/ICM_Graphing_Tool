import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium,firefox} from 'playwright';
import {browserLaunchOptions,browserContextOptions} from './browser-environment.mjs';
import {installPrivacyGuard} from './privacy-network.mjs';

const engine=process.env.ICM_BROWSER||'chromium';
const base=process.env.ICM_BASE_URL||'http://127.0.0.1:8000/';
const browser=await (engine==='firefox'?firefox:chromium).launch(browserLaunchOptions());
const context=await browser.newContext({...browserContextOptions(),acceptDownloads:true,viewport:{width:1440,height:1000}});
const page=await context.newPage(), guard=installPrivacyGuard(context,base);
const errors=[];
page.on('pageerror',error=>errors.push(error.message));
const submit=panel=>panel.getByRole('button',{name:'Calculate',exact:true}).click();
const status=(panel,pattern)=>panel.getByRole('status').filter({hasText:pattern}).waitFor({timeout:90000});
async function set(form,values){
  for(const [key,value] of Object.entries(values))await form.locator('[name="'+key+'"]').fill(String(value));
}
async function downloaded(panel){
  const event=page.waitForEvent('download');
  await panel.getByRole('button',{name:'Download calculation CSV'}).click();
  return fs.readFile(await (await event).path(),'utf-8');
}
try{
  await guard.navigate(page,base);
  await page.waitForFunction(()=>window.__ICM_PRECISION_WORKBENCH__?.navigate);
  assert.deepEqual(await page.evaluate(()=>window.__ICM_PRECISION_WORKBENCH__.route()),{workspace:'home',page:'overview'});
  await page.locator('[data-workspace="hydraulics"]').click();
  await page.getByRole('tab',{name:'System curve',exact:true}).click();
  const system=page.locator('#tab-pipe-system');
  const systemForm=system.locator('form');
  await set(systemForm,{static_head_m:-1,flow_m3_s:.05,curve_max_m3_s:.15,diameter_m:.3,length_m:1000,
    darcy_factor:.02,minor_k:2,entrance_k:.5,exit_k:1});
  await submit(system);await status(system,/System curve calculated/);
  const sheet=await downloaded(system);
  assert.match(sheet,/Total required head/);assert.match(sheet,/steady-fixed-darcy-v1/);
  await system.getByRole('button',{name:'Add row'}).click();
  assert.equal(await system.getByRole('button',{name:'Download calculation CSV'}).isDisabled(),true);
  await system.getByRole('button',{name:'Remove pipe branches row 2',exact:true}).click();
  await page.getByRole('tab',{name:'Pump duty',exact:true}).click();
  const pump=page.locator('#tab-pump-duty'), pumpForm=pump.locator('form');
  await set(pumpForm,{density_kg_m3:1000,efficiency:75});
  await pumpForm.locator('[name=flow]').nth(0).fill('0');
  await pumpForm.locator('[name=head]').nth(0).fill('10');
  await pumpForm.locator('[name=flow]').nth(1).fill('0.2');
  await pumpForm.locator('[name=head]').nth(1).fill('1');
  await submit(pump);await status(pump,/1 supported intersection/);
  assert.match(await downloaded(pump),/Hydraulic power \(kW\)/);
  await pump.getByRole('button',{name:'Edit pipe system'}).click();
  await systemForm.locator('[name=static_head_m]').fill('50');
  await page.getByRole('tab',{name:'Pump duty',exact:true}).click();
  assert.equal(await pump.getByRole('button',{name:'Download calculation CSV'}).isDisabled(),true);
  await submit(pump);await status(pump,/No intersection within/);

  await page.getByRole('tab',{name:'Formula A',exact:true}).click();
  const design=page.locator('#tab-formula-a'),form=design.locator('form'),rows=form.locator('tbody tr');
  await set(rows.nth(0),{id:'Combined-A',population:100,domestic_l_head_day:150,infiltration_l_day:3000,trade_l_day:2000});
  await form.getByRole('button',{name:'Add row'}).click();
  await set(rows.nth(1),{id:'Separate-B',population:50,domestic_l_head_day:120,infiltration_l_day:1000,trade_l_day:500,evidence:'Synthetic storm response review'});
  await rows.nth(1).locator('[name=classification]').selectOption('qualifying-separate');
  await submit(design);
  assert.equal(await design.getByRole('button',{name:'Download calculation CSV'}).isDisabled(),true);
  await rows.nth(1).locator('[name=eligibility_confirmed]').check();
  await submit(design);await status(design,/Retained flow calculated/);
  const formula=await downloaded(design);
  assert.match(formula,/180500/);
  assert.match(formula,/Synthetic storm response review/);
  assert.match(formula,/mixed Formula A/);
  await set(rows.nth(1),{id:'Combined-A'});
  await submit(design);await status(design,/Catchment IDs must be unique/);
  assert.equal(await design.getByRole('button',{name:'Download calculation CSV'}).isDisabled(),true);
  await page.getByRole('tab',{name:'Pipe capacity',exact:true}).click();
  assert.equal(await page.locator('#pipeCapacityForm').isVisible(),true);
  assert.deepEqual(errors,[]);
  guard.assertClean();
  console.log('HYDRAULIC_DESIGN_PASS '+engine);
}finally{await browser.close();}
