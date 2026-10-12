/* 回归测试：胜负分不得因置换表复用而漂移。
   背景：静止搜索（qNode）返回的胜负分 ±(9000000+qd*10) 不带 negamax 的 depth*1000 约定，
   旧版把它按 depth 归一化写入 TT，取回时分值偏移，导致根节点在多条必输着法间排序错误。
   本测试：同一局面，(A) 干净置换表下算各候选深度 4 分值；(B) 先用深度 5 填满置换表（固定深度，
   不依赖时限，结果确定可复现），再算深度 4。A 与 B 必须逐位相同。
   运行: node tests/tt-mate-regression-test.mjs（在仓库根目录下） */
import {readFileSync,existsSync} from 'fs';
const pageUrl=new URL('../index.html',import.meta.url);
if(!existsSync(pageUrl)){console.error('找不到 index.html（请在仓库根目录下运行）');process.exit(2);}
const html=readFileSync(pageUrl,'utf8');
const src=html.slice(html.indexOf('/*CORE_START*/'),html.indexOf('/*CORE_END*/'));
const api=new Function(src+`
return {N,EMPTY,BLACK,WHITE,isWinRun,aiChoose,orderedMoves,negamax,pushStone,setCell,setMode:(m)=>{mode=m;},setBoard:(b)=>{board=b;syncCand();},setDeadline:(v)=>{searchDeadline=v;searchAborted=false;},zobristInit,hashFromBoard,foulDraft:()=>{ttDraft++;}};`)();
const {N,EMPTY,BLACK,WHITE}=api;
let pass=0,fail=0;
const ck=(label,cond,extra)=>{if(cond)pass++;else{fail++;console.log('FAIL',label,extra||'');}};

/* 来自一局真实对局：白方 expert 在此局面下选了 (6,11)，置换表污染使其分值被错误地抬高 */
const MOVES="B(7,7) W(5,7) B(8,7) W(5,6) B(7,8) W(6,6) B(6,9) W(9,6) B(9,7) W(10,7) B(7,5) W(7,6) B(8,6) W(10,8) B(5,3) W(6,4) B(8,5) W(8,8) B(6,8) W(9,5) B(6,10) W(3,6) B(4,6)";
function setup(){
  api.setBoard(Array.from({length:N},()=>new Array(N).fill(EMPTY)));
  api.zobristInit();
  for(const s of MOVES.split(' ')){const m=s.match(/([BW])\((\d+),(\d+)\)/);api.setCell(+m[2],+m[3],m[1]==='B'?BLACK:WHITE);}
  api.hashFromBoard();api.setDeadline(Infinity);
}
function scan(d){
  const out=[];
  for(const c of api.orderedMoves(WHITE,16)){
    api.pushStone(c.x,c.y,WHITE);
    const v=api.isWinRun(c.x,c.y,WHITE)?9e6:-api.negamax(d-1,-Infinity,Infinity,BLACK,c.x,c.y);
    api.pushStone(c.x,c.y,EMPTY);
    out.push(`${c.x},${c.y}:${v}`);
  }
  return out.join(' ');
}
setup();api.foulDraft();
const A=scan(4);
setup();api.foulDraft();scan(5);   /* 深度 5 填表：写入大量含胜负分的条目 */
setup();                           /* 不递增 draft：复用上一步的表 */
const B=scan(4);
ck('复用置换表后的候选分值与干净表一致',A===B,`\n  clean=${A}\n  reuse=${B}`);
console.log(`${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
