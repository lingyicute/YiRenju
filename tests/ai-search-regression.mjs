/* Search control regressions. No browser/dependencies/wall-clock races.
   node tests/ai-search-regression.mjs [path/to/index.html]
   Only the root-control tests stub move scores; abort tests use real negamax/qNode. */
import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
const html=readFileSync(process.argv[2]||new URL('../index.html',import.meta.url),'utf8');
const src=html.slice(html.indexOf('/*CORE_START*/'),html.indexOf('/*CORE_END*/'));
function run(body){return new Function('Date','Math',src+'\n'+body)({now:()=>1000},Object.assign(Object.create(Math),{random:()=>0.99}));}
let failed=0;
function test(name,fn){try{fn();console.log('PASS',name);}catch(e){failed++;console.error('FAIL',name,e.message);}}
const rootSetup=`
mode='ai-hard'; AI_CFG['ai-hard']={d:[2,4],t:1200,w:2};
const A={x:7,y:7},B={x:7,y:8};
candidates=()=>[[7,7],[7,8]];
fivePoint=blackWinPoint=()=>null; winPointsAll=()=>[];
vctFindWin=vctDefend=()=>null;
orderedMoves=()=>[A,B]; isWinRun=()=>false;
guardBest=()=>null;
`;
test('incomplete deeper iteration cannot replace completed result',()=>{
  const m=run(rootSetup+`
  candidates=()=>[[7,7],[7,8],[7,9]];
  orderedMoves=()=>[A,B,{x:7,y:9}];
  negamax=(d,a,b,p,x,y)=>{
    if(d===1)return y===7?-10:y===8?-2000:-5; // completed depth 2 selects B (margin > opening-pool EPS)
    if(y===8)return -100;
    if(y===7)return -200; // partial deeper iteration prefers A
    searchAborted=true;return 0;
  };
  return aiChooseRaw(WHITE);`);
  assert.deepEqual(m,{x:7,y:8});
});
test('no completed iteration retains static legal fallback',()=>{
  const m=run(rootSetup+`
  AI_CFG['ai-hard'].w=3;
  candidates=()=>[[7,7],[7,8],[7,9]];
  orderedMoves=()=>[A,B,{x:7,y:9}];
  negamax=(d,a,b,p,x,y)=>{
    if(y===9){searchAborted=true;return 0;}
    return y===7?-10:-20;
  };
  return aiChooseRaw(WHITE);`);
  assert.deepEqual(m,{x:7,y:7});
});
test('guard checks selected best before stale root order',()=>{
  const r=run(rootSetup+`
  AI_CFG['ai-hard'].d=[2];
  negamax=()=>-20; // exact tie: RNG picks B, stable score order still starts with A
  let checked=[];
  guardBest=(p,root)=>{checked=root.map(m=>m.y);return root[0];};
  const move=aiChooseRaw(WHITE);return {move,checked};`);
  assert.deepEqual(r.move,{x:7,y:8});
  assert.deepEqual(r.checked,[8,7]);
});
test('aborted negamax unwinds without visiting siblings or polluting state',()=>{
  const r=run(`
  pushStone(5,5,BLACK);zobristInit();hashFromBoard();
  const before=JSON.stringify([board,[...CAND1],[...CAND2],zh1,zh2]);
  searchDeadline=2000;searchAborted=false;
  fivePoint=blackWinPoint=()=>null;winPointsAll=()=>[];isWinRun=()=>false;
  orderedMoves=()=>[{x:7,y:7},{x:7,y:8},{x:7,y:9}];
  let visits=0;qNode=()=>{visits++;searchAborted=true;return 0;};
  negamax(1,-Infinity,Infinity,WHITE,-1,-1);
  return {visits,restored:before===JSON.stringify([board,[...CAND1],[...CAND2],zh1,zh2]),
    ply:searchPly,tt:TT.some(Boolean),killer:KILL.some(k=>k!==-1)};
  `);
  assert.deepEqual(r,{visits:1,restored:true,ply:0,tt:false,killer:false});
});
test('qNode checks deadline on entry, not only every 1024 nodes',()=>{
  const r=run(`
  searchDeadline=999;searchAborted=false;qNodes=0;
  qNode(WHITE,-Infinity,Infinity,0);return searchAborted;`);
  assert.equal(r,true);
});
test('already aborted negamax does not start move generation',()=>{
  const r=run(`
  searchDeadline=2000;searchAborted=true;
  let generated=0;orderedMoves=()=>{generated++;return [];};
  negamax(1,-Infinity,Infinity,WHITE,-1,-1);return generated;`);
  assert.equal(r,0);
});
console.log(`\n${6-failed} passed, ${failed} failed`);
process.exitCode=failed?1:0;
