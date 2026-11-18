import {trackControls} from './control-evidence.mjs';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {chromium} from 'playwright';
import {browserLaunchOptions,browserContextOptions} from './browser-environment.mjs';
import {installPrivacyGuard} from './privacy-network.mjs';

const base=process.env.ICM_BASE_URL||'http://127.0.0.1:8000/';
const browser=await chromium.launch(browserLaunchOptions());
let writeControlEvidence;
try{
  const context=await browser.newContext({...browserContextOptions(),viewport:{width:1440,height:900}});
  const privacy=installPrivacyGuard(context,base),page=await context.newPage();
  writeControlEvidence=await trackControls(context,'network-context-smoke-control-evidence.json');
  await privacy.navigate(page,base);
  await page.getByRole('link',{name:'Open network schematic'}).click();
  await page.locator('#nsSvg').waitFor();
  const fixture=readFileSync(new URL('../../tests/fixtures/network-context/synthetic-default.csv',import.meta.url),'utf8');
  const load=csv=>page.locator('#nsLoadInput').setInputFiles({name:'network.csv',mimeType:'text/csv',buffer:Buffer.from(csv)});
  const audit=page.getByRole('dialog',{name:'Model Context Import Audit'});
  const apply=audit.getByRole('button',{name:'Apply network context'});
  const beforeCancel=await page.evaluate(()=>window.ICMNetworkSchematic.snapshot());
  await load(fixture);
  await audit.waitFor();
  await audit.getByRole('button',{name:'Cancel',exact:true}).click();
  await audit.waitFor({state:'hidden'});
  assert.deepEqual(await page.evaluate(()=>window.ICMNetworkSchematic.snapshot()),beforeCancel);
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
  const conduit=page.locator('[data-ns-edge]');
  await conduit.focus();
  const previousConnector=await conduit.elementHandle();
  await page.setViewportSize({width:1380,height:900});
  await page.waitForFunction(element=>!element.isConnected,previousConnector);
  assert.equal(await conduit.evaluate(element=>document.activeElement===element),true,'Keyboard focus survives the schematic resize');
  await conduit.press('Enter');
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
  await page.getByText('Tools',{exact:true}).click();
  await page.getByText('Monitoring association',{exact:true}).click();
  await page.getByRole('button',{name:'Open Verification evidence'}).click();
  await page.locator('#verificationReviewDecision').selectOption('Requires investigation');
  await page.locator('#verificationReviewSave').click();
  await page.evaluate(()=>window.__ICM_PRECISION_WORKBENCH__.navigate('network','schematic'));
  await point.locator('[data-ns-verification="Review requires attention"]').waitFor({state:'attached'});
  await page.getByText('Tools',{exact:true}).click();
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
  await page.locator('#nsEdit').click();
  await point.focus();await point.press('Enter');
  await page.getByRole('tab',{name:'Evidence',exact:true}).click();
  const inspectorPanel=page.locator('#nsInspectorPanel');
  assert.match(await inspectorPanel.innerText(),/Flow Survey · Stale survey evidence/);
  assert.match(await inspectorPanel.innerText(),/Verification · Stale evidence/);
  await page.getByRole('tab',{name:'Data linking',exact:true}).click();
  await inspectorPanel.getByText('Monitoring association',{exact:true}).click();
  assert.equal(await inspectorPanel.getByLabel('Flow monitor').inputValue(),'FM01');
  await page.locator('#nsEdit').click();
  // Calculate a real comparison from synthetic ICM reports. A matching ID
  // alone must never attach that comparison to an imported network object.
  await page.evaluate(()=>window.__ICM_PRECISION_WORKBENCH__.navigate('data','time-series'));
  await page.setInputFiles('#dtFileInput',['flood','level','spill'].flatMap(kind=>['a','b'].map(slot=>'tests/fixtures/detriment/'+kind+'-'+slot+'.csv')));
  await page.waitForFunction(()=>[...state.files.values()].filter(file=>file.status==='ready'&&file.parsed?.metadata?.source_kind==='detriment_report').length===6);
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
  await page.locator('#nsEdit').click();
  await point.focus();await point.press('Enter');
  await page.getByRole('tab',{name:'Evidence',exact:true}).click();
  assert.match(await inspectorPanel.innerText(),/Change: 6 m³/);
  await inspectorPanel.getByRole('button',{name:'Open Flooding evidence',exact:true}).click();
  assert.match(await page.locator('#dtDrawer h2').innerText(),/^001$/);
  await page.locator('#dtForm [data-key="threshold"]').fill('6');
  await page.evaluate(()=>window.__ICM_PRECISION_WORKBENCH__.navigate('network','schematic'));
  await point.locator('[data-ns-detriment="stale"]').waitFor({state:'attached'});
  assert.doesNotMatch(await point.locator('[data-ns-detriment="stale"] title').textContent(),/m³/);
  await page.locator('#nsEdit').click();
  await point.focus();
  await point.press('Enter');
  await page.getByText('Detriment association',{exact:true}).click();
  await page.getByRole('button',{name:'Remove association'}).click();
  assert.equal(await point.locator('[data-ns-detriment]').count(),0);
  for(const [kind,asset,inputs,evidenceText] of [
    ['level','MH01',{threshold:'0.15',freeboard_required:'0.5',datum:'AOD',elevation_confirmed:true},/Proposed freeboard 0\.35 m/],
    ['spill','CSO01',{period_start:'2025-01-01',period_end:'2026-01-01',template:'UK12/24 equivalent threshold and integral'},/Δ 3 spills.*Δ duration 4 h/],
  ]){
    await page.evaluate(kind=>window.__ICM_PRECISION_WORKBENCH__.navigate('detriment',kind),kind);
    const field=key=>page.locator('#dtForm [data-key="'+key+'"]');
    for(const slot of ['a','b'])await field(slot+'.id').selectOption({label:kind+'-'+slot+'.csv'});
    await field('scope_confirmed').check();
    for(const [key,value] of Object.entries(inputs)){
      if(value===true)await field(key).check();
      else await field(key).fill(value);
    }
    await page.locator('#runDetrimentBtn').click();
    await page.waitForFunction(()=>window.ICMDetriment.result()?.status==='complete');
    await page.evaluate(()=>window.__ICM_PRECISION_WORKBENCH__.navigate('network','schematic'));
    await page.getByText('Tools',{exact:true}).click();
    await page.getByLabel('Detriment theme').selectOption(kind);
    await page.getByText('Tools',{exact:true}).click();
    assert.equal(await point.locator('[data-ns-detriment]').count(),0);
    await point.focus();
    await point.press('Enter');
    await page.getByText('Detriment association',{exact:true}).click();
    await page.getByLabel('Exact report asset ID').fill(asset);
    await page.getByRole('button',{name:'Confirm association'}).click();
    assert.match(await badge.locator('title').textContent(),evidenceText);
  }
  await page.getByRole('button',{name:'Done editing'}).click();
  await point.focus();
  await point.press('Enter');
  const inspector=page.getByRole('complementary',{name:'Selected asset evidence'});
  await page.getByRole('tab',{name:'Evidence',exact:true}).click();
  assert.match(await inspector.locator('.ns-linked-evidence').filter({hasText:'Flow monitor FM01'}).innerText(),/Flow monitor FM01/);
  await inspector.getByRole('button',{name:'Open Verification evidence'}).click();
  await page.waitForFunction(()=>window.__ICM_PRECISION_WORKBENCH__.route().workspace==='graphs');
  await page.evaluate(()=>window.__ICM_PRECISION_WORKBENCH__.navigate('network','schematic'));
  const menu=page.locator('.ns-export-menu summary');
  await menu.click();
  const networkDownload=page.waitForEvent('download');
  await page.locator('#nsSave').click();
  const networkJson=readFileSync(await (await networkDownload).path());
  const savedNetwork=JSON.parse(networkJson);
  assert.equal(savedNetwork.nodes.length,2);
  assert.equal(savedNetwork.edges.length,1);
  const chooseNetwork=async bytes=>{
    await menu.click();
    const choice=page.waitForEvent('filechooser');
    await page.locator('#nsLoad').click();
    await (await choice).setFiles({name:'network.json',mimeType:'application/json',buffer:bytes});
  };
  await chooseNetwork(Buffer.from('{"schema":2,"nodes":null}'));
  await page.waitForFunction(()=>document.querySelector('#nsStatus').textContent.includes('Unsupported network schematic file'));
  assert.equal(await page.locator('[data-ns-node]').count(),2);
  await chooseNetwork(networkJson);
  await page.waitForFunction(()=>document.querySelector('#nsStatus').textContent.includes('Network restored.'));
  assert.equal(await page.locator('[data-ns-edge]').count(),1);
  const layoutContext=await browser.newContext({...browserContextOptions(),viewport:{width:1024,height:768}});
  let writeLayoutEvidence;
  try{
    writeLayoutEvidence=await trackControls(layoutContext,'network-context-layout-control-evidence.json');
    const layoutPrivacy=installPrivacyGuard(layoutContext,base),layoutPage=await layoutContext.newPage();
    await layoutPrivacy.navigate(layoutPage,base);
    await layoutPage.getByRole('link',{name:'Open network schematic'}).click();
    const layoutMenu=layoutPage.locator('.ns-export-menu summary');
    await layoutMenu.click();
    const chooser=layoutPage.waitForEvent('filechooser');
    await layoutPage.locator('#nsLoad').click();
    await (await chooser).setFiles({name:'network.csv',mimeType:'text/csv',buffer:Buffer.from(fixture)});
    const layoutAudit=layoutPage.getByRole('dialog',{name:'Model Context Import Audit'});
    await layoutAudit.getByLabel('Layout').selectOption('schematic');
    await layoutAudit.getByRole('checkbox').check();
    await layoutAudit.getByRole('button',{name:'Apply network context'}).click();
    await layoutAudit.waitFor({state:'hidden'});
    const laidOut=await layoutPage.evaluate(()=>window.ICMNetworkSchematic.snapshot());
    const conduit=laidOut.edges[0];
    assert.equal(conduit.from,'001');
    assert.equal(conduit.to,'Out');
    assert.equal(conduit.icm.conduit_width,450);
    assert.deepEqual(conduit.bends,[]);
    assert.equal(laidOut.nodes[0].sourcePosition.x,350000);
    assert.notEqual(laidOut.nodes[0].x,laidOut.nodes[0].sourcePosition.x);
    assert.equal(await layoutPage.locator('[data-ns-edge]').count(),1);
    layoutPrivacy.assertClean();
  }finally{try{await writeLayoutEvidence?.();}finally{await layoutContext.close();}}
  privacy.assertClean();
  console.log('Native context import, audit, revision, hydraulic trial and Verification, Flow Survey and Detriment overlays passed.');
}finally{try{await writeControlEvidence?.();}finally{await browser.close();}}
