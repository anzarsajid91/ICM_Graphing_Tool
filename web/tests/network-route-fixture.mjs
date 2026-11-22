export const nativeNetwork='**** hw_node\nnode_id,node_type,x,y,ground_level,chamber_floor\n'+
  '00127,manhole,0,0,11,9.95\nB,CSO,100,0,10.5,9.72\nC,manhole,220,0,10,9.31\nD,manhole,100,100,10,9.7\nE,outfall,320,0,9,\nZ,manhole,0,180,,\nB.1,manhole,320,180,,\n'+
  '**** hw_conduit\nus_node_id,ds_node_id,link_suffix,shape,conduit_length,conduit_width,conduit_height,us_invert,ds_invert,roughness_type,bottom_roughness_cw,top_roughness_cw,sediment_depth,number_of_barrels\n'+
  '00127,B,1,CIRC,100,600,600,10,9.8,CW,1,1,0,1\n'+
  'B,C,1,CIRC,120,600,600,9.75,9.35,CW,1,1,0,1\n'+
  'B,C,2,CIRC,120,600,600,9.7,9.3,CW,1,1,0,1\n'+
  'B,D,3,CIRC,120,600,600,9.7,9.9,CW,1,1,0,1\n'+
  'C,E,1,CIRC,,600,600,9.3,,CW,1,1,0,1\n'+
  '**** hw_pump\nus_node_id,ds_node_id,link_suffix\nD,C,P\n'+
  '**** hw_weir\nus_node_id,ds_node_id,link_suffix\nD,E,W\n';

export const controlProfileNetwork='**** hw_node\nnode_id,node_type,x,y,ground_level,chamber_floor,chamber_roof\n'+
  'A,manhole,0,0,12,10,11\nB,manhole,100,0,12,9.6,11\nC,manhole,110,0,12,9.8,11\n'+
  'D,manhole,120,0,12,9.9,11\nE,manhole,130,0,12,10,11\nF,manhole,140,0,12,10,11\nG,outfall,220,0,11,9,10\n'+
  '**** hw_conduit\nus_node_id,ds_node_id,link_suffix,shape,conduit_length,conduit_width,conduit_height,us_invert,ds_invert\n'+
  'A,B,1,RECT,100,700,500,10.4,10.1\nF,G,1,EGG,80,400,600,10.2,10\n'+
  '**** hw_pump\nus_node_id,ds_node_id,link_suffix,switch_on_level,switch_off_level\nB,C,P,10.8,10.1\n'+
  '**** hw_weir\nus_node_id,ds_node_id,link_suffix,crest\nC,D,W,10.9\n'+
  '**** hw_orifice\nus_node_id,ds_node_id,link_suffix,invert\nD,E,O,10.5\n'+
  '**** hw_sluice\nus_node_id,ds_node_id,link_suffix,invert\nE,F,S,10.6\n';
// Synthetic gravity grid with adjacent branches, periodic overflows and one
// outlet. The coordinates and engineering values are entirely generated.
export function largeNativeNetwork(nodeCount){
  const width=Math.ceil(Math.sqrt(nodeCount));
  const id=index=>String(index+1).padStart(5,'0');
  const nodes=['****hw_node','node_id,x,y,node_type,ground_level,chamber_floor'];
  const links=['****hw_conduit','us_node_id,ds_node_id,link_suffix,conduit_length,shape,conduit_width,conduit_height,us_invert,ds_invert'];
  for(let index=0;index<nodeCount;index++){
    const type=index===nodeCount-1?'Outfall':index%53===0?'CSO':'Manhole';
    nodes.push([id(index),1000+index%width*75,2000+Math.floor(index/width)*80,type,30,28].join(','));
    if(index===nodeCount-1)continue;
    const next=index%width!==width-1?index+1:Math.min(index+width,nodeCount-1);
    links.push([id(index),id(next),1,next===index+1?75:80,'CIRC',450,450,28,27.85].join(','));
  }
  return [...nodes,...links].join('\n')+'\n';
}
