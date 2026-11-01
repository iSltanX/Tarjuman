#!/usr/bin/env node
// فحص آلي لخلو العينات والأدلة والسجلات من pot والتواقيع والروابط وملفات الارتباط والرموز.
// يمرّ على test/fixtures/ وdocs/evidence/P1/. الوثائق السردية (.md) قد تذكر روابط مراجع عامة،
// أما روابط يوتيوب وجوجل والأسرار فممنوعة فيها أيضًا. يخرج برمز 1 عند أي اكتشاف.
import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { findSecrets } from '../src/core/diagnostics/sanitize.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SCOPES = ['test/fixtures', 'docs/evidence/P1'];
const TEXT = /\.(json|srt|txt|log|md|csv|ndjson)$/i;
const SENSITIVE_HOST = /(?:youtu\.?be|youtube|google|googlevideo|ytimg|ggpht)/i;

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
  }
}

if (findings.length) {
  console.error(`check-secrets: ${findings.length} اكتشاف في ${scanned} ملف\n- ${findings.slice(0, 50).join('\n- ')}`);
  process.exit(1);
}
console.log(`check-secrets: ناجح (${scanned} ملف بلا pot ولا تواقيع ولا روابط ولا ملفات ارتباط)`);
