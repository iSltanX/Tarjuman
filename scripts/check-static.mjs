#!/usr/bin/env node
// فحوص ثابتة على src/ (P2-AC5): الأذونات والبيان ضمن القائمة المعتمدة، ولا HTML نصي، ولا eval، ولا شيفرة
// بعيدة، ولا نطاقات خارجية، ولا طلبات شبكة من الإضافة، ولا تخزين خارج وحدة التخزين، ولا تسجيل، ولا تفعيل
// برمجي للمشغّل. يخرج برمز 1 عند أي مخالفة.   --src <مجلد> لفحص شجرة أخرى (لاختبار الفحص نفسه).
import { access, readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CODE_RULES } from './code-rules.mjs';
import { MANIFEST_LOCALES, manifestMessages, manifestText, targetManifest } from './targets.mjs';

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
// لمكان الحفظ وحده (الإصدار الثاني)، والعامل الخلفي للحفظ وحده بمدخل واحد. يُفحص بيانا الهدفين (جولة النشر T2) بالقواعد
// نفسها: src/manifest.json لعائلة Chromium، وما تولّده منه طبقة Firefox في scripts/targets.mjs؛ والطبقة لا تغيّر غير
// الخلفية وbrowser_specific_settings، وقيمتاهما هنا حرفيتان لا مأخوذتان من الطبقة.
const ALLOWED_PERMISSIONS = ['storage', 'unlimitedStorage', 'downloads'];
const BACKGROUND = {
  chromium: '{"service_worker":"background/worker.js"}',
  firefox: '{"scripts":["background/worker.js"]}',
};
// Gecko المعتمد (store/README.md §٥): المعرّف، وأدنى إصدار 144 (Q08، مصدره scripts/targets.mjs)، ولا جمع بيانات دون موافقة، والفئتان الاختياريتان وحدهما:
// البلاغ (T2.1) وصور المحفوظات (قرار سلطان 2026-11-04)، ولا gecko_android (سطح المكتب وحده).
const GECKO_SETTINGS = '{"gecko":{"id":"tarjuman@bysltan.com","strict_min_version":"144.0","data_collection_permissions":{"required":["none"],"optional":["technicalAndInteraction","browsingActivity"]}}}';
// قناة البلاغات (جولة النشر T2.1): إذن مضيف اختياري لخادمها وحده، يُطلب عند أول إرسال؛ والإلزامية كما هي.
const OPTIONAL_HOSTS = '["https://app-reports.isultantf.workers.dev/*"]';
const FORBIDDEN_KEYS = [
  'host_permissions', 'optional_permissions',
  'externally_connectable', 'content_security_policy', 'sandbox', 'oauth2', 'key', 'chrome_url_overrides',
  'devtools_page', 'options_page', 'options_ui', 'commands', 'side_panel', 'declarative_net_request', 'update_url',
];
const PAGES = ['popup', 'library', 'settings', 'editor'];
const YT = '["https://www.youtube.com/*"]';
// الاسم والملخص في المتاجر (store/README.md §٣): الاسم حتى 50 (AMO)، والمختصر حتى 12، والملخص حتى 132 (Chrome)؛ ولا ذكر
// لمتصفح أو لشركة متصفح (Edge 1.1.2، وعلامات Google وMozilla).
const NAME_MAX = 50;
const SHORT_NAME_MAX = 12;
const DESCRIPTION_MAX = 132;
const BROWSER_NAMES = /chrom(?:e|ium)|brave|edge|firefox|mozilla|google|microsoft|كروم|بريف|إيدج|ايدج|فايرفوكس|فيرفوكس|جوجل|غوغل|مايكروسوفت/i;

const base = JSON.parse(await readFile(path.join(SRC, 'manifest.json'), 'utf8'));
if ('browser_specific_settings' in base) problems.push('manifest: browser_specific_settings لطبقة Firefox وحدها، لا في البيان الأساسي');
const SUBTITLE_FONTS = path.join('ui', 'fonts', 'subtitle');
const UI_FONTS = path.join('ui', 'fonts', 'ui');

// رسائل البيان: لغتان بالمفاتيح نفسها، والافتراضية إحداهما (2.1.1).
let messages = {};
try {
  messages = await manifestMessages(SRC);
} catch (e) {
  problems.push(`_locales: تعذّرت قراءتها (${e.message})`);
}
if (!MANIFEST_LOCALES.includes(base.default_locale)) problems.push(`manifest: default_locale ${JSON.stringify(base.default_locale ?? null)} والمعتمد إحدى ${MANIFEST_LOCALES.join('، ')}`);
const messageKeys = MANIFEST_LOCALES.map((l) => Object.keys(messages[l] ?? {}).sort().join());
if (new Set(messageKeys).size > 1) problems.push('_locales: مفاتيح اللغتين مختلفة');

for (const target of ['chromium', 'firefox']) {
  let manifest;
  try {
    manifest = targetManifest(base, target);
  } catch (e) {
    problems.push(`manifest (${target}): تعذّر توليده (${e.message})`);
    continue;
  }
  const at = target === 'chromium' ? 'manifest' : `manifest (${target})`;
  const perms = manifest.permissions ?? [];
  if (manifest.manifest_version !== 3) problems.push(`${at}: ليس MV3`);
  if (perms.length !== new Set(perms).size || perms.some((p) => !ALLOWED_PERMISSIONS.includes(p)) || !perms.includes('storage')) {
    problems.push(`${at}: الأذونات ${JSON.stringify(perms)} والمعتمد ${JSON.stringify(ALLOWED_PERMISSIONS)}`);
  }
  for (const k of FORBIDDEN_KEYS) if (k in manifest) problems.push(`${at}: المفتاح ${k} غير مسموح`);
  if (JSON.stringify(manifest.optional_host_permissions) !== OPTIONAL_HOSTS) problems.push(`${at}: optional_host_permissions غير المعتمد ${JSON.stringify(manifest.optional_host_permissions ?? null)} (المعتمد ${OPTIONAL_HOSTS})`);
  if ('background' in manifest && JSON.stringify(manifest.background) !== BACKGROUND[target]) problems.push(`${at}: background غير المعتمد ${JSON.stringify(manifest.background)} (المعتمد ${BACKGROUND[target]})`);
  if (target === 'firefox' && JSON.stringify(manifest.browser_specific_settings) !== GECKO_SETTINGS) {
    problems.push(`${at}: browser_specific_settings غير المعتمد ${JSON.stringify(manifest.browser_specific_settings ?? null).slice(0, 200)}`);
  }
  // الطبقة لا تمس غير مفتاحيها: ما عداهما في بيان Firefox مطابق للبيان الأساسي.
  if (target === 'firefox') {
    for (const k of new Set([...Object.keys(base), ...Object.keys(manifest)])) {
      if (k !== 'background' && k !== 'browser_specific_settings' && JSON.stringify(base[k]) !== JSON.stringify(manifest[k])) problems.push(`${at}: الطبقة غيّرت ${k}`);
    }
  }
  // الحدود على النص الذي يراه المستخدم بكل لغة، لا على رمز `__MSG_…__`.
  for (const locale of MANIFEST_LOCALES) {
    const text = (k) => manifestText(manifest[k], messages[locale] ?? {});
    const name = text('name');
    const shortName = text('short_name');
    const description = text('description');
    if (typeof name !== 'string' || ![...name].length || [...name].length > NAME_MAX) problems.push(`${at}: name فارغ أو أطول من ${NAME_MAX} (${locale})`);
    if (typeof shortName !== 'string' || ![...shortName].length || [...shortName].length > SHORT_NAME_MAX) problems.push(`${at}: short_name فارغ أو أطول من ${SHORT_NAME_MAX} (${locale})`);
    if (typeof description !== 'string' || ![...description].length || [...description].length > DESCRIPTION_MAX) problems.push(`${at}: description مفقود أو أطول من ${DESCRIPTION_MAX} (${locale})`);
    for (const k of ['name', 'short_name', 'description']) if (BROWSER_NAMES.test(text(k) ?? '')) problems.push(`${at}: ${k} يذكر متصفحًا أو شركة متصفح (${locale})`);
  }
  const cs = manifest.content_scripts ?? [];
  const mainWorld = cs.filter((c) => c.world === 'MAIN');
  const isolated = cs.filter((c) => c.world !== 'MAIN');
  if (cs.length !== 2 || mainWorld.length !== 1 || isolated.length !== 1) problems.push(`${at}: المتوقع سكربتا محتوى فقط (MAIN وISOLATED)`);
  if (JSON.stringify(mainWorld[0]?.js) !== '["main-world/capture.js"]' || mainWorld[0]?.run_at !== 'document_start') problems.push(`${at}: سكربت MAIN عند document_start مفقود أو مختلف`);
  if (JSON.stringify(isolated[0]?.js) !== '["content/main.js"]' || isolated[0]?.run_at !== 'document_start') problems.push(`${at}: سكربت ISOLATED (content/main.js) عند document_start مفقود أو مختلف`);
  for (const c of cs) {
    if (JSON.stringify(c.matches) !== YT) problems.push(`${at}: مطابقة غير متوقعة ${JSON.stringify(c.matches)}`);
    if (c.all_frames) problems.push(`${at}: all_frames غير مسموح`);
    for (const k of ['css', 'exclude_matches', 'include_globs', 'match_about_blank', 'match_origin_as_fallback']) if (k in c) problems.push(`${at}: ${k} غير مسموح في سكربت المحتوى`);
  }
  if (manifest.action?.default_popup !== 'pages/popup/index.html') problems.push(`${at}: نافذة الأيقونة ليست pages/popup/index.html`);
  // web_accessible_resources: الخطوط وحدها («تهيئة W4»، وخطوط الواجهة في جولة الصقل): إدخال واحد لملفات .woff2 في
  // ui/fonts/subtitle (الترجمة) وui/fonts/ui (عناوين الواجهة)، ليوتيوب وحده، بعنوان متغير (use_dynamic_url؛ وFirefox يتجاهله،
  // فعنوان moz-extension عشوائي لكل نسخة متصفح أصلًا). ومجلدا الخطوط لا يحويان غير WOFF2 بأوزانها ورخصها.
  if ('web_accessible_resources' in manifest) {
    const war = manifest.web_accessible_resources;
    const e = Array.isArray(war) && war.length === 1 ? war[0] : null;
    if (!e || Object.keys(e).sort().join() !== 'matches,resources,use_dynamic_url' || JSON.stringify(e.resources) !== '["ui/fonts/subtitle/*.woff2","ui/fonts/ui/*.woff2"]'
      || JSON.stringify(e.matches) !== YT || e.use_dynamic_url !== true) {
      problems.push(`${at}: web_accessible_resources غير المعتمد ${JSON.stringify(war).slice(0, 160)}`);
    }
  }
}
// الملفات التي يشير إليها البيان: واحدة في الهدفين. وأيقونات الإضافة PNG بأحجام البيان وحدها.
const manifest = base;
if ('background' in manifest && !(await exists(path.join(SRC, 'background', 'worker.js')))) problems.push('manifest: background/worker.js مفقود');
for (const [dir, weights] of [[SUBTITLE_FONTS, '400|700'], [UI_FONTS, '700|800']]) {
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
// القواعد بلا استثناء مشتركة مع تدقيق الحزمة (scripts/code-rules.mjs، تدقيق 7a66f91، U61)، ومنها الصيغ الديناميكية؛ وهنا ما له
// استثناء مسمّى بملفه وسطره.
const RULES = [
  ...CODE_RULES,
  {
    re: /\bchrome\s*(?:\.|\[\s*['"`])\s*(?:webRequest|declarativeNetRequest|scripting|cookies|identity|history|bookmarks|debugger|management|offscreen)\b|\bchrome\s*\[\s*['"`]downloads|\bpermissions\s*\.\s*request\b|\btabs\s*\.\s*(?:executeScript|insertCSS)\b/,
    msg: 'واجهة تحتاج إذنًا غير معتمد',
    // طلب إذن مضيف البلاغات وحده، بسطره المراجَع في ملف القناة (جولة النشر T2.1)؛ وطلب موافقة صور المحفوظات في Firefox بسطره
    // المراجَع في ملف الموافقة (قرار سلطان 2026-11-04، core/consent/thumbnails.js).
    allow: (rel, line) => (rel === REPORT_FILE && REPORT_LINES.has(line.trim())) || (rel === CONSENT_FILE && CONSENT_LINES.has(line.trim())),
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
// الأسماء المستعارة للطلب الأصلي (F-07): origFetch.call(window, url) طلب لا تظهر فيه كلمة fetch معرّفًا. فهذه الأسماء لا ترد
// إلا في أسطرها المراجَعة حرفيًا في ملفها.
const REQUEST_ALIAS = /(?<![\w$])(?:origFetch|origOpen|origSend|pageFetch)(?![\w$])/;
const ALIAS_LINES = new Map([
  [CAPTURE, new Set([
    'const origFetch = window.fetch;',
    'const result = origFetch.apply(this, arguments); // الطلب الوحيد: طلب الصفحة نفسه.',
    'const origOpen = XHR.open;',
    'const origSend = XHR.send;',
    'return origOpen.apply(this, arguments);',
    'return origSend.apply(this, arguments);',
  ])],
  [path.join('core', 'report', 'client.js'), new Set([
    'const pageFetch = (url, init) => globalThis.fetch(url, init);',
    'export async function sendReport(payload, key, { granted, request = pageFetch, timeoutMs = SEND_TIMEOUT_MS }) {',
  ])],
]);
// قناة البلاغات (جولة النشر T2.1): أضيق استثناء لهذا المضيف وهذا الملف. طلب fetch واحد وطلب إذن واحد بسطريهما
// المراجَعين حرفيًا، والمضيف رابطًا في هذا الملف وحده. فلا طلب في ملف آخر، ولا مضيف آخر هنا، والعامل وسكربتا المحتوى بلا شبكة.
const REPORT_FILE = path.join('core', 'report', 'client.js');
const REPORTS_ORIGIN = 'https://app-reports.isultantf.workers.dev';
const REPORT_LINES = new Set([
  'const pageFetch = (url, init) => globalThis.fetch(url, init);',
  'return Promise.resolve(api.permissions.request(reportPermissions(target))).then((granted) => granted === true, () => false);',
]);
// موافقة صور المحفوظات في Firefox (قرار سلطان 2026-11-04، docs/site/README.md): طلب واحد لفئة browsingActivity وحدها، بسطره
// المراجَع حرفيًا في ملفه وحده؛ بلا مضيف ولا إذن آخر.
const CONSENT_FILE = path.join('core', 'consent', 'thumbnails.js');
const CONSENT_LINES = new Set([
  'return Promise.resolve(api.permissions.request({ data_collection: [THUMBS_DATA] })).then((granted) => granted === true, () => false);',
]);
// قراءة ملف خط الترجمة من حزمة الإضافة نفسها (chrome-extension://، ليست شبكة) لـFontFace ببياناته (عقد interfaces §٣):
// في محمّل خطوط الطبقة وحده، والسطر مراجَع حرفيًا كأسطر غلافي الالتقاط (طلب ملف مشترك من P6).
const PACKAGED_READS = new Map([[path.join('player', 'overlay', 'fonts.js'), new Set(['const res = await fetch(runtime.getURL(path));'])]]);
// الروابط الحرفية بأي مضيف (ومنه localhost): عنوان المشاهدة على يوتيوب وحده، ونطاق أسماء SVG ليس طلبًا.
const URL_RE = /(?:https?:)?\/\/[A-Za-z0-9][A-Za-z0-9.-]*(?::\d+)?[^\s'"`)]*/g;
// روابط «حول» الثلاثة (R42) وحدها، في ملفه وحده (الموقع، والمستودع العام منذ 2026-11-07 بطلب سلطان، وصفحة الدعم من T4): روابط <a> تُفتح بضغط المستخدم في تبويب جديد، لا طلب شبكة من الإضافة.
const ABOUT_FILE = path.join('pages', 'settings', 'about.js');
const ABOUT_LINKS = new Set(['https://bysltan.com', 'https://github.com/iSltanX/Tarjuman', 'https://bysltan.com/tarjuman/support']);
// صور الفيديو في المحفوظات (قرار سلطان 2026-11-03، docs/product-spec.md §٦.٦): الاستثناء المسمّى الوحيد لنطاق خارجي. بادئة
// الصورة `https://i.ytimg.com/vi/` وحدها، في وحدة الصورة المصغّرة وحدها، لعنصر <img> يحمّله المتصفح (لا fetch ولا XHR ولا Image()،
// وكلها ممنوعة هنا كما كانت). فلا يمرّ رابط آخر في ذلك الملف، ولا هذا الرابط في ملف آخر.
const THUMB_FILE = path.join('pages', 'library', 'thumb.js');
const THUMB_URL = 'https://i.ytimg.com/vi/';
const URL_OK = (u, rel) => u.startsWith('https://www.youtube.com/') || u === 'http://www.w3.org/2000/svg' || (rel === ABOUT_FILE && ABOUT_LINKS.has(u)) || (rel === THUMB_FILE && u === THUMB_URL)
  || (rel === REPORT_FILE && u === REPORTS_ORIGIN);
// والسلسلة الاختيارية (?.) كالنقطة: api.storage?.local وchrome?.storage كانا يمرّان (تدقيق Fable، FA-02)، كما تعالجها قاعدة التنزيلات.
const STORAGE = /\bchrome\s*(?:\??\.|\[\s*['"`]|\?\.\s*\[\s*['"`])\s*storage\b|\.\s*storage\s*(?:\??\.\s*(?:local|sync|session|managed|onChanged)\b|(?:\?\.)?\s*\[)/;
// الكتابة في المساحة للكاتب الواحد وحده (عقد storage §١٢، تدقيق 7a66f91، C2): لا set ولا remove ولا clear خارج writer.js
// والترحيل الذي يستدعيه الكاتب، فلا يعود سياق يكتب بنفسه. وarea?.set( مثل area.set( (FA-02).
const STORE_WRITE = /\barea\s*\??\.\s*(?:set|remove|clear)\s*\(/;
// صفحات HTML بلا شيفرة داخلها (تدقيق Fable، FA-02): لا <script> بلا src، ولا معالج حدث في سمة (on…=)، ولا رابط javascript:.
// CSP الافتراضية في MV3 تمنع تنفيذها أصلًا، فوجودها في المصدر خطأ صامت لا يعمل؛ والفحص على الملف كله لا سطرًا بسطر.
const HTML_INLINE = [
  { re: /<script\b(?![^>]*\bsrc\s*=)[^>]*>/i, msg: 'سكربت داخل HTML (بلا src)' },
  { re: /<[a-z][^>]*\son[a-z]+\s*=/i, msg: 'معالج حدث في سمة HTML (on…=)' },
  { re: /\bjavascript\s*:/i, msg: 'رابط javascript: في HTML' },
];
// أدنى إصدار Chromium في البيان (تدقيق 7a66f91، قرار Q09؛ ومثله target chrome130 في البناء): لا يُغيَّر دون قرار (FA-19).
const MIN_CHROME = '130';
if (base.minimum_chrome_version !== MIN_CHROME) problems.push(`manifest: minimum_chrome_version ${JSON.stringify(base.minimum_chrome_version ?? null)} والمعتمد ${MIN_CHROME} (Q09)`);
const STORE_WRITERS = new Set([path.join('core', 'store', 'writer.js'), path.join('core', 'store', 'migrate.js')]);
// واجهة التنزيلات محصورة في ملفات ترجمان (اعتماد سلطان 2026-11-02، عقد interfaces §١٣): في src/core/save وsrc/background
// وحدهما؛ والوصول إلى كائنها (.downloads) في أسطر مراجَعة حرفيًا تسلّمه إلى متغير اسمه downloads لا غير؛ ولا يُستدعى منه
// إلا download وsearch، وsearch بالمعرّف وحده. فلا بحث في تنزيلات المستخدم، ولا فتح ولا حذف، ولا مستمعات تمس كل التنزيلات.
const DL_DIRS = [path.join('core', 'save') + path.sep, 'background' + path.sep];
const DL_OBJECT = /\b(?:chrome|api)\s*\??\.\s*downloads\b/;
const DL_SOURCES = new Set([
  'const downloads = api?.downloads;',
  'export async function savedPath(downloadId, { downloads = globalThis.chrome?.downloads, extensionId = globalThis.chrome?.runtime?.id ?? null } = {}) {',
  'createSaveService({ runtime: chrome.runtime, downloads: chrome.downloads, store: createStore({ area, transport: localTransport(writer) }) }).install();',
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
  const text = await readFile(file, 'utf8');
  if (rel.endsWith('.html')) for (const r of HTML_INLINE) if (r.re.test(text)) problems.push(`${rel}: ${r.msg}`);
  codeLines(text).forEach((line, i) => {
    if (!line.trim()) return;
    const at = `${rel}:${i + 1}`;
    for (const r of RULES) if (r.re.test(line) && !r.allow?.(rel, line)) problems.push(`${at}: ${r.msg}`);
    if (NETWORK.test(line) && !(rel === CAPTURE && PASSTHROUGH.has(line.trim())) && !PACKAGED_READS.get(rel)?.has(line.trim())
      && !(rel === REPORT_FILE && REPORT_LINES.has(line.trim()))) problems.push(`${at}: طلب شبكة من الإضافة`);
    if (REQUEST_ALIAS.test(line) && !ALIAS_LINES.get(rel)?.has(line.trim())) problems.push(`${at}: اسم مستعار لطلب شبكة خارج أسطره المراجَعة`);
    for (const m of line.matchAll(URL_RE)) if (!URL_OK(m[0], rel)) problems.push(`${at}: نطاق خارجي ${m[0].slice(0, 60)}`);
    if (STORAGE.test(line) && !inStore) problems.push(`${at}: التخزين خارج src/core/store`);
    if (STORE_WRITE.test(line) && !STORE_WRITERS.has(rel)) problems.push(`${at}: الكتابة في التخزين عبر الكاتب الواحد وحده (writer.js)`);
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
console.log('check-static: ناجح (بيانا Chromium وFirefox والأذونات المعتمدة، ولا HTML نصي ولا eval ولا شيفرة بعيدة ولا نطاقات خارجية ولا طلبات ولا تسجيل)');
