#!/usr/bin/env node
// فحص آلي لخلو العينات والأدلة والسجلات من pot والتواقيع والروابط وملفات الارتباط والرموز ومسارات الجهاز المحلية.
// يمرّ على test/fixtures/ وعينات test/e2e/fixtures/ (ترجمات حقيقية؛ تدقيق 5fedcb9، GM-028) وأدلة كل المراحل في
// docs/evidence/. الوثائق السردية (.md) قد تذكر روابط مراجع
// عامة، أما روابط يوتيوب وجوجل والأسرار فممنوعة فيها أيضًا. يخرج برمز 1 عند أي اكتشاف.
import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { findSecrets } from '../src/core/diagnostics/sanitize.js';

// --root <مجلد> لفحص شجرة أخرى (لاختبار الفحص نفسه، تدقيق Fable، FA-11).
const rootArg = process.argv.indexOf('--root');
if (rootArg > -1 && !process.argv[rootArg + 1]) {
  console.error('check-secrets: --root يحتاج مجلدًا');
  process.exit(2);
}
const ROOT = rootArg > -1 ? path.resolve(process.argv[rootArg + 1]) : path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SCOPES = ['test/fixtures', 'test/e2e/fixtures', 'docs/evidence'];
const TEXT = /\.(json|srt|txt|log|md|csv|ndjson)$/i;
const SENSITIVE_HOST = /(?:youtu\.?be|youtube|google|googlevideo|ytimg|ggpht)/i;
// مسارات الجهاز المحلية (اسم المستخدم والقرص ومجلدات الجلسات المؤقتة) لا تدخل الأدلة؛ تُكتب برمز عام مثل $SCRATCH/.
const LOCAL_PATH = /(?:\/Users\/[^/\s"'`]+\/|\/private\/(?:tmp|var)\/|\/Volumes\/[^/\s"'`]+\/|\b[A-Za-z]:\\Users\\)/g;

// نطاق غائب أو لا يُقرأ فشل لا «صفر ملفات» (FA-11): كان الخطأ يُبتلع فينجح الفحص ولو نُقلت الأدلة كلها.
async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const out = [];
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...(await walk(p)));
    else if (TEXT.test(e.name)) out.push(p);
  }
  return out;
}

const MAX_BYTES = 50 * 1024 * 1024;
const findings = [];
let scanned = 0;
for (const scope of SCOPES) {
  let files;
  try {
    files = await walk(path.join(ROOT, scope));
  } catch (err) {
    findings.push(`${scope}: نطاق الفحص غائب أو لا يُقرأ (${err.code ?? err.message})`);
    continue;
  }
  for (const file of files) {
    // ملف نصي أكبر من الحد لا يُتخطى بصمت: الأدلة لا تبلغه، وما بلغه يُقسَم أو يُنقَّى قبل حفظه.
    if ((await stat(file)).size > MAX_BYTES) {
      findings.push(`${path.relative(ROOT, file)}: أكبر من 50 م.ب فلم يُفحص`);
      continue;
    }
    scanned++;
    const rel = path.relative(ROOT, file);
    const text = await readFile(file, 'utf8');
    for (const f of findSecrets(text)) {
      if (rel.endsWith('.md') && f.type === 'url' && !SENSITIVE_HOST.test(text.slice(f.index, f.index + f.length))) continue;
      findings.push(`${rel}@${f.index}: ${f.type} ${f.sample}`);
    }
    for (const m of text.matchAll(LOCAL_PATH)) findings.push(`${rel}@${m.index}: local-path ${m[0]}`);
  }
}

if (!scanned) findings.push('لا ملف نصيًا في نطاقات الفحص (test/fixtures وtest/e2e/fixtures وdocs/evidence)');
if (findings.length) {
  console.error(`check-secrets: ${findings.length} اكتشاف في ${scanned} ملف\n- ${findings.slice(0, 50).join('\n- ')}`);
  process.exit(1);
}
console.log(`check-secrets: ناجح (${scanned} ملف بلا pot ولا تواقيع ولا روابط ولا ملفات ارتباط ولا مسارات محلية)`);
