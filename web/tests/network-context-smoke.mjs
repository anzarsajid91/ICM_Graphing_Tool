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
    '001,350000,425000,Manhole','Out,350125,425030,Outfall',
    '**** hw_conduit','us_node_id,link_suffix,ds_node_id,shape,roughness_type,conduit_width,conduit_height,conduit_length,us_invert,ds_invert,bottom_roughness_CW,top_roughness_CW,sediment_depth,number_of_barrels,point_array',
    '001,1,OUT,CIRC,CW,450,450,200,101,100,1.5,1.5,0,1,"{350000,425000,350030,425025,350125,425030}"',
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
  await load(fixture.replace('001,1,OUT','001,1,Missing'));
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
  const point=page.locator('[data-ns-node="001"]');
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
  await page.evaluate(()=>{
    const wb=window.__ICM_WORKBENCH__;
    wb.survey.batch={monitors:[{monitor:'FM01',status:'complete',weekly:{weeks:[
      {start:'2026-01-01',end:'2026-01-08',week_ending:'2026-01-08',rag:'Green'},
      {start:'2026-01-08',end:'2026-01-10',week_ending:'2026-01-10',rag:'Amber'},
    ]}}]};
    wb.survey.batchSignature=wb.surveyDependencySignature('complete');
  });
  await page.getByLabel('Flow Survey evidence layer').check();
  await point.locator('[data-ns-survey="Amber · Calculated · Short boundary week"]').waitFor({state:'attached'});
  await page.getByLabel('Survey week',{exact:true}).selectOption('2026-01-08');
  await point.locator('[data-ns-survey="Green · Calculated"]').waitFor({state:'attached'});
  await page.getByLabel('Flow Survey evidence layer').uncheck();
  await page.evaluate(()=>{document.querySelector('#gapInput').value='150';});
  await page.getByLabel('Flow Survey evidence layer').check();
  await point.locator('[data-ns-survey="Stale survey evidence"]').waitFor({state:'attached'});
  // Calculate a real comparison from synthetic ICM reports. A matching ID
  // alone must never attach that comparison to an imported network object.
  await page.evaluate(()=>window.__ICM_PRECISION_WORKBENCH__.navigate('data','time-series'));
  await page.setInputFiles('#dtFileInput',['tests/fixtures/detriment/flood-a.csv','tests/fixtures/detriment/flood-b.csv']);
  await page.waitForFunction(()=>[...state.files.values()].filter(file=>file.status==='ready'&&file.parsed?.metadata?.source_kind==='detriment_report').length===2);
  await page.evaluate(()=>window.__ICM_PRECISION_WORKBENCH__.navigate('detriment','flooding'));
  for(const [slot,name] of [['a','flood-a.csv'],['b','flood-b.csv']]){
    await page.locator('#dtForm [data-key="'+slot+'.id"]').selectOption({label:name});
  }
  await page.locator('#dtForm [data-key="scope_confirmed"]').check();
  await page.locator('#dtForm [data-key="threshold"]').fill('5');
  await page.locator('#runDetrimentBtn').click();
  await page.waitForFunction(()=>window.ICMDetriment.result()?.rows.some(row=>row.asset_id==='001'&&row.delta===6));
  await page.evaluate(()=>window.__ICM_PRECISION_WORKBENCH__.navigate('network','schematic'));
  if(!await page.locator('#nsReviewTools').evaluate(el=>el.open))await page.getByText('Tools',{exact:true}).click();
  await page.getByLabel('Detriment evidence layer').check();
  await page.getByText('Tools',{exact:true}).click();
  assert.equal(await page.locator('[data-ns-detriment]').count(),0);
  await point.focus();
  await point.press('Enter');
  await page.getByText('Detriment association',{exact:true}).click();
  await page.getByLabel('Exact report asset ID').fill('001');
  await page.getByRole('button',{name:'Confirm association'}).click();
  const badge=point.locator('[data-ns-detriment="detriment"]');
  assert.match(await badge.locator('title').textContent(),/flood-a.csv → flood-b.csv.*Δ 6 m³/);
  if(process.env.ICM_DETRIMENT_LAYER_SCREENSHOT)await page.screenshot({path:process.env.ICM_DETRIMENT_LAYER_SCREENSHOT,animations:'disabled'});
  await page.getByRole('button',{name:'Open detriment evidence'}).click();
  assert.match(await page.locator('#dtDrawer h2').innerText(),/^001$/);
  await page.locator('#dtForm [data-key="threshold"]').fill('6');
  await page.evaluate(()=>window.__ICM_PRECISION_WORKBENCH__.navigate('network','schematic'));
  await point.locator('[data-ns-detriment="stale"]').waitFor({state:'attached'});
  assert.doesNotMatch(await point.locator('[data-ns-detriment="stale"] title').textContent(),/m³/);
  await point.focus();
  await point.press('Enter');
  await page.getByText('Detriment association',{exact:true}).click();
  await page.getByRole('button',{name:'Remove association'}).click();
  assert.equal(await point.locator('[data-ns-detriment]').count(),0);
  privacy.assertClean();
  console.log('Native context import, audit, revision, hydraulic trial and Verification, Flow Survey and Detriment overlays passed.');
}finally{await browser.close();}
