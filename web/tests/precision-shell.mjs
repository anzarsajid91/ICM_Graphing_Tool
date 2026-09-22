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
  await page.waitForFunction(()=>Boolean(window.__ICM_PRECISION_WORKBENCH__?.navigate),null,{timeout:30000});
  const labels=(await page.locator('.pw-primary-nav button').allTextContents()).map(x=>x.replace(/^[^A-Za-z]+/,'').trim());
  if(labels.join('|')!=='Data / Time Series|Spills|Flow Survey|Graphs|Reports')throw new Error('Primary workspaces mismatch: '+JSON.stringify(labels));
  await page.evaluate(()=>window.__ICM_PRECISION_WORKBENCH__.navigate('survey','fdv-check',false));
  const surveyTabs=(await page.locator('#pwSecondaryNav button').allTextContents()).map(x=>x.trim());
  if(surveyTabs.join('|')!=='FDV Check|Rainfall Check|Volume Balance')throw new Error('Flow Survey subtab order mismatch: '+JSON.stringify(surveyTabs));
  await page.evaluate(()=>window.__ICM_PRECISION_WORKBENCH__.navigate('reports','report-generation',false));
  const reportTabs=(await page.locator('#pwSecondaryNav button').allTextContents()).map(x=>x.trim());
  if(reportTabs[0]!=='Report Generation')throw new Error('Reports must land on Report Generation first: '+JSON.stringify(reportTabs));
  await page.evaluate(()=>window.__ICM_PRECISION_WORKBENCH__.navigate('verification','storage',false));
  const migrated=await page.evaluate(()=>window.__ICM_PRECISION_WORKBENCH__.route());
  if(migrated.workspace!=='spills'||migrated.page!=='storage')throw new Error('Legacy Storage route did not migrate: '+JSON.stringify(migrated));
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
  await page.evaluate(()=>window.__ICM_PRECISION_WORKBENCH__.navigate('survey','fdv-check',false));
  const railAfterRoute=await page.locator('.pw-rail').evaluate(el=>el.getBoundingClientRect().width);
  if(Math.abs(railAfterRoute-railCollapsed)>2)throw new Error('Route change mutated the user-selected rail collapse state: '+JSON.stringify({railCollapsed,railAfterRoute}));
  await page.click('#pwRailToggle');
  const inspectorContainment=await page.evaluate(()=>{
    const inspector=document.querySelector('#pwInspector'),toolbar=document.querySelector('#v2GraphToolbar');
    return{inspectorClient:inspector?.clientWidth||0,inspectorScroll:inspector?.scrollWidth||0,toolbarClient:toolbar?.clientWidth||0,toolbarScroll:toolbar?.scrollWidth||0};
  });
  if(inspectorContainment.inspectorScroll>inspectorContainment.inspectorClient+1||inspectorContainment.toolbarScroll>inspectorContainment.toolbarClient+1)throw new Error('Docked time-series Inspector controls overflow horizontally: '+JSON.stringify(inspectorContainment));

  // Refinement acceptance: shared legacy tabs must expose only the surface owned by the selected route.
  await page.evaluate(()=>window.__ICM_PRECISION_WORKBENCH__.navigate('survey','volume-balance',false));
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

  await page.evaluate(()=>window.__ICM_PRECISION_WORKBENCH__.navigate('survey','fdv-check',false));
  if(await page.locator('#pwDataHealthSummary').count()!==1)throw new Error('FDV Check must lead with a monitor/source triage summary before raw channel/week detail.');
  const healthComposition=await page.evaluate(()=>({
    summaryVisible:getComputedStyle(document.querySelector('#pwDataHealthSummary')).display!=='none',
    rawInsideDetails:Boolean(document.querySelector('#pwDataHealthDetails #healthBody')),
  }));
  if(!healthComposition.summaryVisible||!healthComposition.rawInsideDetails)throw new Error('FDV Check summary/detail composition is incomplete: '+JSON.stringify(healthComposition));
  const typeScale=await page.evaluate(()=>({
    title:Number.parseFloat(getComputedStyle(document.querySelector('.pw-page-title')).fontSize),
    section:Number.parseFloat(getComputedStyle(document.querySelector('.panel-head h2')).fontSize),
    subsection:Number.parseFloat(getComputedStyle(document.querySelector('h3')).fontSize),
    nav:Number.parseFloat(getComputedStyle(document.querySelector('.pw-primary-nav button')).fontSize),
    secondary:Number.parseFloat(getComputedStyle(document.querySelector('.pw-secondary-nav button')).fontSize),
    tableHeading:Number.parseFloat(getComputedStyle(document.querySelector('#pwDataHealthSummary th')).fontSize),
    scopeLabel:Number.parseFloat(getComputedStyle(document.querySelector('.pw-scope-item span')).fontSize),
  }));
  if(typeScale.title<24||typeScale.section<20||typeScale.subsection<16||typeScale.nav<15||typeScale.secondary>13||typeScale.nav<=typeScale.secondary||typeScale.tableHeading<13||typeScale.scopeLabel<12)throw new Error('Precision typography hierarchy is below the strict PR25 minimums: '+JSON.stringify(typeScale));

  const rhythm=await page.evaluate(()=>{
    const values={};
    const take=(name,el,props)=>{const s=getComputedStyle(el);for(const prop of props)values[name+'.'+prop]=Number.parseFloat(s[prop]);};
    take('workarea',document.querySelector('.pw-workarea'),['gap','paddingTop','paddingBottom']);
    take('context',document.querySelector('.pw-context'),['gap','paddingTop','paddingBottom']);
    take('primaryNav',document.querySelector('.pw-primary-nav'),['gap']);
    take('panel',document.querySelector('.panel'),['paddingTop','paddingRight','paddingBottom','paddingLeft']);
    take('button',document.querySelector('.btn'),['paddingTop','paddingRight','paddingBottom','paddingLeft']);
    take('scope',document.querySelector('.pw-scopebar'),['gap','paddingTop','paddingRight','paddingBottom','paddingLeft']);
    return values;
  });
  const rhythmFailures=Object.entries(rhythm).filter(([,v])=>Number.isFinite(v)&&v!==0&&Math.round(v)%4!==0);
  if(rhythmFailures.length)throw new Error('PR25 spacing rhythm must resolve to 8px base / 4px micro-spacing on structural surfaces: '+JSON.stringify({rhythm,rhythmFailures}));

  const precisionCss=await (await fetch(new URL('assets/precision-workbench.css',baseUrl))).text();
  const stylesheetRhythmFailures=[];
  for(const match of precisionCss.matchAll(/(?:^|[;{])\s*(gap|padding(?:-(?:top|right|bottom|left))?|margin(?:-(?:top|right|bottom|left))?)\s*:\s*([^;}]+)/gm)){
    const bad=[...match[2].matchAll(/(\d+(?:\.\d+)?)px/g)].map(x=>Number(x[1])).filter(n=>n!==0&&n%4!==0);
    if(bad.length)stylesheetRhythmFailures.push({property:match[1],value:match[2].trim(),bad});
  }
  if(stylesheetRhythmFailures.length)throw new Error('Precision stylesheet contains spacing outside the 8px base / 4px micro rhythm: '+JSON.stringify(stylesheetRhythmFailures));

  const primaryRoutes=[
    ['survey','fdv-check','runHealthBtn'],
    ['survey','volume-balance','runSurveyBalanceBtn'],
    ['survey','rainfall-check','runRainEventsBtn'],
    ['graphs','comparison','runCompareBtn'],
    ['graphs','rating','runRatingBtn'],
    ['graphs','dwf','runDwfBtn'],
    ['spills','storage','runStorageBtn'],
    ['spills','assessment','runSpillsBtn'],
    ['reports','report-generation','downloadReportBtn'],
  ];
  for(const [workspace,route,expected] of primaryRoutes){
    await page.evaluate(([w,p])=>window.__ICM_PRECISION_WORKBENCH__.navigate(w,p,false),[workspace,route]);
    await page.waitForTimeout(20);
    const visiblePrimary=await page.locator('.btn.primary').evaluateAll(nodes=>nodes.filter(el=>!el.hidden&&el.getClientRects().length>0&&getComputedStyle(el).display!=='none').map(el=>el.id).filter(Boolean));
    if(visiblePrimary.length!==1||visiblePrimary[0]!==expected){
      const routeState=await page.evaluate(expectedId=>{
        const describe=el=>el?{id:el.id,classes:el.className,hidden:el.hidden,display:getComputedStyle(el).display,visibility:getComputedStyle(el).visibility,rects:el.getClientRects().length}:null;
        const target=document.getElementById(expectedId);
        return {body:document.body.className,target:describe(target),ancestors:target?[...function*(){let el=target.parentElement;while(el){yield describe(el);el=el.parentElement;}}()]:[]};
      },expected);
      throw new Error('Route must expose exactly one obvious primary action: '+JSON.stringify({workspace,route,expected,visiblePrimary,routeState}));
    }
  }

  await page.evaluate(()=>window.__ICM_PRECISION_WORKBENCH__.navigate('spills','storage',false));
  const verificationContainment=await page.evaluate(()=>{
    const state=(id,selector)=>{const root=document.getElementById(id);const el=selector?root?.querySelector(selector):root;const css=el?getComputedStyle(el):null;return {id,selector:selector||null,hidden:el?.hidden??null,display:css?.display??null,visibility:css?.visibility??null,rects:el?.getClientRects().length??0};};
    return {comparison:state('tab-compare',':scope > .panel'),storage:state('tab-storage')};
  });
  if(verificationContainment.comparison.rects!==0||verificationContainment.comparison.display!=='none'||verificationContainment.storage.rects===0){
    throw new Error('Storage route must contain the legacy comparison surface: '+JSON.stringify(verificationContainment));
  }

  const quietSurfaces=await page.evaluate(()=>{
    const inspect=(workspace,route,selector)=>{
      window.__ICM_PRECISION_WORKBENCH__.navigate(workspace,route,false);
      const el=document.querySelector(selector);const s=el?getComputedStyle(el):null;
      return {workspace,route,selector,exists:Boolean(el),shadow:s?.boxShadow||'',overflow:document.documentElement.scrollWidth-document.documentElement.clientWidth};
    };
    return [
      inspect('data','time-series','#tab-graph>.panel'),
      inspect('survey','rainfall-check','#tab-rain-events>.panel'),
      inspect('graphs','comparison','#tab-compare>.panel'),
      inspect('spills','storage','#tab-storage>.panel'),
      inspect('spills','assessment','#tab-spills>.panel'),
      inspect('reports','report-generation','#tab-workspace>.panel'),
    ];
  });
  const noisySurface=quietSurfaces.find(x=>!x.exists||x.overflow>1||(x.shadow&&x.shadow!=='none'));
  if(noisySurface)throw new Error('Major route surface violates quiet-surface containment: '+JSON.stringify({noisySurface,quietSurfaces}));

  const inspectorText=(await page.locator('#pwInspectorBody').textContent())||'';
  if(inspectorText.includes('Live context'))throw new Error('Inspector must not present the hard-coded Live context result state.');

  await page.evaluate(()=>window.__ICM_PRECISION_WORKBENCH__.navigate('reports','report-generation',false));
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
      railVisible:getComputedStyle(document.querySelector('.pw-rail')).display!=='none',
      overflowElements:[...document.querySelectorAll('body *')].map(el=>{const r=el.getBoundingClientRect();return {tag:el.tagName,id:el.id,classes:el.className,right:Math.round(r.right),width:Math.round(r.width),scrollWidth:el.scrollWidth};}).filter(x=>x.right>document.documentElement.clientWidth+1).sort((a,b)=>b.right-a.right).slice(0,8)
    }));
    if(layout.overflow>1||!layout.sourceVisible||!layout.railVisible)throw new Error('Responsive shell failure '+size.width+'x'+size.height+': '+JSON.stringify(layout));
  }
  await page.setViewportSize({width:1440,height:1000});
  await page.evaluate(()=>window.__ICM_PRECISION_WORKBENCH__.navigate('survey','fdv-check',true));
  await page.waitForFunction(()=>location.hash==='#/survey/data-health');
  if((await page.locator('#pwPageTitle').textContent())?.trim()!=='Survey health and data coverage')throw new Error('Deep-link title mismatch');
  await page.reload({waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.__ICM_PRECISION_WORKBENCH__?.route?.().page==='data-health',null,{timeout:30000});
  if(errors.length)throw new Error('Browser errors: '+errors.join(' | '));
  console.log(browserName+' Precision Workbench shell acceptance passed.');
}finally{
  await browser.close();
}
