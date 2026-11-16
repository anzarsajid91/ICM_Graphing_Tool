import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {browserLaunchOptions,browserContextOptions} from './browser-environment.mjs';
import {installPrivacyGuard} from './privacy-network.mjs';

const base=process.env.ICM_BASE_URL||'http://127.0.0.1:8000/';
const browser=await chromium.launch(browserLaunchOptions());
try{
  const context=await browser.newContext({...browserContextOptions(),viewport:{width:1440,height:900}});
  const privacy=installPrivacyGuard(context,base),page=await context.newPage();
  await privacy.navigate(page,base);
  await page.getByRole('link',{name:'Open network schematic'}).click();
  await page.locator('#nsSvg').waitFor();
  const fixture=[
    '**** hw_node','node_id,x,y,node_type',
    'Up,350000,425000,Manhole','Out,350125,425030,Outfall',
    '**** hw_conduit','us_node_id,link_suffix,ds_node_id,shape,roughness_type,conduit_width,conduit_height,conduit_length,us_invert,ds_invert,bottom_roughness_CW,top_roughness_CW,sediment_depth,number_of_barrels,point_array',
    'UP,1,OUT,CIRC,CW,450,450,200,101,100,1.5,1.5,0,1,"{350000,425000,350030,425025,350125,425030}"',
    '',
  ].join('\n');
  const load=csv=>page.locator('#nsLoadInput').setInputFiles({name:'network.csv',mimeType:'text/csv',buffer:Buffer.from(csv)});
  const audit=page.getByRole('dialog',{name:'Model Context Import Audit'});
  const apply=audit.getByRole('button',{name:'Apply network context'});
  await load(fixture);
  await audit.waitFor();
  await apply.click();
  assert.match(await audit.textContent(),/Confirm the units/);
  assert.equal(await page.locator('[data-ns-node]').count(),0);
  await audit.getByRole('checkbox').check();
  await apply.click();
  await audit.waitFor({state:'hidden'});
  assert.equal(await page.locator('[data-ns-node]').count(),2);
  assert.equal(await page.locator('[data-ns-edge] [data-ns-direction]').count(),1);
  await load(fixture.replace('UP,1,OUT','UP,1,Missing'));
  await page.waitForFunction(()=>document.querySelector('#nsStatus').textContent.includes('unknown node'));
  assert.equal(await page.locator('[data-ns-node]').count(),2);
  await load(fixture.replace('Out,350125,425030','Out,350145,425030'));
  await audit.getByRole('checkbox').check();
  await apply.click();
  await audit.waitFor({state:'hidden'});
  assert.equal(await page.evaluate(()=>window.ICMNetworkSchematic.snapshot().nodes.find(n=>n.id==='Out').x),350145);
  await page.locator('#nsEdit').click();
  await page.locator('[data-ns-edge]').focus();
  await page.locator('[data-ns-edge]').press('Enter');
  await page.getByRole('button',{name:'Open in Hydraulic Calculations'}).click();
  assert.equal(await page.getByLabel(/Diameter/).inputValue(),'450');
  assert.equal(await page.getByLabel('Gradient (m/m)').inputValue(),'0.005');
  await page.getByLabel(/Diameter/).fill('600');
  assert.equal(await page.evaluate(()=>window.ICMNetworkSchematic.snapshot().edges[0].icm.conduit_width),450);
  await page.evaluate(()=>{
    const registry=window.ICMProjectRegistry;
    registry.registerSource({id:'monitor',hash:'fixture-monitor',displayName:'FM01.fdv',parsed:{
      format:'fdv_ascii',columns:['flow'],metadata:{monitor:'FM01',channels:{flow:{quantity:'flow',canonical_unit:'m³/s'}}}}});
    registry.registerSource({id:'baseline',hash:'fixture-baseline',displayName:'Model.csv',parsed:{
      format:'tabular_csv',columns:['Flow (m³/s)'],metadata:{quantity:'flow',canonical_unit:'m³/s'}}});
    const observed=JSON.stringify(['monitor','flow']),model=JSON.stringify(['baseline','Flow (m³/s)']);
    registry.publishAssessment('verification:comparison',{asset:{id:'FM01',kind:'flow-monitor'},signature:analysisSignature(),
      period:{start:null,end:null},seriesKeys:[observed,model],scenarios:[{seriesKey:model,metrics:{pairs:4,rmse:.01},
        coverage:{status:'complete',coverage_fraction:1},unit:'m³/s'}]});
    window.__ICM_PRECISION_WORKBENCH__.navigate('network','schematic');
  });
  const point=page.locator('[data-ns-node="Up"]');
  await point.focus();
  await point.press('Enter');
  await page.getByText('Monitoring association',{exact:true}).click();
  await page.locator('#nsMonitorAssociation').selectOption('FM01');
  await page.getByText('Tools',{exact:true}).click();
  await page.getByLabel('Verification evidence layer').check();
  await point.locator('[data-ns-verification="Evidence available"]').waitFor({state:'attached'});
  await page.getByLabel('Verification evidence layer').uncheck();
  await page.evaluate(()=>{document.querySelector('#gapInput').value='120';});
  await page.getByLabel('Verification evidence layer').check();
  await point.locator('[data-ns-verification="Stale evidence"]').waitFor({state:'attached'});
  privacy.assertClean();
  console.log('Native context import, audit, revision, hydraulic trial and Verification overlay passed.');
}finally{await browser.close();}
