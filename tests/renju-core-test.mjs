/* YiRenju 连珠规则内核单元测试（自包含，零依赖）
   运行: node tests/renju-core-test.mjs   (在仓库根目录下) */
import {readFileSync,existsSync} from 'fs';
const pageUrl=new URL('../index.html',import.meta.url);
if(!existsSync(pageUrl)){console.error('找不到 index.html（请在仓库根目录下运行）');process.exit(2);}
const html=readFileSync(pageUrl,'utf8');
const src=html.slice(html.indexOf('/*CORE_START*/'),html.indexOf('/*CORE_END*/'));
const api=new Function(src+`
return {N,EMPTY,BLACK,WHITE,candidates,runInfo,isWinRun,winCellsAt,blackLegality,blackMoveType,orderedMoves,negamax,blackWinPoint,fivePoint,winPointsAll,winPointsBoth,fourMoves,qNode,aiChoose,isLegalMoveAt,legalCandidatePoints,evalBoard,evalDiff,dirScore,splitScore,stoneScore,vctFindWin,vctDefend,syncCand,setCell,pushStone,zobristInit,hashFromBoard,hashPlace,foulDraft:()=>{ttDraft++;},setQNodes:(v)=>{qNodes=v;},getQNodes:()=>qNodes,setVct:(ms)=>{vctDeadline=ms;vctAborted=false;vctNodeCount=0;},setMode:(m)=>{mode=m;},getBoard:()=>board,setBoard:(b)=>{board=b;syncCand();},setDeadline:(ms)=>{searchDeadline=ms;searchAborted=false;},getAborted:()=>searchAborted};`)();
const {N,EMPTY,BLACK,WHITE}=api;
let pass=0,fail=0;
function eq(name,got,want){const ok=JSON.stringify(got)===JSON.stringify(want);ok?pass++:fail++;console.log((ok?'PASS':'FAIL')+' '+name+(ok?'':`  got=${JSON.stringify(got)} want=${JSON.stringify(want)}`));}
function blank(){api.setBoard(Array.from({length:N},()=>new Array(N).fill(EMPTY)));} /* setBoard 内部已 syncCand */
function put(stones,v){const b=api.getBoard();for(const [x,y] of stones)b[x][y]=v;api.syncCand();}

/* (a) 三三禁手 */
blank();put([[6,7],[8,7],[7,6],[7,8]],BLACK);
eq('三三 at (7,7)',api.blackLegality(7,7),'33');
/* (b) 四四禁手 */
blank();put([[6,7],[8,7],[9,7],[7,6],[7,8],[7,9]],BLACK);
eq('四四 at (7,7)',api.blackLegality(7,7),'44');
/* (c) 长连禁手（缺口补成6连） */
blank();put([[4,4],[5,4],[6,4],[7,4],[9,4]],BLACK);
eq('长连 at (8,4)',api.blackLegality(8,4),'overline');
/* (d) 一个方向恰5 + 另一方向长连 → 长连优先 */
blank();put([[4,4],[5,4],[6,4],[8,4],[7,5],[7,6],[7,7],[7,8],[7,9]],BLACK);
eq('5+over→long at (7,4)',api.blackLegality(7,4),'overline');
/* 黑棋恰好五连 = 合法胜招 */
blank();put([[3,3],[4,3],[5,3],[6,3]],BLACK);
eq('黑恰五 win at (7,3)',api.blackLegality(7,3),'win');
const wp=api.blackWinPoint();
eq('blackWinPoint is win point',!!wp&&((wp.x===7&&wp.y===3)||(wp.x===2&&wp.y===3)),true);
/* (e) 白棋六连 = 胜 */
blank();put([[4,7],[5,7],[6,7],[7,7],[8,7],[9,7]],WHITE);
eq('white overline isWinRun',api.isWinRun(9,7,WHITE),true);
eq('white overline winCells len',api.winCellsAt(9,7,WHITE).length,6);
/* 黑棋六连 ≠ 胜 */
blank();put([[4,4],[5,4],[6,4],[7,4],[8,4],[9,4]],BLACK);
eq('black 6-run isWinRun false',api.isWinRun(9,4,BLACK),false);
eq('black 6-run winCells null',api.winCellsAt(9,4,BLACK),null);
eq('black overline → blackWinPoint null',api.blackWinPoint(),null);
/* 四三同时为合法强手 */
blank();put([[4,7],[5,7],[6,7],[7,8],[7,9]],BLACK);
eq('四三 at (7,7) → ok',api.blackLegality(7,7),'ok');
/* 活三延伸点自身为禁手 → 该三不算活三 */
blank();put([[12,11],[13,11],[14,10],[14,12],[14,13],[11,12],[11,13]],BLACK);put([[9,11]],WHITE);
eq('假活三+真活三 at (11,11) → ok',api.blackLegality(11,11),'ok');
/* orderedMoves 过滤黑方禁手点 */
blank();put([[6,7],[8,7],[7,6],[7,8]],BLACK);
eq('foul (7,7) excluded from black moves',api.orderedMoves(BLACK,5).some(m=>m.x===7&&m.y===7),false);
/* 专家搜索在预算内完成 */
blank();
for(const [x,y,v] of [[7,7,1],[8,7,2],[6,6,1],[7,6,2],[9,8,1],[8,8,2],[6,8,1],[5,7,2],[9,6,1],[10,9,2]])api.getBoard()[x][y]=v;
api.syncCand();
api.setDeadline(Date.now()+3000);
api.zobristInit();api.hashFromBoard();api.foulDraft();api.setQNodes(0);
const root=api.orderedMoves(WHITE,12);
const t0=Date.now();let best=null,bv=-1e18;
for(const m of root){
  api.pushStone(m.x,m.y,WHITE);
  const v=api.isWinRun(m.x,m.y,WHITE)?9e6:-api.negamax(3,-1e18,1e18,BLACK,m.x,m.y);
  api.pushStone(m.x,m.y,EMPTY);
  if(v>bv){bv=v;best=m;}
  if(api.getAborted())break;
}
const dt=Date.now()-t0;
eq('expert search returns a move',!!best,true);
eq('expert search < 3.2s (took '+dt+'ms)',dt<3200,true);
eq('qNode actually engaged',api.getQNodes()>0,true);

/* ===== VCF 静默扩展 ===== */
/* (f) 白棋活三 → 冲四扩展看到活四必杀（2层VCF） */
blank();put([[5,5],[6,5],[7,5]],WHITE);put([[12,12],[12,13]],BLACK);
eq('quiet pos has no white win point yet',api.winPointsAll(WHITE).length,0);
eq('qNode sees open-four win',api.qNode(WHITE,-1e18,1e18,8)>=9000000,true);

/* (g) 四步VCF：白两次冲四，第二次成活四（黑两次被迫应） */
blank();put([[2,3],[3,3],[5,3],[4,5],[4,6]],WHITE);put([[1,3]],BLACK);
api.setDeadline(Date.now()+3000);api.setQNodes(0);
eq('4-ply VCF forced win',api.qNode(WHITE,-1e18,1e18,8)>=9000000,true);

/* (h) 对照组：稀疏平静局面不得误判有杀 */
blank();put([[3,3],[11,11]],WHITE);put([[7,2],[2,12]],BLACK);
eq('quiet pos qNode is small',Math.abs(api.qNode(WHITE,-1e18,1e18,8))<1000000,true);

/* (i) fourMoves 排除黑方禁手着（长连点不得入列） */
blank();put([[4,4],[5,4],[6,4],[7,4],[9,4]],BLACK);
eq('overline move not in fourMoves',api.fourMoves(BLACK,8).some(m=>m.x===8&&m.y===4),false);

/* (j) 黑方有合法胜点时 qNode 直接判胜 */
blank();put([[3,3],[4,3],[5,3],[6,3]],BLACK);
eq('black win via qNode',api.qNode(BLACK,-1e18,1e18,8)>=9000000,true);
/* (k) 外部评审回归：AI 执黑·简单难度不得随机选中禁手点（对抗性 RNG 全覆盖） */
blank();put([[6,7],[8,7],[7,6],[7,8]],BLACK);put([[2,2],[12,12]],WHITE);
api.setMode('ai-easy');
{
  const origRnd=Math.random;let allLegal=true;
  for(let k=0;k<40;k++){
    Math.random=()=>k/40;
    const mv=api.aiChoose(BLACK);
    if(!mv||!['ok','win'].includes(api.blackLegality(mv.x,mv.y)))allLegal=false;
  }
  Math.random=origRnd;api.setMode('ai-easy');
  eq('easy-AI-black 40档RNG全合法',allLegal,true);
}

/* (l) 外部评审回归：中等及以上必须吃下唯一必挡点（RNG 极端值也要挡） */
blank();put([[7,2]],BLACK);put([[7,3],[7,4],[7,5],[7,6]],WHITE); /* 白活四单边被封，唯一杀点(7,7) */
api.setMode('ai-medium');
{
  const origRnd=Math.random;Math.random=()=>0.99; /* 特意逼它选排名外的着法 */
  const mv=api.aiChoose(BLACK);
  Math.random=origRnd;
  eq('medium 强制唯一必挡',!!mv&&mv.x===7&&mv.y===7,true);
}

/* (m) orderedMoves(BLACK) 产出全程合法（含兜底逻辑不返回禁手） */
blank();put([[6,7],[8,7],[7,6],[7,8]],BLACK);put([[2,2],[12,12]],WHITE);
eq('orderedMoves 黑全合法',api.orderedMoves(BLACK,12).every(m=>['ok','win'].includes(api.blackLegality(m.x,m.y))),true);

/* (n) aiChoose 终检防线：黑方返回必合法（全难度抽查） */
blank();put([[6,7],[8,7],[7,6],[7,8],[4,4],[10,10]],BLACK);put([[2,2],[12,12],[3,9]],WHITE);
eq('aiChoose 全难度黑合法',['ai-easy','ai-medium'].every(md=>{
  api.setMode(md);const mv=api.aiChoose(BLACK);
  return mv&&['ok','win'].includes(api.blackLegality(mv.x,mv.y));
}),true);
api.setMode('ai-easy');

/* ===== 优化补丁回归：行为等价性 ===== */
/* (o) 增量候选表与旧 Set 实现集合一致（两套局面） */
function legacyCandidates(dist){
  const b=api.getBoard(),set=new Set();let any=false;
  for(let x=0;x<N;x++)for(let y=0;y<N;y++){
    if(b[x][y]!==EMPTY){any=true;
      for(let dx=-dist;dx<=dist;dx++)for(let dy=-dist;dy<=dist;dy++){
        const nx=x+dx,ny=y+dy;
        if(nx>=0&&nx<N&&ny>=0&&ny<N&&b[nx][ny]===EMPTY)set.add(nx*16+ny);}}}
  if(!any)return [[7,7]];
  const out=[];for(const k of set)out.push([(k/16)|0,k%16]);return out;
}
const keyOf=list=>list.map(c=>c[0]*16+c[1]).sort((a,b)=>a-b).join(',');
{
  blank();
  api.getBoard()[7][7]=1;api.getBoard()[9][9]=2;api.getBoard()[3][3]=1;api.getBoard()[3][11]=2;
  api.getBoard()[11][3]=1;api.getBoard()[11][11]=2;api.getBoard()[7][8]=1;api.syncCand();
  eq('candidates(1) 增量/旧实现一致',keyOf(api.candidates(1)),keyOf(legacyCandidates(1)));
  eq('candidates(2) 增量/旧实现一致',keyOf(api.candidates(2)),keyOf(legacyCandidates(2)));
  blank();
  eq('空盘候选为天元',JSON.stringify(api.candidates(2)),JSON.stringify([[7,7]]));
}
/* (p) evalDiff 与双向 evalBoard 差值一致 */
blank();put([[7,7],[8,8],[6,7],[5,9],[9,4]],BLACK);put([[8,7],[7,8],[10,10],[4,4]],WHITE);
eq('evalDiff(B)==evalBoard(B)-evalBoard(W)',api.evalDiff(BLACK),api.evalBoard(BLACK)-api.evalBoard(WHITE));
eq('evalDiff(W)==-(evalDiff(B))',api.evalDiff(WHITE),-api.evalDiff(BLACK));
/* (q) winPointsBoth：双侧结果与单扫一致、各集≤2 */
blank();put([[3,3],[4,3],[5,3],[6,3]],BLACK);put([[10,4],[10,5],[10,6],[10,7]],WHITE);
{
  const both=api.winPointsBoth(WHITE);
  eq('winPointsBoth 白方杀点含 (10,8)或(10,3)',both.mine.some(m=>(m.x===10&&m.y===8)||(m.x===10&&m.y===3)),true);
  eq('winPointsBoth 黑方杀点含 (7,3)或(2,3)',both.opp.some(m=>(m.x===7&&m.y===3)||(m.x===2&&m.y===3)),true);
  eq('winPointsBoth 各集≤2',both.mine.length<=2&&both.opp.length<=2,true);
  eq('mine 与 winPointsAll 一致',JSON.stringify(both.mine),JSON.stringify(api.winPointsAll(WHITE)));
}
/* (r) fourMoves 确定性（同局面两次调用结果全等） */
blank();put([[7,7],[8,7],[6,6],[7,6],[9,8]],BLACK);put([[8,8],[6,7],[5,7],[9,6]],WHITE);
eq('fourMoves 可复现',JSON.stringify(api.fourMoves(WHITE,4)),JSON.stringify(api.fourMoves(WHITE,4)));
/* (s) 真机 aiChoose 迭代加深路径：中盘限时内返回合法着 */
blank();put([[7,7],[6,6],[9,8],[6,8],[9,6]],BLACK);put([[8,7],[7,6],[8,8],[5,7]],WHITE);
{
  api.setMode('ai-hard');
  const t0=Date.now(),mv=api.aiChoose(WHITE),dt=Date.now()-t0;
  eq('aiChoose(hard) 在预算+宽限内返回',dt<1200+2500,true); /* 尾程一层可能被截断，给出宽限 */
  eq('aiChoose(hard) 返回棋子',!!mv,true);
  api.setMode('ai-expert');
  const t1=Date.now(),mv2=api.aiChoose(WHITE),dt2=Date.now()-t1;
  eq('aiChoose(expert) 在预算+宽限内返回',dt2<3000+2500,true);
  eq('aiChoose(expert) 返回棋子',!!mv2,true);
  api.setMode('ai-easy');
}

/* ===== 增量补丁②回归：强制应着 / qNode 静态延伸 / 根窗口 ===== */
const ck=eq;
api.setDeadline(Date.now()+60000);api.foulDraft();
/* (t) 竞速格局：白有自胜点 + 黑双杀点 → 走子方必须取己胜（fast-win 守卫先于威胁检测） */
blank();put([[7,5],[7,6],[7,7],[7,8]],WHITE);
put([[3,3],[4,3],[5,3],[6,3],[3,11],[4,11],[5,11],[6,11]],BLACK);
ck('竞速：白轮走应判胜(非堵非负分)',api.negamax(4,-1e18,1e18,WHITE,-1,-1)>8900000,true);
/* (u) 黑双杀 + 白无自胜 → 必败分 */
blank();put([[3,3],[4,3],[5,3],[6,3],[3,11],[4,11],[5,11],[6,11]],BLACK);put([[9,9],[10,10]],WHITE);
ck('双杀必败：负分深度档',api.negamax(3,-1e18,1e18,WHITE,-1,-1)<-8900000,true);
/* (v) 黑单杀（一端已被白子堵住）→ 白只能挡 (2,3)，但不算速败 */
blank();put([[3,3],[4,3],[5,3],[6,3]],BLACK);put([[7,3],[9,9],[10,10]],WHITE);
ck('单杀强挡：非必败',api.negamax(4,-1e18,1e18,WHITE,-1,-1)>-8900000,true);
/* (w) qNode 静态延伸：qd 耗尽遇单杀应返回静态评估而非 -9000000 */
blank();put([[4,6],[4,7],[4,8],[4,9]],WHITE);put([[4,5],[7,7],[8,8],[3,3]],BLACK);
api.setDeadline(Date.now()+60000);api.foulDraft();
ck('qNode(qd=0) 单杀→静态评估',api.qNode(BLACK,-1e18,1e18,0),api.evalDiff(BLACK));
/* (x) 并列同分修正回归：黑双组恰五胜点 → aiChoose 随机化后仍必须落在胜点集合、不得降级为普通着 */
blank();put([[3,3],[4,3],[5,3],[6,3],[3,11],[4,11],[5,11],[6,11]],BLACK);put([[9,9],[9,10]],WHITE);
{
  const wins=new Set(['2,3','7,3','2,11','7,11']);
  api.setMode('ai-expert');api.foulDraft();
  for(let k=0;k<3;k++){
    const mv=api.aiChoose(BLACK);
    ck(`双胜点随机取着仍必胜#${k+1}`,!!mv&&wins.has(mv.x+','+mv.y),true);
  }
  api.setMode('ai-easy');
}

/* ===== 增量补丁④回归：分离型棋形 / 死四估值 ===== */
/* (y) 死四(两端堵)静态分必须低于活二 */
ck('死四估值<活二',api.dirScore(4,0,BLACK)<api.dirScore(2,2,BLACK),true);
/* (z) 断四 XX.XX 窗口补算≥SPLIT4 */
blank();put([[5,5],[5,6],[5,8],[5,9]],BLACK);
ck('断四splitScore≥12000',api.splitScore(5,6,0,1,BLACK)>=12000,true);
/* (aa) 连续四不产生 split 分（由 dirScore 负责） */
blank();put([[5,5],[5,6],[5,7],[5,8]],BLACK);
ck('连续四splitScore=0',api.splitScore(5,6,1,0,BLACK),0);
/* (ab) 跳三 X.XX 窗口补算≥SPLIT3 */
blank();put([[5,5],[5,7],[5,8]],BLACK);
ck('跳三splitScore≥3000',api.splitScore(5,7,0,1,BLACK)>=3000,true);

/* ===== 增量补丁⑤回归：VCT 连续做杀 ===== */
/* (ac) 白双活三局面 → vctFindWin 证明 (3,3) 必胜（探针：属实，expert 续走 5 手白胜） */
blank();put([[2,2],[4,4],[2,4],[4,2]],WHITE);put([[10,10],[11,11]],BLACK);
api.setVct(Date.now()+1000);
eq('白双三 vctFindWin=(3,3)',(()=>{const v=api.vctFindWin(WHITE);return v?v.x+','+v.y:null;})(),'3,3');
/* (ad) aiChoose(expert) 同局面直连 VCT 胜着 */
api.setMode('ai-expert');
eq('aiChoose(expert)白直连(3,3)',(()=>{const v=api.aiChoose(WHITE);return v?v.x+','+v.y:null;})(),'3,3');
api.setMode('ai-easy');
/* (ae) 黑方同构：(3,3) 为双三禁手；vctFindWin 不得报禁手点（探针：另有 (2,3) 深层胜并经 expert 对守验证成立） */
blank();put([[2,2],[4,4],[2,4],[4,2]],BLACK);put([[10,10],[11,11]],WHITE);
eq('黑(3,3)双三禁手',api.blackLegality(3,3),'33');
api.setVct(Date.now()+1000);
ck('黑 vctFindWin 不越禁手',(()=>{const v=api.vctFindWin(BLACK);return v===null||api.isLegalMoveAt(BLACK,v.x,v.y);})(),true);
/* (af) 浅层活三威胁 → vctDefend(黑) 交出的破局着均合法且必含 (5,4) */
blank();put([[5,5],[5,6],[5,7]],WHITE);put([[10,10],[11,11]],BLACK);
api.setVct(Date.now()+1000);
ck('vctDefend 交出合法破局着',(()=>{
  const out=api.vctDefend(BLACK);
  if(!out||!out.length)return false;
  if(!out.every(m=>api.isLegalMoveAt(BLACK,m.x,m.y)))return false;
  return out.some(m=>m.x===5&&m.y===4);
})(),true);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
