// A6 — CL-N4 وCL-N5: إعداد CI وسكربتات التثبيت، ونطاق check-secrets، ومسح أنماط الأسرار والمسارات المحلية على الملفات المتتبَّعة.
// لا يطبع أي قيمة مطابقة: أعداد ومسارات ملفات وتصنيف مقنَّع فقط. يقرأ Git المحلي وحده (لا شبكة).
// الاستعمال: command node repo-hygiene.mjs <جذر الشيفرة (نسخة Git)>
import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const R = process.argv[2];
if (!R) throw new Error('الوسيط الأول: جذر الشيفرة');
const git = (...a) => execFileSync('git', ['-C', R, ...a], { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
console.log(`# A6 — صحة المستودع (HEAD ${git('rev-parse', 'HEAD').trim()})`);

// ١. CI
{
  console.log('\n## ١. .github/workflows/ci.yml');
  const ci = readFileSync(path.join(R, '.github/workflows/ci.yml'), 'utf8').split('\n');
  ci.forEach((l, i) => {
    const m = /uses:\s*(\S+)@(\S+)/.exec(l);
    if (m) console.log(`  سطر ${i + 1}: ${m[1]}@${m[2]} — ${/^[0-9a-f]{40}$/.test(m[2]) ? 'مثبت بمعرّف التزام' : 'وسم متحرك (ليس SHA)'}`);
    if (/npm (ci|install)/.test(l)) console.log(`  سطر ${i + 1}: ${l.trim()} — ${/--ignore-scripts/.test(l) ? 'بلا سكربتات تثبيت' : 'سكربتات التثبيت تعمل'}`);
    if (/^permissions:|^\s+contents:/.test(l)) console.log(`  سطر ${i + 1}: ${l.trim()}`);
    if (/pull_request_target|secrets\./.test(l)) console.log(`  سطر ${i + 1}: ${l.trim()} — انتبه`);
  });
  console.log(`  pull_request_target أو secrets.*: ${ci.some((l) => /pull_request_target|secrets\./.test(l)) ? 'موجود' : 'لا شيء'}`);
  for (const f of ['.github/dependabot.yml', '.github/dependabot.yaml']) console.log(`  ${f}: ${existsSync(path.join(R, f)) ? 'موجود' : 'غائب'}`);
  const lock = JSON.parse(readFileSync(path.join(R, 'package-lock.json'), 'utf8'));
  const scripts = Object.entries(lock.packages).filter(([, v]) => v.hasInstallScript).map(([k, v]) => `${k.replace('node_modules/', '')}@${v.version}${v.dev ? ' (dev)' : ''}`);
  console.log(`  حزم بسكربت تثبيت في package-lock.json: ${JSON.stringify(scripts)}`);
  const pkg = JSON.parse(readFileSync(path.join(R, 'package.json'), 'utf8'));
  console.log(`  dependencies: ${JSON.stringify(pkg.dependencies ?? {})}، devDependencies: ${JSON.stringify(pkg.devDependencies ?? {})}`);
}

// ٢. نطاق check-secrets
const tracked = git('ls-files', '-z').split('\0').filter(Boolean);
{
  console.log('\n## ٢. نطاق scripts/check-secrets.mjs');
  const src = readFileSync(path.join(R, 'scripts/check-secrets.mjs'), 'utf8');
  const scopes = JSON.parse(/const SCOPES = (\[[^\]]+\]);/.exec(src)[1].replace(/'/g, '"'));
  const text = new RegExp(/const TEXT = \/(.+)\/i;/.exec(src)[1], 'i');
  const inScope = tracked.filter((f) => scopes.some((s) => f.startsWith(`${s}/`)));
  const scanned = inScope.filter((f) => text.test(path.basename(f)));
  const images = tracked.filter((f) => /\.(png|jpe?g|gif|webp)$/i.test(f));
  console.log(`  SCOPES=${JSON.stringify(scopes)}، TEXT=${text}`);
  console.log(`  الملفات المتتبَّعة: ${tracked.length}؛ داخل النطاقات: ${inScope.length}؛ يفحصها فعلًا (امتداد نصي): ${scanned.length}؛ خارج الفحص: ${tracked.length - scanned.length}`);
  console.log(`  الصور المتتبَّعة: ${images.length} (في docs/evidence: ${images.filter((f) => f.startsWith('docs/evidence/')).length})، ولا يفحص أيًّا منها`);
}

// ٣. مسح أنماط الأسرار على كل الملفات المتتبَّعة (نصية وثنائية)
{
  console.log('\n## ٣. مسح الأنماط على كل الملفات المتتبَّعة (لا تُطبع القيم)');
  const user = os.userInfo().username;
  const PATTERNS = [
    ['GitHub token (ghp_/gho_/ghu_/ghs_/ghr_)', /\bgh[pousr]_[A-Za-z0-9]{36}\b/g],
    ['GitHub fine-grained PAT', /\bgithub_pat_[A-Za-z0-9_]{20,}/g],
    ['AWS access key (AKIA)', /\bAKIA[0-9A-Z]{16}\b/g],
    ['Google API key (AIza)', /\bAIza[0-9A-Za-z_-]{35}\b/g],
    ['Slack token (xox?-)', /\bxox[baprs]-[0-9A-Za-z-]{10,}/g],
    ['Private key block', /-----BEGIN [A-Z ]*PRIVATE KEY-----/g],
    ['OpenAI/Anthropic key (sk-/sk-ant-)', /(?<![A-Za-z0-9])sk-(?:ant-)?[A-Za-z0-9_-]{20,}/g],
    ['/Users/<name>/', /\/Users\/([^/\s"'`]+)\//g],
    ['/Volumes/<name>/', /\/Volumes\/([^/\s"'`]+)\//g],
    ['/private/tmp|var/', /\/private\/(?:tmp|var)\//g],
    ['اسم المستخدم المحلي الحقيقي', new RegExp(`\\b${user.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'g')],
  ];
  const hits = new Map(PATTERNS.map(([n]) => [n, { files: new Set(), count: 0, names: new Map() }]));
  for (const f of tracked) {
    let buf;
    try { buf = readFileSync(path.join(R, f)); } catch { continue; }
    const s = buf.toString('latin1');
    for (const [n, re] of PATTERNS) {
      for (const m of s.matchAll(re)) {
        const h = hits.get(n);
        h.files.add(f);
        h.count++;
        if (m[1] !== undefined) h.names.set(m[1] === user ? '<REAL_LOCAL_USER>' : n.startsWith('/Volumes') ? '<VOLUME>' : m[1], (h.names.get(m[1]) ?? 0) + 1);
      }
    }
  }
  for (const [n, h] of hits) {
    console.log(`  ${n}: ${h.count} مطابقة في ${h.files.size} ملف${h.names.size ? `؛ الأسماء: ${JSON.stringify([...h.names.keys()])}` : ''}`);
    for (const f of [...h.files].slice(0, 12)) console.log(`    ${f}`);
  }
}

// ٤. بيانات الصور الوصفية
{
  console.log('\n## ٤. بيانات الصور الوصفية (PNG tEXt/iTXt/zTXt/eXIf وJPEG EXIF)');
  let text = 0;
  let exif = 0;
  let exifStrings = 0;
  for (const f of tracked.filter((x) => /\.(png|jpe?g)$/i.test(x))) {
    const b = readFileSync(path.join(R, f));
    let seg = null;
    if (b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
      for (let i = 8; i + 8 <= b.length;) {
        const len = b.readUInt32BE(i);
        const type = b.subarray(i + 4, i + 8).toString('latin1');
        if (['tEXt', 'iTXt', 'zTXt'].includes(type)) text++;
        if (type === 'eXIf') seg = b.subarray(i + 8, i + 8 + len);
        i += 12 + len;
      }
    } else if (b[0] === 0xff && b[1] === 0xd8) {
      const j = b.indexOf('Exif\0\0', 0, 'latin1');
      if (j >= 0 && j < 65536) seg = b.subarray(j, j + 4096);
    }
    if (seg) {
      exif++;
      if (/[ -~]{5,}/.test(seg.toString('latin1'))) exifStrings++;
    }
  }
  console.log(`  كتل نصية في PNG: ${text}؛ كتل EXIF: ${exif}، منها بنص مقروء (5 محارف فأكثر): ${exifStrings}`);
}
