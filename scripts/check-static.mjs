#!/usr/bin/env node
// فحوص ثابتة على src/ (P2-AC5): الأذونات والبيان ضمن القائمة المعتمدة، ولا HTML نصي، ولا eval، ولا شيفرة
// بعيدة، ولا نطاقات خارجية، ولا طلبات شبكة من الإضافة، ولا تخزين خارج وحدة التخزين، ولا تسجيل، ولا تفعيل
// برمجي للمشغّل. يخرج برمز 1 عند أي مخالفة.   --src <مجلد> لفحص شجرة أخرى (لاختبار الفحص نفسه).
import { access, readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const srcArg = process.argv.indexOf('--src');
const SRC = srcArg > -1 ? path.resolve(process.argv[srcArg + 1]) : path.join(ROOT, 'src');
const problems = [];
const exists = (p) => access(p).then(() => true, () => false);

async function walk(dir) {
  const out = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...(await walk(p)));
    else out.push(p);
  }
  return out;
}

// ١. البيان: الأذونات المعتمدة فقط (عقد interfaces §٦)، ونقاط الدخول كلها مصرّح بها مسبقًا.
const ALLOWED_PERMISSIONS = ['storage', 'unlimitedStorage'];
const FORBIDDEN_KEYS = [
  'host_permissions', 'optional_permissions', 'optional_host_permissions', 'background',
  'externally_connectable', 'content_security_policy', 'sandbox', 'oauth2', 'key', 'chrome_url_overrides',
  'devtools_page', 'options_page', 'options_ui', 'commands', 'side_panel', 'declarative_net_request', 'update_url',
];
const PAGES = ['popup', 'library', 'settings', 'editor'];
const YT = '["https://www.youtube.com/*"]';

const manifest = JSON.parse(await readFile(path.join(SRC, 'manifest.json'), 'utf8'));
const perms = manifest.permissions ?? [];
if (manifest.manifest_version !== 3) problems.push('manifest: ليس MV3');
if (perms.length !== new Set(perms).size || perms.some((p) => !ALLOWED_PERMISSIONS.includes(p)) || !perms.includes('storage')) {
  problems.push(`manifest: الأذونات ${JSON.stringify(perms)} والمعتمد ${JSON.stringify(ALLOWED_PERMISSIONS)}`);
}
for (const k of FORBIDDEN_KEYS) if (k in manifest) problems.push(`manifest: المفتاح ${k} غير مسموح`);
const cs = manifest.content_scripts ?? [];
const mainWorld = cs.filter((c) => c.world === 'MAIN');
const isolated = cs.filter((c) => c.world !== 'MAIN');
if (cs.length !== 2 || mainWorld.length !== 1 || isolated.length !== 1) problems.push('manifest: المتوقع سكربتا محتوى فقط (MAIN وISOLATED)');
if (JSON.stringify(mainWorld[0]?.js) !== '["main-world/capture.js"]' || mainWorld[0]?.run_at !== 'document_start') problems.push('manifest: سكربت MAIN عند document_start مفقود أو مختلف');
if (JSON.stringify(isolated[0]?.js) !== '["content/main.js"]' || isolated[0]?.run_at !== 'document_start') problems.push('manifest: سكربت ISOLATED (content/main.js) عند document_start مفقود أو مختلف');
for (const c of cs) {
  if (JSON.stringify(c.matches) !== YT) problems.push(`manifest: مطابقة غير متوقعة ${JSON.stringify(c.matches)}`);
  if (c.all_frames) problems.push('manifest: all_frames غير مسموح');
  for (const k of ['css', 'exclude_matches', 'include_globs', 'match_about_blank', 'match_origin_as_fallback']) if (k in c) problems.push(`manifest: ${k} غير مسموح في سكربت المحتوى`);
}
if (manifest.action?.default_popup !== 'pages/popup/index.html') problems.push('manifest: نافذة الأيقونة ليست pages/popup/index.html');
// web_accessible_resources: خطوط الترجمة وحدها («تهيئة W4»): إدخال واحد لملفات .woff2 في ui/fonts/subtitle، ليوتيوب
// وحده، بعنوان متغير (use_dynamic_url). ومجلد الخطوط لا يحوي غير WOFF2 ورخصها.
const SUBTITLE_FONTS = path.join('ui', 'fonts', 'subtitle');
if ('web_accessible_resources' in manifest) {
  const war = manifest.web_accessible_resources;
  const e = Array.isArray(war) && war.length === 1 ? war[0] : null;
  if (!e || Object.keys(e).sort().join() !== 'matches,resources,use_dynamic_url' || JSON.stringify(e.resources) !== '["ui/fonts/subtitle/*.woff2"]'
    || JSON.stringify(e.matches) !== YT || e.use_dynamic_url !== true) {
    problems.push(`manifest: web_accessible_resources غير المعتمد ${JSON.stringify(war).slice(0, 160)}`);
  }
}
if (await exists(path.join(SRC, SUBTITLE_FONTS))) {
  for (const f of await walk(path.join(SRC, SUBTITLE_FONTS))) {
    const rel = path.relative(path.join(SRC, SUBTITLE_FONTS), f);
    if (!/^[a-z0-9-]+-(?:400|700)\.woff2$|^[a-z0-9-]+-OFL\.txt$/.test(rel)) problems.push(`${path.join(SUBTITLE_FONTS, rel)}: ملف غير متوقع في مجلد خطوط الترجمة`);
  }
}
for (const p of PAGES) {
  for (const f of ['index.html', 'main.js']) if (!(await exists(path.join(SRC, 'pages', p, f)))) problems.push(`pages: ${p}/${f} مفقود`);
}

// ٢. أنماط ممنوعة في الشيفرة والصفحات والأنماط. الأسماء الخطرة ممنوعة معرّفاتٍ أينما وردت (لا بعد نقطة
// فقط)، والوصول إليها بالأقواس ممنوع كذلك. الفحص سطرًا بسطر بعد نزع التعليقات؛ هو حدّ أدنى لا محلل كامل.
const RULES = [
  {
    re: /\b(?:innerHTML|outerHTML|insertAdjacentHTML|setHTMLUnsafe|parseHTMLUnsafe|createContextualFragment|srcdoc)\b|\bdocument\s*\.\s*write(?:ln)?\b|parseFromString\([^)]*text\/html/,
    msg: 'إدراج HTML نصي ممنوع؛ textContent وDOM فقط',
  },
  { re: /(?<![\w$.])eval\b|(?<![\w$])Function\s*\(|set(?:Timeout|Interval)\s*\(\s*['"`]/, msg: 'تنفيذ نص كشيفرة ممنوع' },
  { re: /\bimport\s*\(\s*['"`](?:https?:)?\/\/|\bimportScripts\b|<script[^>]*\bsrc\s*=\s*["'](?:https?:)?\/\//i, msg: 'شيفرة بعيدة ممنوعة' },
  { re: /\bsetOption\s*\(|\bloadModule\s*\(/, msg: 'تفعيل المشغّل برمجيًا ممنوع دون قرار سلطان' },
  { re: /youtubei\/v1|innertube|get_transcript|get_panel/i, msg: 'طلبات InnerTube ممنوعة' },
  { re: /\b(?:sendBeacon|WebSocket|EventSource|RTCPeerConnection|WebTransport)\b|\bnew\s+(?:Request|Image)\s*\(/, msg: 'قنوات شبكة ممنوعة' },
  {
    re: /\bchrome\s*(?:\.|\[\s*['"`])\s*(?:downloads|webRequest|declarativeNetRequest|scripting|cookies|identity|history|bookmarks|debugger|management|offscreen)\b|\bpermissions\s*\.\s*request\b|\btabs\s*\.\s*(?:executeScript|insertCSS)\b/,
    msg: 'واجهة تحتاج إذنًا غير معتمد',
  },
  { re: /\b(?:localStorage|sessionStorage|indexedDB)\b/, msg: 'التخزين عبر src/core/store وحده (لا localStorage ولا IndexedDB)' },
  { re: /\bconsole\b/, msg: 'التسجيل في الكونسول ممنوع؛ الأخطاء برموز وتقرير التشخيص' },
  {
    re: /\[\s*['"`](?:innerHTML|outerHTML|insertAdjacentHTML|setHTMLUnsafe|eval|fetch|sendBeacon|storage|write|writeln|XMLHttpRequest)['"`]\s*\]/,
    msg: 'وصول بالأقواس إلى اسم ممنوع',
  },
];
// الشبكة: fetch وXMLHttpRequest معرّفين ممنوعان، إلا أسطر غلافي الالتقاط في capture.js التي تمرّر طلب
// الصفحة نفسه (مراجَعة حرفيًا). والسلسلة 'fetch' (اسم وسيلة النقل) ليست استدعاءً.
const NETWORK = /(?<![\w$'"`])(?:fetch|XMLHttpRequest)(?![\w$'"`])|\.open\s*\(\s*['"`](?:get|post|put|patch|delete|head)['"`]/i;
const PASSTHROUGH = new Set([
  'const origFetch = window.fetch;',
  'window.fetch = function fetch(input, init) {',
  'const result = origFetch.apply(this, arguments); // الطلب الوحيد: طلب الصفحة نفسه.',
  'const XHR = window.XMLHttpRequest.prototype;',
]);
const CAPTURE = path.join('main-world', 'capture.js');
// الروابط الحرفية بأي مضيف (ومنه localhost): عنوان المشاهدة على يوتيوب وحده، ونطاق أسماء SVG ليس طلبًا.
const URL_RE = /(?:https?:)?\/\/[A-Za-z0-9][A-Za-z0-9.-]*(?::\d+)?[^\s'"`)]*/g;
const URL_OK = (u) => u.startsWith('https://www.youtube.com/') || u === 'http://www.w3.org/2000/svg';
const STORAGE = /\bchrome\s*(?:\.|\[\s*['"`])\s*storage\b|\.\s*storage\s*\.\s*(?:local|sync|session|managed|onChanged)\b/;

/** ينزع تعليقات الكتل (ولو امتدت أسطرًا أو سبقت شيفرة) وأسطر // كاملة؛ ويُبقي رقم السطر. */
function codeLines(text) {
  let inBlock = false;
  return text.split('\n').map((raw) => {
    let line = raw;
    let out = '';
    while (line.length) {
      if (inBlock) {
        const end = line.indexOf('*/');
        if (end === -1) return out;
        line = line.slice(end + 2);
        inBlock = false;
      } else {
        const start = line.indexOf('/*');
        if (start === -1) {
          out += line;
          break;
        }
        out += `${line.slice(0, start)} `;
        line = line.slice(start + 2);
        inBlock = true;
      }
    }
    return /^\s*\/\//.test(out) ? '' : out;
  });
}

for (const file of await walk(SRC)) {
  if (!/\.(?:m?js|html|css)$/.test(file)) continue;
  const rel = path.relative(SRC, file);
  const inStore = rel.startsWith(path.join('core', 'store') + path.sep);
  codeLines(await readFile(file, 'utf8')).forEach((line, i) => {
    if (!line.trim()) return;
    const at = `${rel}:${i + 1}`;
    for (const r of RULES) if (r.re.test(line)) problems.push(`${at}: ${r.msg}`);
    if (NETWORK.test(line) && !(rel === CAPTURE && PASSTHROUGH.has(line.trim()))) problems.push(`${at}: طلب شبكة من الإضافة`);
    for (const m of line.matchAll(URL_RE)) if (!URL_OK(m[0])) problems.push(`${at}: نطاق خارجي ${m[0].slice(0, 60)}`);
    if (STORAGE.test(line) && !inStore) problems.push(`${at}: التخزين خارج src/core/store`);
  });
}

if (problems.length) {
  console.error(`check-static: ${problems.length} مخالفة\n- ${problems.join('\n- ')}`);
  process.exit(1);
}
console.log('check-static: ناجح (البيان والأذونات المعتمدة، ولا HTML نصي ولا eval ولا شيفرة بعيدة ولا نطاقات خارجية ولا طلبات ولا تسجيل)');
