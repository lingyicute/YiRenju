/* AI decision-contract regressions (not a strength benchmark).
   node tests/ai-safety-regression.mjs [path/to/index.html]
   Real boards cover tactics/state. Root-control tests deliberately inject an
   incorrect VCT hint: an approximate oracle must not bypass the main search. */
import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
const html=readFileSync(process.argv[2]||new URL('../index.html',import.meta.url),'utf8');
const src=html.slice(html.indexOf('/*CORE_START*/'),html.indexOf('/*CORE_END*/'));
function run(body){
  return new Function('Date','Math',src+'\n'+body)(
    {now:()=>1000},Object.assign(Object.create(Math),{random:()=>0}));
}
let passed=0,failed=0;
function test(name,fn){
  try{fn();passed++;console.log('PASS',name);}
  catch(e){failed++;console.error('FAIL',name,e.message);}
}
const crossWin=`
for(const [x,y] of [[7,2],[7,3],[7,4],[7,6],[7,7],[5,5],[6,5],[8,5],[9,5]])pushStone(x,y,BLACK);
`;
test('all AI win helpers agree with existing exact-five priority',()=>{
  const r=run(crossWin+`
  const before=JSON.stringify([board,WC.map(t=>[...t])]);
  const legal=blackLegality(7,5),one=winPointsOne(BLACK),both=winPointsBoth(BLACK).mine,first=blackWinPoint();
  return {legal,one,both,first,restored:before===JSON.stringify([board,WC.map(t=>[...t])])};`);
  assert.equal(r.legal,'win');
  assert.deepEqual(r.one,[{x:7,y:5}]);
  assert.deepEqual(r.both,r.one);
  assert.deepEqual(r.first,r.one[0]);
  assert.equal(r.restored,true);
});
test('all four levels take own crossed five before blocking opponent',()=>{
  const r=run(crossWin+`
  pushStone(2,0,BLACK);
  for(let y=1;y<=4;y++)pushStone(2,y,WHITE);
  return ['ai-easy','ai-medium','ai-hard','ai-expert'].map(md=>{mode=md;return aiChoose(BLACK);});`);
  for(const m of r)assert.deepEqual(m,{x:7,y:5});
});
test('qNode horizon recognizes an illegal forced block, not a quiet evaluation',()=>{
  const r=run(`
  for(let y=3;y<=6;y++)pushStone(7,y,WHITE);
  for(const [x,y] of [[7,2],[4,7],[5,7],[6,7],[8,7],[9,7]])pushStone(x,y,BLACK);
  searchDeadline=Infinity;
  return {legal:blackLegality(7,7),wins:winPointsBoth(BLACK),score:qNode(BLACK,-Infinity,Infinity,0)};`);
  assert.equal(r.legal,'overline');
  assert.equal(r.wins.mine.length,0);
  assert.deepEqual(r.wins.opp,[{x:7,y:7}]);
  assert.ok(r.score<=-9000000,`got ${r.score}`);
});
test('illegal forced block scores like a double threat at the same qNode horizon',()=>{
  const r=run(`
  for(let y=3;y<=6;y++)pushStone(7,y,WHITE);
  for(const [x,y] of [[7,2],[4,7],[5,7],[6,7],[8,7],[9,7]])pushStone(x,y,BLACK);
  searchDeadline=Infinity;
  const blocked=[0,3,6].map(qd=>qNode(BLACK,-Infinity,Infinity,qd));
  for(let x=0;x<=3;x++)pushStone(x,14,WHITE);   /* second white four: two winning points */
  const double=[0,3,6].map(qd=>qNode(BLACK,-Infinity,Infinity,qd));
  return {blocked,double};`);
  assert.deepEqual(r.double,[-9000000,-9000030,-9000060]);
  assert.deepEqual(r.blocked,r.double);
});
test('winPointsBoth saturates each side at two, like winPointsOne',()=>{
  const r=run(`
  for(const y of [2,7,12])for(let x=3;x<=6;x++)pushStone(x,y,BLACK);
  return {both:winPointsBoth(BLACK).mine,one:winPointsOne(BLACK)};`);
  assert.deepEqual(r.both,r.one);
});
test('depth-zero negamax reuses its win scan in qNode',()=>{
  const r=run(`
  pushStone(7,7,WHITE);searchDeadline=Infinity;
  let scans=0;const original=winPointsBoth;
  winPointsBoth=p=>{scans++;return original(p);};
  const score=negamax(0,-Infinity,-100000000,BLACK,-1,-1);
  return {scans,score};`);
  assert.equal(r.scans,1);
  assert.ok(Number.isFinite(r.score));
});
const rootSetup=`
mode='ai-hard';AI_CFG[mode]={d:[2],t:1200,w:2};
const A={x:7,y:7},B={x:7,y:8},H={x:6,y:7};
candidates=()=>[[7,7],[7,8],[6,7]];
fivePoint=blackWinPoint=()=>null;winPointsAll=()=>[];
orderedMoves=()=>[A,B];isWinRun=()=>false;guardBest=()=>null;
vctFindWin=vctDefend=()=>null;
const visited=[];
negamax=(d,a,b,p,x,y)=>{visited.push([x,y]);return x===7&&y===8?-5000:0;};
`;
test('VCT win is an ordering hint, not an immediate-return proof',()=>{
  const r=run(rootSetup+`
  vctFindWin=()=>H;
  const move=aiChooseRaw(WHITE);return {move,visited};`);
  assert.deepEqual(r.move,{x:7,y:8});
  assert.deepEqual(r.visited,[[6,7],[7,7],[7,8]]);
});
test('VCT defense hints retain all static root candidates, even outside width',()=>{
  const r=run(rootSetup+`
  vctDefend=()=>[H,A];
  const move=aiChooseRaw(WHITE);return {move,visited};`);
  assert.deepEqual(r.move,{x:7,y:8});
  assert.deepEqual(r.visited,[[6,7],[7,7],[7,8]]);
});
test('first-iteration timeout keeps static fallback, not an unverified hint',()=>{
  const r=run(rootSetup+`
  vctFindWin=()=>H;
  negamax=()=>{searchAborted=true;return 0;};
  return aiChooseRaw(WHITE);`);
  assert.deepEqual(r,{x:7,y:7});
});
test('illegal and duplicate VCT defense hints cannot enter the root search',()=>{
  const r=run(rootSetup+`
  vctDefend=()=>[A,A,{x:-1,y:0}];
  const move=aiChooseRaw(WHITE);return {move,visited};`);
  assert.deepEqual(r.move,{x:7,y:8});
  assert.deepEqual(r.visited,[[7,7],[7,8]]);
});
test('VCT timeout cannot leave a previous-call defense restriction',()=>{
  const r=run(rootSetup+`
  vctBreakers=[A];
  vctFindWin=()=>{vctAborted=true;return null;};
  const move=aiChooseRaw(WHITE);return {move,visited};`);
  assert.deepEqual(r.move,{x:7,y:8});
  assert.deepEqual(r.visited,[[7,7],[7,8]]);
});
test('guard cannot veto a quiet move from a false-positive VCT oracle',()=>{
  const r=run(`
  pushStone(7,7,WHITE);zobristInit();hashFromBoard();
  searchDeadline=123;searchAborted=true;qNodes=17;
  const snap=()=>JSON.stringify([board,[...CAND1],[...CAND2],WC.map(t=>[...t]),zh1,zh2]);
  const before=snap();vctA=()=>true;
  const safe=guardSafe(BLACK,{x:7,y:8},100);
  return {safe,restored:before===snap(),deadline:searchDeadline,aborted:searchAborted,nodes:qNodes};`);
  assert.equal(r.safe,true);
  assert.equal(r.restored,true);
  assert.equal(r.deadline,123);
  assert.equal(r.aborted,true);
  assert.equal(r.nodes,17);
});
test('guard still rejects an actual open-four loss and restores state',()=>{
  const r=run(`
  for(let x=5;x<=7;x++)pushStone(x,5,WHITE);
  pushStone(12,12,BLACK);zobristInit();hashFromBoard();
  const snap=()=>JSON.stringify([board,[...CAND1],[...CAND2],WC.map(t=>[...t]),zh1,zh2]);
  const before=snap();const safe=guardSafe(BLACK,{x:0,y:0},100);
  return {safe,restored:before===snap()};`);
  assert.equal(r.safe,false);
  assert.equal(r.restored,true);
});
test('guard timeout fails open without leaking search state',()=>{
  const r=run(`
  pushStone(7,7,WHITE);zobristInit();hashFromBoard();
  searchDeadline=321;searchAborted=false;
  const before=JSON.stringify([board,[...CAND1],[...CAND2],WC.map(t=>[...t]),zh1,zh2]);
  const safe=guardSafe(BLACK,{x:7,y:8},-1);
  return {safe,restored:before===JSON.stringify([board,[...CAND1],[...CAND2],WC.map(t=>[...t]),zh1,zh2]),deadline:searchDeadline,aborted:searchAborted};`);
  assert.equal(r.safe,true);
  assert.equal(r.restored,true);
  assert.equal(r.deadline,321);
  assert.equal(r.aborted,false);
});
test('aiChooseRaw clears stale killer table between searches',()=>{
  const r=run(rootSetup+`
  KILL.fill(42);
  negamax=()=>0;
  aiChooseRaw(WHITE);
  return KILL.every(k=>k===-1);`);
  assert.equal(r,true);
});
test('opening random pool excludes forced losses to avoid picking faster mates',()=>{
  const r=run(rootSetup+`
  negamax=(d,a,b,p,x,y)=>y===7?9004000:9003000;
  return aiChooseRaw(WHITE);`);
  assert.deepEqual(r,{x:7,y:8});
});
test('guardSafe zero-window probe agrees with full-window VCF check',()=>{
  const r=run(`
  for(const [x,y] of [[5,5],[5,6],[5,7],[9,5],[9,6],[9,7]])pushStone(x,y,WHITE);
  pushStone(12,12,BLACK);
  const cands=[{x:0,y:0},{x:5,y:4},{x:5,y:8},{x:9,y:4}];
  return cands.every(mv=>{
    const fast=guardSafe(BLACK,mv,1000);
    pushStone(mv.x,mv.y,BLACK);
    searchDeadline=Infinity;searchAborted=false;
    const full=qNode(WHITE,-Infinity,Infinity,GUARD_DEPTH*2)<8900000;
    pushStone(mv.x,mv.y,EMPTY);
    return fast===full;
  });`);
  assert.equal(r,true);
});
test('splitScore bitmask LUT matches naive 5x5 scan across seeded boards',()=>{
  const r=run(`
  function naiveSplit(x,y,dx,dy,p){
    if(winCount(x,y,dx,dy,p)<2)return 0;
    const op=3-p;let s=0;
    for(let o=-4;o<=0;o++){
      let k=0,mn=5,mx=-5,ok=true;
      for(let t=o;t<o+5;t++){
        const nx=x+dx*t,ny=y+dy*t;
        if(!inB(nx,ny)){ok=false;break;}
        const v=board[nx][ny];
        if(v===op){ok=false;break;}
        if(v===p){k++;if(t<mn)mn=t;if(t>mx)mx=t;}
      }
      if(!ok||k<3||mx-mn+1===k)continue;
      s+=k===4?SPLIT4:SPLIT3;
    }
    return s;
  }
  let seed=20260417,bad=0;
  const rnd=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/2**32;};
  for(let g=0;g<20;g++){
    clearBoard();
    for(let x=0;x<N;x++)for(let y=0;y<N;y++){const v=rnd();if(v<0.22)setCell(x,y,BLACK);else if(v<0.44)setCell(x,y,WHITE);}
    for(let x=0;x<N;x++)for(let y=0;y<N;y++)for(const d of DIRS)for(const p of [BLACK,WHITE]){
      if(splitScore(x,y,d[0],d[1],p)!==naiveSplit(x,y,d[0],d[1],p))bad++;
    }
  }
  return bad;`);
  assert.equal(r,0);
});
console.log(`\n${passed} passed, ${failed} failed`);
process.exitCode=failed?1:0;
