// Static synthetic component states; excluded from the deployed release.
import {chromium} from 'playwright';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {installPrivacyGuard,resourcePaths} from './privacy-network.mjs';
const base='http://127.0.0.1:8002/',out=process.env.ICM_UIUX_EVIDENCE||'/tmp/hydra-uiux/routes';
await fs.mkdir(out,{recursive:true});
const browser=await chromium.launch(),context=await browser.newContext({viewport:{width:1440,height:1000}}),page=await context.newPage();
const paths=resourcePaths();paths.add('tests/design-showcase.html');
const privacy=installPrivacyGuard(context,base,{paths}),errors=[];page.on('pageerror',e=>errors.push(e.message));
try{
 await page.goto(base+'tests/design-showcase.html');
 const button=page.getByRole('button',{name:'Calculate',exact:true});
 await page.screenshot({path:out+'/components-default.png',fullPage:true});
 await button.hover();await page.screenshot({path:out+'/components-hover.png',fullPage:true});
 await button.press('Tab');await page.getByRole('button',{name:'Export CSV'}).focus();
 const focus=await page.getByRole('button',{name:'Export CSV'}).evaluate(el=>({active:document.activeElement===el,style:getComputedStyle(el).outlineStyle,width:parseFloat(getComputedStyle(el).outlineWidth)}));
 assert.equal(focus.active,true);assert.notEqual(focus.style,'none');assert.ok(focus.width>=2);
 assert.equal(await page.getByRole('button',{name:'Unavailable'}).isDisabled(),true);
 assert.equal(await page.getByRole('button',{name:'Calculating'}).getAttribute('aria-busy'),'true');
 assert.equal(await page.getByLabel('Unknown unit').getAttribute('aria-invalid'),'true');
 await page.screenshot({path:out+'/components-focus-validation.png',fullPage:true});
 await page.getByText('Methodology and advanced settings').click();
 assert.equal(await page.locator('details').getAttribute('open'),'');
 await page.setViewportSize({width:390,height:900});
 await page.screenshot({path:out+'/components-390.png',fullPage:true});
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth<=1));
 await page.emulateMedia({reducedMotion:'reduce'});
 privacy.assertClean();assert.deepEqual(errors,[]);
 console.log('Synthetic component showcase states passed: default/hover/focus/disabled/busy/error/disclosure/narrow.');
}finally{await browser.close();}
