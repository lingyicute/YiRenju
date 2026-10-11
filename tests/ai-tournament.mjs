/* AI 难度擂台：四档交叉对战。运行: node tests/ai-tournament.mjs（自包含，读取 ../index.html 核心）
   走子全部经过出厂 aiChoose 路径（含 VCT/迭代加深/送杀闸门/开局随机），成绩即产品实力；
   代价是慢：hard 1.2s/手、expert 3s/手，每对 GAMES 局（默认 1，可用 GAMES=3 node ... 加样）。
   用途：强度回归基准（报表工具，不做断言把关）；机器越快单局越深，矩阵数值会与历史基线有出入。 */
import {readFileSync,existsSync} from 'fs';
const pageUrl=new URL('../index.html',import.meta.url);
if(!existsSync(pageUrl)){console.error('找不到 index.html（请在仓库根目录下运行）');process.exit(2);}
const html=readFileSync(pageUrl,'utf8');
const src=html.slice(html.indexOf('/*CORE_START*/'),html.indexOf('/*CORE_END*/'));
const api=new Function(src+`
return {N,EMPTY,BLACK,WHITE,isWinRun,winCellsAt,blackLegality,aiChoose,zobristInit,hashFromBoard,syncCand,setCell,getBoard:()=>board,setBoard:(b)=>{board=b;syncCand();},setMode:(m)=>{mode=m;}};`)();
const {N,EMPTY,BLACK,WHITE}=api;
const TIERS=['easy','medium','hard','expert'];
function choose(p,tier){
  api.setMode('ai-'+tier);
  return api.aiChoose(p);
}
function game(tb,tw){
  api.setBoard(Array.from({length:N},()=>new Array(N).fill(EMPTY)));
  api.zobristInit();api.hashFromBoard();
  let p=BLACK,no=0;
  while(no<180){
    const m=choose(p,p===BLACK?tb:tw);
    if(!m)return {w:3-p,no,note:'no-move'};
    if(p===BLACK){const t=api.blackLegality(m.x,m.y);if(t!=='ok'&&t!=='win')return {w:WHITE,no,note:'black-foul:'+t};}
    api.setCell(m.x,m.y,p);no++;
    const wc=api.winCellsAt(m.x,m.y,p);
    if(wc)return {w:p,no,by:wc.length};
    p=3-p;
  }
  return {w:0,no,note:'cap'};
}
const G=Math.max(1,+(process.env.GAMES||1)),mat={};
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
console.log('\n=== 胜率矩阵（白=AItier 视角：白胜-黑胜-平 / 平均手数，GAMES='+G+'）===');
console.log('黑方\\白方   easy        medium      hard        expert');
for(const tb of TIERS){
  const row=TIERS.map(tw=>{const r=mat[tb.slice(0,2)+'v'+tw.slice(0,2)];return `${r.ww}-${r.wb}-${r.d}/${r.plies}`.padEnd(11);}).join(' ');
  console.log(tb.padEnd(10)+' '+row);
}
console.log('\n总耗时 '+((Date.now()-t0)/1000).toFixed(0)+'s');
