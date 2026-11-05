#!/usr/bin/env node
// فحص آلي لخلو العينات والأدلة والسجلات من pot والتواقيع والروابط وملفات الارتباط والرموز ومسارات الجهاز المحلية.
// يمرّ على test/fixtures/ وعينات test/e2e/fixtures/ (ترجمات حقيقية؛ تدقيق 5fedcb9، GM-028) وأدلة كل المراحل في
// docs/evidence/. الوثائق السردية (.md) قد تذكر روابط مراجع
// عامة، أما روابط يوتيوب وجوجل والأسرار فممنوعة فيها أيضًا. يخرج برمز 1 عند أي اكتشاف.
import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { findSecrets } from '../src/core/diagnostics/sanitize.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SCOPES = ['test/fixtures', 'test/e2e/fixtures', 'docs/evidence'];
const TEXT = /\.(json|srt|txt|log|md|csv|ndjson)$/i;
const SENSITIVE_HOST = /(?:youtu\.?be|youtube|google|googlevideo|ytimg|ggpht)/i;
// مسارات الجهاز المحلية (اسم المستخدم والقرص ومجلدات الجلسات المؤقتة) لا تدخل الأدلة؛ تُكتب برمز عام مثل $SCRATCH/.
const LOCAL_PATH = /(?:\/Users\/[^/\s"'`]+\/|\/private\/(?:tmp|var)\/|\/Volumes\/[^/\s"'`]+\/|\b[A-Za-z]:\\Users\\)/g;

async function walk(dir) {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  const out = [];
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...(await walk(p)));
    else if (TEXT.test(e.name)) out.push(p);
  }
  return out;
}

const findings = [];
let scanned = 0;
for (const scope of SCOPES) {
  for (const file of await walk(path.join(ROOT, scope))) {
    if ((await stat(file)).size > 50 * 1024 * 1024) continue;
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

if (findings.length) {
  console.error(`check-secrets: ${findings.length} اكتشاف في ${scanned} ملف\n- ${findings.slice(0, 50).join('\n- ')}`);
  process.exit(1);
}
console.log(`check-secrets: ناجح (${scanned} ملف بلا pot ولا تواقيع ولا روابط ولا ملفات ارتباط ولا مسارات محلية)`);
