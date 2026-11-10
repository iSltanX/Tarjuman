#!/usr/bin/env node
// مصدر واحد للمقاطع المكررة في الوثائق (ح2، 2026-11-10). docs/facts.json يحمل روابط المتاجر والحدود الدنيا للمتصفحات وبريد الدعم
// وقوالب المقاطع المكررة بلغتيها، وهذا السكربت:
//   - يولّد كل قالب بين علامتي <!-- tj:facts الاسم --> و<!-- /tj:facts الاسم --> في README.md وREADME.en.md وdocs/user-guide.md؛
//   - يفحص بلا علامات نصوص docs/site وstore (مستودع الموقع يقرأ docs/site بمسارها، فلا يتغير شكلها): كل رابط متجر فيها يساوي ما
//     في الحقائق، وكل «‹رقم› فأحدث / or later» يساوي الحد الأدنى للمتصفح في سطره، وبريد الدعم واحد؛
//   - يفحص بنية النسخة الإنجليزية مقابل العربية (العناوين بمستوياتها وعددها وترتيبها) لأزواج README وdocs/site وstore/listing؛
//   - يتحقق أن الحدين الأدنيين في الحقائق هما ما في src/manifest.json وscripts/targets.mjs.
//   node scripts/docs/facts.mjs           يكتب المقاطع المولّدة
//   node scripts/docs/facts.mjs --check   يفشل إن عُدّل موضع مولَّد بيد أو خالف نصٌّ الحقائق (في npm run check)
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const FACTS_FILE = 'docs/facts.json';
/** الملفات التي فيها علامات، بلغة قوالبها. */
export const TARGETS = Object.freeze([
  { file: 'README.md', lang: 'ar' },
  { file: 'README.en.md', lang: 'en' },
  { file: 'docs/user-guide.md', lang: 'ar' },
]);
/** ملفات فيها روابط المتاجر تُطابق روابطها وحدها: السجل يذكر حدودًا دنيا قديمة بحق، والمواصفة تشرحها. */
export const LINKS_ONLY = Object.freeze(['CHANGELOG.md', 'docs/product-spec.md']);
/** أزواج البنية: «exact» تطابق كامل بعد إسقاط قسم «جدول الأدلة» العربي (لا يُنشر)، و«prefix» الإنجليزية تطابق أول العربية. */
export const PAIRS = Object.freeze([
  { ar: 'README.md', en: 'README.en.md', mode: 'exact' },
  ...['credits', 'help', 'privacy', 'tarjuman'].map((n) => ({ ar: `docs/site/${n}.md`, en: `docs/site/${n}.en.md`, mode: 'exact' })),
  { ar: 'store/listing.ar.md', en: 'store/listing.en.md', mode: 'prefix' },
]);

const VARS = /\{(chrome|edge|minChromium|minFirefox|email|pubChrome|pubEdge)\}/g;
const MARK = /<!-- tj:facts ([a-z-]+) -->\n([\s\S]*?)\n?<!-- \/tj:facts \1 -->/g;

/** @param {string} line @param {any} facts */
export function fill(line, facts) {
  const v = {
    chrome: facts.stores.chrome, edge: facts.stores.edge, minChromium: facts.minimum.chromium, minFirefox: facts.minimum.firefox, email: facts.supportEmail,
    pubChrome: facts.published?.chrome, pubEdge: facts.published?.edge,
  };
  return line.replace(VARS, (_, k) => String(v[k]));
}

/** نص قالب بلغته. @param {any} facts @param {string} name @param {string} lang */
export function renderBlock(facts, name, lang) {
  const lines = facts.blocks?.[name]?.[lang];
  if (!Array.isArray(lines)) throw new Error(`قالب غير معروف في ${FACTS_FILE}: ${name} (${lang})`);
  return lines.map((l) => fill(l, facts)).join('\n');
}

/** النص بكل قالب معلَّم مولَّدًا من الحقائق. @param {string} text @param {any} facts @param {string} lang */
export function applyBlocks(text, facts, lang) {
  return text.replace(MARK, (_, name) => `<!-- tj:facts ${name} -->\n${renderBlock(facts, name, lang)}\n<!-- /tj:facts ${name} -->`);
}

/** أسماء القوالب التي يخالف نصُّها المولَّد (عُدّلت بيد أو تغيّرت الحقائق). */
export function driftedBlocks(text, facts, lang) {
  const out = [];
  for (const m of text.matchAll(MARK)) if (m[2] !== renderBlock(facts, m[1], lang)) out.push(m[1]);
  return out;
}

/** أسماء القوالب المعلَّمة في نص. @param {string} text */
export const blocksIn = (text) => [...text.matchAll(MARK)].map((m) => m[1]);

const URL_END = '[^\\s)>\\]"\'`،]+';
/**
 * روابط متجر في سطر مع نص كل رابط (رابط Markdown) أو null (رابط مجرد). رابطٌ نصُّه منتجٌ آخر (مرجع في ملاحظات المتاجر) ليس رابط
 * ترجمان، فلا يُقارن بالحقائق.
 */
function storeLinks(line, base) {
  const out = [];
  const md = new RegExp(`\\[([^\\]]*)\\]\\((${base}${URL_END})\\)`, 'g');
  const seen = new Set();
  for (const m of line.matchAll(md)) {
    out.push({ url: m[2], text: m[1] });
    seen.add(m.index + m[0].indexOf(m[2]));
  }
  for (const m of line.matchAll(new RegExp(`${base}${URL_END}`, 'g'))) if (!seen.has(m.index)) out.push({ url: m[0], text: null });
  return out;
}
const OURS = /Chrome Web Store|Edge Add-ons|Firefox Add-ons|ترجمان|Tarjuman/i;
const ours = (l) => l.text === null || OURS.test(l.text);
/**
 * مطابقة بلا علامات: روابط المتاجر والحدود الدنيا وبريد الدعم في نصوص لا تُولَّد (docs/site وstore).
 * @param {{ file: string, text: string, linksOnly?: boolean }[]} files linksOnly: الروابط وحدها (سجل يذكر حدودًا قديمة بحق)
 * @param {any} facts
 * @returns {string[]}
 */
export function matchProblems(files, facts) {
  const out = [];
  for (const { file, text, linksOnly = false } of files) {
    const lines = text.split('\n');
    lines.forEach((line, i) => {
      const at = `${file}:${i + 1}`;
      for (const [store, base] of [['chrome', 'https://chromewebstore\\.google\\.com/detail/'], ['edge', 'https://microsoftedge\\.microsoft\\.com/addons/detail/']]) {
        for (const l of storeLinks(line, base)) if (ours(l) && l.url !== facts.stores[store]) out.push(`${at}: رابط ${store} يخالف الحقائق: ${l.url}`);
      }
      for (const l of storeLinks(line, 'https://addons\\.mozilla\\.org/[^\\s)]*?/addon/')) {
        if (ours(l) && l.url !== facts.stores.firefox) out.push(`${at}: رابط Firefox Add-ons يخالف الحقائق (${facts.stores.firefox ?? 'غير منشور'}): ${l.url}`);
      }
      if (linksOnly) return;
      for (const m of line.matchAll(/\b(\d{2,3})\s*(?:فأحدث|or later)/g)) {
        const want = /Firefox/.test(line) ? facts.minimum.firefox : facts.minimum.chromium;
        if (Number(m[1]) !== want) out.push(`${at}: حد أدنى ${m[1]} والحقائق ${want}`);
      }
      for (const m of line.matchAll(/\b[\w.+-]+@gmail\.com\b/gi)) if (m[0] !== facts.supportEmail) out.push(`${at}: بريد يخالف بريد الدعم: ${m[0]}`);
    });
  }
  return out;
}

/** مستويات العناوين خارج كتل الشيفرة؛ وفي العربية يُسقط قسم «جدول الأدلة» وما بعده (للمراجعة، لا يُنشر). */
export function headingLevels(text, { dropEvidence = false } = {}) {
  const clean = text.replace(/```[\s\S]*?```/g, '');
  const out = [];
  for (const m of clean.matchAll(/^(#{1,6})\s+(.*)$/gm)) {
    if (dropEvidence && /^جدول الأدلة/.test(m[2].trim())) break;
    out.push(m[1].length);
  }
  return out;
}

/** @param {{ ar: string, en: string, mode: 'exact' | 'prefix', arText: string, enText: string }[]} pairs @returns {string[]} */
export function structureProblems(pairs) {
  const out = [];
  for (const p of pairs) {
    const a = headingLevels(p.arText, { dropEvidence: true });
    const e = headingLevels(p.enText);
    const ok = p.mode === 'prefix' ? e.length <= a.length && e.every((lv, i) => lv === a[i]) : JSON.stringify(a) === JSON.stringify(e);
    if (!ok) out.push(`${p.en}: بنية العناوين تخالف ${p.ar} (${p.mode}): ${JSON.stringify(e)} مقابل ${JSON.stringify(a)}`);
  }
  return out;
}

/** الحدان الأدنيان في الحقائق هما ما في البيان وأهداف Firefox. */
export function consistencyProblems(facts, { manifestText, targetsText }) {
  const out = [];
  const chromium = Number(JSON.parse(manifestText).minimum_chrome_version);
  const firefox = Number(/strict_min_version:\s*'(\d+)/.exec(targetsText)?.[1]);
  if (chromium !== facts.minimum.chromium) out.push(`${FACTS_FILE}: minimum.chromium ${facts.minimum.chromium} والبيان ${chromium}`);
  if (firefox !== facts.minimum.firefox) out.push(`${FACTS_FILE}: minimum.firefox ${facts.minimum.firefox} وscripts/targets.mjs ${firefox}`);
  return out;
}

const read = (root, f) => readFileSync(path.join(root, f), 'utf8');
const mdIn = (root, dir) => readdirSync(path.join(root, dir)).filter((n) => n.endsWith('.md')).map((n) => `${dir}/${n}`);

/**
 * الفحص كله على مستودع، أو الكتابة. يعيد المشكلات والملفات المكتوبة.
 * @param {{ root?: string, write?: boolean }} [o]
 */
export function runFacts({ root = ROOT, write = false } = {}) {
  const facts = JSON.parse(read(root, FACTS_FILE));
  const problems = [];
  const written = [];
  for (const t of TARGETS) {
    const text = read(root, t.file);
    if (!blocksIn(text).length) problems.push(`${t.file}: لا علامات tj:facts`);
    const next = applyBlocks(text, facts, t.lang);
    if (next === text) continue;
    if (write) {
      writeFileSync(path.join(root, t.file), next);
      written.push(t.file);
    } else problems.push(`${t.file}: مقاطع مولَّدة عُدّلت بيد أو تخالف الحقائق: ${driftedBlocks(text, facts, t.lang).join('، ')} (شغّل node scripts/docs/facts.mjs)`);
  }
  problems.push(...matchProblems([
    ...[...mdIn(root, 'docs/site'), ...mdIn(root, 'store')].map((file) => ({ file, text: read(root, file) })),
    ...LINKS_ONLY.map((file) => ({ file, text: read(root, file), linksOnly: true })),
  ], facts));
  problems.push(...structureProblems(PAIRS.map((p) => ({ ...p, arText: read(root, p.ar), enText: read(root, p.en) }))));
  problems.push(...consistencyProblems(facts, { manifestText: read(root, 'src/manifest.json'), targetsText: read(root, 'scripts/targets.mjs') }));
  return { problems, written };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const check = process.argv.includes('--check');
  const { problems, written } = runFacts({ write: !check });
  for (const f of written) console.log(`كُتب: ${f}`);
  if (problems.length) {
    console.error(`facts: ${problems.length} مشكلة:`);
    for (const p of problems) console.error(`- ${p}`);
    process.exit(1);
  }
  console.log(`facts: ناجح (${TARGETS.length} ملفات بمقاطع مولَّدة، وروابط المتاجر والحدود الدنيا وبريد الدعم في docs/site وstore، وبنية ${PAIRS.length} أزواج عربية وإنجليزية).`);
}
