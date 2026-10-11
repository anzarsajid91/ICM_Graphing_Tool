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
  window.HydraDesign=Object.freeze({family,prepareReportFont,reportFontCss:()=>fontCss,
    chartLayout:()=>({paper_bgcolor:'#fcfcfc',plot_bgcolor:'#fcfcfc',font:{family,size:12,color:'#202221'},
      hoverlabel:{bgcolor:'#ffffff',bordercolor:'#e4e5e3',font:{family,size:12,color:'#202221'}}})
  });
})();
