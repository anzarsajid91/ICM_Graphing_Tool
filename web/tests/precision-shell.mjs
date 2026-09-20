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
  if(labels.join('|')!=='Data|Survey|Rainfall|Verification|Spills|Report')throw new Error('Primary workspaces mismatch: '+JSON.stringify(labels));

  // Refinement acceptance: analytical routes must preserve labelled navigation by default.
  await page.evaluate(()=>window.__ICM_PRECISION_WORKBENCH__.navigate('data','time-series',false));
  if(await page.locator('body').evaluate(el=>el.classList.contains('pw-focus-canvas')))throw new Error('Focus canvas must be explicitly opted into; fresh sessions must retain labelled navigation.');

  // Refinement acceptance: shared legacy tabs must expose only the surface owned by the selected route.
  await page.evaluate(()=>window.__ICM_PRECISION_WORKBENCH__.navigate('survey','flow-continuity',false));
  const continuityComposition=await page.evaluate(()=>{
    const visible=el=>Boolean(el)&&getComputedStyle(el).display!=='none'&&!el.hidden;
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

  const inspectorText=(await page.locator('#pwInspectorBody').textContent())||'';
  if(inspectorText.includes('Live context'))throw new Error('Inspector must not present the hard-coded Live context result state.');

  await page.evaluate(()=>window.__ICM_PRECISION_WORKBENCH__.navigate('report','builder',false));
  const reportComposition=await page.evaluate(()=>{
    const visible=el=>Boolean(el)&&getComputedStyle(el).display!=='none'&&!el.hidden;
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
