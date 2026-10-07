import {chromium} from 'playwright';
import {browserLaunchOptions,browserContextOptions} from './browser-environment.mjs';
import assert from 'node:assert/strict';
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
  assert.deepEqual(errors,[]);console.log('Network layout passed: 400 points/399 wires in '+Math.round(timing)+' ms, incremental pan, multi-select alignment and layout lock.');
}finally{await browser.close();}
