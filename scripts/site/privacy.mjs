#!/usr/bin/env node
// PRIVACY.md من مصدره الواحد docs/site/privacy.md ، فلا تنشأ سياستان متعارضتان:
// - يُحذف ما يخص مواصفة الصفحة: العنوان والتنبيهات (>) وقسم «الرأس» وجدول الأدلة وما بعده.
// - عناوين الأقسام «## … — `#id`» تصير عناوين بمراسٍ ثابتة، ورابط صفحة الدعم في الموقع يصير ملفها في المستودع.
// - المقدمة من سطرها في «الرأس» برقم الإصدار من package.json، وتاريخ السريان من سطره متى ثُبّت.
// - ما بقي فيه [قرار] يُولَّد مسودةً بتنبيه في رأسها، و--strict يرفضه ويرفض تاريخ سريان غير مثبت (للنشر في T8).
//   node scripts/site/privacy.mjs                       يكتب PRIVACY.md
//   node scripts/site/privacy.mjs --check               يفشل إن اختلف PRIVACY.md عمّا يولّده
//   node scripts/site/privacy.mjs --strict [--check]    ويفشل إن بقي [قرار] أو ⟨…⟩ أو تاريخ سريان غير مثبت
//   node scripts/site/privacy.mjs --effective YYYY-MM-DD  يثبّت تاريخ السريان في المصدر ثم يولّد
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const SOURCE = 'docs/site/privacy.md';
export const TARGET = 'PRIVACY.md';
const PENDING_DATE = '⟨تاريخ النشر⟩';
const DATE_LINE = /^- \*\*تاريخ السريان:\*\* (.+)$/m;
const INTRO_LINE = /^- \*\*المقدمة:\*\* (.+)$/m;
const DECISION = /\s*\*\*\[قرار\]\*\*/g;
/** تاريخ بصيغة YYYY-MM-DD موجود فعلًا (لا 2026-02-30). @param {string} s */
const validDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`)) && new Date(`${s}T00:00:00Z`).toISOString().slice(0, 10) === s;

/** تاريخ السريان من المصدر، أو null ما دام ⟨تاريخ النشر⟩. @param {string} source */
export function effectiveDateOf(source) {
  const m = DATE_LINE.exec(source);
  if (!m) throw new Error(`${SOURCE}: لا سطر «تاريخ السريان» في قسم الرأس`);
  const value = m[1].trim();
  if (value === PENDING_DATE) return null;
  if (!validDate(value)) throw new Error(`${SOURCE}: تاريخ سريان غير صالح: ${value}`);
  return value;
}

/** يثبّت تاريخ السريان في نص المصدر. @param {string} source @param {string} date YYYY-MM-DD */
export function withEffectiveDate(source, date) {
  if (!validDate(date)) throw new Error(`تاريخ غير صالح: ${date}`);
  if (!DATE_LINE.test(source)) throw new Error(`${SOURCE}: لا سطر «تاريخ السريان» في قسم الرأس`);
  return source.replace(DATE_LINE, `- **تاريخ السريان:** ${date}`);
}

/**
 * @param {{ source?: string, version?: string, strict?: boolean }} [o]
 * @returns {{ text: string, decisions: number, effective: string | null }}
 */
export function generate({
  source = readFileSync(path.join(ROOT, SOURCE), 'utf8'),
  version = JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version,
  strict = false,
} = {}) {
  const src = source.replace(/\r\n/g, '\n');
  const intro = INTRO_LINE.exec(src)?.[1];
  if (!intro) throw new Error(`${SOURCE}: لا سطر «المقدمة» في قسم الرأس`);
  const effective = effectiveDateOf(src);
  const out = [];
  let skip = false;
  for (const line of src.split('\n')) {
    if (line.startsWith('## جدول الأدلة')) break;
    if (line.startsWith('## الرأس')) { skip = true; continue; }
    if (skip && line.startsWith('## ')) skip = false;
    if (skip || line.startsWith('# ') || line.startsWith('>')) continue;
    const heading = /^(#{2,3}) (.+?) — `#([a-z-]+)`$/.exec(line);
    if (heading) {
      out.push(`<a id="${heading[3]}"></a>`, '', `${heading[1]} ${heading[2]}`);
      continue;
    }
    out.push(line.replace(/\]\(\/tarjuman\/support(#[a-z-]+)?\)/g, '](docs/site/help.md)'));
  }
  const body = out.join('\n').replace(/\n{3,}/g, '\n\n').trim();
  const decisions = (body.match(DECISION) ?? []).length;
  const head = [
    '<div dir="rtl">',
    '',
    '# سياسة الخصوصية — ترجمان',
    '',
    intro.replace('⟨رقم الإصدار⟩', version).replace(/\(bysltan\.com\)/, '([bysltan.com](https://bysltan.com))'),
    '',
    ...(effective ? [`تسري هذه السياسة اعتبارًا من ${effective}.`, ''] : []),
    ...(decisions ? [`> **مسودة:** مواضع [قرار] لم يحسمها الناشر بعد: ${decisions}. لا تُنشر قبل حسمها.`, ''] : []),
    `> هذا الملف مولَّد من [\`${SOURCE}\`](${SOURCE}) بالأمر \`node scripts/site/privacy.mjs\`. يُعدَّل المصدر ثم يُعاد التوليد، ولا يُحرَّر هنا.`,
    '',
  ];
  const text = `${head.join('\n')}\n${body}\n\n</div>\n`;
  const leftovers = text.match(/⟨[^⟩]*⟩|`#[a-z-]+`$|\/tarjuman\/(?:support|privacy)/gm);
  if (leftovers) throw new Error(`بقي في ${TARGET} ما لا يُنشر: ${[...new Set(leftovers)].join('، ')}`);
  if (strict && decisions) throw new Error(`${TARGET}: بقي ${decisions} [قرار] في ${SOURCE}`);
  if (strict && !effective) throw new Error(`${TARGET}: تاريخ السريان غير مثبت في ${SOURCE} (--effective YYYY-MM-DD)`);
  return { text, decisions, effective };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const argv = process.argv.slice(2);
  const strict = argv.includes('--strict');
  const at = argv.indexOf('--effective');
  if (at > -1) {
    const file = path.join(ROOT, SOURCE);
    writeFileSync(file, withEffectiveDate(readFileSync(file, 'utf8'), argv[at + 1]));
    console.log(`ثُبّت تاريخ السريان ${argv[at + 1]} في ${SOURCE}`);
  }
  let result;
  try {
    result = generate({ strict });
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
  const file = path.join(ROOT, TARGET);
  const note = `${result.decisions ? `مسودة، مواضع [قرار]: ${result.decisions}` : 'بلا [قرار]'}، وتاريخ السريان ${result.effective ?? 'غير مثبت'}`;
  if (argv.includes('--check')) {
    if (!existsSync(file) || readFileSync(file, 'utf8') !== result.text) {
      console.error(`${TARGET} لا يطابق ما يولّده scripts/site/privacy.mjs من ${SOURCE}؛ شغّله بلا --check`);
      process.exit(1);
    }
    console.log(`${TARGET} مطابق لمصدره (${note})`);
  } else {
    writeFileSync(file, result.text);
    console.log(`كُتب ${TARGET} من ${SOURCE} (${Buffer.byteLength(result.text)} بايت، ${note})`);
  }
}
