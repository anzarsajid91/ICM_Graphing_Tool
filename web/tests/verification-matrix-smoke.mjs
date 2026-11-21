import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium,firefox} from 'playwright';
import {browserLaunchOptions,browserContextOptions} from './browser-environment.mjs';
import {installPrivacyGuard} from './privacy-network.mjs';

const engine=process.env.ICM_BROWSER||'chromium',base=process.env.ICM_BASE_URL||'http://127.0.0.1:8000/';
const browser=await (engine==='firefox'?firefox:chromium).launch(browserLaunchOptions());
const context=await browser.newContext({...browserContextOptions(),acceptDownloads:true,viewport:{width:1280,height:950}});
const guard=installPrivacyGuard(context,base,{canaries:['SYNTHETIC-VERIFY-MONITOR','SYNTHETIC-MATRIX-COMMENT']});
const page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));
const root=page.locator('#tab-verification-matrix'),status=root.locator('#hbVerifyStatus');
const open=async()=>{await page.locator('button[data-workspace="graphs"]').click();await page.getByRole('tab',{name:'Verification matrix',exact:true}).click();};
const time=i=>new Date(Date.UTC(2025,0,1,0,i)).toISOString().slice(0,19);
const hydraulics=(file,base,peak)=>({name:file+'.csv',mimeType:'text/csv',buffer:Buffer.from('Timestamp,Flow (m3/s)\n'+
  Array.from({length:71},(_,i)=>time(i)+','+(i%6===2?peak:base)).join('\n'))});
const rain={name:'matrix-rain.R',mimeType:'text/plain',buffer:Buffer.from('**FIELD: 1,RAINFALL\n**UNITS: 1,mm/h\n*CSTART\n'+
  '2501010000 2501010112 1\n*CEND\n'+Array.from({length:72},(_,i)=>[1,2].includes(i%6)?'60':'0').join(' ')+'\n')};

try{
  await guard.navigate(page,base);await open();
  await status.getByText('Calculate a current qualifying rainfall event set',{exact:false}).waitFor();
  await page.locator('button[data-workspace="data"]').click();
  await page.setInputFiles('#fileInput',[hydraulics('=SYNTHETIC-VERIFY-MONITOR-A',1,2),hydraulics('SYNTHETIC-VERIFY-MONITOR-B',2,4),
    hydraulics('SYNTHETIC-model-A',1,2.2),hydraulics('SYNTHETIC-model-B',2,3.99),rain]);
  await page.waitForFunction(()=>window.__ICM_WORKBENCH__.stateSummary().readyFiles===5,null,{timeout:90000});
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
  await root.getByRole('button',{name:'Remove pairing 2',exact:true}).click();assert(await table.isHidden());
  await page.evaluate(()=>{const invoke=engine.call.bind(engine);engine.call=async (name,...args)=>{
    const data=await invoke(name,...args);if(name==='verification_matrix_event')await new Promise(resolve=>setTimeout(resolve,400));return data;};});
  await run.click();await root.getByRole('button',{name:'Cancel calculation',exact:true}).click();
  await status.getByText('Calculation cancelled.',{exact:false}).waitFor();assert(await table.isHidden());
  await root.getByRole('combobox',{name:'Hydraulic quantity',exact:true}).selectOption('depth');
  assert(await root.locator('[name=depth_peak_error_m]').isVisible());assert(await root.locator('[name=flow_peak_error_percent]').isHidden());
  assert(await run.isDisabled());
  assert.deepEqual(errors,[]);guard.assertClean();console.log('VERIFICATION_MATRIX_PASS '+engine);
}finally{await browser.close();}
