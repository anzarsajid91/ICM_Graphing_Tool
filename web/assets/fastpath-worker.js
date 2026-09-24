/* Lightweight display-only FDV/CSV preview worker.
 *
 * No engineering analysis lives here. The authoritative Python worker remains
 * the only calculation engine for verification, DWF, rainfall events, spills,
 * exclusions, storage and dimensional integrations.
 */
const WORKER_URL=new URL(self.location.href);
const BUILD_TOKEN=WORKER_URL.searchParams.get('v')||'local';
const coreUrl=new URL('fastpath-core.js',WORKER_URL);
coreUrl.searchParams.set('v',BUILD_TOKEN);
importScripts(coreUrl.toString());

function reply(id,result){self.postMessage({type:'result',id:id,ok:true,result:result});}
function fail(id,error){self.postMessage({type:'result',id:id,ok:false,error:String(error&&error.message||error),stack:String(error&&error.stack||'')});}

self.addEventListener('message',function(event){
  const message=event.data||{},id=message.id;
  try{
    if(message.type==='ping')return reply(id,{ready:Boolean(self.ICMFastPathCore),buildToken:BUILD_TOKEN});
    if(message.type!=='parse')throw new Error('Unsupported FastPath worker message: '+String(message.type));
    if(!self.ICMFastPathCore)throw new Error('FastPath parser core was not available.');
    const started=performance.now();
    const bytes=message.bytes instanceof Uint8Array?message.bytes:new Uint8Array(message.bytes||0);
    const text=self.ICMFastPathCore.decodeText(bytes);
    const parsed=self.ICMFastPathCore.parseText(message.name||'',text,{maxPoints:message.maxPoints||15000});
    reply(id,{parsed:parsed,duration_ms:performance.now()-started,buildToken:BUILD_TOKEN});
  }catch(error){fail(id,error);}
});
