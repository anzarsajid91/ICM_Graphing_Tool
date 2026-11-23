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
  id:'fm01',hash:'synthetic-observed-fingerprint',displayName:'FM01.fdv',virtualPath:'/data/FM01.fdv',
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
  id:'model',hash:'synthetic-model-fingerprint',displayName:'simulated.csv',virtualPath:'/data/simulated.csv',
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

const evidence={
  asset:{id:'FM01',kind:'flow-monitor'},
  signature:'synthetic-analysis-config',
  period:{start:'2026-01-01',end:'2026-01-02'},
  seriesKeys:[JSON.stringify(['fm01','depth']),JSON.stringify(['model','depth'])],
  scenarios:[{metrics:{rmse:0.01}}],
};
assert.equal(registry.publishAssessment('comparison',evidence),true);
const read=signature=>registry.readAssessment('comparison',signature);
assert.equal(read(evidence.signature).freshness,'current');
assert.equal(read(evidence.signature).dependencies[1].fingerprint,'synthetic-model-fingerprint');
assert.equal(read('different-config').freshness,'stale');
assert.equal(read().freshness,'stale');
evidence.scenarios[0].metrics.rmse=5;
read(evidence.signature).scenarios[0].metrics.rmse=6;
assert.equal(read(evidence.signature).scenarios[0].metrics.rmse,0.01);
assert.equal(registry.publishAssessment('other',{...evidence,asset:{id:'FM01',kind:'conduit'}}),false);
assert.equal(registry.publishAssessment('other',{...evidence,seriesKeys:['missing']}),false);
registry.registerSource({
  id:'model',hash:'replaced-fingerprint',displayName:'simulated.csv',
  parsed:{format:'tabular_csv',columns:['depth'],metadata:{quantity_by_column:{depth:'depth'}}},
});
assert.equal(read(evidence.signature).freshness,'stale');
registry.removeSource('fm01');
assert.equal(read(evidence.signature).freshness,'stale');
registry.clearSources();
assert.equal(read(evidence.signature),null);
console.log('Shared assessment evidence regressions passed.');

const hash='d'.repeat(64),derived={schema:'hydra-derived-series-v1',result:{quantity:'flow',unit:'L/s',
  rows:[['2026-01-01T00:00:00','2026-01-01T00:00:30',20,30]]}};
const archive=registry.retainDerived(hash,'Synthetic derived intervals',derived);
assert.equal(registry.retainDerived(hash,'Redundant second import',derived).name,'Synthetic derived intervals');
assert.equal(registry.listDerived()[0].available,true);
assert.equal(registry.snapshot().derived[0].rows,undefined);
assert.equal(registry.listSeries().length,0);
registry.clearSources();
registry.restoreDerived([archive,{...archive,fingerprint:'invalid'}]);
assert.equal(registry.listDerived().length,1);
assert.equal(registry.listDerived()[0].available,false);
assert.equal(registry.derivedSeries(hash),null);
assert.equal(registry.retainDerived(hash,'Portable file',derived).name,'Synthetic derived intervals');
assert.equal(registry.derivedSeries(hash),derived);
registry.removeDerived(hash);
assert.equal(registry.listDerived().length,0);

const qualityKey=hash+':'+JSON.stringify(['long-timestep','2026-01-01T00:00:00']);
assert(registry.saveSourceReview(qualityKey,{decision:'accepted',note:'Reviewed synthetic gap',exclusionId:'synthetic-exclusion'}));
const qualityArchive=registry.snapshot().source_quality_reviews;
registry.clearSources();
registry.restoreSourceReviews([...qualityArchive,{key:'invalid',decision:'accepted',note:'bogus',exclusionId:null}]);
assert.equal(registry.snapshot().source_quality_reviews.length,1);
assert.equal(registry.readSourceReview(qualityKey).note,'Reviewed synthetic gap');
assert.equal(registry.readSourceReview('f'+qualityKey.slice(1)),null);
