import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium,firefox} from 'playwright';
import {browserLaunchOptions,browserContextOptions} from './browser-environment.mjs';
import {installPrivacyGuard,resourcePaths} from './privacy-network.mjs';

const engine=process.env.ICM_BROWSER||'chromium',base=process.env.ICM_BASE_URL||'http://127.0.0.1:8000/';
const paths=resourcePaths();
for(const name of await fs.readdir('_site/downloads/icm')) paths.add('downloads/icm/'+name);
const browser=await (engine==='firefox'?firefox:chromium).launch(browserLaunchOptions());
const context=await browser.newContext({...browserContextOptions(),acceptDownloads:true});
const guard=installPrivacyGuard(context,base,{paths}),page=await context.newPage();
const errors=[];page.on('pageerror',error=>errors.push(error.message));

try {
  await guard.navigate(page,base);
  const toolkit=page.locator('#hbIcmExportToolkit');
  await toolkit.waitFor();
  assert.match(await toolkit.innerText(),/ICM runtime validation pending/);
  const links=toolkit.getByRole('link');
  assert.equal(await links.count(),7);
  for(const link of await links.all()) {
    const name=await link.getAttribute('download');
    assert.match(name,/-v\d+\.\d+\.\d+\.(rb|md)$/);
    const download=page.waitForEvent('download');
    await link.click();
    const result=await download;
    assert.equal(result.suggestedFilename(),name);
    const bytes=await fs.readFile(await result.path());
    assert.deepEqual(bytes,await fs.readFile('_site/downloads/icm/'+name));
    if(name.endsWith('.rb')) {
      assert.match(bytes.toString(),/SPDX-License-Identifier: AGPL-3.0-only/);
      assert.match(bytes.toString(),/HydraIcmExport\.run\(:[a-z_]+, \{\}\)/);
    }
  }
  await page.setViewportSize({width:390,height:844});
  const widths=await toolkit.evaluate(el=>[el.scrollWidth,el.clientWidth]);
  assert(widths[0]<=widths[1]+1);
  assert.deepEqual(errors,[]);
  guard.assertClean();
  console.log('ICM_TOOLKIT_DOWNLOAD_PASS '+engine);
} finally {await browser.close();}
