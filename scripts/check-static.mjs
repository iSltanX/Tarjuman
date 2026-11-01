#!/usr/bin/env node
// فحوص ثابتة على src/: الأذونات، ولا innerHTML، ولا طلبات شبكة من الإضافة، ولا تفعيل برمجي للمشغّل،
// ولا تسجيل في سكربتي المحتوى. يخرج برمز 1 عند أي مخالفة.
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'src');
const problems = [];

async function walk(dir) {
  const out = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...(await walk(p)));
    else out.push(p);
  }
  return out;
}

// ١. البيان: storage فقط، ولا host_permissions، وسكربت MAIN عند document_start.
const manifest = JSON.parse(await readFile(path.join(SRC, 'manifest.json'), 'utf8'));
const perms = manifest.permissions || [];
if (manifest.manifest_version !== 3) problems.push('manifest: ليس MV3');
if (perms.length !== 1 || perms[0] !== 'storage') problems.push(`manifest: الأذونات ${JSON.stringify(perms)} والمسموح ["storage"] فقط`);
for (const k of ['host_permissions', 'optional_permissions', 'optional_host_permissions', 'background', 'web_accessible_resources', 'externally_connectable']) {
  if (k in manifest) problems.push(`manifest: المفتاح ${k} غير مسموح في P1`);
}
const main = (manifest.content_scripts || []).find((c) => c.world === 'MAIN');
if (!main || main.run_at !== 'document_start') problems.push('manifest: سكربت MAIN عند document_start مفقود');
for (const c of manifest.content_scripts || []) {
  if (JSON.stringify(c.matches) !== '["https://www.youtube.com/*"]') problems.push(`manifest: مطابقة غير متوقعة ${JSON.stringify(c.matches)}`);
}

// ٢. أنماط ممنوعة في الشيفرة.
const RULES = [
  { re: /\.innerHTML\b|\.outerHTML\b|insertAdjacentHTML|document\.write\b/, msg: 'إدراج HTML ممنوع؛ textContent فقط' },
  { re: /\beval\s*\(|new\s+Function\s*\(/, msg: 'eval وnew Function ممنوعان' },
  { re: /\bsetOption\s*\(|\bloadModule\s*\(/, msg: 'تفعيل المشغّل برمجيًا ممنوع دون قرار سلطان' },
  { re: /youtubei\/v1|innertube|get_transcript|get_panel/i, msg: 'طلبات InnerTube ممنوعة' },
  { re: /navigator\.sendBeacon|new\s+WebSocket|new\s+EventSource/, msg: 'قنوات شبكة ممنوعة' },
  { re: /chrome\.downloads|chrome\.webRequest|chrome\.scripting/, msg: 'واجهات تحتاج أذونات غير مسموحة' },
];
// الطلبات: لا fetch ولا XMLHttpRequest جديد إلا في غلافي capture.js اللذين يمرّران طلب الصفحة.
const NETWORK = /(?<!function\s+)\bfetch\s*\(|new\s+XMLHttpRequest\b|\.open\s*\(\s*['"](?:GET|POST)/;
const PASSTHROUGH = new Set([
  "  const result = origFetch.apply(this, arguments); // الطلب الوحيد: طلب الصفحة نفسه.",
]);

for (const file of await walk(SRC)) {
  if (!/\.(m?js|html)$/.test(file)) continue;
  const rel = path.relative(ROOT, file);
  const lines = (await readFile(file, 'utf8')).split('\n');
  lines.forEach((line, i) => {
    if (/^\s*\/\//.test(line)) return;
    for (const r of RULES) if (r.re.test(line)) problems.push(`${rel}:${i + 1}: ${r.msg}`);
    if (NETWORK.test(line) && !PASSTHROUGH.has(line)) problems.push(`${rel}:${i + 1}: طلب شبكة من الإضافة`);
    if (/\bconsole\.(log|info|warn|error|debug)\b/.test(line) && /src\/(main-world|content|extract)\//.test(rel)) {
      problems.push(`${rel}:${i + 1}: تسجيل في سكربتات المحتوى ممنوع في P1`);
    }
  });
}

if (problems.length) {
  console.error(`check-static: ${problems.length} مخالفة\n- ${problems.join('\n- ')}`);
  process.exit(1);
}
console.log('check-static: ناجح (الأذونات، ولا HTML، ولا طلبات من الإضافة، ولا تفعيل برمجي)');
