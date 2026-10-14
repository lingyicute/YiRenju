/* Slow independent RIF 3/9.2/9.3 oracle for tests only.
   No engine helpers, WC tables, endpoint shortcuts or recursion cutoff.
   Input: black already placed at (x,y); every hypothetical move is restored. */
export const blank=()=>Array.from({length:15},()=>Array(15).fill(0));
export const dirs=[[1,0],[0,1],[1,1],[1,-1]];
const inside=(x,y)=>x>=0&&x<15&&y>=0&&y<15;
// Independent slow oracle: enumerate length-5 windows and stone-set identities.
export function oracle(b,x,y,stats={max:0,calls:0},depth=0){
 stats.calls++;stats.max=Math.max(stats.max,depth);
 function run(x,y,dx,dy){let n=1;for(const s of [-1,1])for(let k=1;inside(x+s*k*dx,y+s*k*dy)&&b[x+s*k*dx][y+s*k*dy]===1;k++)n++;return n;}
 function hasFive(x,y){return dirs.some(([dx,dy])=>run(x,y,dx,dy)===5);}
 const runs=dirs.map(([dx,dy])=>run(x,y,dx,dy));
 if(runs.includes(5))return 'win';if(runs.some(n=>n>5))return 'overline';
 const fours=new Set();
 for(const [dx,dy] of dirs)for(let a=-4;a<=0;a++){
  const cells=Array.from({length:5},(_,i)=>[x+(a+i)*dx,y+(a+i)*dy]);
  if(cells.some(([u,v])=>!inside(u,v)||b[u][v]===2))continue;
  const stones=cells.filter(([u,v])=>b[u][v]===1),empty=cells.filter(([u,v])=>!b[u][v]);
  if(stones.length!==4||empty.length!==1)continue;
  const [u,v]=empty[0];b[u][v]=1;const n=run(u,v,dx,dy);b[u][v]=0;
  if(n===5)fours.add(stones.map(([u,v])=>u*15+v).sort((a,b)=>a-b).join(','));
 }
 if(fours.size>1)return '44';
 const threes=new Set();
 for(const [dx,dy] of dirs)for(let a=-3;a<=0;a++){
  const cells=Array.from({length:4},(_,i)=>[x+(a+i)*dx,y+(a+i)*dy]);
  const ends=[a-1,a+4].map(k=>[x+k*dx,y+k*dy]);
  if(ends.some(([u,v])=>!inside(u,v)||b[u][v]!==0)||cells.some(([u,v])=>!inside(u,v)||b[u][v]===2))continue;
  const stones=cells.filter(([u,v])=>b[u][v]===1),empty=cells.filter(([u,v])=>!b[u][v]);
  if(stones.length!==3||empty.length!==1)continue;
  const key=stones.map(([u,v])=>u*15+v).sort((a,b)=>a-b).join(',');if(threes.has(key))continue;
  const [u,v]=empty[0];b[u][v]=1;
  let ok=!hasFive(u,v);
  for(const [ex,ey] of ends){b[ex][ey]=1;ok=ok&&run(ex,ey,dx,dy)===5;b[ex][ey]=0;}
  if(ok)ok=oracle(b,u,v,stats,depth+1)==='ok';b[u][v]=0;
  if(ok)threes.add(key);
  if(threes.size>1)return '33';
 }
 return 'ok';
}
