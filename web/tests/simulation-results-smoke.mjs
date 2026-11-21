import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium,firefox} from 'playwright';
import {browserLaunchOptions,browserContextOptions} from './browser-environment.mjs';
import {installPrivacyGuard} from './privacy-network.mjs';

const engine=process.env.ICM_BROWSER||'chromium',base=process.env.ICM_BASE_URL||'http://127.0.0.1:8000/';
const browser=await (engine==='firefox'?firefox:chromium).launch(browserLaunchOptions());
const context=await browser.newContext({...browserContextOptions(),viewport:{width:1440,height:1000}});
const guard=installPrivacyGuard(context,base,{canaries:['SYNTHETIC-PRIVATE-SIM','SYNTHETIC-REV-ID']});
const page=await context.newPage(),errors=[];
page.on('pageerror',error=>errors.push(error.message));
const panel=page.locator('#tab-simulation-results'),status=page.locator('#hbResultImportStatus');
const fixture='Time,00127.B,00129.C\r\n,L/s,L/s\r\n2025-01-01 00:00:00,0,1200\r\n'+
  '2025-01-01 00:07:00,#N/A,500\r\n2025-01-01 00:15:00,-400,1000\r\n';
const upload=(name,text)=>panel.getByLabel('Local results CSV').setInputFiles({name,mimeType:'text/csv',buffer:Buffer.from(text)});

try {
  await guard.navigate(page,base);
  await page.locator('button[data-workspace="network"]').click();
  await page.getByRole('tab',{name:'Simulation results'}).click();
  await panel.waitFor();
  assert.match(await panel.innerText(),/Import a results CSV to review available samples/);
  await upload('synthetic-icm-results.csv',fixture);
  await panel.getByText('Preview ready.',{exact:false}).waitFor();
  assert.match(await panel.getByRole('table',{name:'First records (six columns shown)'}).innerText(),/00127.B/);
  const fields={
    'Simulation ID':'SYNTHETIC-PRIVATE-SIM','Model revision':'SYNTHETIC-REV-ID','Scenario':'Baseline',Event:'Design storm',
    'Optional missing-value token':'#N/A','Source result attribute':'DS flow'
  };
  for(const [label,value] of Object.entries(fields)) await panel.getByLabel(label,{exact:true}).fill(value);
  await panel.getByLabel('Asset type').selectOption('link');
  await panel.getByLabel('Link table').selectOption('conduit');
  await panel.getByLabel('Result quantity').selectOption('flow');
  await panel.getByLabel('Link end').selectOption('downstream');
  await panel.getByLabel('Source unit').selectOption('L/s');
  await panel.getByLabel('The next record contains units').check();
  await panel.getByLabel('The file contains instantaneous samples on the confirmed project clock').check();
  await panel.getByLabel('Mapping 1 CSV column number').fill('2');
  await panel.getByLabel('Mapping 1 Node or upstream ID').fill('00127');
  await panel.getByLabel('Mapping 1 Link suffix').fill('B');
  await panel.getByRole('button',{name:'Add mapped column'}).click();
  await panel.getByRole('button',{name:'Mapping 2 Remove'}).click();
  await panel.getByRole('button',{name:'Add mapped column'}).click();
  await panel.getByLabel('Mapping 3 CSV column number').fill('3');
  await panel.getByLabel('Mapping 3 Node or upstream ID').fill('00129');
  await panel.getByLabel('Mapping 3 Link suffix').fill('C');
  const submit=panel.getByRole('button',{name:'Index simulation results'});
  await submit.click();
  await status.filter({hasText:'3 timestamps indexed for 2 result series'}).waitFor();
  const sample=panel.locator('#hbResultSample');
  await sample.filter({hasText:'2025-01-01 00:00:00.000 (project clock) · 0 m³/s'}).waitFor();
  const next=panel.getByRole('button',{name:'Next sample'}),back=panel.getByRole('button',{name:'Previous sample'});
  await next.click();await sample.filter({hasText:'00:07:00.000 (project clock) · Missing'}).waitFor();
  await next.click();await sample.filter({hasText:'00:15:00.000 (project clock) · -0.4 m³/s'}).waitFor();
  assert(await next.isDisabled());
  await back.click();await sample.filter({hasText:'00:07:00.000 (project clock) · Missing'}).waitFor();
  const slider=panel.getByRole('slider',{name:'Sample position'});
  await slider.focus();await page.keyboard.press('Home');
  await sample.filter({hasText:'00:00:00.000 (project clock) · 0'}).waitFor();
  await panel.getByLabel('Result series').selectOption('1');
  await sample.filter({hasText:'00:00:00.000 (project clock) · 1.2'}).waitFor();
  assert.match(await panel.locator('#hbResultEnvelope').innerText(),/minimum 0\.5.*Maximum 1\.2/);
  await panel.getByLabel('Samples per second').selectOption('1');
  await panel.getByRole('button',{name:'Play',exact:true}).click();
  await panel.getByRole('button',{name:'Pause',exact:true}).click();
  await panel.getByLabel('Samples per second').selectOption('5');
  await panel.getByRole('button',{name:'Play',exact:true}).click();
  await sample.filter({hasText:'00:15:00.000 (project clock) · 1'}).waitFor();
  await panel.getByRole('button',{name:'Play',exact:true}).waitFor();
  await submit.click();await status.filter({hasText:'already indexed'}).waitFor();

  const larger=['Time,00127.B,00129.C',',L/s,L/s'];
  for(let i=0;i<80000;i++) larger.push(new Date(Date.UTC(2025,0,1,0,0,i)).toISOString().slice(0,-1)+',800,900');
  await upload('large-synthetic-results.csv',larger.join('\r\n'));
  await panel.getByText('Preview ready.',{exact:false}).waitFor();
  await panel.locator('form').evaluate(form=>{
    form.requestSubmit();form.querySelector('#hbCancelResult').click();
  });
  await status.filter({hasText:'Import cancelled.'}).waitFor();
  assert.match(await panel.getByLabel('Indexed source').locator('option:checked').innerText(),/synthetic-icm-results.csv/);
  await upload('invalid-synthetic-results.csv',fixture.replace('00:07:00','00:00:00'));
  await submit.click();await status.filter({hasText:'Timestamps must increase strictly'}).waitFor();
  assert.match(await panel.getByLabel('Indexed source').locator('option:checked').innerText(),/synthetic-icm-results.csv/);
  if(process.env.ICM_EVIDENCE_DIR){
    await fs.mkdir(process.env.ICM_EVIDENCE_DIR,{recursive:true});
    await panel.locator('article').nth(1).screenshot({path:process.env.ICM_EVIDENCE_DIR+'/v3-simulation-results-'+engine+'.png'});
  }
  await panel.getByRole('button',{name:'Remove indexed source'}).click();
  await panel.getByText('Import a results CSV to review available samples.').waitFor();
  assert.deepEqual(errors,[]);
  guard.assertClean();
  console.log('SIMULATION_RESULTS_PASS '+engine);
} finally {await browser.close();}
