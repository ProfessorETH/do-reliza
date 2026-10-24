const clamp=(n,min,max)=>Math.max(min,Math.min(max,n));
export function readBubblePosition(raw) {
  try { const p=typeof raw==='string'?JSON.parse(raw):raw;if(Number.isFinite(p?.x)&&Number.isFinite(p?.y))return {x:clamp(p.x,0,1),y:clamp(p.y,0,1)}; } catch { /* Use a visible default. */ }
  return {x:1,y:1};
}
export function bubblePlacement(point,bounds,blockers=[]) {
  const {width,height,sizeX=72,sizeY=76,top=12,bottom=height-12,gap=12,left=gap,right=width-gap}=bounds;
  const minX=left,maxX=Math.max(minX,right-sizeX),minY=Math.max(gap,top),maxY=Math.max(minY,bottom-sizeY-gap);
  const desired={x:minX+clamp(point.x,0,1)*(maxX-minX),y:minY+clamp(point.y,0,1)*(maxY-minY)};
  const ys=[desired.y,minY,maxY,...blockers.flatMap(r=>[r.top-sizeY-gap,r.bottom+gap])].map(y=>clamp(y,minY,maxY));
  const overlaps=p=>blockers.some(r=>p.x<r.right+gap&&p.x+sizeX>r.left-gap&&p.y<r.bottom+gap&&p.y+sizeY>r.top-gap);
  const choices=[minX,maxX].flatMap(x=>ys.map(y=>({x,y}))).filter(p=>!overlaps(p));
  choices.sort((a,b)=>Math.hypot(a.x-desired.x,a.y-desired.y)-Math.hypot(b.x-desired.x,b.y-desired.y));
  return choices[0]||{x:point.x<.5?minX:maxX,y:desired.y};
}
export function normalizeBubble(point,bounds) {
  const {width,height,sizeX=72,sizeY=76,top=12,bottom=height-12,gap=12,left=gap,right=width-gap}=bounds;
  return {x:clamp((point.x-left)/Math.max(1,right-sizeX-left),0,1),y:clamp((point.y-Math.max(gap,top))/Math.max(1,bottom-sizeY-gap-Math.max(gap,top)),0,1)};
}
