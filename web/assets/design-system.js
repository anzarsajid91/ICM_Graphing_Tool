/* Presentation defaults and fixed, same-origin font embedding for explicit local exports. */
(()=>{'use strict';
  const family='"Inter", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
  const fontUrl=new URL('../vendor/inter-4.1/InterVariable.woff2',document.currentScript.src).href;
  let fontCss='',pending;
  const prepareReportFont=()=>pending||(pending=(async()=>{
    const response=await fetch(fontUrl,{mode:'same-origin',credentials:'omit',referrerPolicy:'no-referrer',cache:'force-cache'});
    if(!response.ok)throw new Error('The local report typeface could not be loaded. Retry export.');
    const bytes=new Uint8Array(await response.arrayBuffer());let binary='';
    for(let i=0;i<bytes.length;i+=32768)binary+=String.fromCharCode(...bytes.subarray(i,i+32768));
    fontCss='@font-face{font-family:Inter;font-style:normal;font-weight:100 900;src:url(data:font/woff2;base64,'+btoa(binary)+') format("woff2")}';
    return fontCss;
  })().catch(error=>{pending=undefined;throw error;}));
  function moveSelection(container,target,style,previous){
    if(!target?.getClientRects().length)return;
    let indicator=container.querySelector(':scope > .hb-selection-indicator');
    if(!indicator){
      indicator=document.createElement('span');
      indicator.classList.add('hb-selection-indicator',style);
      indicator.setAttribute('aria-hidden','true');
      container.prepend(indicator);
    }
    const rect=target.getBoundingClientRect(),bounds=container.getBoundingClientRect();
    Object.assign(indicator.style,{
      left:(rect.left-bounds.left-container.clientLeft+container.scrollLeft)+'px',
      top:(rect.top-bounds.top-container.clientTop+container.scrollTop)+'px',
      width:rect.width+'px',height:rect.height+'px'
    });
    container.classList.add('hb-has-selection');
    const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
    if(previous||reduced)for(const animation of indicator.getAnimations())animation.cancel();
    if(!previous?.width||!previous.height||reduced||!rect.width||!rect.height)return;
    const x=previous.left-rect.left,y=previous.top-rect.top;
    if(Math.abs(x)<1&&Math.abs(y)<1&&Math.abs(previous.width-rect.width)<1&&Math.abs(previous.height-rect.height)<1)return;
    const tokens=getComputedStyle(indicator);
    indicator.animate([
      {transform:`translate(${x}px,${y}px) scale(${previous.width/rect.width},${previous.height/rect.height})`},
      {transform:'none'}
    ],{duration:parseFloat(tokens.getPropertyValue('--hb-motion-selection'))||200,easing:tokens.getPropertyValue('--hb-ease').trim()||'ease-out'});
  }
  window.HydraDesign=Object.freeze({family,prepareReportFont,reportFontCss:()=>fontCss,moveSelection,
    chartLayout:()=>({paper_bgcolor:'#fcfcfc',plot_bgcolor:'#fcfcfc',font:{family,size:12,color:'#202221'},
      hoverlabel:{bgcolor:'#ffffff',bordercolor:'#e4e5e3',font:{family,size:12,color:'#202221'}}})
  });
})();
