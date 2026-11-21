import assert from 'node:assert/strict';
import {chromium,firefox} from 'playwright';
import {browserLaunchOptions,browserContextOptions} from './browser-environment.mjs';
import {installPrivacyGuard} from './privacy-network.mjs';
import {baseline,changed} from './network-revision-fixture.mjs';

const engine=process.env.ICM_BROWSER||'chromium',base=process.env.ICM_BASE_URL||'http://127.0.0.1:8000/';
const browser=await (engine==='firefox'?firefox:chromium).launch(browserLaunchOptions());
const context=await browser.newContext({...browserContextOptions(),viewport:{width:1440,height:1000}});
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
  assert.deepEqual(await snapshot(),original);
  await audit.getByRole('button',{name:'Cancel',exact:true}).click();
  await audit.waitFor({state:'hidden'});
  assert.deepEqual(await snapshot(),original);
  await open(changed);await apply();
  const final=await snapshot();
  assert.equal(final.edges.find(edge=>edge.from==='A').to,'C');
  assert.equal(final.nodes.some(node=>node.id==='E'),false);
  assert.equal(final.nodes.some(node=>node.id==='F'),true);
  assert.deepEqual(errors,[]);
  guard.assertClean();
  console.log('NETWORK_REVISION_PASS '+engine);
}finally{await browser.close();}
