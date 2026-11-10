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
  /* 官方 Playwright 容器把浏览器预装在 /ms-playwright，并通过
     PLAYWRIGHT_BROWSERS_PATH 暴露；本地开发则缓存在 ~/.cache/ms-playwright。 */
  const dirs=[process.env.PLAYWRIGHT_BROWSERS_PATH,
              process.env.HOME+'/.cache/ms-playwright'].filter(Boolean);
  for(const dir of dirs){
    try{
      for(const d of readdirSync(dir)){
        if(d.startsWith('chromium_headless_shell-')){
          const p=dir+'/'+d+'/chrome-headless-shell-linux64/chrome-headless-shell';
          if(existsSync(p))return p;
        }
      }
    }catch(e){}
  }
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
ok('菜单首项=什么是连珠？',(await page.textContent('.menu .menu-item')).includes('什么是连珠'));
/* 音效开关：默认开、点击切换、状态持久化、图标联动 */
ok('音效菜单项默认开',(await page.textContent('#soundText')).includes('开'),await page.textContent('#soundText'));
await page.evaluate(()=>document.querySelector('[data-act="sound"]').click());
ok('音效切到关',(await page.textContent('#soundText')).includes('关'));
ok('音效图标联动(关显示×版)',await page.evaluate(()=>document.getElementById('icSoundOff').style.display!=='none'&&document.getElementById('icSoundOn').style.display==='none'));
ok('音效状态持久化到 settings',await page.evaluate(()=>JSON.parse(localStorage.getItem('yirenju.settings')).sound===false));
await page.evaluate(()=>document.querySelector('[data-act="sound"]').click());
ok('音效切回开',(await page.textContent('#soundText')).includes('开'));

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

/* 控件获得焦点时保留 Space 的原生激活；游戏快捷键仅在棋盘/页面焦点时接管。 */
await page.evaluate(()=>{setMode('pvp');newGame();placeAt(7,7,turn);placeAt(8,8,turn);});
await page.locator('#btnUndo').focus();
await page.keyboard.press('Space');
await page.waitForTimeout(80);
ok('Space 在悔棋按钮上触发原生悔棋',(await histLen())===1,'len='+(await histLen()));
await page.evaluate(()=>newGame());
await page.locator('#btnMenu').click();
await page.locator('.menu-item[data-act="help"]').focus();
await page.keyboard.press('Space');
await page.waitForTimeout(80);
ok('Space 在菜单项上打开规则对话框而不落子',(await histLen())===0&&(await dlgText()).includes('规则说明'));
await page.keyboard.press('Escape');
await page.evaluate(()=>{closeDialog();setMenuOpen(false);cursor={x:7,y:7};kbdCursor=false;newGame();});
await page.locator('#board').focus();
await page.keyboard.press('ArrowRight');
ok('棋盘可聚焦且方向键移动光标',await page.evaluate(()=>cursor.x===8&&cursor.y===7&&kbdCursor));
await page.evaluate(()=>{setMode('ai-easy');newGame();});

/* P0 回归：执白 + 存档停在人类回合时刷新页面，恢复后不得冻结（aiThinking 不得卡死） */
await page.evaluate(()=>{
  history.length=0; /* 阻止 visibilitychange/beforeunload 在 reload 时用内存对局覆盖刚写入的存档 */
  localStorage.setItem('yirenju.settings',JSON.stringify({side:'W',mode:'ai-easy'}));
  localStorage.setItem('yirenju.session',JSON.stringify({mode:'ai-easy',over:false,side:'W',elapsed:0,
    moves:[{x:7,y:7},{x:8,y:8},{x:7,y:9}]}));
});
await page.reload();await page.waitForTimeout(250);
ok('P0 恢复后不残留卡死思考态',await page.evaluate(()=>aiThinking===false&&history.length===3&&turn===2),
  'st='+await page.evaluate(()=>({a:aiThinking,h:history.length,t:turn})));
await clickCell(10,10);await page.waitForTimeout(120);
ok('P0 恢复后点击落子不被吞',(await histLen())>=4,'len='+(await histLen()));

/* P1 回归：畸形存档必须整档作废并可用（越界坐标 / 重复落点两种） */
for(const bad of [[{x:99,y:-3}],[{x:5,y:5},{x:5,y:5}]]){
  await page.evaluate(b=>{
    history.length=0; /* 同上：否则 reload 触发的 saveSession 会把内存对局（含 side）回写覆盖 */
    localStorage.setItem('yirenju.settings',JSON.stringify({side:'B',mode:'pvp'}));
    localStorage.setItem('yirenju.session',JSON.stringify({mode:'pvp',over:false,moves:b}));
  },bad);
  await page.reload();await page.waitForTimeout(250);
  ok('P1 畸形存档后页面可用 '+JSON.stringify(bad[0]),await page.evaluate(()=>{
    setMode('pvp');newGame();placeAt(7,7,turn);return history.length===1;
  }));
}
await page.evaluate(()=>{history.length=0;localStorage.clear();}); /* 先断回写源再清，否则清了也白清 */
await page.reload();await page.waitForTimeout(250);
await page.evaluate(()=>{setMode('ai-easy');newGame();});

/* 1.5 无障碍状态播报（canvas 无原生语义，靠 aria-live 区域逐手播报） */
ok('存在 role=status 的 aria-live 区域',await page.evaluate(()=>{
  const e=document.getElementById('a11yStatus');
  return !!e&&e.getAttribute('role')==='status'&&e.getAttribute('aria-live')==='polite'&&e.classList.contains('sr-only');
}));
ok('canvas 有 aria-describedby',await page.evaluate(()=>{
  const c=document.getElementById('board'),d=document.getElementById(c.getAttribute('aria-describedby'));
  return !!d&&d.textContent.includes('禁手');
}));
await page.evaluate(()=>{setMode('pvp');newGame();});
await page.waitForTimeout(100);
ok('新局有语音播报',((await page.$eval('#a11yStatus',e=>e.textContent))||'').includes('新的一局'));
await clickCell(7,7);await page.waitForTimeout(120);
const ann=await page.$eval('#a11yStatus',e=>e.textContent);
ok('落子播报含坐标 H8 与手数',ann.includes('H8')&&ann.includes('第 1 手'),ann);
await page.locator('#btnUndo').click();await page.waitForTimeout(120);
ok('悔棋有语音播报',((await page.$eval('#a11yStatus',e=>e.textContent))||'').includes('悔棋'));

/* 1.6 光标 / 坐标 / 合并播报（等 live 区文本，避免和 announce 的 30ms 定时器抢跑） */
const waitAnn=t=>page.waitForFunction(
  x=>document.getElementById('a11yStatus').textContent.includes(x),t,{timeout:3000});
await page.evaluate(()=>{setMode('pvp');newGame();});
await page.locator('#board').focus();
await page.evaluate(()=>{cursor={x:7,y:7};kbdCursor=false;});
await page.keyboard.press('ArrowRight');
await waitAnn('光标');
ok('方向键移动光标有播报',(await page.$eval('#a11yStatus',e=>e.textContent)).includes('光标 J8'));
ok('列字母跳过 I',await page.evaluate(()=>{
  const o=[];for(let x=0;x<15;x++)o.push(coordLabel(x,0)[0]);return o.join('')==='ABCDEFGHJKLMNOP';
}));
await page.evaluate(()=>{setMode('pvp');newGame();placeAt(0,14,turn);});
await waitAnn('A1');
ok('左下角播报 A1（行号自底部起算）',(await page.$eval('#a11yStatus',e=>e.textContent)).includes('A1'));
await page.evaluate(()=>placeAt(14,0,turn));
await waitAnn('P15');
ok('右上角播报 P15',(await page.$eval('#a11yStatus',e=>e.textContent)).includes('P15'));
ok('同批播报合并而非丢弃（新局+落子都保留）',await page.evaluate(async()=>{
  setMode('pvp');newGame();placeAt(7,7,1);
  await new Promise(r=>setTimeout(r,150));
  const t=document.getElementById('a11yStatus').textContent;
  return t.includes('新的一局开始')&&t.includes('H8');
}));
/* 恢复存档：回放不走 placeAt，必须单独播报真实局面 */
await page.evaluate(()=>{
  history.length=0;
  localStorage.setItem('yirenju.settings',JSON.stringify({side:'B',mode:'pvp'}));
  localStorage.setItem('yirenju.session',JSON.stringify({mode:'pvp',over:false,elapsed:7,
    moves:[{x:7,y:7},{x:8,y:8},{x:6,y:6}]}));
});
await page.reload({waitUntil:'load'});await page.waitForTimeout(250);
await waitAnn('已恢复对局');
ok('恢复存档播报真实局面',(await page.$eval('#a11yStatus',e=>e.textContent)).includes('已恢复对局，共 3 手'));
/* 光标落在禁手点要有禁手提示（复用第 2 段的禁手局面） */

/* 2. PvP：三三禁手拒绝落子 + ×标记 */
await page.evaluate(()=>{setMode('pvp');newGame();});
for(const [x,y] of [[6,7],[13,13],[8,7],[13,12],[7,6],[13,11],[7,8],[12,13]])await clickCell(x,y);
const fs=await page.evaluate(()=>({size:foulSet.size,has119:foulSet.has(7*16+7)}));
ok('foulSet 非空且含 (7,7)',fs.size>0&&fs.has119,JSON.stringify(fs));
await page.screenshot({path:'/tmp/renju-foul.png'});
await clickCell(7,7); /* 禁手点：应被拒绝 */
const toast=(await page.textContent('#toast'))||'';
ok('toast 提示禁手',toast.includes('禁手'),toast);
ok('禁手也通过 aria-live 播报',((await page.$eval('#a11yStatus',e=>e.textContent))||'').includes('禁手'));
await page.evaluate(()=>{cursor={x:7,y:7};kbdCursor=true;announceCursor();});
await waitAnn('光标');
const cursorAnn=await page.$eval('#a11yStatus',e=>e.textContent);
ok('光标停在禁手点会提示禁手',cursorAnn.includes('光标 H8')&&cursorAnn.includes('三三禁手'),cursorAnn);
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
ok('长连胜播报含「长连」',((await page.$eval('#a11yStatus',e=>e.textContent))||'').includes('连成五子或长连'));
ok('winCells=6',await page.evaluate(()=>winCells&&winCells.length===6));

/* 5. 人机：简单 AI 应手正常 */
await page.evaluate(()=>{closeDialog();setMode('ai-easy');newGame();});
await clickCell(7,7);
await page.waitForTimeout(1500);
ok('AI 应手后共 2 手',(await histLen())===2,'len='+(await histLen()));
ok('AI 落子也有播报',await page.evaluate(async()=>{
  await new Promise(r=>setTimeout(r,150));
  const t=document.getElementById('a11yStatus').textContent;
  return t.includes('第 2 手')&&t.includes('轮到黑棋');
}));
ok('AI Worker 已挂载自举',await page.evaluate(()=>typeof aiWorker==='object'&&aiWorker!==null));

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
/* 13. 平局不计入负场、Ctrl+R 不误触重开、750ms 内重开不弹旧终局窗、配色弹窗聚焦与归还焦点 */
ok('平局不计入战绩负场',await page.evaluate(()=>{
  setMode('ai-easy');applySide('B');newGame();
  const l0=records.b.easy.l;
  over=true;winner=0;onGameEnd(0);
  const okDraw=records.b.easy.l===l0;
  newGame();
  return okDraw;
}));
await page.evaluate(()=>{setMode('pvp');newGame();placeAt(7,7,turn);});
await page.keyboard.press('Control+r');
ok('Ctrl+R 不误触重开清空棋局',(await histLen())===1);
ok('终局后 750ms 内重开不会弹出过期结算窗',await page.evaluate(async()=>{
  setMode('pvp');newGame();
  for(let i=0;i<5;i++)placeAt(3+i,3,1);
  newGame();
  await new Promise(r=>setTimeout(r,820));
  return !dialogOpenFlag&&scrim.hidden===true;
}));
ok('配色弹窗自动聚焦当前色块且关闭后归还焦点至棋盘',await page.evaluate(async()=>{
  applyAccent('green');showPalette();   /* 选非首个色块：焦点若落到第一个按钮（紫色）即为回归 */
  await new Promise(r=>setTimeout(r,60));
  const focusedInDlg=document.activeElement&&document.activeElement.dataset.accent==='green';
  closeDialog();applyAccent('purple');
  return focusedInDlg&&document.activeElement===document.getElementById('board');
}));
ok('新弹窗从顶部开始，不沿用上一个弹窗的滚动位置',await page.evaluate(async()=>{
  dialog.style.maxHeight='160px';      /* 桌面视口下内容放得下，压低高度上限以制造滚动 */
  showHelp();dialog.scrollTop=9999;
  const scrolled=dialog.scrollTop>0;
  closeDialog();
  await new Promise(r=>setTimeout(r,50));
  showWhatIsRenju();
  const top=dialog.scrollTop;
  closeDialog();dialog.style.maxHeight='';
  return scrolled&&top===0;
}));
ok('theme-color 跟随手动切换的主题与配色，并与页面背景同色',await page.evaluate(()=>{
  const metas=[...document.querySelectorAll('meta[name="theme-color"]')];
  /* body 的背景带 .3s 过渡，另挂一个不带过渡的探针读 --bg 的最终值（计算值可能是 rgb() 或 color(srgb …)） */
  const probe=document.body.appendChild(document.createElement('i'));
  probe.style.cssText='background:var(--bg);transition:none';
  const synced=()=>{
    const s=getComputedStyle(probe).backgroundColor,v=s.match(/[\d.]+/g).slice(0,3).map(Number);
    const bg=s.startsWith('color(')?v.map(n=>n*255):v;
    return metas.length===2&&metas.every(m=>hex2rgb(m.content).every((c,i)=>Math.abs(c-bg[i])<=1));
  };
  applyTheme('light');applyAccent('green');
  const light=synced();
  applyTheme('dark');applyAccent('purple');
  const dark=synced();
  probe.remove();
  return light&&dark;
}));
ok('菜单按钮的 aria-expanded 随开合同步',await page.evaluate(()=>{
  const b=document.getElementById('btnMenu'),st=()=>b.getAttribute('aria-expanded')+'/'+menu.classList.contains('open');
  const seq=[st()];
  b.click();seq.push(st());                 /* 展开 */
  document.body.click();seq.push(st());     /* 点菜单外收起 */
  b.click();document.querySelector('.menu-item[data-act="help"]').click();seq.push(st());   /* 选中菜单项收起 */
  closeDialog();
  return seq.join(' ')==='false/false true/true false/false false/false';
}));
/* 菜单展开时点在棋盘上的那一下只负责收起菜单 */
await page.evaluate(()=>{closeDialog();setMode('pvp');newGame();});
await page.locator('#btnMenu').click();
await clickCell(3,12);
ok('菜单展开时点击棋盘只收起菜单、不落子',(await histLen())===0&&await page.evaluate(()=>!menu.classList.contains('open')),'len='+(await histLen()));
await clickCell(3,12);
ok('菜单收起后同一点可正常落子',(await histLen())===1,'len='+(await histLen()));
ok('战绩弹窗不渲染被改坏的存储条目',await page.evaluate(()=>{
  const keep=records.b.easy;
  records.b.easy={w:'<i id="recXss">9</i>',l:1};
  showRecords();
  const clean=!document.getElementById('recXss')&&!dialog.textContent.includes('NaN');
  closeDialog();records.b.easy=keep;
  return clean;
}));
ok('聚焦主按钮不会把超出一屏的弹窗滚到底部',await page.evaluate(async()=>{
  dialog.style.maxHeight='160px';
  showHelp();
  await new Promise(r=>setTimeout(r,80));    /* 等 30ms 的延迟聚焦生效 */
  const top=dialog.scrollTop,focused=!!document.activeElement&&document.activeElement.dataset.cmd==='ok';
  closeDialog();dialog.style.maxHeight='';
  return focused&&top===0;
}));
/* 横屏手机（宽度不到两栏断点、高度很小）：棋盘必须能整盘放进一屏 */
await page.setViewportSize({width:740,height:360});
await page.waitForTimeout(250);
{
  const h=await page.evaluate(()=>document.getElementById('board').getBoundingClientRect().height);
  ok('横屏窄视口下棋盘不高于视口',h>=240&&h<=360,'h='+h);
}
await page.setViewportSize({width:1280,height:900});
await page.waitForTimeout(250);

/* 14. 仅主键落子；长按 Z / R 不连发 */
await page.evaluate(()=>{closeDialog();setMode('pvp');newGame();});
{
  const pt=await page.evaluate(()=>{const G=geom(),r=document.getElementById('board').getBoundingClientRect();
    return {px:r.left+G.m+7*G.g,py:r.top+G.m+7*G.g};});
  await page.mouse.click(pt.px,pt.py,{button:'right'});
  await page.mouse.click(pt.px,pt.py,{button:'middle'});
  await page.waitForTimeout(80);
  ok('右键/中键不落子',(await histLen())===0,'len='+(await histLen()));
  await page.mouse.click(pt.px,pt.py);
  ok('左键仍可落子',(await histLen())===1);
}
await page.evaluate(()=>{newGame();placeAt(7,7,turn);placeAt(8,8,turn);placeAt(9,9,turn);});
await page.locator('#board').focus();
await page.keyboard.down('z');await page.keyboard.down('z');await page.keyboard.down('z');await page.keyboard.up('z');
ok('长按 Z 只悔一手',(await histLen())===2,'len='+(await histLen()));
await page.keyboard.down('r');await page.keyboard.down('r');await page.keyboard.up('r');
ok('长按 R 只重开一次',(await histLen())===0&&await page.evaluate(()=>!over));

/* 15. 悔棋后必须轮到玩家 */
ok('人机：玩家制胜后悔棋只撤自己那手并回到玩家回合',await page.evaluate(()=>{
  setMode('ai-easy');applySide('B');newGame(true);
  const seq=[[3,3],[3,10],[4,3],[4,10],[5,3],[5,10],[6,3],[6,10],[7,3]];
  seq.forEach((m,i)=>placeAt(m[0],m[1],i%2?WHITE:BLACK));
  const wasOver=over&&winner===BLACK;
  undo();
  return wasOver&&!over&&history.length===8&&turn===BLACK&&!aiThinking;
}));
ok('人机：AI 获胜后悔棋撤两手并回到玩家回合',await page.evaluate(()=>{
  newGame(true);
  const seq=[[0,0],[3,10],[0,2],[4,10],[0,4],[5,10],[0,6],[6,10],[0,8],[7,10]];
  seq.forEach((m,i)=>placeAt(m[0],m[1],i%2?WHITE:BLACK));
  const wasOver=over&&winner===WHITE;
  undo();
  return wasOver&&!over&&history.length===8&&turn===BLACK&&!aiThinking;
}));
await page.evaluate(()=>{newGame(true);});

/* 16. AI 线程健壮性：过期回调不覆盖新思考态、重开换新 Worker、Worker 报错回退主线程 */
await page.evaluate(()=>{closeDialog();setMode('ai-easy');applySide('W');});
ok('主线程回退：重开后旧回调到点不清掉新一局的思考态',await page.evaluate(async()=>{
  dropWorker();
  const rnd=Math.random;
  Math.random=()=>0;newGame();          /* 旧回调约 420ms 触发 */
  Math.random=()=>0.99;newGame();       /* 新回调约 720ms 触发 */
  Math.random=rnd;
  await new Promise(r=>setTimeout(r,550));
  const still=aiThinking===true&&history.length===0;
  await new Promise(r=>setTimeout(r,500));
  initAiWorker();
  return still&&history.length===1&&!aiThinking;
}));
ok('思考中重开会换新的 Worker',await page.evaluate(()=>{
  newGame(true);
  const w0=aiWorker;newGame();           /* AI 先手：进入思考 */
  const thinking=aiThinking;newGame();   /* 思考中再次重开 */
  return !!w0&&thinking&&aiWorker!==null&&aiWorker!==w0;
}));
await page.waitForFunction(()=>history.length===1&&!aiThinking,{timeout:6000});
ok('换 Worker 后 AI 仍能正常开局',true);
await page.evaluate(()=>{newGame();});
ok('Worker 报错：思考态不卡死，改由主线程落子',await page.evaluate(async()=>{
  const thinking=aiThinking,w=aiWorker;
  w.onerror({preventDefault(){}});
  const dropped=aiWorker===null;
  await new Promise(r=>setTimeout(r,1200));
  const done=history.length===1&&!aiThinking;
  initAiWorker();
  return thinking&&dropped&&done;
}));
await page.evaluate(()=>{applySide('B');newGame(true);});
ok('Worker 构造失败会撤销 Blob URL',await page.evaluate(()=>{
  dropWorker();
  const NativeWorker=window.Worker,create=URL.createObjectURL,revoke=URL.revokeObjectURL;
  let url='',revoked='';
  URL.createObjectURL=b=>{url=create.call(URL,b);return url;};
  URL.revokeObjectURL=u=>{revoked=u;revoke.call(URL,u);};
  window.Worker=function(){throw new Error('blocked');};
  try{initAiWorker();}finally{
    window.Worker=NativeWorker;URL.createObjectURL=create;URL.revokeObjectURL=revoke;
  }
  const cleaned=!!url&&revoked===url&&aiWorker===null&&aiWorkerUrl===null;
  if(url&&revoked!==url)revoke.call(URL,url); /* 旧实现也让测试自身不留泄漏 */
  initAiWorker();
  return cleaned;
}));

/* 17. 计时按墙钟推算：定时器被节流/暂停时不少算时间 */
ok('计时按墙钟推算且存档用时为真实值',await page.evaluate(async()=>{
  setMode('pvp');newGame(true);placeAt(7,7,turn);
  const real=Date.now;
  Date.now=()=>real()+90000;             /* 模拟 90 秒内没有任何 tick */
  await new Promise(r=>setTimeout(r,400));
  const shown=document.getElementById('timer').textContent;
  saveSession();
  const saved=JSON.parse(localStorage.getItem('yirenju.session')).elapsed;
  Date.now=real;
  return shown==='01:30'&&saved>=90&&saved<93;
}));
ok('悔至空盘后用时归零，新落子不继承旧计时',await page.evaluate(()=>{
  setMode('pvp');newGame(true);placeAt(7,7,turn);
  timerLast-=91000;           /* 模拟停在第一手 91 秒后悔棋，无需真的等待 */
  undo();
  const reset=history.length===0&&!timerRunning&&elapsed===0&&timerFrac===0
    &&document.getElementById('timer').textContent==='00:00';
  placeAt(7,7,turn);
  const saved=JSON.parse(localStorage.getItem('yirenju.session'));
  return reset&&elapsed===0&&document.getElementById('timer').textContent==='00:00'
    &&saved.elapsed===0;
}));
ok('终局停表后用时不再增长',await page.evaluate(async()=>{
  newGame(true);placeAt(7,7,1);placeAt(0,0,2);placeAt(8,7,1);placeAt(0,2,2);placeAt(9,7,1);placeAt(0,4,2);placeAt(10,7,1);placeAt(0,6,2);placeAt(11,7,1);
  const t=elapsed;
  await new Promise(r=>setTimeout(r,1300));
  return over&&elapsed===t&&!timerRunning;
}));
await page.evaluate(()=>{closeDialog();newGame(true);});

/* 18. 存储中的主题/配色无效时回落到合法值 */
await page.evaluate(()=>{history.length=0;localStorage.setItem('yirenju.settings',JSON.stringify({theme:'foo',accent:'bar'}));});
await page.reload();await page.waitForTimeout(250);
ok('无效主题/配色回落到合法值',await page.evaluate(()=>{
  const d=document.documentElement.dataset;
  return (d.theme==='dark'||d.theme==='light')&&d.accent==='purple'
    &&['dark','light'].includes(JSON.parse(localStorage.getItem('yirenju.settings')).theme);
}));
await page.evaluate(()=>{history.length=0;localStorage.setItem('yirenju.settings',JSON.stringify({mode:'constructor'}));});
await page.reload();await page.waitForTimeout(250);
ok('原型继承键不能作为对局模式',await page.evaluate(()=>mode==='ai-easy'&&settings.mode==='ai-easy'
  &&['constructor','toString','__proto__'].every(m=>!MODES_OK(m))
  &&['ai-easy','ai-medium','ai-hard','ai-expert','pvp'].every(m=>MODES_OK(m))));
await page.evaluate(()=>{history.length=0;localStorage.clear();});

console.log(`\n${pass} passed, ${fail} failed`);
await browser.close();
process.exit(fail?1:0);
