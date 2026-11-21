import assert from 'node:assert/strict';
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
const flow=await fs.readFile(file('spill_storage','hw_weir_ds_flow.csv'),'utf8');
assert.match(flow,/00127\.W/);
assert.match(flow,/0\.06/);
assert.match(await fs.readFile(file('monitoring','hw_conduit_us_vel.csv'),'utf8'),/-0\.2/);
assert.match(await fs.readFile(file('detriment','hw_node_floodvolume.csv'),'utf8'),/m³/);
console.log('ICM_TOOLKIT_IMPORT_ROUNDTRIP_PASS');
