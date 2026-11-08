#!/usr/bin/env node
// فحص تغطية التوطين (جزء من npm run check): يطابق فهرسي العربية والإنجليزية مفتاحًا مفتاحًا وقالبًا قالبًا، ويتحقق أن كل مفتاح تستعمله الشيفرة
// موجود، وأن واجهات المنتج لا تحمل نصًا عربيًا خارج الفهرس. يخرج برمز 1 ويسمّي كل مخالفة. والفهرس يُقرأ كما تقرؤه الإضافة.
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'src');
const ARABIC = /[؀-ۿ]/;
const PLACEHOLDER = /\{(\w+)\}/g;

/** شجرات لا تعرض نصوصًا للمستخدم من نفسها، أو نصوصها بيانات: لا تُفحص بقاعدة «لا عربي خارج الفهرس». */
const SCAN_ROOTS = ['pages', 'player', 'ui'];
const SCAN_SKIP = [/^ui\/gallery\//];
/** رسائل مطوّر تُرمى ولا تُعرض (تُلتقط برمز خطأ)، وتعابير نمطية لمطابقة حروف البيانات. */
const DEV_ONLY = /\bnew\s+(?:Range|Type)?Error\(|\.replace\(\/\[?[\u0600-\u06FF]/;

const isForms = (v) => typeof v === 'object' && v !== null && typeof v.one === 'string' && (typeof v.other === 'string' || (typeof v.two === 'string' && typeof v.few === 'string'));
const holes = (s) => [...s.matchAll(PLACEHOLDER)].map((m) => m[1]).sort();

/** مخالفات مطابقة الفهرسين. @param {ReadonlyMap<string, unknown>} ar @param {ReadonlyMap<string, unknown>} en @returns {string[]} */
export function compareCatalogs(ar, en) {
  const out = [];
  for (const k of ar.keys()) if (!en.has(k)) out.push(`ناقص في en: ${k}`);
  for (const k of en.keys()) if (!ar.has(k)) out.push(`ناقص في ar: ${k}`);
  for (const [k, a] of ar) {
    if (!en.has(k)) continue;
    const e = en.get(k);
    const kind = (v) => (typeof v === 'function' ? 'function' : isForms(v) ? 'forms' : typeof v);
    if (kind(a) !== 'function' && kind(e) !== 'function' && kind(a) !== kind(e)) {
      out.push(`نوع مختلف: ${k} (ar ${kind(a)}، en ${kind(e)})`);
      continue;
    }
    if (typeof a === 'string' && !a.trim()) out.push(`قيمة فارغة في ar: ${k}`);
    if (typeof e === 'string' && !e.trim()) out.push(`قيمة فارغة في en: ${k}`);
    if (typeof e === 'string' && ARABIC.test(e)) out.push(`حرف عربي في نص إنجليزي: ${k}`);
    if (typeof a === 'string' && typeof e === 'string' && holes(a).join() !== holes(e).join()) out.push(`قوالب مختلفة: ${k} (ar ${holes(a)}، en ${holes(e)})`);
    if (isForms(e) && (typeof e.other !== 'string' || ARABIC.test(`${e.one}${e.other}`))) out.push(`صيغ جمع إنجليزية ناقصة: ${k}`);
    if (isForms(a) && !['two', 'few', 'many', 'single'].every((f) => typeof a[f] === 'string') && a.other === undefined) out.push(`صيغ جمع عربية ناقصة: ${k}`);
  }
  return out;
}

async function walk(dir) {
  const out = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...(await walk(p)));
    else if (e.name.endsWith('.js')) out.push(p);
  }
  return out;
}

/** الشيفرة بلا تعليقات، سطرًا بسطر لتبقى أرقام الأسطر. */
function stripComments(src) {
  let block = false;
  return src.split('\n').map((line) => {
    let s = line;
    if (block) {
      const end = s.indexOf('*/');
      if (end === -1) return '';
      s = s.slice(end + 2);
      block = false;
    }
    const open = s.search(/(?<![:'"`])\/\*/);
    if (open !== -1 && !s.includes('*/', open)) {
      block = true;
      s = s.slice(0, open);
    }
    return s.replace(/\/\*.*?\*\//g, '').replace(/(^|\s)\/\/ .*$/, '$1');
  });
}

/** مفاتيح تستعملها الشيفرة وليست في الفهرس، ونصوص عربية في واجهات المنتج. */
export async function scanSources(src, ar, en) {
  const out = [];
  const files = await walk(src);
  const sections = new Map();
  const codeOf = new Map();
  for (const f of files) {
    const text = await readFile(f, 'utf8');
    // سطر بيانات صريح (جدول طي حروف البحث مثلًا) يُعلَّم i18n-ignore فلا يُعدّ نصًا معروضًا.
    const raw = text.split('\n');
    codeOf.set(f, stripComments(text).map((l, i) => (raw[i].includes('i18n-ignore') ? '' : l)));
    const own = {};
    for (const m of text.matchAll(/(?:export\s+)?const\s+(\w+)\s*=\s*texts\('([^']+)'\)/g)) own[m[1]] = m[2];
    if (Object.keys(own).length) sections.set(f, own);
  }
  const has = (k) => ar.has(k) && en.has(k);
  for (const [f, lines] of codeOf) {
    const rel = path.relative(src, f).split(path.sep).join('/');
    if (rel.startsWith('i18n/')) continue;
    const local = { ...(sections.get(f) ?? {}) };
    const body = lines.join('\n');
    for (const m of body.matchAll(/import\s*\{([^}]*)\}\s*from\s*'(\.[^']+)'/g)) {
      const target = path.resolve(path.dirname(f), m[2]);
      const theirs = sections.get(target);
      if (!theirs) continue;
      for (const raw of m[1].split(',')) {
        const [name, alias] = raw.trim().split(/\s+as\s+/);
        if (theirs[name]) local[alias ?? name] = theirs[name];
      }
    }
    lines.forEach((line, i) => {
      for (const m of line.matchAll(/(?<![\w.$])l?t\('([a-zA-Z][\w.-]*)'/g)) {
        if (!has(m[1])) out.push(`${rel}:${i + 1}: مفتاح غير موجود: ${m[1]}`);
      }
      for (const m of line.matchAll(/(?<![\w.$])texts\('([\w.-]+)'\)/g)) {
        const prefix = `${m[1]}.`;
        if (![...ar.keys()].some((k) => k.startsWith(prefix))) out.push(`${rel}:${i + 1}: قسم غير موجود: ${m[1]}`);
      }
      for (const [name, section] of Object.entries(local)) {
        for (const m of line.matchAll(new RegExp(`(?<![\\w.$])${name}\\.(\\w+)`, 'g'))) {
          if (!has(`${section}.${m[1]}`)) out.push(`${rel}:${i + 1}: مفتاح غير موجود: ${section}.${m[1]} (${name})`);
        }
      }
      if (SCAN_ROOTS.some((r) => rel.startsWith(`${r}/`)) && !SCAN_SKIP.some((re) => re.test(rel)) && ARABIC.test(line) && !DEV_ONLY.test(line)) {
        out.push(`${rel}:${i + 1}: نص عربي خارج الفهرس: ${line.trim().slice(0, 80)}`);
      }
    });
  }
  return out;
}

async function main() {
  const { catalogOf } = await import(pathToFileURL(path.join(SRC, 'i18n/index.js')).href);
  const ar = catalogOf('ar');
  const en = catalogOf('en');
  const problems = [...compareCatalogs(ar, en), ...(await scanSources(SRC, ar, en))];
  if (problems.length) {
    console.error(`check-i18n: ${problems.length} مخالفة:\n${problems.map((p) => `- ${p}`).join('\n')}`);
    process.exit(1);
  }
  console.log(`check-i18n: ناجح (${ar.size} مفتاحًا باللغتين، والمفاتيح المستعملة كلها موجودة، ولا نص عربي خارج الفهرس في واجهات المنتج).`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
