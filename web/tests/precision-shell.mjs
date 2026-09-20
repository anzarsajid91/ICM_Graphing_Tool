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
