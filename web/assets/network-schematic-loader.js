/* Small lazy route bridge. No Python work or schematic render during boot. */
(()=>{'use strict';
let pending=null;
const bridge={
  snapshot:()=>state.networkSchematicWorkspace||null,
  restore:value=>{state.networkSchematicWorkspace=value||null;},
  async open(){
    if(window.ICMNetworkSchematic!==bridge)return window.ICMNetworkSchematic.open();
    if(!pending)pending=(async()=>{
      for(const name of ['network-schematic-core.js','network-review-core.js','network-schematic.js']){
        await new Promise((resolve,reject)=>{
          const script=document.createElement('script');script.src='assets/'+name+'?v='+encodeURIComponent(buildToken);
          script.onload=resolve;script.onerror=()=>{script.remove();reject(new Error('Network schematic could not load. Try again.'));};
          document.head.appendChild(script);
        });
      }
    })().catch(error=>{pending=null;throw error;});
    try{await pending;await window.ICMNetworkSchematic.open();}
    catch(error){const root=document.getElementById('tab-spill-network');if(root){root.replaceChildren();const p=document.createElement('p');p.textContent=error.message;const b=document.createElement('button');b.textContent='Retry';b.onclick=()=>bridge.open();root.append(p,b);}}
  }
};
window.ICMNetworkSchematic=bridge;
})();
