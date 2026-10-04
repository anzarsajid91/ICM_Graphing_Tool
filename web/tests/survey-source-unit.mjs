import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const source=fs.readFileSync('web/assets/workbench-survey.js','utf8');
const start=source.indexOf('  function rainSourceSpecs()');
const end=source.indexOf('\n  function ',start+10);
const sources={RG01:{status:'exact'},RG02:{status:'confirmed'},RG03:{status:'candidate'}};
for(const [gauge,match] of Object.entries(sources))match.item={virtualPath:'/'+gauge,displayName:gauge+'.R',parsed:{columns:['rainfall'],metadata:{rainfall_semantics:'intensity'}}};
const context={survey:{association:{records:[{rain_gauge:'RG01'},{rain_gauge:'RG01'},{rain_gauge:'RG02'},{rain_gauge:'RG03'}]}},
  token:x=>x.toLowerCase(),matchRain:gauge=>sources[gauge],rainSourceFingerprint:item=>item.virtualPath,
  rainfallSemanticsFor:item=>item.virtualPath==='/RG02'?'incremental_depth':'intensity'};
vm.createContext(context);
vm.runInContext(source.slice(start,end)+'\n result=rainSourceSpecs();',context);
assert.deepEqual(JSON.parse(JSON.stringify(context.result)).map(x=>[x.gauge,x.rainfall_semantics]),[['RG01','intensity'],['RG02','incremental_depth']]);
assert.ok(context.result.every(x=>x.network_member));
console.log('Survey source RPC specs passed: shared semantics helper, confirmations, deduplication and candidate isolation.');

// Association imports precede hydraulic files in a mixed drop. They must boot
// the authoritative engine themselves when the application starts idle.
const coldSource=fs.readFileSync('web/assets/workbench-survey.js','utf8');
const functionText=name=>{const start=coldSource.indexOf('  async function '+name+'(');const end=coldSource.indexOf('\n  ',start+3);return coldSource.slice(start,coldSource.indexOf('\n  }',start)+5);};
const sequence=[];
const cold={survey:{},document:{getElementById:()=>({textContent:''})},window:{ICMWorkbookReader:{read:()=>({})}},
 workbookCandidate:()=>{},extractAssociationMatrix:()=>({headers:['monitor'],rows:[['FM01']],sheetName:'Sheet1'}),
 inferredSurveyMetadata:()=>[],sha256:async()=> 'hash',renderAssociation:()=>{},invalidateSurveyResults:()=>{},
 ensureEngineBoot:async()=>{sequence.push('boot');},engine:{call:async()=>{assert.equal(sequence.at(-1),'boot');sequence.push('call');return {records:[{monitor:'FM01',upstream:[]}]};}},
 file:{name:'fm_rg_assoc.xlsx',size:1,lastModified:1,arrayBuffer:async()=>new ArrayBuffer(1)}};
vm.createContext(cold);vm.runInContext(functionText('loadAssociationWorkbook')+'\n'+functionText('refreshAssociationConflicts'),cold);
await vm.runInContext('loadAssociationWorkbook(file)',cold);
await vm.runInContext('refreshAssociationConflicts()',cold);
assert.deepEqual(sequence,['boot','call','boot','call']);
console.log('Cold workbook import and association refresh boot the engine before authoritative RPC.');
