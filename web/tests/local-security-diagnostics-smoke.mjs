import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium,firefox} from 'playwright';
import {browserLaunchOptions,browserContextOptions} from './browser-environment.mjs';
import {installPrivacyGuard} from './privacy-network.mjs';
import {nativeNetwork} from './network-route-fixture.mjs';

const engine=process.env.ICM_BROWSER||'chromium',base=process.env.ICM_BASE_URL||'http://127.0.0.1:8000/';
const browser=await (engine==='firefox'?firefox:chromium).launch(browserLaunchOptions());
const context=await browser.newContext({...browserContextOptions(),viewport:{width:1240,height:950}});
const guard=installPrivacyGuard(context,base,{canaries:['SYNTHETIC-LOCAL-INVENTORY','SYNTHETIC-LOCAL-WORKSPACE']});
const page=await context.newPage(),errors=[];
page.on('pageerror',error=>errors.push(error.message));
const dialog=page.getByRole('dialog',{name:'Local data and browser diagnostics'});
const csv=(name,text)=>({name,mimeType:'text/csv',buffer:Buffer.from(text)});
const report=()=>page.locator('#hbLocalSecurityRows').innerText();
async function open(){
  await page.getByRole('button',{name:'About',exact:true}).click();
  await page.getByRole('tab',{name:'IT Security',exact:true}).click();
  await page.getByRole('button',{name:'Open local data diagnostics',exact:true}).click();
  await dialog.waitFor();
}

try{
  await guard.navigate(page,base);await open();
  assert.match(await report(),/Ready source files.*0 ready \/ 0 total/);
  assert.match(await dialog.locator('#hbLocalSecurityCapabilities').innerText(),/Secure context.*available/);
  assert(await dialog.getByRole('button',{name:'Remove saved workspace copies'}).isDisabled());
  await dialog.getByRole('button',{name:'Manage current sources'}).click();
  await page.waitForFunction(()=>window.__ICM_PRECISION_WORKBENCH__.route().page==='time-series');
  await page.setInputFiles('#fileInput',csv('SYNTHETIC-LOCAL-INVENTORY.csv','Timestamp,Flow (L/s)\n2025-01-01T00:00:00,25\n2025-01-01T00:10:00,35\n'));
  await page.waitForFunction(()=>window.__ICM_WORKBENCH__.stateSummary().readyFiles===1,null,{timeout:90000});

  await open();assert.match(await report(),/Ready source files.*1 ready \/ 1 total/);
  await dialog.getByRole('button',{name:'Manage indexed simulation results'}).click();
  const inputs=page.locator('#hbResultsImport');
  await inputs.getByLabel('Local results CSV').setInputFiles(csv('SYNTHETIC-LOCAL-LEVEL.csv',
    'Time,00127\n2025-01-01 00:00:00,9.95\n2025-01-01 00:10:00,10.1\n'));
  for(const [label,value] of [['Simulation ID','Synthetic Run'],['Model revision','Synthetic Revision'],['Scenario','Baseline'],['Event','Synthetic event'],
    ['Vertical datum','AOD'],['Source result attribute','DEPNOD'],['Mapping 1 CSV column number','2'],['Mapping 1 Node or upstream ID','00127']])
    await inputs.getByLabel(label,{exact:true}).fill(value);
  await inputs.getByRole('checkbox',{name:/confirmed project clock/}).check();
  await inputs.getByRole('button',{name:'Index simulation results'}).click();
  await inputs.getByText('2 timestamps indexed for 1 result series.',{exact:true}).waitFor();

  await open();assert.match(await report(),/Indexed simulation results.*1 source/);
  await dialog.getByRole('button',{name:'Manage schematic'}).click();
  await page.locator('#nsLoadInput').setInputFiles(csv('synthetic-local-network.csv',nativeNetwork));
  await page.check('#nsContextUnits');await page.click('#nsContextApply');
  await page.waitForFunction(()=>JSON.parse(localStorage.getItem('hydra-network-schematic-v1'))?.nodes.length===7);

  await open();assert.match(await report(),/Schematic autosave.*7 nodes, 7 links/);
  await dialog.getByRole('button',{name:'Manage saved workspaces'}).click();
  await page.locator('#workspaceName').fill('SYNTHETIC-LOCAL-WORKSPACE');
  await page.getByRole('button',{name:'Save in browser',exact:true}).click();
  await page.waitForFunction(()=>Boolean(localStorage.getItem('icm-workbench-named')));
  await page.evaluate(()=>{
    localStorage.setItem('icm-workbench-named-corrupt-synthetic','retired synthetic record');
    localStorage.setItem('another-app-test','unrelated origin fixture');
  });

  await open();assert.match(await report(),/Named workspace copies.*1 saved.*1 recovery record/);
  const remove=dialog.getByRole('button',{name:'Remove saved workspace copies'});
  page.once('dialog',deletion=>deletion.dismiss());await remove.click();
  assert.match(await report(),/Named workspace copies.*1 saved/);
  page.once('dialog',deletion=>deletion.accept());await remove.click();
  await dialog.getByText('Removed the named workspace and recovery copies.',{exact:false}).waitFor();
  assert.match(await report(),/Named workspace copies.*0 saved.*0 recovery records/);
  assert.match(await report(),/Ready source files.*1 ready \/ 1 total/);
  assert.match(await report(),/Indexed simulation results.*1 source/);
  assert.match(await report(),/Schematic autosave.*7 nodes, 7 links/);
  assert.equal(await page.evaluate(()=>localStorage.getItem('another-app-test')),'unrelated origin fixture');
  await page.evaluate(()=>{
    if(navigator.storage)Object.defineProperty(navigator.storage,'estimate',{configurable:true,value:async()=>{throw new Error('synthetic denial');}});
  });
  await dialog.getByRole('button',{name:'Refresh diagnostics'}).click();
  await dialog.locator('#hbLocalSecurityStorage').filter({hasText:/declined to report|estimate unavailable/i}).waitFor();
  if(process.env.ICM_EVIDENCE_DIR){await fs.mkdir(process.env.ICM_EVIDENCE_DIR,{recursive:true});
    await dialog.screenshot({path:process.env.ICM_EVIDENCE_DIR+'/v3-local-security-'+engine+'.png'});}
  await dialog.getByRole('button',{name:'Close diagnostics'}).click();
  assert(await dialog.isHidden());assert.deepEqual(errors,[]);guard.assertClean();
  console.log('LOCAL_SECURITY_DIAGNOSTICS_PASS '+engine);
}finally{await browser.close();}
