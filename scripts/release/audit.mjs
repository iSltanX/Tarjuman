#!/usr/bin/env node
// تدقيق حزمة الإضافة المبنية قبل تسليمها للتثبيت الشخصي (P9-AC4 وAC5، وللإصدار الثاني P15-AC4 وAC6): يقرأ الملفات
// المشحونة نفسها لا المصدر. الأذونات ضمن المعتمد وحده، ولا اتصال خارجي (لا طلب شبكة إلا قراءة خط من الحزمة، ولا رابط إلا
// المسموح)، ولا شيفرة بعيدة ولا تقييم نصي ولا HTML نصي، ولا خطاف تطوير ولا معرض مكوّنات، وكل خط ترجمة مضمّن بملفيه ورخصته.
// والإصدار الثاني (product-spec §١٠ «الأذونات والعامل الخلفي»): إذن downloads وحده وعامل خلفي للحفظ فقط، وواجهة التنزيلات
// محصورة في download وsearch (عقد interfaces §١٣: صفحات الإضافة مباشرة عبر core/save، والعامل لسكربت المحتوى)، ولا تصل
// إليها شيفرة عالم الصفحة. وكل ملف يشير إليه البيان أو صفحة أو نمط موجود غير فارغ، وخطوط الواجهة كخطوط الترجمة برخصها.
//   node scripts/release/audit.mjs <مجلد الإضافة المبنية>
import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SUBTITLE_FONT_LIST } from '../../src/ui/subtitle-fonts.js';
import { UI_FONT_LIST } from '../../src/ui/ui-fonts.js';

/** الأذونات المعتمدة (product-spec §١٠، والتحقق في P2، وdownloads للإصدار الثاني): لا غيرها ولا host_permissions ولا اختيارية. */
export const APPROVED_PERMISSIONS = ['storage', 'unlimitedStorage', 'downloads'];
/** العامل الخلفي الوحيد: خدمة الحفظ (P10). */
export const WORKER = 'background/worker.js';
/** شيفرة عالم الصفحة (MAIN): لا واجهات إضافة فيها. */
const MAIN_WORLD = 'main-world/capture.js';
const YOUTUBE_MATCH = 'https://www.youtube.com/*';
/**
 * الروابط المسموحة في شيفرة الحزمة: نطاق SVG، ورابط الفيديو في تعليمات الترجمة، ورابطا «حول» في صفحة الإعدادات وحدها،
 * وأصل يوتيوب في العامل للتحقق من مرسل الرسالة (لا طلب إليه).
 */
const URL_OK = (u, rel) => u === 'http://www.w3.org/2000/svg'
  || u === YOUTUBE_MATCH
  || u.startsWith('https://www.youtube.com/watch?v=')
  || (rel === 'pages/settings/main.js' && (u === 'https://bysltan.com' || u === 'https://github.com/iSltanX/Tarjuman'))
  || (rel === WORKER && u === 'https://www.youtube.com/');
/** طلب الشبكة الوحيد في الحزمة: قراءة خط الترجمة من ملفاتها (P6، chrome-extension://). */
const FETCH_OK = new Map([['content/main.js', [/\bfetch\(runtime\.getURL\(/]]]);
const FORBIDDEN = [
  { re: /\bnew\s+(?:XMLHttpRequest|WebSocket|EventSource)\b/, why: 'اتصال شبكة جديد' },
  { re: /\bsendBeacon\s*\(|\bimportScripts\s*\(/, why: 'إرسال أو تحميل شيفرة' },
  { re: /\beval\s*\(|\bnew\s+Function\s*\(/, why: 'تقييم نص شيفرةً' },
  { re: /\.innerHTML\s*=|\.outerHTML\s*=|insertAdjacentHTML\s*\(|document\.write\s*\(/, why: 'HTML نصي' },
  { re: /\bchrome\.(?:debugger|scripting|tabs\.executeScript|webRequest|cookies)\b/, why: 'واجهة متصفح غير معتمدة' },
  { re: /\bchrome\s*\??\.\s*downloads\b/, why: 'واجهة التنزيلات في عالم الصفحة', only: [MAIN_WORLD] },
  // ما نزّلته الإضافة وحده: لا فتح ولا حذف ولا مسح ولا إظهار ولا اعتراض أسماء ولا متابعة تنزيلات المستخدم، ولا استدعاء غير
  // download وsearch (بالنقطة أو ?. ؛ كان النمط القديم لا يطابق chrome?.downloads، تدقيق 5fedcb9).
  { re: /\bdownloads\s*\??\.\s*(?:open|show|showDefaultFolder|removeFile|erase|acceptDanger|pause|resume|cancel|setShelfEnabled|setUiOptions|getFileIcon|onDeterminingFilename|onCreated|onChanged|onErased)\b/, why: 'استعمال للتنزيلات خارج الحفظ' },
  { re: /\bdownloads\s*\??\.\s*(?!(?:download|search)\b)[A-Za-z_$][\w$]*\s*\(/, why: 'استعمال للتنزيلات خارج الحفظ' },
  { re: /<script[^>]+src=["']https?:/i, why: 'شيفرة بعيدة' },
  { re: /__tarjuman\b|__TJ_DEV__/, why: 'خطاف تطوير' },
  { re: /\bconsole\.(?:log|info|warn|error|debug)\s*\(/, why: 'تسجيل في الكونسول' },
];
const URL_RE = /https?:\/\/[^\s"'`)<>\\]+/g;

async function walk(dir, base = dir) {
  const out = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...(await walk(p, base)));
    else out.push(path.relative(base, p).split(path.sep).join('/'));
  }
  return out.sort();
}

/**
 * @param {string} dir مجلد الإضافة المبنية
 * @returns {Promise<{ ok: boolean, checks: { id: string, ok: boolean, detail: unknown }[], files: string[] }>}
 */
export async function auditPackage(dir) {
  const checks = [];
  const check = (id, ok, detail = null) => checks.push({ id, ok: !!ok, detail });
  const files = await walk(dir);
  const manifest = JSON.parse(await readFile(path.join(dir, 'manifest.json'), 'utf8'));

  // ---- البيان والأذونات ----
  const perms = [...(manifest.permissions ?? [])].sort();
  check('permissions-approved-only', JSON.stringify(perms) === JSON.stringify([...APPROVED_PERMISSIONS].sort()), { permissions: perms });
  check('no-host-or-optional-permissions', !manifest.host_permissions && !manifest.optional_permissions && !manifest.optional_host_permissions,
    { host: manifest.host_permissions ?? null, optional: manifest.optional_permissions ?? null });
  const matches = (manifest.content_scripts ?? []).flatMap((c) => c.matches ?? []);
  check('content-scripts-youtube-only', matches.length > 0 && matches.every((m) => m === YOUTUBE_MATCH)
    && (manifest.content_scripts ?? []).every((c) => c.all_frames === false), { matches: [...new Set(matches)] });
  const war = manifest.web_accessible_resources ?? [];
  // خطوط الترجمة، وخطا الواجهة المضمّنان لأدوات المشغّل (جولة الصقل §١)؛ لا غيرهما.
  check('web-accessible-fonts-only', war.every((w) => w.resources.every((r) => r === 'ui/fonts/subtitle/*.woff2' || r === 'ui/fonts/ui/*.woff2') && w.matches.every((m) => m === YOUTUBE_MATCH) && w.use_dynamic_url === true),
    { resources: war.flatMap((w) => w.resources) });
  const bg = manifest.background ?? null;
  check('save-worker-only-and-no-externally-connectable', JSON.stringify(bg) === JSON.stringify({ service_worker: WORKER })
    && !manifest.externally_connectable && !manifest.content_security_policy,
    { background: bg, externallyConnectable: !!manifest.externally_connectable, csp: !!manifest.content_security_policy });
  check('manifest-v3-and-no-dev-version-name', manifest.manifest_version === 3 && !manifest.version_name, { version: manifest.version, versionName: manifest.version_name ?? null });

  // ---- الملفات: لا خرائط مصدر ولا معرض مكوّنات ولا ملفات غير متوقعة ----
  const unexpected = files.filter((f) => !/^(?:manifest\.json|background\/worker\.js|(?:content|main-world)\/main\.js|main-world\/capture\.js|pages\/(?:popup|library|settings|editor)\/[a-z-]+\.(?:html|css|js)|ui\/[a-z-]+\.css|ui\/fonts\/subtitle\/[a-z-]+-(?:400\.woff2|700\.woff2|OFL\.txt)|ui\/fonts\/ui\/[a-z-]+-(?:600\.woff2|700\.woff2|OFL\.txt)|icons\/tarjuman-icon-(?:16|32|48|128)\.png)$/.test(f));
  check('only-expected-files', unexpected.length === 0, { unexpected, files: files.length });
  check('no-source-maps-or-gallery', !files.some((f) => f.endsWith('.map') || f.startsWith('ui/gallery/')), null);

  // ---- الشيفرة المشحونة: الشبكة والروابط والممنوعات ----
  const problems = [];
  for (const rel of files.filter((f) => /\.(?:js|html|css|json)$/.test(f))) {
    const text = await readFile(path.join(dir, rel), 'utf8');
    for (const { re, why, except = [], only = null } of FORBIDDEN) if (!except.includes(rel) && (!only || only.includes(rel)) && re.test(text)) problems.push({ file: rel, why });
    const calls = [...text.matchAll(/\bfetch\s*\(/g)].map((m) => text.slice(m.index, m.index + 40));
    const allowed = FETCH_OK.get(rel) ?? [];
    for (const c of calls) if (!allowed.some((re) => re.test(c))) problems.push({ file: rel, why: 'طلب شبكة', sample: c.slice(0, 30) });
    for (const m of text.matchAll(URL_RE)) {
      const u = m[0].replace(/\$\{.*$/, '');
      if (!URL_OK(u, rel) && !URL_OK(m[0], rel)) problems.push({ file: rel, why: 'رابط خارجي غير مسموح', sample: m[0].slice(0, 50) });
    }
  }
  check('no-external-connection-or-forbidden-code', problems.length === 0, { problems: problems.slice(0, 20) });

  // ---- خطوط الترجمة المضمّنة ورخصها ----
  const fonts = [];
  for (const f of SUBTITLE_FONT_LIST) {
    const want = [f.files[400], f.files[700], f.license];
    const present = want.filter((p) => files.includes(p));
    let ofl = false;
    if (files.includes(f.license)) ofl = /SIL OPEN FONT LICENSE/i.test(await readFile(path.join(dir, f.license), 'utf8'));
    const sizes = await Promise.all(present.map(async (p) => (await stat(path.join(dir, p))).size));
    fonts.push({ id: f.id, files: present.length, ofl, nonEmpty: sizes.every((s) => s > 0) });
  }
  check('subtitle-fonts-with-ofl-licenses', fonts.every((f) => f.files === 3 && f.ofl && f.nonEmpty), { fonts });

  // ---- خطوط الواجهة المضمّنة ورخصها (جولة الصقل §١؛ تدقيق 5fedcb9، GM-028) ----
  const uiFonts = [];
  for (const f of UI_FONT_LIST) {
    const want = [...Object.values(f.files), f.license];
    const present = want.filter((p) => files.includes(p));
    const ofl = files.includes(f.license) && /SIL OPEN FONT LICENSE/i.test(await readFile(path.join(dir, f.license), 'utf8'));
    const sizes = await Promise.all(present.map(async (p) => (await stat(path.join(dir, p))).size));
    uiFonts.push({ id: f.id, files: present.length, want: want.length, ofl, nonEmpty: sizes.every((s) => s > 0) });
  }
  check('ui-fonts-with-ofl-licenses', uiFonts.every((f) => f.files === f.want && f.ofl && f.nonEmpty), { fonts: uiFonts });

  // ---- كل ما يُشار إليه موجود غير فارغ: البيان، ومراجع الصفحات (src وhref)، وروابط الأنماط (url)، وملفات الخطوط ----
  // only-expected-files يمنع الزائد وحده؛ فحزمة ينقصها سكربت معلن كانت تنجح (تدقيق 5fedcb9، CX-007).
  const required = new Set();
  const add = (p) => { if (typeof p === 'string' && p) required.add(path.posix.normalize(p.replace(/^\//, ''))); };
  add(manifest.background?.service_worker);
  for (const c of manifest.content_scripts ?? []) for (const js of c.js ?? []) add(js);
  add(manifest.action?.default_popup);
  for (const v of Object.values(manifest.icons ?? {})) add(v);
  for (const v of Object.values(manifest.action?.default_icon ?? {})) add(v);
  for (const f of [...SUBTITLE_FONT_LIST, ...UI_FONT_LIST]) for (const p of [...Object.values(f.files), f.license]) add(p);
  const local = (ref) => !/^(?:[a-z][a-z0-9+.-]*:|#|\/\/)/i.test(ref);
  for (const rel of files.filter((f) => /\.(?:html|css)$/.test(f))) {
    const text = await readFile(path.join(dir, rel), 'utf8');
    const refs = rel.endsWith('.html')
      ? [...text.matchAll(/\b(?:src|href)\s*=\s*["']([^"']+)["']/gi)].map((m) => m[1])
      : [...text.matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/gi)].map((m) => m[1]);
    for (const ref of refs.filter(local)) add(path.posix.join(path.posix.dirname(rel), ref.split(/[?#]/)[0]));
  }
  const missing = [];
  for (const p of [...required].sort()) {
    if (!files.includes(p)) missing.push(p);
    else if ((await stat(path.join(dir, p))).size === 0) missing.push(`${p} (فارغ)`);
  }
  check('required-assets-present', missing.length === 0, { missing, required: required.size });

  return { ok: checks.every((c) => c.ok), checks, files };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const dir = process.argv[2];
  if (!dir) {
    console.error('الاستعمال: node scripts/release/audit.mjs <مجلد الإضافة المبنية>');
    process.exit(2);
  }
  const r = await auditPackage(path.resolve(dir));
  for (const c of r.checks) console.log(`${c.ok ? '✓' : '✗'} ${c.id}${c.ok ? '' : ` — ${JSON.stringify(c.detail).slice(0, 300)}`}`);
  console.log(`\nالتدقيق: ${r.ok ? 'ناجح' : 'فاشل'} (${r.checks.filter((c) => c.ok).length}/${r.checks.length}، ${r.files.length} ملفًا)`);
  process.exit(r.ok ? 0 : 1);
}
