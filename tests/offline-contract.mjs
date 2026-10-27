/* YiRenju — 离线 / 自举契约检查（零依赖）
 * 1. 交付的 index.html 不含任何会被浏览器自动加载的外部资源；
 * 2. 有内联 favicon，阻止 /favicon.ico 回退请求；
 * 3. 主脚本不引用网络 API / 远程 CSS；
 * 4. CORE_START/CORE_END 圈出的引擎段是纯逻辑（Worker 安全），
 *    APP_START/APP_END 与 CORE 标记顺序正确，且产品文件不含测试代码。
 */
import { readFileSync } from 'fs';
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const fail = [];
const check = (ok, msg) => { if (!ok) fail.push(msg); };

const refs = [...html.matchAll(/<([a-zA-Z][\w-]*)\b[^>]*?\b(src|href)\s*=\s*["']([^"']+)["'][^>]*>/g)]
  .map(m => ({ tag: m[1].toLowerCase(), attr: m[2].toLowerCase(), url: m[3] }));
const RESOURCE_TAGS = new Set(['link', 'script', 'img', 'iframe', 'source', 'video', 'audio', 'object', 'embed', 'use']);
const external = refs.filter(r => RESOURCE_TAGS.has(r.tag))
  .filter(r => !/^(data:|#|blob:)/i.test(r.url))
  .map(r => `<${r.tag} ${r.attr}="${r.url}">`);
check(external.length === 0, `发现外部资源引用: ${external.join(', ')}`);
check(/<link\s+rel=["']icon["']/i.test(html), '缺少内联 favicon（浏览器会请求 /favicon.ico）');
/* 属性顺序无关：先取出标签再做属性级断言（旧实现写死 id→role→aria-live 的书写顺序，
   只调换两个属性就会误报） */
const tagOf=re=>((html.match(re)||[''])[0]);
const a11yTag=tagOf(/<[^>]*\bid=["']a11yStatus["'][^>]*>/);
check(/\brole=["']status["']/.test(a11yTag)&&/\baria-live=["']polite["']/.test(a11yTag),
      '缺少 aria-live 状态播报区（canvas 棋盘需要它才能被读屏器感知）');
check(/\baria-describedby=["']boardHelp["']/.test(html)&&/\bid=["']boardHelp["']/.test(html),
      'canvas 缺少 aria-describedby 或 boardHelp 说明');
check(/\baria-labelledby=["']dlgTitle["']/.test(tagOf(/<[^>]*\bid=["']dialog["'][^>]*>/)),
      'dialog 缺少 aria-labelledby（读屏器进入弹窗时需读出标题）');
check(!/@import\s+url\(\s*["']?https?:/i.test(html), 'CSS 中存在远程 @import');
check(!/url\(\s*["']?https?:/i.test(html), 'CSS 中存在远程 url() 资源');

const main = html.match(/<script id="main">([\s\S]*?)<\/script>/);
check(!!main, '缺少 <script id="main">');
if (main) {
  const src = main[1];
  check(!/\bfetch\s*\(|XMLHttpRequest|importScripts/.test(src), '主脚本包含网络 API 调用');
  const appA = src.indexOf('/*APP_START*/'), appB = src.indexOf('/*APP_END*/');
  const coreA = src.indexOf('/*CORE_START*/'), coreB = src.indexOf('/*CORE_END*/');
  check(appA >= 0 && appB > appA, 'APP_START / APP_END 缺失或顺序错误');
  check(coreA > appA && coreB > coreA && coreB < appB, 'CORE_START / CORE_END 缺失、顺序错误或越出 APP 段');
  if (coreA >= 0 && coreB > coreA) {
    const core = src.slice(coreA, coreB);
    check(/function\s+aiChoose\s*\(/.test(core), 'CORE 段缺少 aiChoose()');
    check(/function\s+blackLegality\s*\(/.test(core), 'CORE 段缺少 blackLegality()');
    check(!/document\.|window\.|localStorage|navigator\.|URL\.createObjectURL/.test(core),
          'CORE 段混入了浏览器专属 API（Worker 中会抛错）');
  }
  check(!/function\s+oracle\s*\(|describe\s*\(|node:test/.test(src), '产品 HTML 混入了测试代码');
}

if (fail.length) {
  console.error('offline-contract: FAIL');
  for (const f of fail) console.error('  x ' + f);
  process.exit(1);
}
console.log(`offline-contract: PASS (${refs.length} 个 src/href 引用，全部内联)`);
