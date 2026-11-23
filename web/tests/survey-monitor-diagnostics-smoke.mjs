import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium,firefox} from 'playwright';
import {browserLaunchOptions,browserContextOptions} from './browser-environment.mjs';
import {installPrivacyGuard} from './privacy-network.mjs';

const engine=process.env.ICM_BROWSER||'chromium',base=process.env.ICM_BASE_URL||'http://127.0.0.1:8000/';
const browser=await (engine==='firefox'?firefox:chromium).launch(browserLaunchOptions());
const context=await browser.newContext({...browserContextOptions(),acceptDownloads:true,viewport:{width:1280,height:950}});
const guard=installPrivacyGuard(context,base,{canaries:['SYNTHETIC-PAIRED-MONITOR','SYNTHETIC-SENSOR-REVIEW']});
const page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));
const dialog=page.getByRole('dialog',{name:'Investigate monitor readings'}),table=dialog.getByRole('table');
const fields=async values=>{for(const [name,value] of Object.entries(values))await dialog.locator('[name='+name+']').fill(String(value));};
const status=dialog.getByRole('status'),decision=dialog.getByRole('combobox',{name:'Filter findings',exact:true});
const upload=(name,data)=>({name,mimeType:'text/csv',buffer:Buffer.from('Timestamp,Depth (m),Velocity (m/s),Flow (m3/s)\n'+
  data.map((row,i)=>new Date(Date.UTC(2025,0,1,0,i)).toISOString().slice(0,-5)+','+row.join(',')).join('\n'))});
const data=[[.5,.2,Math.PI/40],[.5,1.2,.9],[.5,.6,3*Math.PI/40],[.8,-.2,''],[1.1,-1,.5],['',.2,.1],[.5,1,Math.PI/8]];

try{
  await guard.navigate(page,base);
  const open=page.getByRole('button',{name:'Investigate monitor readings',exact:true});
  await page.locator('button[data-workspace="survey"]').click();await open.click();
  await status.getByText('Import a paired monitor record',{exact:false}).waitFor();
  await dialog.getByRole('button',{name:'Close investigation'}).click();
  await page.locator('button[data-workspace="data"]').click();
  await page.setInputFiles('#fileInput',upload('=SYNTHETIC-PAIRED-MONITOR.csv',data));
  await page.waitForFunction(()=>window.__ICM_WORKBENCH__.stateSummary().readyFiles===1,null,{timeout:90000});
  await page.locator('button[data-workspace="survey"]').click();await open.click();
  await fields({max_gap_s:60,diameter_m:1,depth_min_m:.01,depth_max_m:.9,velocity_min_m_s:-.8,velocity_max_m_s:1});
  const run=dialog.getByRole('button',{name:'Review monitor evidence'});
  await run.click();await status.getByText('Confirm the reviewed circular pipe section',{exact:false}).waitFor();
  await dialog.locator('[name=geometry_confirmed]').check();
  await dialog.getByText('Depth and velocity patterns',{exact:true}).click();
  await fields({velocity_step_m_s:.7,flat_depth_amplitude_m:.005,flat_duration_s:120,flat_velocity_swing_m_s:.8,
    rise_depth_m:.2,rise_velocity_ceiling_m_s:.1,start:'2025-01-01T00:00',end:'2025-01-01T00:06'});
  await dialog.locator('[name=downstream_positive]').check();
  await dialog.getByRole('combobox',{name:'Discharge channel (optional)',exact:true}).selectOption('Flow (m3/s)');
  await dialog.getByText('Discharge consistency',{exact:true}).click();
  await fields({flow_relative_tolerance_percent:20,flow_floor_m3_s:.01});
  await dialog.locator('[name=flow_basis_confirmed]').check();
  await run.click();await status.getByText('Monitor review ready.',{exact:false}).waitFor({timeout:60000});
  assert.match(await dialog.locator('#hbMonitorDiagnosticCoverage').innerText(),/6 of 7 paired samples.*4 discharge checks/);
  const evidence=await table.innerText();
  for(const caption of ['Depth outside reviewed range','Depth reaches reviewed crown','Flat depth with changing velocity',
    'Rising depth with low or reverse velocity','Discharge differs from area × mean velocity'])assert(evidence.includes(caption));
  await decision.selectOption('flow-consistency');
  const reference=((.9-1.2*Math.PI/8)/(1.2*Math.PI/8)*100).toPrecision(7);
  assert.match(await table.locator('tbody tr').innerText(),new RegExp(reference));
  await table.getByRole('combobox',{name:/decision/}).selectOption('accepted');
  await table.getByRole('textbox',{name:/note/}).fill('SYNTHETIC-SENSOR-REVIEW');
  await decision.selectOption('crown');await table.getByRole('combobox',{name:/decision/}).selectOption('dismissed');
  const requested=page.waitForEvent('download');await dialog.getByRole('button',{name:'Download monitor review CSV'}).click();
  const exported=await fs.readFile(await (await requested).path(),'utf8');
  assert.match(exported,/'=SYNTHETIC-PAIRED-MONITOR\.csv/);
  assert.match(exported,/"accepted","SYNTHETIC-SENSOR-REVIEW"/);assert.match(exported,/"dismissed"/);
  if(process.env.ICM_EVIDENCE_DIR){await fs.mkdir(process.env.ICM_EVIDENCE_DIR,{recursive:true});
    await dialog.screenshot({path:process.env.ICM_EVIDENCE_DIR+'/v3-paired-monitor-'+engine+'.png'});}
  await dialog.getByRole('button',{name:'Review source timing'}).click();
  const clock=page.getByRole('dialog',{name:'Time-series quality diagnostics'});await clock.waitFor();
  assert(await dialog.isHidden());await clock.getByRole('button',{name:'Close diagnostics'}).click();
  await page.setInputFiles('#fileInput',upload('synthetic-monitor-many.csv',Array.from({length:55},(_,i)=>[.5,i%2?1:-1,0])));
  await page.waitForFunction(()=>window.__ICM_WORKBENCH__.stateSummary().readyFiles===2,null,{timeout:90000});
  await page.locator('button[data-workspace="survey"]').click();await open.click();
  const source=dialog.getByRole('combobox',{name:'Local monitor source',exact:true});
  await source.selectOption(await source.locator('option').filter({hasText:'synthetic-monitor-many.csv'}).getAttribute('value'));
  await fields({start:'',end:''});await run.click();await status.getByText('Monitor review ready.',{exact:false}).waitFor({timeout:60000});
  await decision.selectOption('velocity-change');
  assert.equal(await table.locator('tbody tr').count(),24);
  await dialog.getByRole('button',{name:'Next page',exact:true}).click();
  assert.match(await table.locator('tbody tr').first().innerText(),/00:24:00/);
  await dialog.getByRole('button',{name:'Previous page',exact:true}).click();
  assert.match(await table.locator('tbody tr').first().innerText(),/00:00:00/);
  await dialog.getByRole('button',{name:'Close investigation'}).click();
  assert(await dialog.isHidden());assert.deepEqual(errors,[]);guard.assertClean();
  console.log('SURVEY_MONITOR_DIAGNOSTICS_PASS '+engine);
}finally{await browser.close();}
