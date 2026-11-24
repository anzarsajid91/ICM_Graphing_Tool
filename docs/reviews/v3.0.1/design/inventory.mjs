import {launch,nav,settle,snapshot,shot,write,browserName} from './browser-common.mjs';
const {browser,page,guard,errors,blocked,identity}=await launch();
const result={identity,browser:browser.version(),routes:[],keyboard:[],responsive:[],history:{}};
try {
  const ready=async()=>{await page.waitForFunction(()=>!document.querySelector('.pw-route-visible')?.innerText.trim().match(/^Opening .*…$/),null,{timeout:12000});await settle(page);};
  const items=await page.evaluate(()=>[...document.querySelectorAll('button[data-workspace]')].map(x=>({id:x.dataset.workspace,text:x.innerText.trim()})));
  for(let i=0;i<10;i++) {
    await page.keyboard.press('Tab');
    result.keyboard.push(await page.evaluate(()=>{const n=document.activeElement; const r=n.getBoundingClientRect();const css=getComputedStyle(n);return {id:n.id,role:n.getAttribute('role'),text:n.innerText?.trim().slice(0,50)||n.getAttribute('aria-label'),withinViewport:r.y>=0&&r.bottom<=innerHeight,outline:css.outlineStyle};}));
  }
  await shot(page,'00-home-keyboard-'+browserName);
  for(const item of items) {
    await nav(page,item.id);await ready();
    const initial=await snapshot(page,item.text);
    const tabs=await page.getByRole('tab').allTextContents();
    result.routes.push({...initial,tabs});
    await shot(page,String(result.routes.length).padStart(2,'0')+'-'+item.id+'-default-'+browserName);
    for(const tab of tabs.map(x=>x.trim())){
      const target=page.getByRole('tab',{name:tab,exact:true});
      if(await target.count()!==1)continue;
      await target.click();
      await ready();
      const sub=await snapshot(page,tab);
      result.routes.push(sub);
      if(['about/security','network/simulation-results','spills/storage-routing','graphs/matrix','reports/revisions'].includes(sub.route.workspace+'/'+sub.route.page))await shot(page,'tab-'+sub.route.workspace+'-'+sub.route.page+'-'+browserName);
    }
  }
  await nav(page,'data');
  result.history.before=page.url();
  await nav(page,'network');
  result.history.after=page.url();
  await page.goBack({waitUntil:'domcontentloaded'}).catch(()=>{});
  result.history.back=page.url();
  result.history.active=await page.evaluate(()=>window.__ICM_PRECISION_WORKBENCH__?.route());
  if(!result.history.active)await guard.navigate(page,result.identity.url,{waitUntil:'domcontentloaded'});
  for(const width of [1366,1024,820,683]){
    await page.setViewportSize({width,height:width===1366?768:900});
    for(const workspace of ['home','data','network','survey','detriment','reports']){
      await nav(page,workspace);
      const detail=await snapshot(page,workspace);
      result.responsive.push({workspace,vw:detail.vw,vh:detail.vh,scrollWidth:detail.scrollWidth,scrollHeight:detail.scrollHeight,offRight:await page.evaluate(()=>[...document.querySelectorAll('.pw-route-visible button,.pw-route-visible select,.pw-route-visible input')].filter(el=>el.getClientRects().length&&el.getBoundingClientRect().right>innerWidth+1&&!el.closest('[hidden],[inert]')).slice(0,15).map(e=>({id:e.id,name:e.textContent.trim().slice(0,50),right:Math.round(e.getBoundingClientRect().right)})))});
      if(width===1024) await shot(page,'viewport-'+workspace+'-'+width+'-'+browserName);
      if(width===683&&['network','reports'].includes(workspace)) await shot(page,'viewport-'+workspace+'-'+width+'-'+browserName);
    }
  }
  result.errors=errors;
  result.blocked=blocked;
  guard.assertClean();
} finally {
  await write('logs/inventory-'+browserName+'.json',result);
  await browser.close();
}
