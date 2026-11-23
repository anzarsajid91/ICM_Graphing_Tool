import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {chromium,firefox} from 'playwright';
import {browserLaunchOptions,browserContextOptions} from './browser-environment.mjs';
import {installPrivacyGuard} from './privacy-network.mjs';
import {largeNativeNetwork} from './network-route-fixture.mjs';

const engine=process.env.ICM_BROWSER||'chromium';
const base=(process.env.ICM_BASE_URL||'http://127.0.0.1:8000/').replace(/\/?$/,'/');
const baseline=process.env.ICM_NETWORK_SCALE_BASELINE==='1';
const evidence=process.env.ICM_EVIDENCE_DIR;
const browser=await (engine==='firefox'?firefox:chromium).launch(browserLaunchOptions());
const waitPaint=page=>page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
const measurements=[];
if(evidence)await mkdir(evidence,{recursive:true});
try{
  for(const nodeCount of [200,800,5001]){
    const context=await browser.newContext({...browserContextOptions(),viewport:{width:1440,height:1000},reducedMotion:'reduce',acceptDownloads:true});
    const privacy=installPrivacyGuard(context,base),page=await context.newPage();
    const errors=[];page.on('pageerror',error=>errors.push(error.message));
    const metrics={engine,baseline,nodes:nodeCount,links:nodeCount-1};
    const measure=async (key,action)=>{
      const start=performance.now();await action();await waitPaint(page);metrics[key]=Math.round(performance.now()-start);
    };
    try{
      await measure('startupMs',async()=>{
        await page.goto(base,{waitUntil:'domcontentloaded'});
        await page.waitForFunction(()=>window.__ICM_PRECISION_WORKBENCH__?.navigate);
      });
      await measure('workspaceMs',async()=>{
        await page.evaluate(()=>window.__ICM_PRECISION_WORKBENCH__.navigate('network','schematic',true));
        await page.locator('#nsEdit').waitFor();
      });
      const contents=Buffer.from(largeNativeNetwork(nodeCount));metrics.csvBytes=contents.length;
      await measure('importPreviewMs',async()=>{
        await page.setInputFiles('#nsLoadInput',{name:'synthetic-network.csv',mimeType:'text/csv',buffer:contents});
        if(baseline&&nodeCount===5001){
          await page.waitForFunction(()=>document.querySelector('#nsStatus').textContent.includes('exceeds 2,000 points'));
        }else await page.locator('#nsContextUnits').waitFor();
      });
      if(baseline&&nodeCount===5001){
        metrics.rejected='Production native node limit';
        assert.equal(await page.locator('#nsContextApply').isVisible(),false);
      }else{
        await page.locator('#nsContextUnits').check();
        await measure('importAndFitMs',async()=>{
          await page.click('#nsContextApply',{timeout:90000});
          await page.locator('#nsContextApply').waitFor({state:'hidden'});
        });
        metrics.renderedGroups=await page.locator('#nsSvg [data-ns-node],#nsSvg [data-ns-edge]').count();
        if(nodeCount===5001){
          await page.locator('#nsCanvas').getByText('Zoom in or use Find asset',{exact:false}).waitFor();
          assert(metrics.renderedGroups<500);
          const compact=page.locator('#nsSvg [data-ns-compact]');
          assert((await compact.evaluateAll(paths=>paths.flatMap(path=>path.getAttribute('d').match(/M/g)||[]).length))>9500);
          if(evidence)await page.locator('#nsCanvas').screenshot({path:evidence+'/'+engine+'-detailed-10001.png'});
        }
        await measure('inspectMs',async()=>{
          const id=nodeCount===5001?'04123':'00001';
          await page.locator('#nsAssetSearch').fill(id);
          await page.locator('#nsAssetSearch').press('Enter');
          await page.locator('#nsPopup').getByRole('heading',{name:id,exact:true}).waitFor();
        });
        await page.getByRole('button',{name:'Close asset evidence'}).click();
        const before=await page.evaluate(()=>ICMNetworkSchematic.snapshot().camera);
        await page.click('#nsPan');
        const box=await page.locator('#nsCanvas').boundingBox();
        await page.mouse.move(box.x+100,box.y+120);
        await measure('panMs',async()=>{
          await page.mouse.down();
          await page.mouse.move(box.x+160,box.y+154,{steps:12});
          await page.mouse.up();
        });
        const after=await page.evaluate(()=>ICMNetworkSchematic.snapshot().camera);
        assert.equal(after.x,before.x+60);
        await measure('zoomMs',()=>page.click('#nsZoomIn'));
        assert((await page.evaluate(()=>ICMNetworkSchematic.snapshot().camera.zoom))>after.zoom);
        await measure('overviewMs',()=>page.click('#nsOverview'));
        assert.equal(await page.locator('#nsOverview').getAttribute('aria-pressed'),'true');
        assert(await page.locator('#nsSvg [data-ns-node]').count()<nodeCount);
        assert.deepEqual(await page.evaluate(()=>{
          const n=ICMNetworkSchematic.snapshot();return [n.nodes.length,n.edges.length,n.nodes[0].id,n.nodes.at(-1).type];
        }),[nodeCount,nodeCount-1,'00001','outfall']);
        if(engine==='chromium'){
          const cdp=await context.newCDPSession(page);
          metrics.heapUsedBytes=(await cdp.send('Runtime.getHeapUsage')).usedSize;
        }
        if(nodeCount===5001){
          if(evidence)await page.locator('#nsCanvas').screenshot({path:evidence+'/'+engine+'-overview-10001.png'});
          await page.locator('.ns-export-menu > summary').click();
          const download=page.waitForEvent('download');await page.click('#nsSave');
          const savedPath=await (await download).path();
          await page.click('#nsClearMap');await page.click('#nsConfirmClearMap');
          await page.setInputFiles('#nsLoadInput',{
            name:'synthetic-restored.json',mimeType:'application/json',buffer:await readFile(savedPath),
          });
          await page.getByRole('status').filter({hasText:'Network restored.'}).waitFor();
          assert.equal(await page.evaluate(()=>ICMNetworkSchematic.snapshot().nodes.length),nodeCount);
        }
      }
      assert.deepEqual(errors,[]);privacy.assertClean();
      measurements.push(metrics);console.log(JSON.stringify(metrics));
    }finally{await context.close();}
  }
}finally{await browser.close();}
if(evidence)await writeFile(evidence+'/'+engine+(baseline?'-baseline':'-candidate')+'.json',JSON.stringify(measurements,null,2)+'\n');
