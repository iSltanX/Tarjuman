// P7-AC5/AC9 آليًا: لا طلبات شبكة من صفحات الإضافة (حتى لتحميل الخطوط)، والصفحات RTL عربية، وواجهات chrome المستعملة
// قائمة قصيرة مسماة، ولا رابط خارجي في الصفحات إلا رابطي «حول» في ملفه وحده. يكمل الفحص الثابت (check:static) بما
// يخص الصفحات، والتجربة الحية (test/live/pages) تقيس الشبكة فعلًا.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const PAGES = ['popup', 'library', 'settings'];

function walk(dir) {
  return readdirSync(dir).flatMap((n) => {
    const p = path.join(dir, n);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}
const files = PAGES.flatMap((p) => walk(path.join(ROOT, 'src/pages', p))).filter((f) => /\.(js|html|css)$/.test(f));
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n');
const rel = (f) => path.relative(path.join(ROOT, 'src'), f);

test('صفحات P7 ثلاث، كل منها HTML عربي RTL بأنماط وسكربت محليين نسبيين', () => {
  for (const p of PAGES) {
    const html = readFileSync(path.join(ROOT, 'src/pages', p, 'index.html'), 'utf8');
    assert.match(html, /<html lang="ar" dir="rtl">/, p);
    assert.match(html, /<meta name="viewport"/, p);
    const refs = [...html.matchAll(/(?:href|src)="([^"]+)"/g)].map((m) => m[1]);
    assert.ok(refs.length >= 4, p);
    for (const r of refs) assert.equal(/^(?:[a-z]+:)?\/\//i.test(r) || r.startsWith('/'), false, `${p}: مرجع غير محلي ${r}`);
    assert.ok(refs.includes('main.js'), `${p}: main.js`);
    assert.ok(refs.includes('../../ui/tokens.css') && refs.includes('../../ui/base.css'), `${p}: رموز التصميم`);
  }
});

test('لا شبكة في الصفحات: لا fetch ولا XHR ولا قنوات ولا @import ولا خط من الخارج ولا رابط خارجي', () => {
  const NETWORK = /\b(?:fetch|XMLHttpRequest|WebSocket|EventSource|sendBeacon|RTCPeerConnection|importScripts)\b|@import|new\s+Image\s*\(/;
  const URL_RE = /(?:https?:)?\/\/[A-Za-z0-9][A-Za-z0-9.-]*[^\s'"`)]*/g;
  const allowedLinks = new Set(['https://bysltan.com', 'https://github.com/iSltanX/Tarjuman', 'https://www.youtube.com/watch?v=']);
  for (const f of files) {
    const text = strip(readFileSync(f, 'utf8'));
    assert.equal(NETWORK.test(text), false, `${rel(f)}: قناة شبكة`);
    for (const m of text.matchAll(URL_RE)) {
      if (m[0] === 'http://www.w3.org/2000/svg') continue;
      assert.ok(rel(f) === path.join('pages', 'settings', 'about.js') ? allowedLinks.has(m[0]) : m[0].startsWith('https://www.youtube.com/watch?v='), `${rel(f)}: رابط ${m[0]}`);
    }
  }
});

test('واجهات chrome في الصفحات قائمة مسماة: tabs.query وsendMessage وcreate، وruntime.getURL وgetManifest فقط', () => {
  const allowed = new Set(['tabs.query', 'tabs.sendMessage', 'tabs.create', 'runtime.getURL', 'runtime.getManifest']);
  const used = new Set();
  for (const f of files.filter((x) => x.endsWith('.js'))) {
    const text = strip(readFileSync(f, 'utf8'));
    // chrome.x.y وapi.x.y وglobalThis.chrome?.x.y، وكذلك المتغيرات المسماة باسم الواجهة (tabs.query بعد استخراج tabs).
    for (const m of text.matchAll(/\b(?:chrome|api)\??\.((?:tabs|runtime|storage|windows|scripting|downloads|cookies|management|history|webRequest)\.\w+)/g)) used.add(m[1]);
    for (const m of text.matchAll(/(?<![\w.])((?:tabs|runtime|windows|scripting|downloads|cookies|management|history)\.\w+)\(/g)) used.add(m[1]);
  }
  for (const u of used) assert.ok(allowed.has(u), `واجهة غير معتمدة: ${u}`);
  assert.ok(used.has('tabs.create'), 'فتح الصفحات والفيديو بتبويب جديد');
  const status = strip(readFileSync(path.join(ROOT, 'src/pages/popup/status.js'), 'utf8'));
  assert.ok(/tabs\.query\(/.test(status) && /tabs\.sendMessage\(/.test(status), 'النافذة تستعلم التبويب النشط وترسل طلب الحالة وحده');
});

test('لا HTML نصي ولا تخزين مباشر في الصفحات (التخزين عبر src/core/store وحده)', () => {
  for (const f of files.filter((x) => x.endsWith('.js'))) {
    const text = strip(readFileSync(f, 'utf8'));
    assert.equal(/\b(?:innerHTML|outerHTML|insertAdjacentHTML|document\.write|localStorage|sessionStorage|indexedDB|chrome\.storage)\b/.test(text), false, rel(f));
    assert.equal(/\bconsole\b/.test(text), false, `${rel(f)}: تسجيل`);
  }
});

test('خط الترجمة لا يُطبَّق في الصفحات إلا على اسم كل خط والمعاينة (لا على body ولا الأنماط العامة)', () => {
  const css = strip(readFileSync(path.join(ROOT, 'src/pages/settings/settings.css'), 'utf8'));
  assert.equal(/Tarjuman Subtitle/.test(css), false, 'العائلات المضمّنة لا تُسمّى في أنماط الصفحة');
  for (const f of files.filter((x) => x.endsWith('.js'))) {
    const text = strip(readFileSync(f, 'utf8'));
    if (/subtitleFontStack/.test(text)) assert.ok(['pages/settings/view.js', 'pages/settings/model.js'].includes(rel(f).split(path.sep).join('/')), `${rel(f)}: استعمال سلسلة خط الترجمة`);
  }
});
