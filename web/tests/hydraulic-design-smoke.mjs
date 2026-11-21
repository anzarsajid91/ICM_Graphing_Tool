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

  await pump.getByRole('button',{name:'Edit pipe system'}).click();
  const friction=systemForm.getByRole('combobox',{name:'Friction method',exact:true});
  await friction.selectOption('calculated',{timeout:5000});
  assert(await systemForm.locator('[name=darcy_factor]').isHidden());
  const referenceRoughnessMm=600*3.7*(10**(-.5/Math.sqrt(.02))-2.51/(900000*Math.sqrt(.02)));
  await set(systemForm,{static_head_m:-2,flow_m3_s:1.5*Math.PI*.6**2/4,curve_max_m3_s:.6,diameter_m:.6,
    length_m:120,roughness_mm:referenceRoughnessMm,viscosity_m2_s:1e-6});
  await submit(system);await status(system,/System curve calculated/);
  const calculated=await downloaded(system);
  const duty=calculated.match(/"Total required head \(m\)","([^"]+)"/);
  assert(Math.abs(Number(duty?.[1])-(-2+7.5*1.5**2/(2*9.80665)))<1e-10);
  for(const expected of [/steady-calculated-darcy-v1/, /Kinematic viscosity/])assert.match(calculated,expected);
  const turbulentRow=calculated.match(/"([\d.]+)","turbulent"\r?\n/);
  assert(Math.abs(Number(turbulentRow?.[1])-900000)<1e-7);
  await set(systemForm,{diameter_m:.01,length_m:2,roughness_mm:0,flow_m3_s:.3*Math.PI*.01**2/4,curve_max_m3_s:.01});
  await submit(system);await status(system,/Duty withheld/);
  assert.match(await downloaded(system),/Supported-flow limits/);
  assert(await system.getByRole('img',{name:'System head'}).locator('circle').count()>0);
  await page.getByRole('tab',{name:'Pump duty',exact:true}).click();
  await submit(pump);await status(pump,/Select fixed Darcy friction/);
  await pump.getByRole('button',{name:'Edit pipe system'}).click();
  await friction.selectOption('fixed');
  assert.equal(Number(await systemForm.locator('[name=darcy_factor]').inputValue()),.02);
  assert(await systemForm.locator('[name=roughness_mm]').isHidden());
  assert(await system.getByRole('button',{name:'Download calculation CSV'}).isDisabled());

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
  await form.getByRole('button',{name:'Import catchment CSV'}).click();
  const mapping=design.getByRole('dialog',{name:'Review catchment CSV'});
  await mapping.getByLabel('Catchment CSV').setInputFiles({name:'synthetic-subcatchment.csv',mimeType:'text/csv',
    buffer:Buffer.from('**** hw_subcatchment\nsubcatchment_id,population,Domestic,I,E\n'+
      'UserUnits,,L/head/day,m3/day,L/day\n0012,100,150,3,2000\n0013,#D,120,1,500\n')});
  await mapping.getByRole('status').filter({hasText:/2 catchment/}).waitFor();
  await mapping.getByLabel('Reviewed domestic allowance (L/head/day)').selectOption('2');
  await mapping.getByLabel('Reviewed infiltration (L/day)').selectOption('3');
  await mapping.getByLabel('Reviewed trade (L/day)').selectOption('4');
  await mapping.getByRole('button',{name:'Apply mapped rows'}).click();
  assert.match(await mapping.getByRole('status').innerText(),/Confirm the units/);
  await mapping.getByLabel('I checked mapped units and reviewed daily allowances').check();
  await mapping.getByRole('button',{name:'Apply mapped rows'}).click();
  await mapping.waitFor({state:'hidden'});
  assert.equal(await rows.nth(0).locator('[name=id]').inputValue(),'0012');
  assert.equal(await rows.nth(1).locator('[name=population]').inputValue(),'');
  assert.equal(await rows.nth(1).locator('[name=classification]').inputValue(),'');
  await rows.nth(0).locator('[name=classification]').selectOption('combined');
  await rows.nth(1).locator('[name=classification]').selectOption('qualifying-separate');
  await set(rows.nth(1),{population:50,evidence:'Inherited population reviewed from synthetic source'});
  await rows.nth(1).locator('[name=eligibility_confirmed]').check();
  await submit(design);await status(design,/Retained flow calculated/);
  const importedSheet=await downloaded(design);
  assert.match(importedSheet,/180500/);assert.match(importedSheet,/Source SHA-256/);
  assert.match(importedSheet,/synthetic-subcatchment.csv/);assert.match(importedSheet,/#D/);
  const method=form.getByRole('combobox',{name:'Permitting framework',exact:true});
  await method.selectOption('scotland');
  assert(await design.getByRole('button',{name:'Download calculation CSV'}).isDisabled());
  const basis=form.getByRole('group',{name:'SEPA applicability'});
  await set(basis,{dilution:8,population_equivalent:250,evidence:'Synthetic reviewed inland overflow conditions'});
  for(const name of ['inland','no_interaction','imax_confirmed'])await basis.locator('[name='+name+']').check();
  await submit(design);await status(design,/dilution greater than 8:1/);
  await set(basis,{dilution:9});
  await submit(design);await status(design,/Retained flow calculated/);
  const scotland=await downloaded(design);
  assert.match(scotland,/sepa-scotland-wat-g-058/);assert.match(scotland,/180500/);
  assert.match(scotland,/Maximum infiltration Imax/);
  await basis.locator('[name=simpler_combined]').check();
  await set(basis,{separate_fraction_percent:18,allocation_basis:'Synthetic reviewed drainage allocation'});
  await submit(design);await status(design,/Retained flow calculated/);
  const simplified=await downloaded(design);
  assert.match(simplified,/236500/);assert.match(simplified,/simpler combined equation/);
  if(process.env.ICM_EVIDENCE_DIR){
    await fs.mkdir(process.env.ICM_EVIDENCE_DIR,{recursive:true});
    await design.screenshot({path:process.env.ICM_EVIDENCE_DIR+'/v3-sepa-formula-a-'+engine+'.png'});
  }
  await method.selectOption('england');assert(await basis.isHidden());
  await submit(design);await status(design,/Retained flow calculated/);
  assert.match(await downloaded(design),/180500/);

  await page.getByRole('tab',{name:'Treatment flows',exact:true}).click();
  const treatment=page.locator('#tab-design-treatment'),treatmentForm=treatment.locator('form');
  await set(treatmentForm,{population:100,domestic_l_head_day:150,infiltration_dwf_l_day:2000,infiltration_max_l_day:6000,
    trade_l_day:4000,evidence:'Synthetic separately reviewed dry-weather and maximum infiltration'});
  await submit(treatment);await status(treatment,/DWF and full treatment flows calculated/);
  const treatmentSheet=await downloaded(treatment);
  assert.match(treatmentSheet,/wat-g-065/);assert.match(treatmentSheet,/"21000"/);assert.match(treatmentSheet,/"63000"/);
  if(process.env.ICM_EVIDENCE_DIR)await treatment.screenshot({path:process.env.ICM_EVIDENCE_DIR+'/v3-sepa-treatment-'+engine+'.png'});
  await set(treatmentForm,{infiltration_max_l_day:1000});
  await submit(treatment);await status(treatment,/Maximum infiltration must be at least/);
  await page.getByRole('tab',{name:'Pipe capacity',exact:true}).click();
  assert.equal(await page.locator('#pipeCapacityForm').isVisible(),true);
  assert.deepEqual(errors,[]);
  guard.assertClean();
  console.log('HYDRAULIC_DESIGN_PASS '+engine);
}finally{await browser.close();}
