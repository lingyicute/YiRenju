/* YiRenju — 离线 / 自举契约检查（零依赖）
 * 1. 交付的 index.html 不含任何会被浏览器自动加载的外部资源；
 * 2. 有内联 favicon，阻止 /favicon.ico 回退请求；
 * 3. 主脚本不引用网络 API / 远程 CSS；
 * 4. CORE_START/CORE_END 圈出的引擎段是纯逻辑（Worker 安全），
 *    APP_START/APP_END 与 CORE 标记顺序正确，且产品文件不含测试代码。
 * 5. 内嵌字体子集覆盖页面全部可渲染汉字（改了文案却没重跑 scripts/subset_font.py 时报错）。
 */
import { readFileSync } from 'fs';
import { brotliDecompressSync } from 'zlib';
import { runInNewContext } from 'node:vm';
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const fail = [];
const check = (ok, msg) => { if (!ok) fail.push(msg); };

/* 离线/私密浏览可能禁止读取 localStorage；启动脚本不能因此跳过系统主题。 */
const bootstrap = (html.match(/<script>([\s\S]*?)<\/script>/) || [])[1];
check(!!bootstrap, '缺少主题防闪烁启动脚本');
if (bootstrap) {
  const start = (getItem, systemDark) => {
    const root = { dataset: { theme: 'dark', accent: 'purple' } };
    runInNewContext(bootstrap, {
      localStorage: { getItem }, document: { documentElement: root },
      window: { matchMedia: () => ({ matches: systemDark }) }
    });
    return root.dataset;
  };
  check(start(() => { throw new Error('storage blocked'); }, false).theme === 'light',
        '存储不可用时未跟随系统浅色主题');
  check(start(() => '{invalid JSON', false).theme === 'light',
        '设置损坏时未跟随系统浅色主题');
  const saved = start(() => '{"theme":"dark","accent":"blue"}', false);
  check(saved.theme === 'dark' && saved.accent === 'blue', '有效的主题与配色未覆盖系统设置');
}

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

/* ---- 5. 内嵌字体子集的字形覆盖 ----
   文案新增的字若不在子集里，会悄悄回退到系统字体，肉眼很难发现。
   WOFF2 = 表目录 + 一段 Brotli 流；cmap 不做变换，解压后按目录顺序切出来即可，不必引入字体库。 */
function woff2Codepoints(buf) {
  if (buf.toString('latin1', 0, 4) !== 'wOF2') throw new Error('不是 WOFF2');
  const numTables = buf.readUInt16BE(12), compLen = buf.readUInt32BE(20);
  let p = 48;                                            /* 定长文件头之后是表目录 */
  const base128 = () => { let v = 0; for (;;) { const c = buf[p++]; v = v * 128 + (c & 127); if (!(c & 128)) return v; } };
  const tables = [];
  for (let i = 0; i < numTables; i++) {
    const flags = buf[p++], known = flags & 63, ver = flags >> 6;
    if (known === 63) p += 4;                            /* 非常见表：后跟 4 字节 tag */
    const origLen = base128();
    /* glyf(10)/loca(11) 的变换版本 0 表示“已变换”，其余表非 0 才是；已变换的表另带变换后长度 */
    const transformed = (known === 10 || known === 11) ? ver === 0 : ver !== 0;
    tables.push({ cmap: known === 0, len: transformed ? base128() : origLen });
  }
  const data = brotliDecompressSync(buf.subarray(p, p + compLen));
  let off = 0, cmap = null;
  for (const t of tables) { if (t.cmap) { cmap = data.subarray(off, off + t.len); break; } off += t.len; }
  if (!cmap) throw new Error('缺少 cmap 表');
  const set = new Set();
  for (let i = 0, n = cmap.readUInt16BE(2); i < n; i++) {
    const o = cmap.readUInt32BE(8 + i * 8), fmt = cmap.readUInt16BE(o);
    if (fmt === 4) {                                     /* BMP 分段映射 */
      const seg = cmap.readUInt16BE(o + 6) >> 1, end = o + 14, start = end + seg * 2 + 2, delta = start + seg * 2, range = delta + seg * 2;
      for (let s = 0; s < seg; s++) {
        const a = cmap.readUInt16BE(start + s * 2), z = cmap.readUInt16BE(end + s * 2), ro = cmap.readUInt16BE(range + s * 2);
        for (let c = a; c <= z && c < 0xFFFF; c++) {
          const g = ro ? cmap.readUInt16BE(range + s * 2 + ro + (c - a) * 2) : (c + cmap.readUInt16BE(delta + s * 2)) & 0xFFFF;
          if (g) set.add(c);
        }
      }
    } else if (fmt === 12) {                             /* 全 Unicode 分组映射 */
      for (let g = 0, groups = cmap.readUInt32BE(o + 12); g < groups; g++) {
        const a = cmap.readUInt32BE(o + 16 + g * 12), z = cmap.readUInt32BE(o + 20 + g * 12);
        for (let c = a; c <= z; c++) set.add(c);
      }
    }
  }
  return set;
}
let glyphs = 0;
const fontB64 = (html.match(/@font-face\s*\{[^}]*?base64,([A-Za-z0-9+/=]+)/) || [])[1];
check(!!fontB64, '缺少内嵌字体（@font-face 的 base64 数据）');
if (fontB64) {
  /* 与 scripts/subset_font.py 的 strip_non_render_text 同一口径：去掉 HTML 注释、<style>、脚本注释 */
  const text = html.replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script\b[^>]*>([\s\S]*?)<\/script>/gi, (m, js) =>
      js.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(?:^|(?<=[;{}\s]))\/\/.*$/gm, ' '));
  try {
    const have = woff2Codepoints(Buffer.from(fontB64, 'base64'));
    glyphs = have.size;
    const missing = [...new Set(text)].filter(ch => /[\u4e00-\u9fff]/.test(ch) && !have.has(ch.codePointAt(0))).sort();
    check(missing.length === 0, `内嵌字体子集缺少界面用字「${missing.join('')}」（改动文案后需重跑 scripts/subset_font.py）`);
  } catch (e) { check(false, '内嵌字体无法解析：' + e.message); }
}

if (fail.length) {
  console.error('offline-contract: FAIL');
  for (const f of fail) console.error('  x ' + f);
  process.exit(1);
}
console.log(`offline-contract: PASS (${refs.length} 个 src/href 引用，全部内联；内嵌字体 ${glyphs} 个字形覆盖全部界面汉字)`);
