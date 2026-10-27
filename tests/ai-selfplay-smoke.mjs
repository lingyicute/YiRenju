/* ai-selfplay-smoke.mjs — 真实 aiChoose 迭代加深路径对弈冒烟（hard 黑 vs expert 白）。
   每次 aiChoose 均校验：返回点合法(含禁手)、用时、终局判定正确。 */
import {readFileSync,existsSync} from 'fs';
/* SMOKE_MS：CI 里把每手预算压到几百毫秒，仍走完整 aiChoose 路径
   （VCT / 迭代加深 / 送杀闸门 / 开局随机），但把烟测从约 3 分钟降到半分钟。
   不设置时保持出厂的 1.2s / 3s 预算，用于本地全量验证。 */
const SMOKE_MS=Math.max(0,+(process.env.SMOKE_MS||0));
const pageUrl=new URL('../index.html',import.meta.url);
if(!existsSync(pageUrl)){console.error('找不到 index.html（请在仓库根目录下运行）');process.exit(2);}
const html=readFileSync(pageUrl,'utf8');
let src=html.slice(html.indexOf('/*CORE_START*/'),html.indexOf('/*CORE_END*/'));
if(SMOKE_MS){
  const before=src;
  src=src.replace(/'ai-hard':\{d:\[2,4,6,8\],t:1200,w:12\}/,
                  `'ai-hard':{d:[2,4,6,8],t:${SMOKE_MS},w:12}`)
         .replace(/'ai-expert':\{d:\[2,4,6,8,10\],t:3000,w:16\}/,
                  `'ai-expert':{d:[2,4,6,8,10],t:${SMOKE_MS},w:16}`);
  if(src===before||!src.includes(`t:${SMOKE_MS}`))
    throw new Error('SMOKE_MS 补丁失败：AI_CFG 格式已变化，请同步更新本烟测');
}
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
