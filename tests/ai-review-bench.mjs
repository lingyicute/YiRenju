/* Reproducible diagnostic, NOT an Elo benchmark.
   node tests/ai-review-bench.mjs old.html new.html [--match]
   Default: fixed-depth search and VCT move-generation timings (median of 5).
   --match: four colour-paired games using actual ai-hard budgets, seeded RNG;
   all black moves adjudicated by the independent oracle. No learning/tuning. */
import {readFileSync} from 'node:fs';
import {performance} from 'node:perf_hooks';
import {blank,dirs,oracle} from './helpers/renju-oracle.mjs';
const paths=process.argv.slice(2,4);
if(paths.length!==2){console.error('Usage: node tests/ai-review-bench.mjs old.html new.html [--match]');process.exit(2);}
function make(path){
 const html=readFileSync(path,'utf8'),src=html.slice(html.indexOf('/*CORE_START*/'),html.indexOf('/*CORE_END*/'));
 let seed=1;const math=Object.assign(Object.create(Math),{random:()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/2**32;}});
 return new Function('Math',src+`
 let visits=0;const originalSearch=negamax;
 negamax=(...args)=>{visits++;return originalSearch(...args);};
 return {load(b,reset=true){board=b.map(r=>r.slice());syncCand();zobristInit();hashFromBoard();
  if(reset){TT.fill(null);KILL.fill(-1);ttDraft++;}searchDeadline=Infinity;searchAborted=false;searchPly=0;qNodes=0;visits=0;},
 fixed(p){const score=negamax(4,-Infinity,Infinity,p,-1,-1);return {score,nodes:visits,qnodes:qNodes};},
 threes(p){return threeMovesVCT(p,6);},choose(p){mode='ai-hard';return aiChoose(p);}};
 `)(math);
}
const engines=paths.map(make);
const fixtures=[
 [[7,7,1],[7,8,2],[8,8,1],[6,6,2]],
 [[7,7,1],[8,7,2],[6,6,1],[7,6,2],[9,8,1],[8,8,2],[6,8,1],[5,7,2],[9,6,1],[10,9,2]],
 [[7,7,1],[5,7,2],[8,7,1],[5,6,2],[7,8,1],[6,6,2],[6,9,1],[9,6,2],[9,7,1],[10,7,2],[7,5,1],[7,6,2],[8,6,1],[10,8,2],[5,3,1],[6,4,2],[8,5,1],[8,8,2],[6,8,1],[9,5,2],[6,10,1],[3,6,2],[4,6,1]],
 [[2,3,2],[3,3,2],[5,3,2],[4,5,2],[4,6,2],[1,3,1]]
];
function boardOf(s){const b=blank();for(const [x,y,p] of s)b[x][y]=p;return b;}
const median=a=>a.slice().sort((a,b)=>a-b)[a.length>>1];
function won(b,x,y,p){return dirs.some(([dx,dy])=>{let n=1;for(const s of [-1,1])for(let k=1;k<15;k++){
 const u=x+s*k*dx,v=y+s*k*dy;if(u<0||u>=15||v<0||v>=15||b[u][v]!==p)break;n++;
 }return p===1?n===5:n>=5;});}
if(process.argv.includes('--match')){
 const openings=[fixtures[0],[[7,7,1],[8,7,2],[6,8,1],[8,6,2]]];
 const games=[];
 for(let o=0;o<openings.length;o++)for(let swap=0;swap<2;swap++){
  // Fresh seeds/engines per game; swap only engine colours, not the opening.
  const pair=paths.map(make),b=boardOf(openings[o]),hist=openings[o].map(m=>m.slice()),times=[[],[]];
  let p=1,result=null;
  while(hist.length<120){
   const which=p===1?swap:1-swap,e=pair[which];e.load(b,false);
   const t=performance.now(),m=e.choose(p);times[which].push(performance.now()-t);
   if(!m||!b[m.x]||b[m.x][m.y]!==0){result={winner:1-which,reason:'no/invalid move'};break;}
   b[m.x][m.y]=p;hist.push([m.x,m.y,p]);
   if(p===1){const rule=oracle(b,m.x,m.y);if(rule!=='ok'&&rule!=='win'){result={winner:1-which,reason:'black foul '+rule};break;}}
   if(won(b,m.x,m.y,p)){result={winner:which,reason:'five'};break;}
   if(hist.length===225){result={winner:null,reason:'draw'};break;}p=3-p;
  }
  result??={winner:null,reason:'120-ply cap, not adjudicated draw'};
  const g={opening:o,patchedColour:swap===1?'black':'white',...result,plies:hist.length,
   meanMs:times.map(a=>Math.round(a.reduce((a,b)=>a+b,0)/a.length)),maxMs:times.map(a=>Math.round(Math.max(...a))),moves:hist};
  games.push(g);console.error(JSON.stringify({...g,moves:undefined}));
 }
 console.log(JSON.stringify({node:process.version,paths,games},null,2));
}else{
 const results=[];
 for(let f=0;f<fixtures.length;f++){
  const b=boardOf(fixtures[f]),p=f===2||f===3?2:1;
  const times=[[],[]],micro=[[],[]],values=[null,null];
  // Warm-up, then alternate order to reduce bias.
  for(let r=-1;r<5;r++)for(const i of (r%2?[1,0]:[0,1])){
   const e=engines[i];e.load(b);const t=performance.now();values[i]=e.fixed(p);const ms=performance.now()-t;
   e.load(b);const v=performance.now();for(let k=0;k<100;k++)e.threes(p);const vm=performance.now()-v;
   if(r>=0){times[i].push(ms);micro[i].push(vm);}
  }
  results.push({fixture:f,side:p,old:{...values[0],medianMs:median(times[0]),vct100Ms:median(micro[0])},
   patched:{...values[1],medianMs:median(times[1]),vct100Ms:median(micro[1])}});
 }
 console.log(JSON.stringify({node:process.version,paths,depth:4,repeats:5,results},null,2));
}
