export const baseline='**** hw_node\nnode_id,node_type,x,y,ground_level\n'+
  'A,CSO,0,0,9\nB,Manhole,100,0,8\nC,Manhole,100,80,8\nD,Outfall,240,0,7\nE,Outfall,240,80,7\n'+
  '**** hw_conduit\nus_node_id,ds_node_id,link_suffix,shape,conduit_length\n'+
  'A,B,1,CIRC,100\nB,D,1,CIRC,140\nC,E,1,CIRC,140\n';
export const changed=baseline.replace('A,CSO,0,0,9','A,CSO,0,20,9.2')
  .replace('C,Manhole','C,Outfall').replace('E,Outfall,240,80,7','F,Outfall,240,80,7')
  .replace('A,B,1,CIRC,100','A,C,1,CIRC,120').replace('C,E,1,CIRC,140','C,F,1,CIRC,140');
