import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium,firefox} from 'playwright';
import {browserLaunchOptions,browserContextOptions} from './browser-environment.mjs';
import {installPrivacyGuard} from './privacy-network.mjs';
import {baseline,changed} from './network-revision-fixture.mjs';
import {largeNativeNetwork} from './network-route-fixture.mjs';

const engine=process.env.ICM_BROWSER||'chromium',base=process.env.ICM_BASE_URL||'http://127.0.0.1:8000/';
const browser=await (engine==='firefox'?firefox:chromium).launch(browserLaunchOptions());
const context=await browser.newContext({...browserContextOptions(),acceptDownloads:true,viewport:{width:1440,height:1000}});
const page=await context.newPage(),guard=installPrivacyGuard(context,base),errors=[];
page.on('pageerror',error=>errors.push(error.message));
const snapshot=()=>page.evaluate(()=>window.ICMNetworkSchematic.snapshot());
const input=page.locator('#nsLoadInput');
const audit=page.getByRole('dialog',{name:'Model Context Import Audit'});
const open=async text=>{
  await input.setInputFiles({name:'network.csv',mimeType:'text/csv',buffer:Buffer.from(text)});
  await audit.waitFor();
};
const apply=async()=>{
  await audit.getByRole('checkbox').check();
  await audit.getByRole('button',{name:'Apply network context'}).click();
  await audit.waitFor({state:'hidden'});
};
try{
  await guard.navigate(page,base);
  await page.getByRole('link',{name:'Open network schematic'}).click();
  await page.locator('#nsSvg').waitFor();
  await open(baseline);await apply();
  await page.locator('button[data-workspace="data"]').click();
  await page.setInputFiles('#fileInput',{name:'synthetic-revision-flow.csv',mimeType:'text/csv',buffer:Buffer.from(
    'Timestamp,Flow (L/s)\n2025-01-01T00:00:00,10\n2025-01-01T00:05:00,20\n'
  )});
  await page.waitForFunction(()=>window.__ICM_WORKBENCH__.stateSummary().readyFiles===1,null,{timeout:90000});
  await page.click('#pwImportMonitorLocations');
  await page.setInputFiles('#nsMonitorFile',{name:'synthetic-revision-monitor-location.csv',mimeType:'text/csv',buffer:Buffer.from(
    'Column 1,Column 2\nFM-A,A\n=FM-LINK,A.1\n'
  )});
  await page.selectOption('#nsMonitorNameColumn','0');
  await page.click('#nsMonitorApply');await page.click('#nsMonitorClose');
  await page.locator('button[data-workspace="network"]').click();
  await page.getByRole('tab',{name:'Schematic',exact:true}).click();
  assert.equal(await page.locator('#nsSvg [data-ns-monitor]').count(),2);
  await page.locator('#nsSvg').getByRole('button',{name:'Connector A.1',exact:true}).press('Enter');
  const inspector=page.locator('#nsPopup');
  await inspector.getByRole('tab',{name:'Data linking',exact:true}).click();
  await inspector.getByLabel('Reference source').selectOption({label:'synthetic-revision-flow.csv'});
  await inspector.getByRole('button',{name:'Link time series',exact:true}).click();
  const original=await snapshot();
  await open(changed);
  const comparison=audit.locator('#nsRevisionComparison');
  await comparison.locator('summary').click();
  assert.match(await comparison.innerText(),/Added 1 · Removed 1 · Modified 5/);
  await comparison.getByLabel('Change type').selectOption('Removed');
  assert.equal(await comparison.getByRole('button',{name:'E',exact:true}).count(),1);
  assert.equal(await comparison.getByRole('button',{name:'F',exact:true}).count(),0);
  await comparison.getByLabel('Change type').selectOption('Modified');
  await comparison.getByLabel('Find changed asset').fill('A.1');
  await comparison.getByRole('button',{name:'A.1',exact:true}).click();
  assert.match(await comparison.innerText(),/Downstream node/);
  assert.match(await comparison.innerText(),/conduit_length/);
  await comparison.getByLabel('Geometry layer').selectOption('before');
  assert.equal(await comparison.locator('.ns-revision-preview polyline').count(),1);
  const scope=comparison.getByLabel('Preview scope',{exact:true});
  await scope.selectOption('network');
  const figure=comparison.getByRole('img',{name:'Full network source geometry with filtered changes'});
  const path=(phase,kind)=>figure.locator('[data-ns-revision-phase="'+phase+'"][data-ns-revision-kind="'+kind+'"]');
  const segments=async(phase,kind)=>(await path(phase,kind).getAttribute('d')).match(/M/g).length;
  assert.equal(await segments('context','node'),5);
  assert.equal(await segments('context','edge'),3);
  assert.equal(await segments('before','edge'),1);
  assert.equal(await path('after','edge').count(),0);
  await comparison.getByLabel('Geometry layer').selectOption('both');
  assert.equal(await segments('after','edge'),1);
  await comparison.getByRole('button',{name:'A.1',exact:true}).click();
  await comparison.getByRole('heading',{name:'Affected assignments and evidence',exact:true}).waitFor();
  assert.match(await comparison.innerText(),/=FM-LINK[\s\S]*original host changed/);
  assert.match(await comparison.innerText(),/synthetic-revision-flow\.csv[\s\S]*assignment is withdrawn/);
  const [file]=await Promise.all([page.waitForEvent('download'),comparison.getByRole('button',{name:'Download revision audit'}).click()]);
  const exported=await fs.readFile(await file.path(),'utf8');
  assert.equal(file.suggestedFilename(),'hydra-network-revision.csv');
  assert.match(exported,/Downstream node.*"B","C"/);
  assert.match(exported,/"'=FM-LINK"/);
  assert.match(exported,/synthetic-revision-flow\.csv/);
  await comparison.getByLabel('Find changed asset').fill('');
  await comparison.getByLabel('Only changes affecting assignments or evidence').check();
  assert.equal(await comparison.getByRole('button',{name:'A',exact:true}).count(),1);
  assert.equal(await comparison.getByRole('button',{name:'A.1',exact:true}).count(),1);
  assert.equal(await comparison.getByRole('button',{name:'B',exact:true}).count(),0);
  assert.equal(await segments('context','edge'),3);
  assert.deepEqual(await snapshot(),original);
  await audit.getByRole('button',{name:'Cancel',exact:true}).click();
  await audit.waitFor({state:'hidden'});
  assert.deepEqual(await snapshot(),original);
  await open(changed);await apply();
  const final=await snapshot();
  assert.equal(final.edges.find(edge=>edge.from==='A').to,'C');
  assert.equal(final.edges.find(edge=>edge.from==='A').seriesLinks,undefined);
  assert.equal(final.monitorLocations.length,2);
  assert.equal(await page.locator('#nsSvg [data-ns-monitor]').count(),1);
  assert.equal(final.nodes.some(node=>node.id==='E'),false);
  assert.equal(final.nodes.some(node=>node.id==='F'),true);

  await page.click('#nsClearMap');await page.click('#nsConfirmClearMap');
  const dense=largeNativeNetwork(5001);
  await open(dense);await apply();
  await open(dense.replace('00001,1000,2000,CSO','00001,999,2000,CSO'));
  await comparison.locator('summary').click();
  const begin=performance.now();
  await scope.selectOption('network');
  assert.equal(await segments('context','node'),5001);
  assert.equal(await segments('context','edge'),5000);
  assert.equal(await segments('after','node'),1);
  assert.equal(await figure.locator('path').count(),6);
  const previewMs=Math.round(performance.now()-begin);
  if(process.env.ICM_EVIDENCE_DIR){
    await fs.mkdir(process.env.ICM_EVIDENCE_DIR,{recursive:true});
    await figure.screenshot({path:process.env.ICM_EVIDENCE_DIR+'/v3-dense-revision-'+engine+'.png'});
  }
  await audit.getByRole('button',{name:'Cancel',exact:true}).click();
  assert.equal((await snapshot()).nodes.find(node=>node.id==='00001').sourcePosition.x,1000);
  assert.deepEqual(errors,[]);
  guard.assertClean();
  console.log('NETWORK_REVISION_PASS '+engine+' · 10,001 assets in '+previewMs+' ms');
}finally{await browser.close();}
