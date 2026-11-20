export const nativeNetwork='**** hw_node\nnode_id,node_type,x,y,ground_level\n'+
  '00127,manhole,0,0,11\nB,CSO,100,0,10.5\nC,manhole,220,0,10\nD,manhole,100,100,10\nE,outfall,320,0,9\nZ,manhole,0,180,\nB.1,manhole,320,180,\n'+
  '**** hw_conduit\nus_node_id,ds_node_id,link_suffix,shape,conduit_length,conduit_width,conduit_height,us_invert,ds_invert,roughness_type,bottom_roughness_cw,top_roughness_cw,sediment_depth,number_of_barrels\n'+
  '00127,B,1,CIRC,100,600,600,10,9.8,CW,1,1,0,1\n'+
  'B,C,1,CIRC,120,600,600,9.75,9.35,CW,1,1,0,1\n'+
  'B,C,2,CIRC,120,600,600,9.7,9.3,CW,1,1,0,1\n'+
  'B,D,3,CIRC,120,600,600,9.7,9.9,CW,1,1,0,1\n'+
  'C,E,1,CIRC,,600,600,9.3,,CW,1,1,0,1\n'+
  '**** hw_pump\nus_node_id,ds_node_id,link_suffix\nD,C,P\n'+
  '**** hw_weir\nus_node_id,ds_node_id,link_suffix\nD,E,W\n';
