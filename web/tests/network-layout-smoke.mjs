import {chromium} from 'playwright';
import {browserLaunchOptions,browserContextOptions} from './browser-environment.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const browser=await chromium.launch(browserLaunchOptions());
const page=await browser.newPage({...browserContextOptions(),viewport:{width:1440,height:1050}});
const errors=[];page.on('pageerror',e=>errors.push(e.message));
try{
  await page.goto(process.env.ICM_BASE_URL||'http://127.0.0.1:8000/');
  await page.waitForFunction(()=>window.__ICM_PRECISION_WORKBENCH__?.navigate);
  await page.evaluate(()=>__ICM_PRECISION_WORKBENCH__.navigate('spills','network',true));
  await page.waitForSelector('#nsEdit');
  const timing=await page.evaluate(()=>{
    const n=ICMNetworkCore.empty();
    for(let i=0;i<400;i++)n.nodes.push({id:'n'+i,name:'Asset '+i,type:'cso',colour:'blue',x:100+(i%20)*230,y:100+Math.floor(i/20)*140,bindings:[],exclusions:[],defaults:{observed:'',model:''}});
    for(let i=1;i<400;i++)n.edges.push({id:'e'+i,from:'n'+(i-1),to:'n'+i,colour:'blue',name:i===1?'Main pipe':'',arrow:true});
    const start=performance.now();ICMNetworkSchematic.restore(n);return performance.now()-start;
  });
  assert.equal(await page.locator('[data-ns-node]').count(),400);
  await page.click('#nsPan');
  await page.evaluate(()=>{window.panChildChanges=0;window.panObserver=new MutationObserver(records=>{window.panChildChanges+=records.filter(r=>r.type==='childList').length;});window.panObserver.observe(document.getElementById('nsSvg'),{subtree:true,childList:true});});
  const box=await page.locator('#nsCanvas').boundingBox();
  await page.mouse.move(box.x+30,box.y+50);await page.mouse.down();await page.mouse.move(box.x+85,box.y+80,{steps:12});
  await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
  assert.equal(await page.evaluate(()=>window.panChildChanges),0,'Pan updates geometry without replacing scene nodes');
  await page.evaluate(()=>window.panObserver.disconnect());await page.mouse.up();await page.click('#nsPan');
  // Geometry manipulation is tested on a small accessible view of the same state.
  await page.evaluate(()=>{const n=ICMNetworkSchematic.snapshot();n.nodes=n.nodes.slice(0,3);n.edges=n.edges.slice(0,2);n.nodes.forEach((x,i)=>{x.x=130+i*200;x.y=180+i*80;});n.camera={x:0,y:0,zoom:1};ICMNetworkSchematic.restore(n);});
  await page.click('#nsEdit');await page.locator('[data-ns-node="n0"] [data-ns-frame]').click();await page.locator('[data-ns-node="n1"] [data-ns-frame]').click({modifiers:['Shift']});
  await page.click('#nsReviewTools > summary');await page.locator('#nsReviewTools details summary').filter({hasText:'Layout'}).click();await page.click('[data-ns-arrange="top"]');
  assert.equal(await page.evaluate(()=>{const n=ICMNetworkSchematic.snapshot();return n.nodes[0].y===n.nodes[1].y;}),true);
  await page.locator('#nsLocked').check();await page.click('#nsReviewTools > summary');
  const before=await page.evaluate(()=>ICMNetworkSchematic.snapshot().nodes[0]);const frame=await page.locator('[data-ns-node="n0"] [data-ns-frame]').boundingBox();
  await page.mouse.move(frame.x+20,frame.y+20);await page.mouse.down();await page.mouse.move(frame.x+80,frame.y+80,{steps:5});await page.mouse.up();
  const after=await page.evaluate(()=>ICMNetworkSchematic.snapshot().nodes[0]);assert.equal(after.x,before.x);assert.equal(after.y,before.y);
  await page.evaluate(()=>{
    const n=ICMNetworkCore.empty();
    for(let i=0;i<12;i++){
      n.nodes.push({id:'dense-'+i,name:'Long synthetic network asset '+i,type:i%4===0?'cso':'manhole',
        x:82+(i%6)*88,y:130+Math.floor(i/6)*145,colour:'blue',bindings:[]});
      if(i>0)n.edges.push({id:'link-'+i,from:'dense-'+(i-1),to:'dense-'+i,colour:'blue',name:'Conduit '+i});
    }
    n.edges.push({id:'return',from:'dense-11',to:'dense-0',colour:'amber',name:'Loop return'});
    ICMNetworkSchematic.restore(n);
  });
  const suppressed=page.locator('[data-ns-label][data-ns-label-suppressed]').first();
  const suppressedId=await suppressed.getAttribute('data-ns-label');
  assert.ok(suppressedId);
  const target=page.locator('[data-ns-node="'+suppressedId+'"]');
  await target.focus();
  await target.press('Enter');
  assert.equal(await target.locator('[data-ns-label-suppressed]').count(),0,'Selecting a node reveals its full label');
  await page.locator('#nsName').fill('Synthetic edited asset · full identifier');
  await page.locator('#nsName').press('Tab');
  assert.match(await target.getAttribute('aria-label'),/^Synthetic edited asset/);
  assert.match(await page.locator('#nsDrawer h3').innerText(),/^Synthetic edited asset/);
  const tools=page.locator('#nsReviewTools > summary');
  await tools.click();
  for(const width of [1440,1024,768,390]){
    await page.setViewportSize({width,height:1000});
    const panel=await page.locator('.ns-tool-panel').boundingBox();
    const canvas=await page.locator('#nsCanvas').boundingBox();
    const drawer=await page.locator('#nsDrawer').boundingBox();
    assert(panel.y+panel.height<=canvas.y&&panel.y+panel.height<=drawer.y,'Tools remain outside the canvas and the property pane at '+width);
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Workspace does not overflow at '+width);
    if(process.env.ICM_EVIDENCE_DIR){
      const dir=process.env.ICM_EVIDENCE_DIR;
      await fs.mkdir(dir,{recursive:true});
      await page.locator('#nsLayout').scrollIntoViewIfNeeded();
      await page.screenshot({path:dir+'/dense-properties-'+width+'.png',animations:'disabled'});
    }
  }
  assert.deepEqual(errors,[]);console.log('Network layout passed: 400 points/399 wires in '+Math.round(timing)+' ms, incremental pan, multi-select alignment and layout lock.');
}finally{await browser.close();}
