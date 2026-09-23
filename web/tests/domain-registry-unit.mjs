import vm from 'node:vm';
import fs from 'node:fs';
import assert from 'node:assert/strict';

const source=fs.readFileSync('web/assets/domain-registry.js','utf8');
const sandbox={
  window:{},
  document:{getElementById:()=>null,querySelector:()=>null},
  console,
};
vm.createContext(sandbox);
vm.runInContext(source,sandbox);
const registry=sandbox.window.ICMProjectRegistry;
assert.ok(registry);

registry.registerSource({
  id:'fm01',displayName:'FM01.fdv',virtualPath:'/data/FM01.fdv',
  parsed:{
    format:'fdv_ascii',rows:2,start:'2026-01-01T00:00:00',end:'2026-01-01T00:02:00',
    columns:['flow','depth','velocity'],
    metadata:{monitor:'FM01',channels:{
      flow:{quantity:'flow',canonical_unit:'m³/s'},
      depth:{quantity:'depth',canonical_unit:'m'},
      velocity:{quantity:'velocity',canonical_unit:'m/s'},
    }}
  }
});
registry.registerSource({
  id:'rg01',displayName:'RG01.r',virtualPath:'/data/RG01.r',
  parsed:{format:'rainfall_r_ascii',rows:2,columns:['rainfall'],metadata:{quantity:'rainfall',canonical_unit:'mm/h'}}
});
registry.registerSource({
  id:'model',displayName:'simulated.csv',virtualPath:'/data/simulated.csv',
  parsed:{format:'tabular_csv',rows:2,columns:['Seconds','depth'],metadata:{quantity_by_column:{depth:'depth'}}}
});
registry.setRelationships([
  {monitor:'FM01',rain_gauge:'RG01',diameter_mm:450,upstream:['FM00']}
],'fm_rg_assoc.xlsx');

const snapshot=registry.snapshot();
assert.equal(snapshot.sources.length,3);
assert.equal(snapshot.series.length,5);
assert.equal(snapshot.sources.find(x=>x.id==='fm01').role,'observed');
assert.equal(snapshot.sources.find(x=>x.id==='rg01').role,'rainfall');
assert.equal(snapshot.sources.find(x=>x.id==='model').role,'model');
assert.equal(snapshot.series.some(x=>x.column==='Seconds'),false);
assert.equal(snapshot.series.filter(x=>x.assetId==='FM01').length,3);
assert.equal(snapshot.relationships.length,2);
assert.equal(snapshot.assets.find(x=>x.id==='FM01').metadata.diameterMm,450);
assert.equal(snapshot.assets.find(x=>x.id==='FM01').metadata.associationStatus,'valid');
assert.equal(snapshot.assets.some(x=>x.id==='FM00'),true);
assert.equal(snapshot.assets.some(x=>x.id==='RG01'),true);

registry.setRelationships([
  {monitor:'FM01',rain_gauge:'RG01',diameter_mm:450,upstream:[]},
],'fm_rg_assoc.xlsx',[
  {severity:'error',monitor:'FM01',field:'monitor',message:'Conflicting duplicate monitor row.'},
]);
const ambiguous=registry.snapshot().assets.find(x=>x.id==='FM01');
assert.equal(ambiguous.metadata.diameterMm,null);
assert.equal(ambiguous.metadata.associationStatus,'ambiguous');

console.log('Domain registry regressions passed: source roles, hydraulic quantities, auxiliary filtering and association relationships.');
