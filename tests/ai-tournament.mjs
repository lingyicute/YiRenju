/* AI 难度擂台：四档交叉对战。运行: node tests/ai-tournament.mjs（自包含，读取 ../index.html 核心）
   用途：强度回归基准（报表工具，不做断言把关）；机器越快单局越深，矩阵数值会与历史基线有出入。 */
import {readFileSync,existsSync} from 'fs';
const pageUrl=new URL('../index.html',import.meta.url);
if(!existsSync(pageUrl)){console.error('找不到 index.html（请在仓库根目录下运行）');process.exit(2);}
const html=readFileSync(pageUrl,'utf8');
const src=html.slice(html.indexOf('/*CORE_START*/'),html.indexOf('/*CORE_END*/'));
const api=new Function(src+`
return {N,EMPTY,BLACK,WHITE,candidates,runInfo,isWinRun,winCellsAt,blackLegality,blackMoveType,orderedMoves,negamax,blackWinPoint,fivePoint,zobristInit,hashFromBoard,hashPlace,syncCand,setCell,pushStone,draft:()=>{ttDraft++;},setQNodes:(v)=>{qNodes=v;},getBoard:()=>board,setBoard:(b)=>{board=b;syncCand();},setDeadline:(ms)=>{searchDeadline=ms;searchAborted=false;},getAborted:()=>searchAborted};`)();
const {N,EMPTY,BLACK,WHITE}=api;
const blackLegality=api.blackLegality,runInfo=api.runInfo;
const TIERS=['easy','medium','hard','expert'];
function legal(m){return m?blackLegality(m.x,m.y):null;}
function choose(p,tier,no){
  const wp=p===WHITE?api.fivePoint(WHITE):api.blackWinPoint();
  if(wp)return wp;
  if(tier==='easy'){
    const th=p===WHITE?api.blackWinPoint():api.fivePoint(WHITE); /* 对方的一步胜点 */
    if(th&&Math.random()<0.55)return th;
    const near=api.candidates(1);
    for(let i=0;i<50;i++){
      const c=near[(Math.random()*near.length)|0];
      const m={x:c[0],y:c[1]};
      if(p===WHITE||['ok','win'].includes(legal(m)))return m;
    }
    return {x:near[0][0],y:near[0][1]};
  }
  if(tier==='medium'){
    const ranked=api.orderedMoves(p,8);
    if(!ranked.length)return null;
    const r=Math.random();let idx=0;
    if(r>=0.7&&r<0.9)idx=Math.min(1,ranked.length-1);
    else if(r>=0.9)idx=Math.min(ranked.length-1,1+((Math.random()*3)|0));
    return ranked[idx];
  }
  const depth=tier==='expert'?4:2;
  api.setDeadline(Date.now()+(tier==='expert'?3000:1200));
  api.zobristInit();api.hashFromBoard();api.draft();api.setQNodes(0);
  const root=api.orderedMoves(p,12);
  if(!root.length)return null;
  /* 开局去重：黑首着/W首着从前列随机挑，避免深度搜索产生完全相同的对局 */
  if(no===0&&p===BLACK)return root[(Math.random()*Math.min(5,root.length))|0];
  if(no===1&&p===WHITE)return root[Math.random()<0.5?0:(Math.random()*Math.min(3,root.length))|0];
  let best=root[0],bv=-1e18;
  for(const m of root){
    api.pushStone(m.x,m.y,p);
    const v=api.isWinRun(m.x,m.y,p)?9e6:-api.negamax(depth-1,-1e18,1e18,3-p,m.x,m.y);
    api.pushStone(m.x,m.y,EMPTY);
    if(v>bv){bv=v;best=m;}
    if(api.getAborted())break;
  }
  return best;
}
function game(tb,tw){
  api.setBoard(Array.from({length:N},()=>new Array(N).fill(EMPTY)));
  let p=BLACK,no=0;
  while(no<180){
    const m=choose(p,p===BLACK?tb:tw,no);
    if(!m)return {w:3-p,no,note:'no-move'};
    if(p===BLACK){const t=legal(m);if(t!=='ok'&&t!=='win')return {w:WHITE,no,note:'black-foul:'+t};}
    api.setCell(m.x,m.y,p);no++;
    const wc=api.winCellsAt(m.x,m.y,p);
    if(wc)return {w:p,no,by:wc.length};
    p=3-p;
  }
  return {w:0,no,note:'cap'};
}
const G=3,mat={};
const t0=Date.now();
for(const tb of TIERS)for(const tw of TIERS){
  const r={wb:0,ww:0,d:0,plies:0};
  for(let g=0;g<G;g++){const s=game(tb,tw);
    if(s.w===BLACK)r.wb++;else if(s.w===WHITE)r.ww++;else r.d++;
    r.plies+=s.no;}
  r.plies=(r.plies/G).toFixed(0);
  mat[tb.slice(0,2)+'v'+tw.slice(0,2)]=r;
  process.stderr.write(`${tb} vs ${tw}: 黑${r.wb} 白${r.ww} 平${r.d} (avg${r.plies}手)\n`);
}
console.log('\n=== 胜率矩阵（白=AItier 视角：白胜-黑胜-平 / 平均手数）===');
console.log('黑方\\白方   easy        medium      hard        expert');
for(const tb of TIERS){
  const row=TIERS.map(tw=>{const r=mat[tb.slice(0,2)+'v'+tw.slice(0,2)];return `${r.ww}-${r.wb}-${r.d}/${r.plies}`.padEnd(11);}).join(' ');
  console.log(tb.padEnd(10)+' '+row);
}
console.log('\n总耗时 '+((Date.now()-t0)/1000).toFixed(0)+'s');
