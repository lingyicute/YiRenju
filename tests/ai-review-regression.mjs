/* Independent rule/search-state regressions. No dependencies, browser or clocks.
   node tests/ai-review-regression.mjs [path/to/index.html]
   Constructed rule boards are NOT a statistical sample of legal games. */
import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {blank,dirs,oracle} from './helpers/renju-oracle.mjs';
const html=readFileSync(process.argv[2]||new URL('../index.html',import.meta.url),'utf8');
const src=html.slice(html.indexOf('/*CORE_START*/'),html.indexOf('/*CORE_END*/'));
function make(){return new Function('Math',src+`
 return {load(b){board=b.map(r=>r.slice());syncCand();zobristInit();hashFromBoard();},
 blackLegality,orderedMoves,pushStone,setCell,syncCand,hashFromBoard,clearBoard,openThreeDir,
 choose(p,md){mode=md;return aiChoose(p)},
 snap(){return JSON.stringify([board,[...CAND1],[...CAND2],WC.map(t=>[...t]),zh1,zh2,stonesOnBoard()]);},
 search(p,depth,lastX=-1,lastY=-1){searchAborted=false;searchDeadline=Infinity;ttDraft++;
   return negamax(depth,-Infinity,Infinity,p,lastX,lastY);},
 quiet(p){searchAborted=false;searchDeadline=Infinity;return qNode(p,-Infinity,Infinity,0);}};
 `)(Object.assign(Object.create(Math),{random:()=>0}));}
const api=make();let pass=0,fail=0;
function test(name,f){try{f();pass++;console.log('PASS',name);}catch(e){fail++;console.error('FAIL',name,e.message);}}
function boardOf(stones){const b=blank();for(const [x,y,p=1] of stones)b[x][y]=p;return b;}
function check(b,x,y,want){api.load(b);const before=api.snap();const actual=api.blackLegality(x,y);
 b[x][y]=1;const expected=oracle(b,x,y);b[x][y]=0;
 assert.equal(expected,want,'oracle disagrees with fixture');assert.equal(actual,want);assert.ok(api.snap()===before,'temporary move leaked state');}

test('same-line double four forbidden in all four orientations',()=>{
 for(const [dx,dy] of dirs)check(boardOf([-3,-1,1,3].map(o=>[7+o*dx,7+o*dy])),7,7,'44');
});
test('one straight four with two winning endpoints is NOT double four',()=>{
 for(const [dx,dy] of dirs)check(boardOf([-1,1,2].map(o=>[7+o*dx,7+o*dy])),7,7,'ok');
});
test('AI final legality filter cannot return the same-line foul',()=>{
 const b=boardOf([[7,4],[7,6],[7,8],[7,10],[1,1,2],[2,3,2],[3,1,2],[4,3,2]]);
 api.load(b);assert.ok(!api.orderedMoves(1,12).some(m=>m.x===7&&m.y===7));
 for(const md of ['ai-easy','ai-medium']){const m=api.choose(1,md);b[m.x][m.y]=1;
   assert.ok(['ok','win'].includes(oracle(b,m.x,m.y)));b[m.x][m.y]=0;}
});
test('recursive fake-three chain cannot use a fixed one-level cutoff',()=>{
 for(const stones of [
  [[4,4],[5,4],[5,5],[5,6],[6,5],[6,8],[7,9],[8,6]],
  [[7,5],[7,8],[8,8],[8,9],[9,8],[9,11],[10,10],[11,9],[11,10]]
 ]){
  const b=boardOf(stones),stats={max:0,calls:0};b[7][7]=1;
  assert.equal(oracle(b,7,7,stats),'33');assert.ok(stats.max>=3);b[7][7]=0;
  check(b,7,7,'33');
 }
});
test('an extension making five elsewhere does not define a three (RIF 3)',()=>{
 const b=boardOf([[7,6],[7,8],[6,7],[8,7],...[5,9].flatMap(y=>[3,4,5,6].map(x=>[x,y]))]);
 check(b,7,7,'ok');
});
test('VCT three detector does not extend an already existing straight four remotely',()=>{
 for(const p of [1,2]){
  const b=boardOf([5,6,7,8].map(x=>[x,7,p]));api.load(b);const before=api.snap();
  assert.equal(api.openThreeDir(6,7,1,0,p),false);assert.ok(api.snap()===before,'temporary move leaked state');
 }
});
test('full board without five is draw at main and quiescence horizons',()=>{
 const b=blank();for(let x=0;x<15;x++)for(let y=0;y<15;y++)b[x][y]=(x+2*y)%4<2?1:2;
 api.load(b);for(const p of [1,2]){assert.equal(api.quiet(p),0);assert.equal(api.search(p,2),0);}
 // Filling the board must not hide a win on the last move.
 for(let y=0;y<5;y++)b[0][y]=2;api.load(b);assert.ok(api.search(1,2,0,4)<-8900000);
});
test('idempotent/recolour/undo operations preserve candidate, WC and hash state',()=>{
 api.load(blank());api.pushStone(7,7,1);api.pushStone(7,7,1);api.pushStone(7,7,2);
 api.pushStone(0,0,0);api.pushStone(7,7,0);const before=api.snap();
 api.syncCand();api.hashFromBoard();assert.ok(api.snap()===before,'temporary move leaked state');
 api.load(blank());api.pushStone(4,5,1);api.pushStone(8,3,2);api.clearBoard();const cleared=api.snap();
 api.syncCand();api.hashFromBoard();assert.ok(api.snap()===cleared,'clearBoard left stale state');
});
test('all 26,244 one-line ternary patterns agree with independent window oracle',()=>{
 for(const [dx,dy] of dirs)for(let code=0;code<3**8;code++){
  const b=blank();let v=code;for(const o of [-4,-3,-2,-1,1,2,3,4]){b[7+o*dx][7+o*dy]=v%3;v=Math.floor(v/3);}
  api.load(b);const got=api.blackLegality(7,7);b[7][7]=1;const want=oracle(b,7,7);
  assert.equal(got,want,`dir=${dx},${dy} code=${code}`);
 }
});
test('10,000 seeded multi-line boards agree with independent recursive oracle',()=>{
 let seed=7371,bad=0;const examples=[];
 const rnd=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/2**32;};
 for(let k=0;k<10000;k++){
  const b=blank();for(let x=3;x<=11;x++)for(let y=3;y<=11;y++){const r=rnd();b[x][y]=r<.25?1:r<.32?2:0;}b[7][7]=0;
  api.load(b);const before=api.snap(),got=api.blackLegality(7,7);b[7][7]=1;
  const want=oracle(b,7,7);b[7][7]=0;
  assert.equal(api.snap(),before,`state leak at board ${k}`);
  if(got!==want){bad++;if(examples.length<5)examples.push({k,got,want});}
 }
 assert.equal(bad,0,`${bad} disagreements: ${JSON.stringify(examples)}`);
});
console.log(`\n${pass} passed, ${fail} failed`);process.exitCode=fail?1:0;
