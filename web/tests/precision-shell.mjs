import { chromium, firefox } from 'playwright';

const browserName=String(process.env.ICM_BROWSER||'firefox').toLowerCase();
const launcher=browserName==='chromium'?chromium:firefox;
const baseUrl=process.env.ICM_BASE_URL||'http://127.0.0.1:8000/';
const browser=await launcher.launch({headless:true});
const context=await browser.newContext({viewport:{width:1440,height:1000}});
const page=await context.newPage();
const errors=[];
page.on('pageerror',e=>errors.push(String(e)));
page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
try{
  await page.goto(baseUrl,{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.__ICM_WORKBENCH__?.status==='ready'&&window.__ICM_PRECISION_WORKBENCH__?.navigate,null,{timeout:120000});
  const labels=(await page.locator('.pw-primary-nav button').allTextContents()).map(x=>x.replace(/^[^A-Za-z]+/,'').trim());
  if(labels.join('|')!=='Data & Time Series|Flow Survey|Rainfall|Assessment|Spills|Report')throw new Error('Primary workspaces mismatch: '+JSON.stringify(labels));
  const productTitle=((await page.locator('.pw-brand-title').textContent())||'').trim();
  if(productTitle!=='ICM Graphing Tool')throw new Error('Product title must be ICM Graphing Tool, got '+JSON.stringify(productTitle));
  if(await page.locator('#pwRailToggle').count()!==1)throw new Error('Navigation rail needs an explicit collapse/expand control.');
  if(await page.locator('[data-pw-page="provenance"]').count()!==0)throw new Error('User-facing provenance route should be removed.');

  // Refinement acceptance: graph-heavy analytical routes lead with the focused canvas,
  // while the standard labelled navigation remains available as an explicit fallback.
  await page.evaluate(()=>window.__ICM_PRECISION_WORKBENCH__.navigate('data','time-series',false));
  const defaultFocus=await page.evaluate(()=>({
    focus:document.body.classList.contains('pw-focus-canvas'),
    rail:document.querySelector('.pw-rail')?.getBoundingClientRect().width||0,
    inspectorToggleVisible:getComputedStyle(document.querySelector('#pwInspectorToggle')).display!=='none',
    railToggleHidden:document.querySelector('#pwRailToggle')?.hidden===true
  }));
  if(!defaultFocus.focus||defaultFocus.rail>90||!defaultFocus.inspectorToggleVisible||!defaultFocus.railToggleHidden)throw new Error('Graph route must default to the focused analytical canvas: '+JSON.stringify(defaultFocus));
  const graphDominance=await page.evaluate(()=>({
    viewport:document.documentElement.clientWidth,
    panel:document.querySelector('#tab-graph>.panel')?.getBoundingClientRect().width||0,
    chart:document.querySelector('#timeChart')?.getBoundingClientRect().width||0
  }));
  if(graphDominance.panel/graphDominance.viewport<0.82||graphDominance.chart/graphDominance.viewport<0.78)throw new Error('Focused graph workspace is not sufficiently dominant: '+JSON.stringify(graphDominance));
  await page.evaluate(()=>window.__ICM_PRECISION_WORKBENCH__.setFocus(false));
  await page.waitForFunction(()=>!document.body.classList.contains('pw-focus-canvas'));
  const railExpanded=await page.locator('.pw-rail').evaluate(el=>el.getBoundingClientRect().width);
  if(railExpanded<180)throw new Error('Standard layout did not restore labelled navigation width: '+railExpanded);
  await page.click('#pwRailToggle');
  const railCollapsed=await page.locator('.pw-rail').evaluate(el=>el.getBoundingClientRect().width);
  if(!(railCollapsed<railExpanded))throw new Error('Rail collapse control did not reduce navigation width: '+JSON.stringify({railExpanded,railCollapsed}));
  await page.evaluate(()=>window.__ICM_PRECISION_WORKBENCH__.navigate('survey','data-health',false));
  const railAfterRoute=await page.locator('.pw-rail').evaluate(el=>el.getBoundingClientRect().width);
  if(Math.abs(railAfterRoute-railCollapsed)>2)throw new Error('Route change mutated the user-selected rail collapse state: '+JSON.stringify({railCollapsed,railAfterRoute}));
  await page.click('#pwRailToggle');
  const inspectorContainment=await page.evaluate(()=>{
    const inspector=document.querySelector('#pwInspector'),toolbar=document.querySelector('#v2GraphToolbar');
    return{inspectorClient:inspector?.clientWidth||0,inspectorScroll:inspector?.scrollWidth||0,toolbarClient:toolbar?.clientWidth||0,toolbarScroll:toolbar?.scrollWidth||0};
  });
  if(inspectorContainment.inspectorScroll>inspectorContainment.inspectorClient+1||inspectorContainment.toolbarScroll>inspectorContainment.toolbarClient+1)throw new Error('Docked time-series Inspector controls overflow horizontally: '+JSON.stringify(inspectorContainment));

  // Refinement acceptance: shared legacy tabs must expose only the surface owned by the selected route.
  await page.evaluate(()=>window.__ICM_PRECISION_WORKBENCH__.navigate('survey','flow-continuity',false));
  const continuityComposition=await page.evaluate(()=>{
    const visible=el=>Boolean(el)&&!el.hidden&&el.getClientRects().length>0;
    return{
      balance:visible(document.querySelector('#surveyBalancePanel')),
      completeSurvey:visible(document.querySelector('#completeSurveyPanel')),
      rawHealth:visible(document.querySelector('#healthBody')?.closest('.table-wrap')),
      professional:visible(document.querySelector('.survey-professional')),
    };
  });
  if(!continuityComposition.balance||continuityComposition.completeSurvey||continuityComposition.rawHealth||continuityComposition.professional)throw new Error('Flow continuity route ownership is incorrect: '+JSON.stringify(continuityComposition));

  await page.evaluate(()=>window.__ICM_PRECISION_WORKBENCH__.navigate('survey','data-health',false));
  if(await page.locator('#pwDataHealthSummary').count()!==1)throw new Error('Data Health must lead with a monitor/source triage summary before raw channel/week detail.');
  const healthComposition=await page.evaluate(()=>({
    summaryVisible:getComputedStyle(document.querySelector('#pwDataHealthSummary')).display!=='none',
    rawInsideDetails:Boolean(document.querySelector('#pwDataHealthDetails #healthBody')),
  }));
  if(!healthComposition.summaryVisible||!healthComposition.rawInsideDetails)throw new Error('Data Health summary/detail composition is incomplete: '+JSON.stringify(healthComposition));
  const typeScale=await page.evaluate(()=>({
    title:Number.parseFloat(getComputedStyle(document.querySelector('.pw-page-title')).fontSize),
    nav:Number.parseFloat(getComputedStyle(document.querySelector('.pw-primary-nav button')).fontSize),
    tableHeading:Number.parseFloat(getComputedStyle(document.querySelector('#pwDataHealthSummary th')).fontSize),
    scopeLabel:Number.parseFloat(getComputedStyle(document.querySelector('.pw-scope-item span')).fontSize),
  }));
  if(typeScale.title<24||typeScale.nav<15||typeScale.tableHeading<13||typeScale.scopeLabel<12)throw new Error('Precision typography scale is below the refinement minimums: '+JSON.stringify(typeScale));

  const inspectorText=(await page.locator('#pwInspectorBody').textContent())||'';
  if(inspectorText.includes('Live context'))throw new Error('Inspector must not present the hard-coded Live context result state.');

  await page.evaluate(()=>window.__ICM_PRECISION_WORKBENCH__.navigate('report','builder',false));
  const reportComposition=await page.evaluate(()=>{
    const visible=el=>Boolean(el)&&!el.hidden&&el.getClientRects().length>0;
    return{
      builder:visible(document.querySelector('#pwReportBuilderSurface')),
      workspace:visible(document.querySelector('#pwWorkspaceSurface')),
      readiness:visible(document.querySelector('#reportPreflight')),
      reportExport:visible(document.querySelector('#downloadReportBtn')),
      workspaceExport:visible(document.querySelector('#downloadWorkspaceBtn')),
    };
  });
  if(!reportComposition.builder||reportComposition.workspace||!reportComposition.readiness||!reportComposition.reportExport||reportComposition.workspaceExport)throw new Error('Report builder ownership is incorrect: '+JSON.stringify(reportComposition));
  for(const size of [{width:1366,height:768},{width:1487,height:1058},{width:1920,height:1080}]){
    await page.setViewportSize(size);
    await page.evaluate(()=>window.__ICM_PRECISION_WORKBENCH__.navigate('data','sources',false));
    const layout=await page.evaluate(()=>({
      overflow:document.documentElement.scrollWidth-document.documentElement.clientWidth,
      sourceVisible:getComputedStyle(document.querySelector('.source-panel')).display!=='none',
      railVisible:getComputedStyle(document.querySelector('.pw-rail')).display!=='none'
    }));
    if(layout.overflow>1||!layout.sourceVisible||!layout.railVisible)throw new Error('Responsive shell failure '+size.width+'x'+size.height+': '+JSON.stringify(layout));
  }
  await page.setViewportSize({width:1440,height:1000});
  await page.evaluate(()=>window.__ICM_PRECISION_WORKBENCH__.navigate('survey','data-health',true));
  await page.waitForFunction(()=>location.hash==='#/survey/data-health');
  if((await page.locator('#pwPageTitle').textContent())?.trim()!=='Survey health and data coverage')throw new Error('Deep-link title mismatch');
  await page.reload({waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.__ICM_WORKBENCH__?.status==='ready'&&window.__ICM_PRECISION_WORKBENCH__?.route?.().page==='data-health',null,{timeout:120000});
  if(errors.length)throw new Error('Browser errors: '+errors.join(' | '));
  console.log(browserName+' Precision Workbench shell acceptance passed.');
}finally{
  await browser.close();
}
