#!/usr/bin/env node
// بوابة يوم النشر (تحقق 2.3.0، ص-٢): تفشل ما بقي في الملفات التي تُنشر أو تُرفع شيءٌ ينتظر النشر. أربعة فحوص:
//   ١. الخصوصية بشرط النشر، كـ`privacy.mjs --strict --check`: لا [قرار]، وتاريخ السريان مثبت، وPRIVACY.md مطابق لمصدره؛ ومعه
//      أن privacy.en.md بتاريخ privacy.md نفسه.
//   ٢. عنصر نائب ⟨…⟩ في النص، لا بين علامتي شيفرة مضمّنة (فذاك اسمه في الشرح لا موضعه)، إلا متغيرات القوالب في TEMPLATE_VAR
//      (⟨رقم الإصدار⟩ ومواضع ⟨لقطة: …⟩) التي يملؤها مولّد.
//   ٣. تنبيه «لم يُنشر» للإصدار الذي يُنشر: جملة فيها رقم package.json وعبارةٌ من UNPUBLISHED («لم يُنشر» و«لم يُرفع» ومقابلهما
//      الإنجليزي). والجملة التي تذكر إصدارًا آخر لا تُمس («## 2.1.2 — لم يُنشر بعد» في السجل صادقة)، ولا التي بلا رقم («ولم يُنشر
//      ترجمان في Firefox Add-ons بعد» صادقة بعد النشر في المتجرين).
//   ٤. عنوان الإصدار في CHANGELOG.md بتاريخ صحيح: «## <الإصدار> — YYYY-MM-DD».
// النطاق: الملفات المتتبعة في Git (ما يُنشر بدمج main في المستودع العام، ومنه docs/site التي يقرؤها مستودع الموقع، وstore التي تُلصق
// نصوصها في المتاجر، وsrc التي تُبنى منها الحزم)، النصية منها، إلا ما في EXCLUDED: شيفرة الأدوات واختباراتها وأدوات الهوية، والعلامات
// فيها بياناتٌ (privacy.mjs يعرّف ⟨تاريخ النشر⟩، والاختبارات تبني به مصادر) لا قيم تنتظر النشر، ولا يُلصق منها نص في متجر ولا موقع.
// ليست في check ولا check:all ولا package: الفرع قبل يوم النشر يحمل العنصر النائب والتنبيهات بحق. تُشغَّل يوم النشر قبل الدمج وقبل رفع
// الحزم (docs/release-day.md)، وتشغّلها CI على main وطلبات الدمج إليه.
//   node scripts/release/gate.mjs        (npm run release:gate)
import { execFileSync } from 'node:child_process';
import { lstatSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SOURCE, SOURCE_EN, TARGET, effectiveDateOf, generate, validDate } from '../site/privacy.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
/** ما لا يُفحص (بادئات مسارات): شيفرة الأدوات واختباراتها وأدوات الهوية. */
export const EXCLUDED = Object.freeze(['scripts/', 'test/', 'tools/']);
/**
 * متغيرات قوالب يملؤها مولّد، لا قيم تنتظر النشر: ⟨رقم الإصدار⟩ في مقدمة الخصوصية (privacy.mjs ومولّد الموقع برقم package.json)،
 * ومواضع اللقطات ⟨لقطة: …⟩ في نصوص الموقع (يضع مولّد الموقع فيها لقطاتها، ونُشرت بها الصفحات منذ T7).
 */
export const TEMPLATE_VAR = /^⟨(?:رقم الإصدار|لقطة: [^⟩]+)⟩$/;
/** عبارات «لم يُنشر» و«لم يُرفع» بالعربية والإنجليزية. */
export const UNPUBLISHED = /لم [يت]ُ?(?:نشر|رفع)|\b(?:hasn[’']t|has not|haven[’']t|have not|isn[’']t|is not|not)\s+(?:been\s+|yet\s+)*(?:published|submitted|uploaded|released)\b|\bunpublished\b/i;
const PLACEHOLDER = /⟨[^⟩\n]*⟩/g;
const INLINE_CODE = /`[^`\n]*`/g;
/** حدود الجملة: نقطة أو علامة استفهام أو تعجب أو فاصلة منقوطة أو نقطتان، لا نقطة رقم الإصدار (2.3.0). */
const SENTENCE_END = /[.!?؟؛;:](?!\d)/;

/** @param {string} rel */
export const inScope = (rel) => !EXCLUDED.some((p) => rel.startsWith(p));

/** @param {string} version */
function versionPattern(version) {
  return new RegExp(`(?<![\\d.])${version.replace(/\./g, '\\.')}(?!\\.?\\d)`);
}

/** العناصر النائبة في النص خارج الشيفرة المضمّنة. @param {string} rel @param {string} text */
export function placeholderProblems(rel, text) {
  const out = [];
  text.split('\n').forEach((line, i) => {
    for (const m of line.replace(INLINE_CODE, '').matchAll(PLACEHOLDER)) {
      if (!TEMPLATE_VAR.test(m[0])) out.push(`${rel}:${i + 1}: عنصر نائب ينتظر النشر ${m[0]}`);
    }
  });
  return out;
}

/** جمل «لم يُنشر» للإصدار نفسه. @param {string} rel @param {string} text @param {string} version */
export function unpublishedProblems(rel, text, version) {
  const ver = versionPattern(version);
  const out = [];
  text.split('\n').forEach((line, i) => {
    for (const sentence of line.split(SENTENCE_END)) {
      if (ver.test(sentence) && UNPUBLISHED.test(sentence)) out.push(`${rel}:${i + 1}: تنبيه «لم يُنشر» للإصدار ${version}: «${sentence.trim().slice(0, 120)}»`);
    }
  });
  return out;
}

/** عنوان الإصدار في السجل بتاريخ صحيح. @param {string} text @param {string} version */
export function changelogProblems(text, version) {
  const lines = text.split('\n');
  const i = lines.findIndex((l) => l === `## ${version}` || l.startsWith(`## ${version} `));
  if (i < 0) return [`CHANGELOG.md: لا عنوان للإصدار ${version}`];
  const date = /^## \S+ — (\d{4}-\d{2}-\d{2})(?: — .+)?$/.exec(lines[i])?.[1];
  if (!date || !validDate(date)) return [`CHANGELOG.md:${i + 1}: عنوان الإصدار بلا تاريخ صحيح «${lines[i]}»، والمطلوب «## ${version} — YYYY-MM-DD»`];
  return [];
}

/** الخصوصية بشرط النشر (privacy.mjs --strict --check) والتاريخ واحد في النسختين. @param {(rel: string) => string} read @param {string} version */
export function privacyProblems(read, version) {
  try {
    const { text } = generate({ source: read(SOURCE), version, strict: true });
    const out = [];
    if (read(TARGET) !== text) out.push(`${TARGET}: لا يطابق ما يولّده scripts/site/privacy.mjs من ${SOURCE}`);
    const ar = effectiveDateOf(read(SOURCE));
    const en = effectiveDateOf(read(SOURCE_EN));
    if (en !== ar) out.push(`${SOURCE_EN}: تاريخ السريان ${en ?? 'غير مثبت'}، وفي ${SOURCE} ${ar}`);
    return out;
  } catch (err) {
    return [`الخصوصية (--strict): ${err.message}`];
  }
}

/** الملفات المتتبعة في Git. @param {string} root */
export function trackedFiles(root) {
  return execFileSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'utf8' }).split('\0').filter(Boolean);
}

/**
 * @param {{ root?: string, files?: string[], read?: (rel: string) => string }} [o]
 *   read يعيد النص، أو null لملف ثنائي (فيه بايت صفري) أو رابط رمزي فلا يُفحص.
 * @returns {{ version: string, scanned: number, problems: string[] }}
 */
export function runGate({ root = ROOT, files, read } = {}) {
  const readText = read ?? ((rel) => {
    // الرابط الرمزي المتتبع يحمل مسارًا لا نصًّا (ويرفضه check-secrets أصلًا)، فلا يُتبع إلى هدفه.
    if (lstatSync(path.join(root, rel)).isSymbolicLink()) return null;
    const buf = readFileSync(path.join(root, rel));
    return buf.includes(0) ? null : buf.toString('utf8');
  });
  const version = JSON.parse(readText('package.json')).version;
  const problems = [...privacyProblems(readText, version), ...changelogProblems(readText('CHANGELOG.md'), version)];
  let scanned = 0;
  for (const rel of (files ?? trackedFiles(root)).filter(inScope)) {
    let text;
    try {
      text = readText(rel);
    } catch (err) {
      problems.push(`${rel}: تعذّرت قراءته (${err.code ?? err.message})`);
      continue;
    }
    if (text === null) continue;
    scanned++;
    problems.push(...placeholderProblems(rel, text), ...unpublishedProblems(rel, text, version));
  }
  return { version, scanned, problems };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { version, scanned, problems } = runGate();
  if (problems.length) {
    for (const p of problems) console.log(`✗ ${p}`);
    console.log(`بوابة النشر: ${problems.length} مما ينتظر النشر في الإصدار ${version} (فُحص ${scanned} ملفًا). الخطوات في docs/release-day.md`);
    process.exit(1);
  }
  console.log(`✓ بوابة النشر: الإصدار ${version} بلا عنصر نائب ولا تنبيه «لم يُنشر»، وتاريخ سريان الخصوصية مثبت (فُحص ${scanned} ملفًا).`);
}
