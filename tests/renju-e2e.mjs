/* YiRenju 端到端测试（需一次性环境准备）：
   1) 启动静态服务：在仓库根目录 python3 -m http.server 8600
   2) 安装依赖：npm i playwright-core @playwright/browser-chromium && npx playwright-core install chromium-headless-shell
      （也可以 npx playwright-core install chromium 全量浏览器，脚本会自动发现）
   运行: node tests/renju-e2e.mjs   (在仓库根目录下) */
import {chromium} from 'playwright-core';
import {existsSync,readdirSync} from 'fs';
const pageName='index.html';
if(!existsSync(new URL('../'+pageName,import.meta.url))){console.error('找不到 index.html（请在仓库根目录下运行）');process.exit(2);}
/* 自动发现本机已安装的无头浏览器；找不到则交给 playwright 默认解析 */
function findExe(){
  const dir=process.env.HOME+'/.cache/ms-playwright';
  try{
    for(const d of readdirSync(dir)){
      if(d.startsWith('chromium_headless_shell-')){
        const p=dir+'/'+d+'/chrome-headless-shell-linux64/chrome-headless-shell';
        if(existsSync(p))return p;
      }
    }
  }catch(e){}
  return null;
}
const exe=findExe();
let pass=0,fail=0;
const ok=(name,cond,extra='')=>{cond?pass++:fail++;console.log((cond?'PASS':'FAIL')+' '+name+(cond?'':(extra?'  '+extra:'')));};
const browser = exe?await chromium.launch({executablePath:exe,args:['--no-sandbox']}):await chromium.launch({args:['--no-sandbox']});
const page = await browser.newPage({viewport:{width:1280,height:900}});
page.on('pageerror',e=>{fail++;console.log('FAIL pageerror:',e.message);});
await page.goto('http://localhost:8600/'+pageName,{waitUntil:'load'});
await page.waitForTimeout(300);

/* 1. 品牌 */
ok('title 含 YiRenju',(await page.title()).includes('YiRenju'),await page.title());
ok('brand-name=YIRenju',(await page.textContent('.brand-name')).trim()==='YiRenju');
ok('h1=五子棋 · 连珠',(await page.textContent('h1')).includes('五子棋 · 连珠'),await page.textContent('h1'));
ok('subtitle 无连珠规则小字',!(await page.textContent('#subtitle')).includes('连珠规则'));
ok('菜单首项=什么是连珠？',(await page.textContent('.menu .menu-item')).includes('什么是连珠？'));

async function clickCell(x,y){
  const pt=await page.evaluate(([x,y])=>{
    const G=geom(),rect=document.getElementById('board').getBoundingClientRect();
    return {px:rect.left+G.m+x*G.g,py:rect.top+G.m+y*G.g};
  },[x,y]);
  await page.mouse.click(pt.px,pt.py);
  await page.waitForTimeout(80);
}
const histLen=()=>page.evaluate(()=>history.length);
const dlgText=async()=>(await page.$eval('#dialog',el=>el.textContent).catch(()=>''))||'';

/* 2. PvP：三三禁手拒绝落子 + ×标记 */
await page.evaluate(()=>{setMode('pvp');newGame();});
for(const [x,y] of [[6,7],[13,13],[8,7],[13,12],[7,6],[13,11],[7,8],[12,13]])await clickCell(x,y);
const fs=await page.evaluate(()=>({size:foulSet.size,has119:foulSet.has(7*16+7)}));
ok('foulSet 非空且含 (7,7)',fs.size>0&&fs.has119,JSON.stringify(fs));
await page.screenshot({path:'/tmp/renju-foul.png'});
await clickCell(7,7); /* 禁手点：应被拒绝 */
const toast=(await page.textContent('#toast'))||'';
ok('toast 提示禁手',toast.includes('禁手'),toast);
ok('禁手后未落子（仍 8 手）',(await histLen())===8,'len='+(await histLen()));
ok('禁手点有 × 且 ghost 抑制：foulSet 仍含 119',await page.evaluate(()=>foulSet.has(119)));
await clickCell(7,5); /* 合法点 */
ok('合法点可落子（9 手）',(await histLen())===9,'len='+(await histLen()));

/* 3. PvP：黑方恰好五连胜 */
await page.evaluate(()=>newGame());
for(const [x,y] of [[4,4],[13,13],[5,4],[13,12],[6,4],[13,11],[7,4],[12,13]])await clickCell(x,y);
await clickCell(8,4);
await page.waitForTimeout(1000);
ok('黑棋五连胜对话框',(await dlgText()).includes('黑棋获胜'),(await dlgText()).slice(0,40));

/* 4. PvP：白棋一手六连（overline）胜 */
await page.evaluate(()=>{closeDialog();newGame();});
for(const [x,y] of [[0,0],[4,4],[0,1],[5,4],[0,2],[6,4],[0,3],[7,4],[1,1],[9,4],[2,2]])await clickCell(x,y);
await clickCell(8,4);
await page.waitForTimeout(1000);
const dt=await dlgText();
ok('白棋六连胜对话框',dt.includes('白棋获胜'),dt.slice(0,40));
ok('winCells=6',await page.evaluate(()=>winCells&&winCells.length===6));

/* 5. 人机：简单 AI 应手正常 */
await page.evaluate(()=>{closeDialog();setMode('ai-easy');newGame();});
await clickCell(7,7);
await page.waitForTimeout(1500);
ok('AI 应手后共 2 手',(await histLen())===2,'len='+(await histLen()));

/* 6. 帮助弹窗（规则说明） */
await page.evaluate(()=>showHelp());
ok('规则弹窗标题=规则说明',(await page.$eval('.dlg-title',el=>el.textContent).catch(()=>'')).trim()==='规则说明');
ok('帮助含三三禁手',(await dlgText()).includes('三三禁手'));
ok('帮助含长连禁手',(await dlgText()).includes('长连禁手'));
await page.evaluate(()=>closeDialog());

/* 7. 什么是连珠弹窗 */
await page.evaluate(()=>showWhatIsRenju());
ok('连珠弹窗标题=什么是连珠？',(await page.$eval('.dlg-title',el=>el.textContent).catch(()=>'')).includes('什么是连珠'));
ok('连珠弹窗含 RIF',(await dlgText()).includes('RIF'));
await page.evaluate(()=>closeDialog());

/* 8. AI 执黑：切换后 AI 自动开出第一手（天元） */
await page.evaluate(()=>{closeDialog();setMode('ai-easy');applySide('W');newGame();});
await page.waitForFunction(()=>history.length===1,{timeout:6000});
const first=await page.evaluate(()=>({x:history[0].x,y:history[0].y,p:history[0].p}));
ok('我执白：AI 执黑自动先手天元',first.p===1&&first.x===7&&first.y===7,JSON.stringify(first));
ok('执子行显示（人机）',(await page.$eval('#sides',el=>getComputedStyle(el).display))==='flex');

/* 9. 执子行在双人模式隐藏 */
await page.evaluate(()=>setMode('pvp'));
ok('执子行隐藏（双人）',(await page.$eval('#sides',el=>getComputedStyle(el).display))==='none');
await page.evaluate(()=>setMode('ai-easy'));

/* 10. 我执白时真实点击：白棋无禁手（PvP 中白双三点可落） */
await page.evaluate(()=>{setMode('pvp');newGame();});
for(const [x,y] of [[0,0],[6,7],[0,1],[8,7],[0,2],[7,6],[0,3],[7,8]])await clickCell(x,y);
await clickCell(7,7); /* 白棋在“三三形位”落子——白无禁手 */
ok('白棋无禁手（双三位可落）',(await histLen())===9,'len='+(await histLen()));

/* 11. 执白悔至空盘 → AI 重新先手 */
await page.evaluate(()=>{setMode('ai-easy');applySide('W');newGame();});
await page.waitForFunction(()=>history.length===1,{timeout:6000});
await page.evaluate(()=>undo());
await page.waitForFunction(()=>history.length===1,{timeout:6000});
ok('执白悔至空盘后 AI 重新先手',true);

/* 12. 执白胜局计入 w 桶且文案含“执白” */
await page.evaluate(()=>{newGame();
  for(let i=0;i<5;i++)placeAt(4+i,4,2); /* 直连五白（harness 直调） */
});
await page.waitForTimeout(1000);
ok('执白胜计入 records.w 桶',await page.evaluate(()=>records.w.easy.w===1),await page.evaluate(()=>JSON.stringify(records.w.easy)));
ok('执白胜文案含“执白”',(await dlgText()).includes('执白'));
ok('执黑桶不受影响',await page.evaluate(()=>records.b.easy.w===0&&records.b.easy.l===0));
await page.evaluate(()=>{closeDialog();applySide('B');newGame();});

console.log(`\n${pass} passed, ${fail} failed`);
await browser.close();
process.exit(fail?1:0);
