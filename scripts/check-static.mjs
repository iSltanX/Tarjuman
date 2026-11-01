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
  'host_permissions', 'optional_permissions', 'optional_host_permissions', 'background', 'web_accessible_resources',
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
for (const p of PAGES) {
  for (const f of ['index.html', 'main.js']) if (!(await exists(path.join(SRC, 'pages', p, f)))) problems.push(`pages: ${p}/${f} مفقود`);
}

// ٢. أنماط ممنوعة في الشيفرة والصفحات والأنماط.
const RULES = [
  { re: /\.innerHTML\b|\.outerHTML\b|insertAdjacentHTML|document\.write\b|createContextualFragment|\.srcdoc\b|parseFromString\([^)]*text\/html/, msg: 'إدراج HTML نصي ممنوع؛ textContent وDOM فقط' },
  { re: /\beval\s*\(|new\s+Function\s*\(|set(?:Timeout|Interval)\s*\(\s*['"`]/, msg: 'تنفيذ نص كشيفرة ممنوع' },
  { re: /\bimport\s*\(\s*['"`](?:https?:)?\/\/|importScripts\s*\(|<script[^>]*\bsrc\s*=\s*["'](?:https?:)?\/\//i, msg: 'شيفرة بعيدة ممنوعة' },
  { re: /\bsetOption\s*\(|\bloadModule\s*\(/, msg: 'تفعيل المشغّل برمجيًا ممنوع دون قرار سلطان' },
  { re: /youtubei\/v1|innertube|get_transcript|get_panel/i, msg: 'طلبات InnerTube ممنوعة' },
  { re: /navigator\.sendBeacon|new\s+WebSocket|new\s+EventSource|new\s+XMLHttpRequest\b/, msg: 'قنوات شبكة ممنوعة' },
  {
    re: /chrome\.(?:downloads|webRequest|declarativeNetRequest|scripting|cookies|identity|history|bookmarks|debugger|management|offscreen|permissions\.request)\b|chrome\.tabs\.(?:executeScript|insertCSS)/,
    msg: 'واجهة تحتاج إذنًا غير معتمد',
  },
  { re: /\b(?:localStorage|sessionStorage|indexedDB)\b/, msg: 'التخزين عبر src/core/store وحده (لا localStorage ولا IndexedDB)' },
  { re: /\bconsole\.(?:log|info|warn|error|debug|trace)\b/, msg: 'التسجيل في الكونسول ممنوع؛ الأخطاء برموز وتقرير التشخيص' },
];
// الطلب الوحيد المسموح: تمرير طلب الصفحة نفسه في غلاف fetch داخل capture.js.
const NETWORK = /(?<!function\s+)\bfetch\s*\(|\.open\s*\(\s*['"](?:GET|POST)/;
const PASSTHROUGH = new Set(['  const result = origFetch.apply(this, arguments); // الطلب الوحيد: طلب الصفحة نفسه.']);
// الروابط الحرفية: عنوان المشاهدة على يوتيوب وحده (أمر «فتح الفيديو»)، ونطاق أسماء SVG ليس طلبًا.
const URL_RE = /(?:https?:)?\/\/[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+[^\s'"`)]*/g;
const URL_OK = (u) => u.startsWith('https://www.youtube.com/') || u === 'http://www.w3.org/2000/svg';
const COMMENT = /^\s*(?:\/\/|\*|\/\*)/;

for (const file of await walk(SRC)) {
  if (!/\.(?:m?js|html|css)$/.test(file)) continue;
  const rel = path.relative(SRC, file);
  const lines = (await readFile(file, 'utf8')).split('\n');
  lines.forEach((line, i) => {
    if (COMMENT.test(line)) return;
    const at = `${rel}:${i + 1}`;
    for (const r of RULES) if (r.re.test(line)) problems.push(`${at}: ${r.msg}`);
    if (NETWORK.test(line) && !PASSTHROUGH.has(line)) problems.push(`${at}: طلب شبكة من الإضافة`);
    for (const m of line.matchAll(URL_RE)) if (!URL_OK(m[0])) problems.push(`${at}: نطاق خارجي ${m[0].slice(0, 60)}`);
    if (/chrome\.storage\b/.test(line) && !rel.startsWith(path.join('core', 'store') + path.sep)) problems.push(`${at}: chrome.storage خارج src/core/store`);
  });
}

if (problems.length) {
  console.error(`check-static: ${problems.length} مخالفة\n- ${problems.join('\n- ')}`);
  process.exit(1);
}
console.log('check-static: ناجح (البيان والأذونات المعتمدة، ولا HTML نصي ولا eval ولا شيفرة بعيدة ولا نطاقات خارجية ولا طلبات ولا تسجيل)');
