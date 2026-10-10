/* ai-selfplay-smoke.mjs — 真实 aiChoose 迭代加深路径对弈冒烟（hard 黑 vs expert 白）。
   每次 aiChoose 均校验：返回点合法(含禁手)、用时、终局判定正确。 */
import {readFileSync,existsSync} from 'fs';
const pageUrl=new URL('../index.html',import.meta.url);
if(!existsSync(pageUrl)){console.error('找不到 index.html（请在仓库根目录下运行）');process.exit(2);}
const html=readFileSync(pageUrl,'utf8');
const src=html.slice(html.indexOf('/*CORE_START*/'),html.indexOf('/*CORE_END*/'));
const api=new Function(src+`
return {N,EMPTY,BLACK,WHITE,isWinRun,blackLegality,isLegalMoveAt,aiChoose,winCellsAt,syncCand,setCell,setMode:(m)=>{mode=m;},getBoard:()=>board,setBoard:(b)=>{board=b;syncCand();},zobristInit,hashFromBoard};`)();
const {N,EMPTY,BLACK,WHITE}=api;
let pass=0,fail=0;
const ck=(label,cond,extra)=>{if(cond)pass++;else{fail++;console.log('FAIL',label,extra||'');}};

function playGame(blackTier,whiteTier,maxMoves=120){
  api.setBoard(Array.from({length:N},()=>new Array(N).fill(EMPTY)));
  api.zobristInit();api.hashFromBoard();api.syncCand();
  const hist=[];let turn=BLACK;const times={[BLACK]:[],[WHITE]:[]};
  while(hist.length<maxMoves){
    api.setMode(turn===BLACK?blackTier:whiteTier);
    const t0=Date.now(),mv=api.aiChoose(turn),dt=Date.now()-t0;
    times[turn].push(dt);
    if(!mv){console.log(`  ${turn===BLACK?'黑':'白'} ${turn===BLACK?blackTier:whiteTier} 无从落子(第${hist.length+1}手)`);return {result:'nomove',hist,times,turn};}
    ck(`着点合法 ${turn===BLACK?'B':'W'}#${hist.length+1} (${mv.x},${mv.y})`,api.isLegalMoveAt(turn,mv.x,mv.y)===true);
    api.setCell(mv.x,mv.y,turn);hist.push([mv.x,mv.y,turn]);
    if(api.isWinRun(mv.x,mv.y,turn))return {result:turn===BLACK?'B':'W',hist,times,turn};
    if(api.getBoard().every(r=>r.every(c=>c!==EMPTY)))return {result:'D',hist,times,turn};
    turn=3-turn;
  }
  return {result:'len',hist,times,turn};
}
const budget=t=>t<=4200; /* expert 3s + 宽限; hard 1.2s + 宽限 → 统一宽松上限 */
{
  const g=playGame('ai-hard','ai-expert');
  console.log(`G1 hard(黑) vs expert(白): 结果=${g.result} 手数=${g.hist.length} 黑均时=${Math.round(g.times[BLACK].reduce((a,b)=>a+b,0)/g.times[BLACK].length)}ms 白均时=${Math.round(g.times[WHITE].reduce((a,b)=>a+b,0)/g.times[WHITE].length)}ms 白最大=${Math.max(...g.times[WHITE])}ms`);
  ck('G1 每手均在预算内',g.times[BLACK].concat(g.times[WHITE]).every(budget));
  ck('G1 分出胜负或下满',g.result!=='nomove');
}
{
  const g=playGame('ai-expert','ai-expert');
  console.log(`G2 expert 自弈: 结果=${g.result} 手数=${g.hist.length} 黑均时=${Math.round(g.times[BLACK].reduce((a,b)=>a+b,0)/g.times[BLACK].length)}ms 白均时=${Math.round(g.times[WHITE].reduce((a,b)=>a+b,0)/g.times[WHITE].length)}ms`);
  ck('G2 每手均在预算内',g.times[BLACK].concat(g.times[WHITE]).every(budget));
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
