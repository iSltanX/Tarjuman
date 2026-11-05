#!/usr/bin/env node
// حزمة التثبيت الشخصي (P9-AC5): بناء الإنتاج في مجلد باسم الإصدار، ثم تدقيقه (audit.mjs: الأذونات، ولا اتصال خارجي،
// وخطوط الترجمة ورخصها)، ثم أرشيف ZIP منه يُتحقق من محتواه، وملف وصف بالبصمات. للاستخدام الشخصي وحده: لا نشر في المتجر.
// والفحص الثابت قبل البناء، والبناء في مجلد مرحلي، فلا يُكتب في مجلد الإخراج شيء قبل حكم التدقيق والأرشيف (تدقيق 7a66f91،
// U61: كان الأرشيف والوصف يُكتبان ثم يُحكم بالفشل فيبقى أرشيف فاشل في release/).
//   node scripts/release/package.mjs [--out <مجلد>]
// الافتراضي release/ في جذر المستودع (متجاهَل في Git). الناتج:
//   release/tarjuman-<الإصدار>/       المجلد الذي يُحمَّل بـ«Load unpacked» (يُنسخ أولًا إلى مكان دائم)
//   release/tarjuman-<الإصدار>.zip    أرشيف المجلد نفسه للحفظ والنقل
//   release/tarjuman-<الإصدار>.json   الإصدار والالتزام وبصمة كل ملف ونتيجة التدقيق
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { auditPackage } from './audit.mjs';
import { buildEnvironment, dirtyNote, sourceState, staticCheck } from './provenance.mjs';
import { createZip, readZip } from './zip.mjs';
import { insidePath, outDirProblem } from '../targets.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');
// بمقاطع المسار لا بالنص (src/..foo داخل src؛ تدقيق 7a66f91، U60).
const inside = insidePath;

/**
 * @param {{ out?: string, log?: (s: string) => void }} [o]
 * @returns {Promise<{ ok: boolean, name: string, dir: string, zip: string, meta: object, problems: string[] }>}
 *   عند الفشل لا يُكتب شيء في مجلد الإخراج (ويبقى ما كان فيه)، وproblems أسبابه.
 */
export async function makePackage({ out = path.join(ROOT, 'release'), log = () => {} } = {}) {
  const OUT = path.resolve(out);
  if (OUT === ROOT || inside(ROOT, OUT) || inside(OUT, path.join(ROOT, 'src'))) throw new Error(`مجلد إخراج غير آمن: ${OUT}`);
  const manifest = JSON.parse(await readFile(path.join(ROOT, 'src/manifest.json'), 'utf8'));
  const name = `tarjuman-${manifest.version}`;
  const dir = path.join(OUT, name);
  const zip = path.join(OUT, `${name}.zip`);
  const meta = {
    name, version: manifest.version, minimumChromeVersion: manifest.minimum_chrome_version,
    ...sourceState(ROOT, ['src', 'scripts']), build: buildEnvironment(),
    builtAt: new Date().toISOString(), zip: null, audit: null, files: [],
  };
  const fail = (problems) => ({ ok: false, name, dir, zip, meta, problems });

  const check = staticCheck(ROOT);
  log(`${check.ok ? '✓' : '✗'} check-static`);
  if (!check.ok) return fail([`check-static: ${check.output.split('\n').slice(0, 6).join(' ')}`]);

  await mkdir(OUT, { recursive: true });
  const stage = await mkdtemp(path.join(OUT, `.${name}-`));
  try {
    const built = path.join(stage, name);
    execFileSync(process.execPath, [path.join(ROOT, 'scripts/build.mjs'), '--out', built], { cwd: ROOT, stdio: 'ignore' });
    log(`بُني الإنتاج في مجلد مرحلي`);

    const audit = await auditPackage(built);
    for (const c of audit.checks) log(`${c.ok ? '✓' : '✗'} ${c.id}`);
    meta.audit = { ok: audit.ok, checks: audit.checks.map(({ id, ok }) => ({ id, ok })) };
    const files = [];
    for (const rel of audit.files) {
      const data = await readFile(path.join(built, rel));
      files.push({ path: rel, bytes: data.length, sha256: sha256(data), data });
    }
    meta.files = files.map(({ path: p, bytes, sha256: h }) => ({ path: p, bytes, sha256: h }));
    if (!audit.ok) return fail(audit.checks.filter((c) => !c.ok).map((c) => `تدقيق ${c.id}`));
    const zipBuf = createZip(files.map((f) => ({ name: `${name}/${f.path}`, data: f.data })));
    const back = readZip(zipBuf);
    const zipOk = back.length === files.length && back.every((e, i) => e.name === `${name}/${files[i].path}` && sha256(e.data) === files[i].sha256);
    meta.zip = { file: path.basename(zip), bytes: zipBuf.length, sha256: sha256(zipBuf), verified: zipOk };
    log(`الأرشيف ${path.basename(zip)}: ${zipBuf.length} بايت، ${zipOk ? 'محتواه مطابق للمجلد' : 'محتواه لا يطابق المجلد'}`);
    if (!zipOk) return fail(['الأرشيف لا يطابق المجلد']);

    // بعد الحكم وحده: المجلد مكان السابق إن كان مجلد بناء (U60: لا يُمسح ما لا يملكه البناء)، ثم الأرشيف والوصف.
    const owned = await outDirProblem(dir, { root: ROOT });
    if (owned) return fail([`مجلد الحزمة ليس مجلد بناء يُستبدل (${owned}): ${dir}`]);
    await rm(dir, { recursive: true, force: true });
    await rename(built, dir);
    await writeFile(zip, zipBuf);
    await writeFile(path.join(OUT, `${name}.json`), `${JSON.stringify(meta, null, 2)}\n`);
    return { ok: true, name, dir, zip, meta, problems: [] };
  } finally {
    await rm(stage, { recursive: true, force: true });
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const argv = process.argv.slice(2);
  const outArg = argv.indexOf('--out');
  const r = await makePackage({ out: outArg > -1 ? argv[outArg + 1] : undefined, log: (s) => console.log(s) });
  if (!r.ok) console.error(`\nلم تُكتب الحزمة:\n- ${r.problems.join('\n- ')}`);
  console.log(`\nالحزمة ${r.name}: ${r.ok ? 'جاهزة للتثبيت الشخصي' : 'فاشلة'}${dirtyNote(r.meta.dirty)} · الالتزام ${r.meta.commit ?? 'غير معروف'}`);
  process.exit(r.ok ? 0 : 1);
}
