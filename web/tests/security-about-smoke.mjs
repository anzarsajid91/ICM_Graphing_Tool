import {chromium,firefox} from 'playwright';
import {browserLaunchOptions,browserContextOptions} from './browser-environment.mjs';
import {installPrivacyGuard} from './privacy-network.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const base=process.env.ICM_BASE_URL||'http://127.0.0.1:8000/';
const browser=await (process.env.ICM_BROWSER==='firefox'?firefox:chromium).launch(browserLaunchOptions());
const context=await browser.newContext({...browserContextOptions(),viewport:{width:1440,height:1000}});
const guard=installPrivacyGuard(context,base);
const page=await context.newPage(),errors=[],requests=[];
page.on('pageerror',e=>errors.push(e.message));context.on('request',r=>requests.push(r.url()));
const evidence=process.env.ICM_EVIDENCE_DIR||'/tmp/hydra-security-evidence';await fs.mkdir(evidence,{recursive:true});
try{
 await guard.navigate(page,base,{waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>window.__ICM_PRECISION_WORKBENCH__?.navigate);
 assert.match(await page.title(),/Hydra Bench/);
 await page.locator('.pw-about-nav button').click();
 await page.getByRole('heading',{name:'Built by Anzar Sajid'}).waitFor();
 const security=page.getByRole('tab',{name:'IT Security',exact:true});await security.click();
 assert.equal(await security.getAttribute('aria-selected'),'true');
 const panel=page.locator('#tab-security');await panel.waitFor({state:'visible'});
 assert.equal(await panel.locator('[data-claim-id]').count(),8);
 assert.equal(await page.locator('#reviewNotes').isVisible(),false);
 assert.match(await panel.innerText(),/Verification status is not available for this build/);
 assert.match(await panel.innerText(),/single-maintainer project/);
 assert.match(await panel.innerText(),/independent human review is not available/i);
 const claimText=await panel.locator('[data-claim-id]').allTextContents();
 const register=await page.evaluate(()=>JSON.parse(document.getElementById('securityClaims').textContent));
 for(let i=0;i<8;i++)assert.ok(claimText[i].includes(register.claims[i].statement));
 const identity=await page.locator('#securityBuildIdentity').innerText();
 const sha=await page.locator('meta[name="icm-build-sha"]').getAttribute('content');
 const version=await page.locator('#appVersion').innerText();assert.ok(identity.includes(sha)&&identity.includes(version));
 // All security content is embedded: navigation adds no resource request.
 await page.waitForTimeout(300);const before=requests.length;
 await page.getByRole('tab',{name:'Overview',exact:true}).click();await security.click();await page.waitForTimeout(200);
 assert.equal(requests.length,before,'About switching must add no network request');
 await security.focus();await page.keyboard.press('ArrowLeft');
 assert.equal(await page.getByRole('tab',{name:'Overview',exact:true}).getAttribute('aria-selected'),'true');
 await page.keyboard.press('End');assert.equal(await security.getAttribute('aria-selected'),'true');
 for(const size of [{width:1440,height:1000},{width:1024,height:900}]){
  await page.setViewportSize(size);
  assert.equal(await panel.evaluate(el=>el.scrollWidth<=el.clientWidth+2),true,'No card overflow');
  await page.screenshot({path:evidence+'/it-security-'+size.width+'.png',fullPage:true});
 }
 await page.locator('#pwBrandToggle').count().then(async n=>{if(n)await page.locator('#pwBrandToggle').click();});
 await page.locator('#pwRailToggle').click();assert.equal(await panel.isVisible(),true);
 assert.deepEqual(errors,[]);guard.assertClean();
 console.log('PASS IT Security: content, exact build identity, keyboard, layout and zero navigation requests.');
}finally{await browser.close();}
