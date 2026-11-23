import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import '../assets/network-schematic-core.js';
import '../assets/simulation-results-core.js';

const root=process.argv[2],folders=await fs.readdir(root);
const file=(job,name)=>path.join(root,folders.find(value=>value.startsWith('hydra_'+job+'_')),name);
const geometry=globalThis.ICMNetworkCore.importNativeContext(await fs.readFile(file('geometry','network_geometry.csv'),'utf8')).network;
assert.deepEqual(geometry.nodes.map(node=>node.id),['00127','00129']);
assert.equal(geometry.edges.length,2);
const conduit=geometry.edges.find(edge=>edge.icm.table==='hw_conduit');
assert.equal(conduit.icm.conduit_height,500);
assert.equal(conduit.sourceAttributes.fields.find(field=>field.name==='point_array').value,'{100,80,110,87,123,95}');
assert.deepEqual(conduit.bends,[{x:110,y:-87}]);
assert.equal(geometry.edges.find(edge=>edge.icm.table==='hw_weir').name,'00127.W');
const source=await fs.readFile(file('simulation','hw_conduit_us_flow.csv'));
const indexed=await globalThis.HydraSimulationResults.importCsv(new Blob([source]),{
  simulation:'SYNTHETIC-SIM',modelRevision:'SYNTHETIC-REV',scenario:'Baseline',event:'Design event',
  clock:'iso',clockConfirmed:true,temporalSupport:'instantaneous',headerRecord:1,timeColumn:0,unitsRecord:2,
  columns:[{column:1,asset:{kind:'link',table:'hw_conduit',upstream:'00127',suffix:'B'},quantity:'flow',unit:'m³/s',
    location:'upstream',sourceAttribute:'us_flow'}]
});
const series=indexed.metadata.columns[0].series;
assert.equal(indexed.count,3);
assert.deepEqual([0,1,2].map(index=>indexed.frame(indexed.timestamp(index),[series])[0]),[0,-0.125,null]);
assert.equal(indexed.timestamp(1)-indexed.timestamp(0),420000);
const clock=['2025-01-01 00:00:00.000','2025-01-01 00:07:00.000','2025-01-01 00:15:00.000'];
const node={kind:'node',id:'00127'};
const link=(table,suffix)=>({kind:'link',table,upstream:'00127',suffix});
const checks=[
  ['spill_storage','hw_weir','ds_flow','m³/s',link('hw_weir','W'),'flow','downstream',[0,0,.06]],
  ['spill_storage','hw_node','depnod','m',node,'level','node',[5,5.2,null]],
  ['monitoring','hw_conduit','us_vel','m/s',link('hw_conduit','B'),'velocity','upstream',[0,-.2,null]],
  ['monitoring','hw_node','qnode','m³/s',node,'flow','node',[0,.1,.03]],
  ['detriment','hw_node','flooddepth','m',node,'flood-depth','node',[-1,0,.2]],
  ['detriment','hw_node','floodvolume','m³',node,'flood-volume','node',[0,0,3]],
  ['detriment','hw_node','depnod','m',node,'level','node',[5,5.2,null]],
];
for(const [job,table,attribute,unit,asset,quantity,location,expected] of checks){
  const basename=`${table}_${attribute}.csv`;
  const sourceTable=await fs.readFile(file(job,'result_sources.csv'),'utf8');
  const lines=sourceTable.trimEnd().split(/\r?\n/).map(line=>line.split(','));
  const record=lines.find(row=>row[0]===basename);
  assert(record,basename);
  const contract=Object.fromEntries(lines[0].map((name,index)=>[name,record[index]]));
  assert.deepEqual([contract.table,contract.attribute,contract.unit,contract.samples],[table,attribute,unit,'3']);
  const bytes=await fs.readFile(file(job,basename));
  const dataset=await globalThis.HydraSimulationResults.importCsv(new Blob([bytes]),{
    simulation:contract.simulation,modelRevision:contract.model_revision,scenario:contract.scenario,event:contract.event,
    clock:'iso',clockConfirmed:true,temporalSupport:'instantaneous',headerRecord:1,timeColumn:0,unitsRecord:2,
    columns:[{column:1,asset,quantity,unit,location,datum:contract.datum,sourceAttribute:contract.attribute}]
  });
  const column=dataset.metadata.columns[0];
  assert.deepEqual(column.asset,asset);
  assert.equal(column.datum,quantity==='level'?'ODN':null);
  assert.equal(column.sourceAttribute,attribute);
  const sourceDigest=createHash('sha256').update(bytes).digest();
  assert.deepEqual(dataset.metadata.fingerprint,{size:bytes.length,algorithm:'sha256-of-ordered-1MiB-sha256-blocks-v1',
    digest:createHash('sha256').update(sourceDigest).digest('hex')});
  const timestamps=clock.map(globalThis.HydraSimulationResults.parseProjectClock);
  assert.deepEqual(timestamps,[0,1,2].map(index=>dataset.timestamp(index)));
  assert.deepEqual(timestamps.map(time=>dataset.frame(time,[column.series])[0]),expected);
  assert.equal(dataset.frame(timestamps[1]+30000,[column.series]),null);
}
console.log('ICM_TOOLKIT_IMPORT_ROUNDTRIP_PASS');
