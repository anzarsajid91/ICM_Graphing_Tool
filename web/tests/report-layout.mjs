// Measure the composed Report Generation controls, including at restored scroll
// offsets. Legacy workspace actions are hidden on this route and are unrelated.
export async function assertReportActionSpacing(page){
  const layout=await page.evaluate(()=>{
    const options=document.querySelector('#pwReportOptions');
    const actions=document.querySelector('#downloadReportBtn')?.closest('.pw-surface-actions');
    const buttons=['downloadReportBtn','downloadFourPeriodBtn'].map(id=>document.getElementById(id));
    const visible=el=>Boolean(el&&el.getClientRects().length&&getComputedStyle(el).visibility!=='hidden');
    const bounds=el=>{const r=el.getBoundingClientRect();return{left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height};};
    if(![options,actions,...buttons].every(visible))return{visible:false};
    const rects=buttons.map(bounds),top=bounds(options),bottom=bounds(actions);
    const overlap=rects[0].left<rects[1].right&&rects[1].left<rects[0].right&&rects[0].top<rects[1].bottom&&rects[1].top<rects[0].bottom;
    return{visible:true,gap:bottom.top-top.bottom,overlap,buttons:rects};
  });
  if(!layout.visible||layout.gap<8||layout.overlap||layout.buttons.some(r=>r.width<=0||r.height<=0))throw new Error('Visible report action controls are missing or crowded: '+JSON.stringify(layout));
  return layout;
}
