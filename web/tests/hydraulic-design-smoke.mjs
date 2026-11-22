import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium,firefox} from 'playwright';
import {browserLaunchOptions,browserContextOptions} from './browser-environment.mjs';
import {installPrivacyGuard} from './privacy-network.mjs';
import {nativeNetwork} from './network-route-fixture.mjs';

const engine=process.env.ICM_BROWSER||'chromium';
const base=process.env.ICM_BASE_URL||'http://127.0.0.1:8000/';
const browser=await (engine==='firefox'?firefox:chromium).launch(browserLaunchOptions());
const context=await browser.newContext({...browserContextOptions(),acceptDownloads:true,viewport:{width:1440,height:1000}});
const page=await context.newPage(), guard=installPrivacyGuard(context,base,{canaries:['HB-LOCAL-CONTINUATION-TEST','HB-LOCAL-REVISION-1']});
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
  const openSheet=system.getByRole('button',{name:'Review calculation sheet',exact:true});
  await openSheet.click();
  const worksheet=system.getByRole('dialog',{name:'Pipe head loss and system curves calculation sheet',exact:true});
  await worksheet.getByText('Calculation engine revision',{exact:true}).waitFor();
  await worksheet.getByText('Pipe loss contributions',{exact:true}).waitFor();
  assert.match(await worksheet.innerText(),/Hstatic.*V²\/\(2g\)/);
  const [sheetDownload]=await Promise.all([page.waitForEvent('download'),
    worksheet.getByRole('button',{name:'Download calculation HTML',exact:true}).click()]);
  assert.equal(sheetDownload.suggestedFilename(),'hydra-pipe-system.html');
  const printSheet=await fs.readFile(await sheetDownload.path(),'utf-8');
  assert.match(printSheet,/Content-Security-Policy/);
  assert.match(printSheet,/Pipe head loss and system curves/);
  assert.match(printSheet,/Total required head \(m\)/);
  assert.match(printSheet,/steady-fixed-darcy-v1/);
  assert.doesNotMatch(printSheet,/<script\b/);
  if(process.env.ICM_EVIDENCE_DIR){
    await fs.mkdir(process.env.ICM_EVIDENCE_DIR,{recursive:true});
    await worksheet.screenshot({path:process.env.ICM_EVIDENCE_DIR+'/v3-calculation-sheet-'+engine+'.png'});
  }
  await page.evaluate(()=>{
    const open=window.open;
    window.open=(...args)=>{
      const popup=open.apply(window,args);
      if(popup)popup.print=()=>{popup.document.body.dataset.printed='yes';};
      return popup;
    };
  });
  const [printTab]=await Promise.all([context.waitForEvent('page'),
    worksheet.getByRole('button',{name:'Print calculation sheet',exact:true}).click()]);
  await printTab.locator('body[data-printed="yes"]').waitFor({state:'attached'});
  assert.equal(printTab.url(),'about:blank');
  assert.match(await printTab.locator('main').innerText(),/Total required head \(m\)/);
  if(engine==='chromium'&&process.env.ICM_EVIDENCE_DIR){
    const pdf=await printTab.pdf({preferCSSPageSize:true,path:process.env.ICM_EVIDENCE_DIR+'/v3-calculation-sheet.pdf'});
    assert.equal(pdf.subarray(0,5).toString(),'%PDF-');
  }
  await printTab.close();
  await page.keyboard.press('Escape');await worksheet.waitFor({state:'hidden'});
  assert(await openSheet.evaluate(button=>document.activeElement===button));
  await openSheet.click();
  await worksheet.getByRole('button',{name:'Close',exact:true}).click();
  await worksheet.waitFor({state:'hidden'});
  await system.getByRole('button',{name:'Add row'}).click();
  assert.equal(await system.getByRole('button',{name:'Download calculation CSV'}).isDisabled(),true);
  assert(await openSheet.isDisabled());
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

  const importPump=pump.getByRole('button',{name:'Import pump curve CSV',exact:true});
  await importPump.click({timeout:5000});
  const pumpImport=pump.getByRole('dialog',{name:'Review pump curve CSV'});
  const supplyCurve=(text)=>pumpImport.getByLabel('Local pump curve CSV').setInputFiles({name:'synthetic-pump-curve.csv',
    mimeType:'text/csv',buffer:Buffer.from(text)});
  await supplyCurve('Head,Rate\n12,0\n5,"unterminated');
  await status(pumpImport,/Check quoting/);
  assert(await pumpImport.getByRole('button',{name:'Apply curve'}).isDisabled());
  await supplyCurve('Head,Rate\n12,0\n5,720');
  await status(pumpImport,/2 measured points/);
  await pumpImport.getByRole('button',{name:'Cancel'}).click();
  assert.equal(Number(await pumpForm.locator('[name=head]').nth(0).inputValue()),10);
  await importPump.click();
  await supplyCurve('Head,Rate\n12,0\n5,720');
  await status(pumpImport,/2 measured points/);
  await pumpImport.getByLabel('Flow column',{exact:true}).selectOption('1');
  await pumpImport.getByLabel('Head column',{exact:true}).selectOption('0');
  await pumpImport.getByLabel('Flow unit',{exact:true}).selectOption('m³/h');
  await pumpImport.getByLabel('Head unit',{exact:true}).selectOption('ft');
  await pumpImport.getByRole('button',{name:'Apply curve'}).click();
  await pumpImport.waitFor({state:'hidden'});
  assert.equal(Number(await pumpForm.locator('[name=flow]').nth(1).inputValue()),.2);
  assert.equal(Number(await pumpForm.locator('[name=head]').nth(1).inputValue()),1.524);
  await submit(pump);await status(pump,/No intersection within/);
  const pumpAudit=await downloaded(pump);
  assert.match(pumpAudit,/synthetic-pump-curve\.csv/);assert.match(pumpAudit,/Source SHA-256/);
  assert.match(pumpAudit,/System stage/);
  assert.match(pumpAudit,/Pwater = ρgQH/);
  assert.match(pumpAudit,/"Flow source column","Rate","m³\/h"/);
  assert.match(pumpAudit,/"Head source column","Head","ft"/);
  await pumpForm.locator('[name=head]').nth(1).fill('2');
  await submit(pump);await status(pump,/No intersection within/);
  assert.match(await downloaded(pump),/Edited after import/);

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
  await rows.nth(1).locator('[name=classification]').selectOption('excluded');
  await set(rows.nth(0),{domestic_l_head_day:140,infiltration_l_day:22800,trade_l_day:0});
  await design.getByText('Modelled continuation during spills',{exact:true}).click();
  const includeSimulation=design.getByLabel('Include a modelled continuation review',{exact:true});
  await includeSimulation.check();
  const openSimulation=design.getByRole('button',{name:'Open simulation results',exact:true});
  await openSimulation.click();
  const simulation=page.locator('#tab-simulation-results');
  const loadResults=(name,header,values)=>simulation.getByLabel('Local results CSV').setInputFiles({name,mimeType:'text/csv',
    buffer:Buffer.from([header,',L/s,L/s',...values].join('\n'))});
  await loadResults('synthetic-continuation.csv','Time,00127.1,B.2',[
    '2025-01-01 00:00:00,0,-1','2025-01-01 00:01:00,-2,-1','2025-01-01 00:02:00,-2,#N/A',
    '2025-01-01 00:03:00,-2,1','2025-01-01 00:04:00,-2,-3','2025-01-01 00:05:00,0,-3']);
  await status(simulation,/Preview ready/);
  for(const [label,value] of Object.entries({'Simulation ID':'HB-LOCAL-CONTINUATION-TEST','Model revision':'HB-LOCAL-REVISION-1',
    Scenario:'Baseline',Event:'Reviewed event','Optional missing-value token':'#N/A','Source result attribute':'Reported downstream flow'})){
    await simulation.getByLabel(label,{exact:true}).fill(value);
  }
  await simulation.getByLabel('Asset type').selectOption('link');
  await simulation.getByLabel('Link table').selectOption('conduit');
  await simulation.getByLabel('Result quantity').selectOption('flow');
  await simulation.getByLabel('Link end').selectOption('downstream');
  await simulation.getByLabel('Source unit').selectOption('L/s');
  await simulation.getByLabel('The next record contains units',{exact:true}).check();
  await simulation.getByLabel('The file contains instantaneous samples on the confirmed project clock',{exact:true}).check();
  for(const [mapping,column,id,suffix] of [[1,'2','00127','1'],[2,'3','B','2']]){
    if(mapping===2)await simulation.getByRole('button',{name:'Add mapped column',exact:true}).click();
    await simulation.getByLabel(`Mapping ${mapping} CSV column number`,{exact:true}).fill(column);
    await simulation.getByLabel(`Mapping ${mapping} Node or upstream ID`,{exact:true}).fill(id);
    await simulation.getByLabel(`Mapping ${mapping} Link suffix`,{exact:true}).fill(suffix);
  }
  const indexSimulation=simulation.getByRole('button',{name:'Index simulation results',exact:true});
  await indexSimulation.click();await status(simulation,/6 timestamps indexed for 2 result series/);
  await simulation.getByLabel('Event',{exact:true}).fill('Different event');
  await indexSimulation.click();
  await simulation.locator('#hbResultDetails').getByText('Different event',{exact:false}).waitFor();
  async function returnToFormula(){
    await page.locator('button[data-workspace="hydraulics"]').click();
    await page.getByRole('tab',{name:'Formula A',exact:true}).click();
  }
  await returnToFormula();
  const modelLabel='Baseline · Reviewed event · synthetic-continuation.csv';
  await design.getByLabel('Overflow results source',{exact:true}).selectOption({label:modelLabel});
  const continuationSource=design.getByLabel('Continuation results source',{exact:true});
  assert.equal(await continuationSource.locator('option').count(),2);
  await continuationSource.selectOption({label:modelLabel});
  await design.getByLabel('Filter overflow link IDs',{exact:true}).fill('00127.1');
  await design.getByLabel('Overflow link and end',{exact:true}).selectOption({label:'conduit 00127.1 · downstream'});
  const continuationLink=design.getByLabel('Continuation link and end',{exact:true});
  await continuationLink.selectOption({label:'conduit 00127.1 · downstream'});
  for(const role of ['Overflow','Continuation'])await design.getByLabel(role+' positive direction',{exact:true}).selectOption('-1');
  await design.getByLabel('Review start (project clock)',{exact:true}).fill('2025-01-01T00:00');
  await design.getByLabel('Review end (project clock)',{exact:true}).fill('2025-01-01T00:05');
  await design.getByLabel('Maximum supported sample gap (s)',{exact:true}).fill('180');
  await design.getByLabel('Overflow flow threshold (L/s)',{exact:true}).fill('1');
  await design.getByLabel('Reviewed overflow and continuation locations and basis',{exact:true}).fill('Synthetic receiving branch and signed link-end results');
  const sameRun=design.getByLabel('Both links belong to this assessment point and use the same reviewed run and project clock',{exact:true});
  await sameRun.check();await submit(design);await status(design,/Choose two distinct links/);
  await continuationLink.selectOption({label:'conduit B.2 · downstream'});
  assert(!(await sameRun.isChecked()));
  await sameRun.check();await submit(design);await status(design,/Retained flow calculated/);
  const spillReview=design.getByRole('table',{name:'Modelled continuation during physical spills',exact:true});
  assert.match(await spillReview.getByRole('row',{name:/Evidence coverage/}).innerText(),/partial/);
  assert.match(await spillReview.getByRole('row',{name:/Supported continuation deficit/}).innerText(),/0\.0975/);
  assert.match(await spillReview.getByRole('row',{name:/Supported volume above/}).innerText(),/0\.0375/);
  const spillAudit=await downloaded(design);
  assert.match(spillAudit,/"2025-01-01T00:00:30","2025-01-01T00:04:30","240","120","120"/);
  assert.match(spillAudit,/"Continuation","conduit B\.2 · downstream","Reported downstream flow","L\/s","synthetic-continuation\.csv","[a-f0-9]{64}"/);
  if(process.env.ICM_EVIDENCE_DIR){
    await fs.mkdir(process.env.ICM_EVIDENCE_DIR,{recursive:true});
    await spillReview.screenshot({path:process.env.ICM_EVIDENCE_DIR+'/v3-modelled-continuation-'+engine+'.png'});
  }
  await openSimulation.click();
  await simulation.getByLabel('Filter indexed events',{exact:true}).selectOption('Reviewed event');
  await simulation.getByLabel('Indexed source').selectOption({label:'Baseline · synthetic-continuation.csv'});
  await simulation.getByRole('button',{name:'Remove indexed source',exact:true}).click();
  await returnToFormula();
  assert(await design.getByRole('button',{name:'Download calculation CSV',exact:true}).isDisabled());
  await includeSimulation.uncheck();
  await rows.nth(1).locator('[name=classification]').selectOption('qualifying-separate');
  await rows.nth(1).locator('[name=eligibility_confirmed]').check();
  await set(rows.nth(0),{domestic_l_head_day:150,infiltration_l_day:3000,trade_l_day:2000});
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
  const permitBasis=design.getByLabel('Permit and framework applicability evidence',{exact:true});
  await method.selectOption('wales');
  await permitBasis.fill('Reviewed synthetic GN066 applicability');
  await submit(design);await status(design,/Retained flow calculated/);
  const welsh=await downloaded(design);
  assert.match(welsh,/nrw-wales-gn066-v2-2026-07/);assert.match(welsh,/180500/);
  await method.selectOption('ireland');
  assert.equal(await permitBasis.inputValue(),'');
  await permitBasis.fill('Reviewed synthetic combined licence design basis');
  await rows.nth(1).locator('[name=classification]').selectOption('excluded');
  await submit(design);await status(design,/Retained flow calculated/);
  const irish=await downloaded(design);
  assert.match(irish,/ie-doe-epa-swo-section-6-2/);assert.match(irish,/160000/);
  await method.selectOption('documented');
  const project=form.getByRole('group',{name:'Documented additive method'});
  await set(project,{name:'Reviewed synthetic project method',reference:'Permit schedule 2, revision A',
    evidence:'Reviewed applicability for the synthetic case',domestic_factor:2,infiltration_factor:1.2,
    trade_factor:2.5,population_allowance_l_head_day:50});
  await submit(design);await status(design,/Retained flow calculated/);
  const custom=await downloaded(design);
  assert.match(custom,/documented-project-continuation-v1/);assert.match(custom,/43600/);
  assert.match(custom,/Permit schedule 2, revision A/);
  await method.selectOption('england');

  async function loadNetwork(text,inspect=false){
    await page.locator('button[data-workspace="network"]').click();
    await page.getByRole('tab',{name:'Schematic',exact:true}).click();
    await page.locator('#nsLoadInput').setInputFiles({name:'synthetic-upstream-network.csv',mimeType:'text/csv',buffer:Buffer.from(text)});
    await page.check('#nsContextUnits');await page.click('#nsContextApply');
    if(inspect){
      await page.locator('#nsSvg [data-ns-node="B"]').focus();
      await page.keyboard.press('Enter');
      await page.getByRole('button',{name:'Review Formula A catchments',exact:true}).click();
      await design.waitFor();
      return;
    }
    await page.locator('button[data-workspace="hydraulics"]').click();
    await page.getByRole('tab',{name:'Formula A',exact:true}).click();
  }
  await loadNetwork(nativeNetwork,true);
  await design.getByRole('button',{name:'Import catchment CSV',exact:true}).click();
  const upstream=[['**** hw_subcatchment'],
    ['subcatchment_id','drains_to','node_id','link_suffix','to_subcatchment_id','ground_node','population','Domestic','I','E'],
    ['UserUnits','','','','','','','L/head/day','L/day','L/day'],
    ['C01','Node','00127','','','',100,150,3000,2000],
    ['C02','Node','Z','','','',50,150,3000,2000],
    ['C03','Node','00127','','','Z',40,150,3000,2000],
    ['C04','Node','00127','','','',50,150,3000,2000],
    ['C04','Node','Z','','','',50,150,3000,2000]];
  await mapping.getByLabel('Catchment CSV',{exact:true}).setInputFiles({name:'synthetic-contributing-catchments.csv',mimeType:'text/csv',
    buffer:Buffer.from(upstream.map(row=>row.join(',')).join('\n'))});
  await status(mapping,/5 catchment row/);
  await mapping.getByLabel('Reviewed domestic allowance (L/head/day)').selectOption('7');
  await mapping.getByLabel('Reviewed infiltration (L/day)').selectOption('8');
  await mapping.getByLabel('Reviewed trade (L/day)').selectOption('9');
  await mapping.getByLabel('I checked mapped units and reviewed daily allowances').check();
  await mapping.getByRole('button',{name:'Review network contributions',exact:true}).click();
  assert.equal(await mapping.getByLabel('Assessment asset',{exact:true}).locator('option:checked').textContent(),'Node B');
  await mapping.getByRole('button',{name:'Trace reviewed drainage',exact:true}).click();
  await status(mapping,/1 candidate · 1 disconnected · 1 ambiguous · 2 duplicate/);
  await mapping.getByRole('button',{name:'Apply mapped rows',exact:true}).click();
  await status(mapping,/Review the decision and evidence/);
  await mapping.getByLabel('Catchment source row 4 Decision',{exact:true}).selectOption('include');
  for(const [label,value] of [['Population',50],['Infiltration',25],['Trade',80]]){
    await mapping.getByLabel('Catchment source row 4 '+label+' share (%)',{exact:true}).fill(String(value));
  }
  await mapping.getByLabel('Catchment source row 4 Evidence',{exact:true}).fill('Synthetic reviewed separate contribution shares');
  for(const line of [5,6,7,8]){
    await mapping.getByLabel('Catchment source row '+line+' Decision',{exact:true}).selectOption('exclude');
    await mapping.getByLabel('Catchment source row '+line+' Evidence',{exact:true}).fill('Excluded in the synthetic case');
  }
  await mapping.getByRole('button',{name:'Apply mapped rows',exact:true}).click();
  await mapping.waitFor({state:'hidden'});
  assert.equal(await rows.nth(0).locator('[name=population]').inputValue(),'50');
  assert.equal(await rows.nth(0).locator('[name=infiltration_l_day]').inputValue(),'750');
  assert.equal(await rows.nth(0).locator('[name=trade_l_day]').inputValue(),'1600');
  assert.equal(await rows.count(),4);
  await rows.nth(0).locator('[name=classification]').selectOption('combined');
  await submit(design);await status(design,/Retained flow calculated/);
  const allocated=await downloaded(design);
  assert.match(allocated,/"Retained flow \(L\/day\)","81050"/);
  assert.match(allocated,/"Assessment asset","Node B"/);
  assert.match(allocated,/"Candidate","Nominal topology reaches the selected assessment asset.*","include","50","25","80"/);
  assert.match(allocated,/"C03","Ambiguous","Review the separate groundwater destination/);
  await design.getByText('Sensitivity and comparisons',{exact:true}).click();
  await design.getByLabel('Sensitivity per input (%)',{exact:true}).fill('10');
  await design.getByLabel('Permit pass-forward flow (L/s)',{exact:true}).fill('0.9');
  await design.getByLabel('Permit source and assessed conditions',{exact:true}).fill('Synthetic permit schedule and matching location');
  await design.getByRole('button',{name:'Load conduit choices',exact:true}).click();
  await status(design,/eligible circular conduits/);
  await design.getByLabel('Compare an eligible native conduit',{exact:true}).selectOption({label:'00127.1'});
  assert(await design.getByLabel('Pipe trial kinematic viscosity (m²/s)',{exact:true}).isVisible());
  await submit(design);await status(design,/Retained flow calculated/);
  const continuationReview=await downloaded(design);
  assert.match(continuationReview,/"Population","73500","88600"/);
  assert.match(continuationReview,/"Permit pass-forward flow","0.9","-0.038[\d]+","below screening flow"/);
  assert.match(continuationReview,/"Pipe capacity · 00127.1","288.09[\d]+","[\d.]+","at or above screening flow"/);
  assert.match(continuationReview,/"Source conduit","00127.1"/);
  await loadNetwork(nativeNetwork.replace('00127,B,1,CIRC','00127,C,1,CIRC'));
  assert(await design.getByRole('button',{name:'Download calculation CSV',exact:true}).isDisabled());
  await submit(design);await status(design,/Network topology changed/);

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
  await treatment.getByLabel('Treatment framework',{exact:true}).selectOption('england');
  const seasonal=treatment.getByLabel('Review different winter and summer populations or allowances',{exact:true});
  assert(await seasonal.isVisible());
  await seasonal.check();
  await set(treatmentForm,{population:100,domestic_l_head_day:150,infiltration_dwf_l_day:2500,infiltration_max_l_day:12000,
    trade_l_day:1000,summer_population:150,summer_domestic_l_head_day:150,summer_infiltration_dwf_l_day:2500,
    summer_infiltration_max_l_day:4000,summer_trade_l_day:1000,summer_evidence:'Reviewed synthetic summer allowances'});
  await submit(treatment);await status(treatment,/Governing EA FFT calculated for summer/);
  const seasonalSheet=await downloaded(treatment);
  assert.match(seasonalSheet,/"Governing FFT \(L\/day\)","74500"/);
  assert.match(seasonalSheet,/"Winter evidence"/);
  assert.match(seasonalSheet,/"Summer evidence","Reviewed synthetic summer allowances"/);
  await seasonal.uncheck();assert(await treatmentForm.locator('[name=summer_population]').isHidden());
  await submit(treatment);await status(treatment,/Governing EA FFT calculated for annual/);
  assert.match(await downloaded(treatment),/"Governing FFT \(L\/day\)","60000"/);

  await page.getByRole('tab',{name:'Peak foul flow',exact:true}).click();
  const loading=page.locator('#tab-design-foul'),loadingForm=loading.locator('form');
  await set(loadingForm,{population:400,domestic_l_head_day:150,commercial_l_day:5500,infiltration_l_day:12000,
    trade_l_day:2000,domestic_factor:6,commercial_factor:3.5,trade_factor:3,evidence:'Synthetic reviewed new wastewater network assumptions'});
  await loading.getByLabel('I reviewed the new-network foul loading basis and the distinct inputs',{exact:true}).check();
  await submit(loading);await status(loading,/Reviewed peak foul flow calculated/);
  const loadSheet=await downloaded(loading);
  assert.match(loadSheet,/"Design foul flow \(L\/day\)","397250"/);
  assert.match(loadSheet,/"Peaked commercial domestic \(L\/day\)","19250"/);
  assert.match(loadSheet,/uisce-eireann-cds-5030-03-rev3-2025-eq1-v1/);

  await page.getByRole('tab',{name:'Velocity and shear',exact:true}).click();
  const section=page.locator('#tab-section-check'),sectionForm=section.locator('form');
  await set(sectionForm,{diameter_m:.6,depth_m:.3,flow_m3_s:.15,minimum_velocity_m_s:.75,energy_gradient:.005,
    evidence:'Synthetic uniform open section and reviewed project criterion'});
  await submit(section);await status(section,/Circular gravity section reviewed/);
  assert.match(await downloaded(section),/"Mean boundary shear \(Pa\)",""/);
  await section.getByLabel('Steady uniform flow and the energy gradient are reviewed for mean shear',{exact:true}).check();
  await submit(section);await status(section,/Circular gravity section reviewed/);
  const sectionSheet=await downloaded(section);
  const shear=sectionSheet.match(/"Mean boundary shear \(Pa\)","([^"]+)"/);
  assert(Math.abs(Number(shear?.[1])-7.3549875)<1e-10);
  assert.match(sectionSheet,/"Project velocity screen","meets threshold"/);
  await set(sectionForm,{depth_m:0});
  await submit(section);await status(section,/dry section cannot convey/);
  assert(await section.getByRole('button',{name:'Download calculation CSV',exact:true}).isDisabled());

  await page.getByRole('tab',{name:'Pipe capacity',exact:true}).click();
  assert.equal(await page.locator('#pipeCapacityForm').isVisible(),true);
  assert.deepEqual(errors,[]);
  guard.assertClean();
  console.log('HYDRAULIC_DESIGN_PASS '+engine);
}finally{await browser.close();}
