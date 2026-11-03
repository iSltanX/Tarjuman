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

// ١. البيان: الأذونات المعتمدة فقط (عقد interfaces §٦ و§١٣)، ونقاط الدخول كلها مصرّح بها مسبقًا. downloads معتمد
// لمكان الحفظ وحده (الإصدار الثاني)، والعامل الخلفي للحفظ وحده بمدخل واحد.
const ALLOWED_PERMISSIONS = ['storage', 'unlimitedStorage', 'downloads'];
const BACKGROUND = '{"service_worker":"background/worker.js"}';
const FORBIDDEN_KEYS = [
  'host_permissions', 'optional_permissions', 'optional_host_permissions',
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
if ('background' in manifest && JSON.stringify(manifest.background) !== BACKGROUND) problems.push(`manifest: background غير المعتمد ${JSON.stringify(manifest.background)} (المعتمد ${BACKGROUND})`);
if ('background' in manifest && !(await exists(path.join(SRC, 'background', 'worker.js')))) problems.push('manifest: background/worker.js مفقود');
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
// web_accessible_resources: الخطوط وحدها («تهيئة W4»، وخطوط الواجهة في جولة الصقل): إدخال واحد لملفات .woff2 في
// ui/fonts/subtitle (الترجمة) وui/fonts/ui (عناوين الواجهة)، ليوتيوب وحده، بعنوان متغير (use_dynamic_url). ومجلدا الخطوط لا
// يحويان غير WOFF2 بأوزانها ورخصها. وأيقونات الإضافة PNG بأحجام البيان وحدها.
const SUBTITLE_FONTS = path.join('ui', 'fonts', 'subtitle');
const UI_FONTS = path.join('ui', 'fonts', 'ui');
if ('web_accessible_resources' in manifest) {
  const war = manifest.web_accessible_resources;
  const e = Array.isArray(war) && war.length === 1 ? war[0] : null;
  if (!e || Object.keys(e).sort().join() !== 'matches,resources,use_dynamic_url' || JSON.stringify(e.resources) !== '["ui/fonts/subtitle/*.woff2","ui/fonts/ui/*.woff2"]'
    || JSON.stringify(e.matches) !== YT || e.use_dynamic_url !== true) {
    problems.push(`manifest: web_accessible_resources غير المعتمد ${JSON.stringify(war).slice(0, 160)}`);
  }
}
for (const [dir, weights] of [[SUBTITLE_FONTS, '400|700'], [UI_FONTS, '600|700']]) {
  if (!(await exists(path.join(SRC, dir)))) continue;
  for (const f of await walk(path.join(SRC, dir))) {
    const rel = path.relative(path.join(SRC, dir), f);
    if (!new RegExp(`^[a-z0-9-]+-(?:${weights})\\.woff2$|^[a-z0-9-]+-OFL\\.txt$`).test(rel)) problems.push(`${path.join(dir, rel)}: ملف غير متوقع في مجلد الخطوط`);
  }
}
const ICON_SIZES = ['16', '32', '48', '128'];
if (JSON.stringify(manifest.icons) !== JSON.stringify(Object.fromEntries(ICON_SIZES.map((n) => [n, `icons/tarjuman-icon-${n}.png`])))) problems.push('manifest: icons غير المعتمدة');
for (const n of ICON_SIZES) if (!(await exists(path.join(SRC, 'icons', `tarjuman-icon-${n}.png`)))) problems.push(`icons: tarjuman-icon-${n}.png مفقودة`);
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
    re: /\bchrome\s*(?:\.|\[\s*['"`])\s*(?:webRequest|declarativeNetRequest|scripting|cookies|identity|history|bookmarks|debugger|management|offscreen)\b|\bchrome\s*\[\s*['"`]downloads|\bpermissions\s*\.\s*request\b|\btabs\s*\.\s*(?:executeScript|insertCSS)\b/,
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
// قراءة ملف خط الترجمة من حزمة الإضافة نفسها (chrome-extension://، ليست شبكة) لـFontFace ببياناته (عقد interfaces §٣):
// في محمّل خطوط الطبقة وحده، والسطر مراجَع حرفيًا كأسطر غلافي الالتقاط (طلب ملف مشترك من P6).
const PACKAGED_READS = new Map([[path.join('player', 'overlay', 'fonts.js'), new Set(['const res = await fetch(runtime.getURL(path));'])]]);
// الروابط الحرفية بأي مضيف (ومنه localhost): عنوان المشاهدة على يوتيوب وحده، ونطاق أسماء SVG ليس طلبًا.
const URL_RE = /(?:https?:)?\/\/[A-Za-z0-9][A-Za-z0-9.-]*(?::\d+)?[^\s'"`)]*/g;
// رابطا «حول» (R42) وحدهما، في ملفه وحده: روابط <a> تُفتح بضغط المستخدم في تبويب جديد، لا طلب شبكة من الإضافة.
const ABOUT_FILE = path.join('pages', 'settings', 'about.js');
const ABOUT_LINKS = new Set(['https://bysltan.com', 'https://github.com/iSltanX/Tarjuman']);
const URL_OK = (u, rel) => u.startsWith('https://www.youtube.com/') || u === 'http://www.w3.org/2000/svg' || (rel === ABOUT_FILE && ABOUT_LINKS.has(u));
const STORAGE = /\bchrome\s*(?:\.|\[\s*['"`])\s*storage\b|\.\s*storage\s*\.\s*(?:local|sync|session|managed|onChanged)\b/;
// واجهة التنزيلات محصورة في ملفات ترجمان (اعتماد سلطان 2026-11-02، عقد interfaces §١٣): في src/core/save وsrc/background
// وحدهما؛ والوصول إلى كائنها (.downloads) في أسطر مراجَعة حرفيًا تسلّمه إلى متغير اسمه downloads لا غير؛ ولا يُستدعى منه
// إلا download وsearch، وsearch بالمعرّف وحده. فلا بحث في تنزيلات المستخدم، ولا فتح ولا حذف، ولا مستمعات تمس كل التنزيلات.
const DL_DIRS = [path.join('core', 'save') + path.sep, 'background' + path.sep];
const DL_OBJECT = /\b(?:chrome|api)\s*\??\.\s*downloads\b/;
const DL_SOURCES = new Set([
  'const downloads = api?.downloads;',
  'export async function savedPath(downloadId, { downloads = globalThis.chrome?.downloads } = {}) {',
  'createSaveService({ runtime: chrome.runtime, downloads: chrome.downloads, store: createStore() }).install();',
]);
const DL_MEMBER = /\bdownloads\s*\??\.\s*([A-Za-z_$][\w$]*)/g;
const DL_SEARCH_BY_ID = /\bdownloads\s*\.\s*search\s*\(\s*\{\s*id(?:\s*:\s*[A-Za-z_$][\w$]*)?\s*\}\s*\)/;
const DL_LISTENERS = /\bon(?:DeterminingFilename|Erased)\b/;

/**
 * ينزع تعليقات الكتل (ولو امتدت أسطرًا أو سبقت شيفرة) وأسطر // كاملة؛ ويُبقي رقم السطر ونصوص السلاسل كما هي (فالروابط والأسماء
 * داخلها تُفحص). يتتبع السلاسل ('…' و"…" وقوالب `…` ولو امتدت أسطرًا) والتعابير النمطية، فـ'/*' داخل سلسلة مثل
 * 'https://www.youtube.com/*' لا يفتح تعليقًا يُعمي الفحص عن بقية الملف (تدقيق 5fedcb9، GM-017.2). هو حدّ أدنى لا محلل كامل.
 */
function codeLines(text) {
  let mode = 'code'; // code | block | ' | " | ` | regex
  let regexClass = false;
  return text.split('\n').map((raw) => {
    let out = '';
    let prev = ''; // آخر محرف غير فراغ في الشيفرة (لتمييز / القسمة من بداية تعبير نمطي)
    for (let i = 0; i < raw.length; i++) {
      const ch = raw[i];
      const next = raw[i + 1];
      if (mode === 'block') {
        if (ch === '*' && next === '/') {
          mode = 'code';
          i++;
          out += ' ';
        }
        continue;
      }
      if (mode === "'" || mode === '"' || mode === '`') {
        out += ch;
        if (ch === '\\') {
          out += next ?? '';
          i++;
        } else if (ch === mode) mode = 'code';
        continue;
      }
      if (mode === 'regex') {
        out += ch;
        if (ch === '\\') {
          out += next ?? '';
          i++;
        } else if (ch === '[') regexClass = true;
        else if (ch === ']') regexClass = false;
        else if (ch === '/' && !regexClass) mode = 'code';
        continue;
      }
      if (ch === '/' && next === '*') {
        mode = 'block';
        i++;
        continue;
      }
      if (ch === '/' && next === '/') {
        out += raw.slice(i);
        break;
      }
      if (ch === "'" || ch === '"' || ch === '`') mode = ch;
      else if (ch === '/' && (prev === '' || /[(,=:[!&|?{};+\-*%<>~^]/.test(prev) || /\b(?:return|typeof|case|in|of)$/.test(out.trimEnd()))) {
        mode = 'regex';
        regexClass = false;
      }
      out += ch;
      if (!/\s/.test(ch)) prev = ch;
    }
    // سلسلة عادية أو تعبير نمطي لا يمتدان إلى السطر التالي.
    if (mode === "'" || mode === '"' || mode === 'regex') mode = 'code';
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
    if (NETWORK.test(line) && !(rel === CAPTURE && PASSTHROUGH.has(line.trim())) && !PACKAGED_READS.get(rel)?.has(line.trim())) problems.push(`${at}: طلب شبكة من الإضافة`);
    for (const m of line.matchAll(URL_RE)) if (!URL_OK(m[0], rel)) problems.push(`${at}: نطاق خارجي ${m[0].slice(0, 60)}`);
    if (STORAGE.test(line) && !inStore) problems.push(`${at}: التخزين خارج src/core/store`);
    const inDl = DL_DIRS.some((d) => rel.startsWith(d));
    const members = [...line.matchAll(DL_MEMBER)].map((m) => m[1]);
    if (!inDl && (DL_OBJECT.test(line) || members.length)) problems.push(`${at}: واجهة التنزيلات خارج src/core/save وsrc/background`);
    if (inDl && DL_OBJECT.test(line) && !DL_SOURCES.has(line.trim())) problems.push(`${at}: وصول غير مراجَع إلى كائن التنزيلات`);
    if (inDl) {
      for (const m of members) if (m !== 'download' && m !== 'search') problems.push(`${at}: downloads.${m} غير مسموح (download وsearch بالمعرّف وحدهما)`);
      if (members.includes('search') && !DL_SEARCH_BY_ID.test(line)) problems.push(`${at}: downloads.search بالمعرّف وحده ({ id })`);
    }
    if (DL_LISTENERS.test(line)) problems.push(`${at}: مستمع يمس كل تنزيلات المتصفح`);
  });
}

if (problems.length) {
  console.error(`check-static: ${problems.length} مخالفة\n- ${problems.join('\n- ')}`);
  process.exit(1);
}
console.log('check-static: ناجح (البيان والأذونات المعتمدة، ولا HTML نصي ولا eval ولا شيفرة بعيدة ولا نطاقات خارجية ولا طلبات ولا تسجيل)');
