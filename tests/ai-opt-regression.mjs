/* ai-opt-regression.mjs — 增量加速路径与朴素实现的一致性回归（零依赖）。
   背景：本轮优化用三处「等价变换」换速度，任何一处若与朴素语义有偏差，都会让 AI 静默走弱：
     ① WC 方向势能表（setCell 增量维护的 ±4 同色子数）——必须与逐格扫盘的 winCount 全等；
     ② 补点唯一性：ptsToFiveThrough / isFreeThreeDir / openThreeDir 只枚举 R+1 / -(L+1) 两个偏移；
     ③ 成五下界筛 canFive：winPointsOne/winPointsBoth/fivePoint/blackWinPoint 跳过不可能成五的点；
     ④ fourMoves 只对 winCount≥3 的方向做补点判定。
   本测试把 ①②③④ 的朴素版本原地重写一遍，在随机局面上逐点比对；
   规则修正后参考枚举也要求「直四、延伸参与成形、延伸不成五、完整递归」，
   并同步试落 WC；规则本身另由 ai-review-regression 的独立窗口 oracle 核查。
   另校验 225 格 × 4 方向 × 2 色的 winCount 与盘面重算值一致（表不漂移）。
   运行: node tests/ai-opt-regression.mjs（在仓库根目录下）*/
import {readFileSync,existsSync} from 'fs';
const pageUrl=new URL('../index.html',import.meta.url);
if(!existsSync(pageUrl)){console.error('找不到 index.html（请在仓库根目录下运行）');process.exit(2);}
const html=readFileSync(pageUrl,'utf8');
const src=html.slice(html.indexOf('/*CORE_START*/'),html.indexOf('/*CORE_END*/'));
const api=new Function(src+`
/* ================= 朴素枚举参考（规则以直四/完整递归为准） ================= */
function nWinCount(x,y,dx,dy,p){
  let c=0;
  for(let o=1;o<=4;o++){
    if(inB(x+dx*o,y+dy*o)&&board[x+dx*o][y+dy*o]===p)c++;
    if(inB(x-dx*o,y-dy*o)&&board[x-dx*o][y-dy*o]===p)c++;
  }
  return c;
}
function nPtsToFive(x,y,dx,dy,p){
  let cnt=0;
  for(let o=-4;o<=4;o++){
    if(o===0)continue;
    const nx=x+dx*o,ny=y+dy*o;
    if(!inB(nx,ny)||board[nx][ny]!==EMPTY)continue;
    if(!linkedTo(x,y,dx,dy,o,p))continue;
    board[nx][ny]=p;
    const r=runInfo(x,y,dx,dy,p)[0];
    board[nx][ny]=EMPTY;
    if(p===BLACK?r===5:r>=5)cnt++;
  }
  return cnt;
}
function nIsFreeThreeDir(x,y,dx,dy,depth){
  for(let o=-4;o<=4;o++){
    if(o===0)continue;
    const nx=x+dx*o,ny=y+dy*o;
    if(!inB(nx,ny)||board[nx][ny]!==EMPTY)continue;
    if(!linkedTo(x,y,dx,dy,o,BLACK))continue;
    pushStone(nx,ny,BLACK);
    const open4=runInfo(x,y,dx,dy,BLACK)[0]===4
      &&nPtsToFive(x,y,dx,dy,BLACK)===2&&blackExtensionLegal(nx,ny,depth);
    pushStone(nx,ny,EMPTY);
    if(open4)return true;
  }
  return false;
}
function nOpenThreeDir(x,y,dx,dy,p){
  for(let o=-4;o<=4;o++){
    if(o===0)continue;
    const nx=x+dx*o,ny=y+dy*o;
    if(!inB(nx,ny)||board[nx][ny]!==EMPTY)continue;
    if(!linkedTo(x,y,dx,dy,o,p))continue;
    pushStone(nx,ny,p);
    let ok=!isWinRun(nx,ny,p)&&runInfo(x,y,dx,dy,p)[0]===4;
    if(ok&&p===BLACK)ok=blackExtensionLegal(nx,ny,0);
    const fives=ok?nPtsToFive(x,y,dx,dy,p):0;
    pushStone(nx,ny,EMPTY);
    if(fives>=2)return true;
  }
  return false;
}
function nWinPointsOne(p){
  const out=[];
  for(const c of candidates(1)){
    if(board[c[0]][c[1]]!==EMPTY)continue;
    board[c[0]][c[1]]=p;
    const hit=p===BLACK?blackWinAt(c[0],c[1]):isWinRun(c[0],c[1],p);
    board[c[0]][c[1]]=EMPTY;
    if(hit){out.push({x:c[0],y:c[1]});if(out.length>=2)break;}
  }
  return out;
}
function nWinPointsBoth(p){
  /* 参考语义与现行契约对齐：调用方只区分 0/1/≥2，各侧按行序计到 2 即停（与 winPointsOne 一致）。 */
  const op=3-p,mine=[],opp=[];
  for(const c of candidates(1)){
    const x=c[0],y=c[1];
    if(board[x][y]!==EMPTY)continue;
    if(mine.length<2){
      if(p===BLACK){board[x][y]=BLACK;if(blackWinAt(x,y))mine.push({x:x,y:y});board[x][y]=EMPTY;}
      else{board[x][y]=WHITE;if(isWinRun(x,y,WHITE))mine.push({x:x,y:y});board[x][y]=EMPTY;}
    }
    if(opp.length<2){
      if(op===BLACK){board[x][y]=BLACK;if(blackWinAt(x,y))opp.push({x:x,y:y});board[x][y]=EMPTY;}
      else{board[x][y]=WHITE;if(isWinRun(x,y,WHITE))opp.push({x:x,y:y});board[x][y]=EMPTY;}
    }
    if(mine.length>=2&&opp.length>=2)break;
  }
  return {mine:mine,opp:opp};
}
function nFourMoves(p,cap){
  const out=[];
  for(const c of candidates(2)){
    if(board[c[0]][c[1]]!==EMPTY)continue;
    let fourPot=false;
    for(const d of DIRS){if(nWinCount(c[0],c[1],d[0],d[1],p)>=3){fourPot=true;break;}}
    if(!fourPot)continue;
    if(p===BLACK){
      pushStone(c[0],c[1],BLACK);
      const t=blackMoveType(c[0],c[1]);
      if(t!=='ok'){pushStone(c[0],c[1],EMPTY);continue;}
    }else pushStone(c[0],c[1],p);
    let dirs=0,open=false;
    for(const d of DIRS){
      const n=nPtsToFive(c[0],c[1],d[0],d[1],p);
      if(n>=1){dirs++;if(n>=2)open=true;}
    }
    pushStone(c[0],c[1],EMPTY);
    if(dirs>=1)out.push({x:c[0],y:c[1],k:(dirs>1?2:0)+(open?1:0)});
  }
  out.sort((a,b)=>b.k-a.k||((a.x*16+a.y)-(b.x*16+b.y)));
  return out.slice(0,cap||4);
}
function nThreeMovesVCT(p,cap){
  const out=[];
  for(const c of candidates(2)){
    const x=c[0],y=c[1];
    if(board[x][y]!==EMPTY)continue;
    if(p===BLACK&&!isLegalMoveAt(p,x,y))continue;
    pushStone(x,y,p);
    let hit=false;
    for(const d of DIRS){
      if(nWinCount(x,y,d[0],d[1],p)<2)continue;
      if(nOpenThreeDir(x,y,d[0],d[1],p)){hit=true;break;}
    }
    pushStone(x,y,EMPTY);
    if(hit)out.push({x:x,y:y,s:evalPoint(x,y,p)});
  }
  out.sort((a,b)=>b.s-a.s||((a.x*16+a.y)-(b.x*16+b.y)));
  return out.slice(0,cap);
}
return {N,EMPTY,BLACK,WHITE,DIRS,
  setBoard:(b)=>{board=b;syncCand();},getBoard:()=>board,syncCand,setCell,pushStone,zobristInit,hashFromBoard,
  candidates,winCount,winPointsOne,winPointsBoth,winPointsAll,fourMoves,threeMovesVCT,ptsToFiveThrough,
  isFreeThreeDir,openThreeDir,linkedTo,runInfo,evalDiff,evalBoard,
  n:{nWinCount,nPtsToFive,nIsFreeThreeDir,nOpenThreeDir,nWinPointsOne,nWinPointsBoth,nFourMoves,nThreeMovesVCT}};`)();
const {N,EMPTY,BLACK,WHITE,DIRS}=api;
let pass=0,fail=0;
const ck=(label,cond,extra)=>{if(cond)pass++;else{fail++;console.log('FAIL '+label+(extra!==undefined?'  '+extra:''));}};

const DIRK=[[1,0],[0,1],[1,1],[1,-1]];
/* 工程化的小 PRNG：跨机器可复现 */
let seed=20261012;
const rnd=()=>{seed=(seed*1103515245+12345)&0x7fffffff;return seed/0x7fffffff;};
const key=l=>l.map(m=>m.x*16+m.y).join(',');
const boardKey=()=>api.getBoard().map(r=>r.join('')).join('');

/* ---------- 1) WC 表一致性：任意落子/撤子序列后，winCount 必须等于盘面重算 ---------- */
{
  api.setBoard(Array.from({length:N},()=>new Array(N).fill(EMPTY)));
  const hist=[];
  for(let i=0;i<160;i++){
    if(hist.length&&rnd()<0.35){                        /* 撤子：覆盖 setCell(...,EMPTY) 的减计数 */
      const m=hist.pop();api.setCell(m[0],m[1],EMPTY);
    }else{
      const x=(rnd()*N)|0,y=(rnd()*N)|0;
      if(api.getBoard()[x][y]!==EMPTY)continue;
      const p=rnd()<0.5?BLACK:WHITE;
      api.setCell(x,y,p);hist.push([x,y]);
    }
  }
  let bad=0,first=null;
  for(let x=0;x<N;x++)for(let y=0;y<N;y++)for(const d of DIRK)for(const p of [BLACK,WHITE]){
    const got=api.winCount(x,y,d[0],d[1],p),want=api.n.nWinCount(x,y,d[0],d[1],p);
    if(got!==want){bad++;if(!first)first=`(${x},${y}) dir ${d} color ${p}: ${got} vs ${want}`;}
  }
  ck('WC 表与盘面重算全等（225×4×2）',bad===0,first||'');
  /* 打乱方向正负号也必须命中同一条线 */
  let bad2=0;
  for(let x=0;x<N;x++)for(let y=0;y<N;y++)for(const d of DIRK){
    if(api.winCount(x,y,-d[0],-d[1],BLACK)!==api.winCount(x,y,d[0],d[1],BLACK))bad2++;
  }
  ck('WC 方向取反结果不变',bad2===0,bad2);
}

/* ---------- 2/3/4) 随机局面上：优化路径 vs 朴素参考 ---------- */
const POS=[];
for(let g=0;g<14;g++){
  api.setBoard(Array.from({length:N},()=>new Array(N).fill(EMPTY)));
  const stones=6+((rnd()*30)|0);
  let placed=0,guard=0;
  while(placed<stones&&guard++<600){
    /* 靠近已有棋子落子，贴近真实对局形态 */
    const near=api.candidates(2);
    const c=near[(rnd()*near.length)|0];
    if(!c||api.getBoard()[c[0]][c[1]]!==EMPTY)continue;
    const p=placed%2===0?BLACK:WHITE;
    api.setCell(c[0],c[1],p);placed++;
  }
  /* 同色过密时 blackLegality 会大量触发禁手，这里保证黑白数量差 ≤1 即可（setCell 已维护表）*/
  POS.push(boardKey());
  const snap=api.getBoard().map(r=>r.slice());
  const side=placed%2===0?BLACK:WHITE;

  /* 每个空点：ptsToFiveThrough / isFreeThreeDir 与朴素实现逐方向一致 */
  let badP5=0,badF3=0,badOpen=0,checked=0;
  for(const c of api.candidates(2)){
    const x=c[0],y=c[1];
    if(api.getBoard()[x][y]!==EMPTY)continue;
    for(const p of [BLACK,WHITE]){
      api.setCell(x,y,p);                      /* 等价于「该点刚落下 p」，表与盘面同步 */
      for(const d of DIRK){
        const got=api.ptsToFiveThrough(x,y,d[0],d[1],p),want=api.n.nPtsToFive(x,y,d[0],d[1],p);
        if(got!==want){badP5++;if(badP5<3)console.log('   p5',x,y,d,p,got,want);}
        const openG=api.openThreeDir(x,y,d[0],d[1],p);
        const openW=api.n.nOpenThreeDir(x,y,d[0],d[1],p);
        if(openG!==openW){badOpen++;if(badOpen<3)console.log('   open3',x,y,d,p,openG,openW);}
      }
      api.setCell(x,y,EMPTY);
      checked++;
      if(p===BLACK){
        api.setCell(x,y,BLACK); /* 活三接口要求中心已有黑子 */
        for(const d of DIRK){
          const g=api.isFreeThreeDir(x,y,d[0],d[1],0),w=api.n.nIsFreeThreeDir(x,y,d[0],d[1],0);
          if(g!==w){badF3++;if(badF3<3)console.log('   f3',x,y,d,g,w);}
        }
        api.setCell(x,y,EMPTY);
      }
    }
  }
  ck(`#${g} ptsToFiveThrough 与朴素枚举一致(${checked}点)`,badP5===0,badP5);
  ck(`#${g} isFreeThreeDir 与朴素枚举一致`,badF3===0,badF3);
  ck(`#${g} openThreeDir 与朴素枚举一致`,badOpen===0,badOpen);

  /* 取胜点扫描（含 canFive 下界筛）与朴素扫描逐位一致，顺序也必须一致 */
  for(const p of [BLACK,WHITE]){
    const g1=api.winPointsOne(p)||[],w1=api.n.nWinPointsOne(p)||[];
    ck(`#${g} winPointsOne(${p}) 与朴素扫描一致`,key(g1)===key(w1),key(g1)+' vs '+key(w1));
    const g2=api.winPointsBoth(p),w2=api.n.nWinPointsBoth(p);
    ck(`#${g} winPointsBoth(${p}).mine 一致`,key(g2.mine)===key(w2.mine),key(g2.mine)+' vs '+key(w2.mine));
    ck(`#${g} winPointsBoth(${p}).opp 一致`,key(g2.opp)===key(w2.opp),key(g2.opp)+' vs '+key(w2.opp));
    /* 冲四着法与 VCT 活三着法（含按方向筛 + 排序 / 截断）必须与朴素完全同序 */
    ck(`#${g} fourMoves(${p}) 与朴素实现一致`,JSON.stringify(api.fourMoves(p,4))===JSON.stringify(api.n.nFourMoves(p,4)));
    ck(`#${g} threeMovesVCT(${p}) 与朴素实现一致`,JSON.stringify(api.threeMovesVCT(p,6))===JSON.stringify(api.n.nThreeMovesVCT(p,6)));
  }
  /* 盘面没有被临时写格污染 */
  ck(`#${g} 临时写格已还原`,boardKey()===POS[POS.length-1]);
  ck(`#${g} 盘面快照一致`,boardKey()===snap.map(r=>r.join('')).join(''));
}

/* ---------- 5) 读档 / 整体替换 board 后 syncCand 必须重建 WC ---------- */
{
  api.setBoard(Array.from({length:N},()=>new Array(N).fill(EMPTY)));
  api.getBoard()[5][5]=BLACK;api.getBoard()[5][6]=BLACK;api.getBoard()[5][7]=BLACK;api.getBoard()[5][8]=BLACK;
  api.getBoard()[8][8]=WHITE;api.getBoard()[9][9]=WHITE;
  api.syncCand();                                     /* 直写盘面后的唯一对齐入口 */
  let bad=0;
  for(let x=0;x<N;x++)for(let y=0;y<N;y++)for(const d of DIRK)for(const p of [BLACK,WHITE]){
    if(api.winCount(x,y,d[0],d[1],p)!==api.n.nWinCount(x,y,d[0],d[1],p))bad++;
  }
  ck('syncCand 重建 WC（直写盘面路径）',bad===0,bad);
  ck('重建后黑 (5,4)/(5,9) 为成五点',api.winPointsOne(BLACK).some(m=>m.x===5&&(m.y===4||m.y===9)));
}

/* ---------- 6) evalDiff 的逐子分缓存（EVS/EVD）与逐子重算一致 ----------
   evalBoard 不走缓存，作对照。三种扰动：全盘随机落 / 撤 / 改色；集中在四条线上堆同色长连段
   （距离超过 4 格的子仍会经 runInfo 读到被改的那一格）；直写盘面后 syncCand。
   中途穿插会裸写格试落的查询，确认试落不会污染缓存。 */
{
  const ri=n=>Math.floor(rnd()*n);
  const empty=()=>Array.from({length:N},()=>new Array(N).fill(EMPTY));
  let checked=0,bad=0;
  const cmp=()=>{
    checked++;
    const want=api.evalBoard(BLACK)-api.evalBoard(WHITE);
    if(api.evalDiff(BLACK)!==want||api.evalDiff(WHITE)!==-want)bad++;
  };
  api.setBoard(empty());
  for(let i=0;i<4000;i++){
    (i&1?api.setCell:api.pushStone)(ri(N),ri(N),ri(3));
    if(i%5===0){api.fourMoves(1+ri(2),4);api.winPointsBoth(BLACK);}
    cmp();
  }
  ck(`evalDiff 缓存：全盘随机落/撤/改色与逐子重算一致(${checked}次)`,bad===0,bad);
  checked=0;bad=0;
  for(let round=0;round<12;round++){
    api.setBoard(empty());
    const col=1+ri(2);
    for(let i=0;i<400;i++){
      const t=ri(4),k=ri(N),r=ri(10);
      const x=t===0?7:k,y=t===0?k:t===1?7:t===2?k:N-1-k;   /* 一横、一竖、两条斜线 */
      api.setCell(x,y,r<6?col:r<8?EMPTY:3-col);
      cmp();
    }
  }
  ck(`evalDiff 缓存：长连段上的改动与逐子重算一致(${checked}次)`,bad===0,bad);
  checked=0;bad=0;
  for(let round=0;round<8;round++){
    const b=api.getBoard();
    for(let x=0;x<N;x++)for(let y=0;y<N;y++)b[x][y]=rnd()<0.7?1+ri(2):EMPTY;
    api.syncCand();cmp();
    for(let i=0;i<200;i++){api.setCell(ri(N),ri(N),ri(3));cmp();}
  }
  ck(`evalDiff 缓存：直写盘面经 syncCand 后与逐子重算一致(${checked}次)`,bad===0,bad);
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
