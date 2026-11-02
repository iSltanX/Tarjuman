#!/usr/bin/env node
// حزمة التثبيت الشخصي (P9-AC5): بناء الإنتاج في مجلد باسم الإصدار، ثم تدقيقه (audit.mjs: الأذونات، ولا اتصال خارجي،
// وخطوط الترجمة ورخصها)، ثم أرشيف ZIP منه يُتحقق من محتواه، وملف وصف بالبصمات. للاستخدام الشخصي وحده: لا نشر في المتجر.
//   node scripts/release/package.mjs [--out <مجلد>]
// الافتراضي release/ في جذر المستودع (متجاهَل في Git). الناتج:
//   release/tarjuman-<الإصدار>/       المجلد الذي يُحمَّل بـ«Load unpacked» (يُنسخ أولًا إلى مكان دائم)
//   release/tarjuman-<الإصدار>.zip    أرشيف المجلد نفسه للحفظ والنقل
//   release/tarjuman-<الإصدار>.json   الإصدار والالتزام وبصمة كل ملف ونتيجة التدقيق
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { auditPackage } from './audit.mjs';
import { createZip, readZip } from './zip.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');
const inside = (child, parent) => !path.relative(parent, child).startsWith('..') && !path.isAbsolute(path.relative(parent, child));

function git(args) {
  try {
    return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return null;
  }
}

/**
 * @param {{ out?: string, log?: (s: string) => void }} [o]
 * @returns {Promise<{ ok: boolean, name: string, dir: string, zip: string, meta: object }>}
 */
export async function makePackage({ out = path.join(ROOT, 'release'), log = () => {} } = {}) {
  const OUT = path.resolve(out);
  if (OUT === ROOT || inside(ROOT, OUT) || inside(OUT, path.join(ROOT, 'src'))) throw new Error(`مجلد إخراج غير آمن: ${OUT}`);
  const manifest = JSON.parse(await readFile(path.join(ROOT, 'src/manifest.json'), 'utf8'));
  const name = `tarjuman-${manifest.version}`;
  const dir = path.join(OUT, name);
  await mkdir(OUT, { recursive: true });
  execFileSync(process.execPath, [path.join(ROOT, 'scripts/build.mjs'), '--out', dir], { cwd: ROOT, stdio: 'ignore' });
  log(`بُني الإنتاج في ${path.relative(ROOT, dir) || dir}`);

  const audit = await auditPackage(dir);
  for (const c of audit.checks) log(`${c.ok ? '✓' : '✗'} ${c.id}`);
  const files = [];
  for (const rel of audit.files) {
    const data = await readFile(path.join(dir, rel));
    files.push({ path: rel, bytes: data.length, sha256: sha256(data), data });
  }
  const zipBuf = createZip(files.map((f) => ({ name: `${name}/${f.path}`, data: f.data })));
  const back = readZip(zipBuf);
  const zipOk = back.length === files.length && back.every((e, i) => e.name === `${name}/${files[i].path}` && sha256(e.data) === files[i].sha256);
  const zip = path.join(OUT, `${name}.zip`);
  await writeFile(zip, zipBuf);

  const meta = {
    name, version: manifest.version, minimumChromeVersion: manifest.minimum_chrome_version,
    commit: git(['rev-parse', '--short=12', 'HEAD']), dirty: Boolean(git(['status', '--porcelain', '--', 'src', 'scripts'])),
    builtAt: new Date().toISOString(),
    zip: { file: path.basename(zip), bytes: zipBuf.length, sha256: sha256(zipBuf), verified: zipOk },
    audit: { ok: audit.ok, checks: audit.checks.map(({ id, ok }) => ({ id, ok })) },
    files: files.map(({ path: p, bytes, sha256: h }) => ({ path: p, bytes, sha256: h })),
  };
  await writeFile(path.join(OUT, `${name}.json`), `${JSON.stringify(meta, null, 2)}\n`);
  log(`الأرشيف ${path.basename(zip)}: ${zipBuf.length} بايت، ${zipOk ? 'محتواه مطابق للمجلد' : 'محتواه لا يطابق المجلد'}`);
  return { ok: audit.ok && zipOk, name, dir, zip, meta };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const argv = process.argv.slice(2);
  const outArg = argv.indexOf('--out');
  const r = await makePackage({ out: outArg > -1 ? argv[outArg + 1] : undefined, log: (s) => console.log(s) });
  console.log(`\nالحزمة ${r.name}: ${r.ok ? 'جاهزة للتثبيت الشخصي' : 'فاشلة'}${r.meta.dirty ? ' (من شجرة فيها تغييرات غير ملتزمة)' : ''} · الالتزام ${r.meta.commit ?? 'غير معروف'}`);
  process.exit(r.ok ? 0 : 1);
}
