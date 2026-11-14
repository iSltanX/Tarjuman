// نصوص الموقع والخصوصية (جولة النشر T5): PRIVACY.md مولَّد من مصدره الواحد docs/site/privacy.md بلا قسم الرأس ولا جدول
// الأدلة ولا مراسي المواصفة، ورقم الإصدار من package.json، و[قرار] يُبقيه مسودة يرفضها --strict، وتاريخ السريان يُثبَّت بصيغته.
// وكل مسار يستشهد به جدول أدلة في نصوص الموقع موجود في المستودع.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PENDING_DATE, SOURCE, SOURCE_EN, TARGET, effectiveDateOf, generate, withEffectiveDate } from '../../../scripts/site/privacy.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const source = readFileSync(path.join(ROOT, SOURCE), 'utf8');
const sourceEn = readFileSync(path.join(ROOT, SOURCE_EN), 'utf8');
// نسخة من المصدر بلا تاريخ، لاختبار سلوك المولّد مع ⟨تاريخ النشر⟩ أيًّا كان سطر المصدر (ثُبّت 2026-11-04، ثم 2026-11-05 في تدقيق 7a66f91،
// C9، ثم عاد ⟨تاريخ النشر⟩ في AA4 لأن ما يحفظه 2.0.0 تغيّر، ثم ثُبّت 2026-11-08 يوم نشر موقع 2.0.0 بقرار سلطان، ثم عاد في 2.1.0 وثُبّت 2026-11-08 يوم نشره بقراره،
// ثم 2026-11-10 و2026-11-11، ثم عاد في 2.3.0 لأن ما يحفظه تغيّر: ح-62).
const undated = source.replace(/^- \*\*تاريخ السريان:\*\* .+$/m, '- **تاريخ السريان:** ⟨تاريخ النشر⟩');
/** ⟨تاريخ النشر⟩ في النص خارج التنبيهات والشيفرة المضمّنة، أي ما يملؤه --effective. @param {string} text */
const bareMarks = (text) => text.split('\n').filter((l) => !l.startsWith('>')).join('\n').match(/(?<!`)⟨تاريخ النشر⟩(?!`)/g)?.length ?? 0;
/** سطر «الإصدار …» في قسم «التغييرات». @param {string} text */
const changesLine = (text) => text.slice(text.indexOf('`#changes`')).split('\n').find((l) => /^- \*\*(?:الإصدار|Version) /.test(l));
/**
 * المصدر بحاله قبل --effective: سطر الرأس وسطر «التغييرات» بـ⟨تاريخ النشر⟩، فإن كان مثبتًا أُرجع السطران وحدهما. فاختبار --effective
 * على النص الحقيقي يمر قبل يوم النشر وبعده (تحقق 2.3.0، ص-٢: كان يفرض غياب التاريخ فيسقط بالإجراء الموثّق نفسه). @param {string} text
 */
const pendingOf = (text) => {
  const effective = effectiveDateOf(text);
  if (!effective) return text;
  const line = changesLine(text);
  return text.replace(/^- \*\*تاريخ السريان:\*\* .+$/m, '- **تاريخ السريان:** ⟨تاريخ النشر⟩').replace(line, line.replaceAll(effective, PENDING_DATE));
};
const { version } = JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf8'));

test('PRIVACY.md المتتبَّع هو ما يولّده المولّد من مصدره', () => {
  assert.ok(readFileSync(path.join(ROOT, TARGET), 'utf8') === generate().text, 'شغّل node scripts/site/privacy.mjs');
});

test('المولَّد بلا ما يخص المواصفة: لا رأس ولا تنبيهات المصدر ولا جدول أدلة ولا مراسٍ نصية، وبرقم الإصدار ومراسٍ ثابتة', () => {
  const { text } = generate();
  assert.ok(text.startsWith('<div dir="rtl">\n\n# سياسة الخصوصية — ترجمان\n'));
  assert.ok(text.includes(`كما تفعله شيفرة الإصدار ${version}.`));
  for (const banned of ['## الرأس', 'جدول الأدلة', 'المصدر الواحد لنص الخصوصية', '`#summary`', '/tarjuman/support']) {
    assert.equal(text.includes(banned), false, banned);
  }
  // ⟨…⟩ لا يُنشر: يبقى ⟨تاريخ النشر⟩ وحده في النص ما دام تاريخ السريان غير مثبت (ح-62)، ولا شيء منه بعد --effective.
  assert.equal(text.replaceAll(PENDING_DATE, '').includes('⟨'), false);
  assert.equal(generate({ source: withEffectiveDate(source, '2026-12-01') }).text.includes('⟨'), false);
  const anchors = [...source.matchAll(/^#{2,3} .+? — `#([a-z-]+)`$/gm)].map((m) => m[1]);
  assert.ok(anchors.length >= 12);
  for (const a of anchors) assert.ok(text.includes(`<a id="${a}"></a>`), a);
  for (const a of ['summary', 'stored', 'files', 'sent', 'youtube', 'thumbnails', 'report', 'offline', 'ai', 'permissions', 'third-parties', 'limited-use', 'retention', 'changes', 'contact']) {
    assert.ok(anchors.includes(a), `المرساة ${a}`);
  }
  assert.ok(text.includes('](docs/site/help.md)'), 'رابط صفحة الدعم يصير ملفها في المستودع');
});

test('[قرار] يُبقي المولَّد مسودة بتنبيه، و--strict يرفضه ويرفض تاريخ سريان غير مثبت', () => {
  const draft = generate();
  const marks = (source.slice(0, source.indexOf('## جدول الأدلة')).match(/\*\*\[قرار\]\*\*/g) ?? []).length
    - (source.slice(0, source.indexOf('## الرأس')).match(/\*\*\[قرار\]\*\*/g) ?? []).length;
  assert.equal(draft.decisions, marks);
  if (draft.decisions) {
    assert.ok(draft.text.includes(`> **مسودة:** مواضع [قرار] لم يحسمها الناشر بعد: ${draft.decisions}.`));
    assert.throws(() => generate({ strict: true }), /\[قرار\]/);
  }
  const resolved = undated.replace(/\s*\*\*\[قرار\]\*\*/g, '');
  assert.throws(() => generate({ source: resolved, strict: true }), /تاريخ السريان غير مثبت/);
  const dated = withEffectiveDate(resolved, '2026-12-01');
  const ok = generate({ source: dated, strict: true });
  assert.equal(ok.decisions, 0);
  assert.equal(ok.effective, '2026-12-01');
  assert.ok(ok.text.includes('تسري هذه السياسة اعتبارًا من 2026-12-01.'));
  // تنبيه المسودة وحده لا الكلمة: «ما يُحفظ» يذكر مسودة المحرّر منذ الفكرة ٩.
  assert.equal(ok.text.includes('> **مسودة:**'), false);
  assert.equal(ok.text.includes('لم يحسمها الناشر'), false);
});

test('تاريخ السريان: المصدران وPRIVACY.md على حال واحدة، ⟨تاريخ النشر⟩ قبل النشر أو تاريخ صحيح بعد --effective (ص-٢)، و--strict يرفض غير المثبت، و--effective يملأ الرأس وسطر «التغييرات» باللغتين', () => {
  // الحال الحاضرة أيًّا كانت (ح-62: ⟨تاريخ النشر⟩ حتى يثبّته سلطان يوم النشر): التاريخ واحد في النسختين، وصحيح إن ثُبّت
  // (effectiveDateOf يرمي غير الصالح)، وسطر «التغييرات» عليه، وPRIVACY.md المولَّد بحاله. وما يمنع نشر غير المثبت بوابة النشر
  // (scripts/release/gate.mjs) لا هذا الاختبار، فلا يسقط باتباع الإجراء الموثّق.
  const effective = effectiveDateOf(source);
  assert.equal(effectiveDateOf(sourceEn), effective, 'privacy.en.md بتاريخ privacy.md');
  for (const [name, text] of [['ar', source], ['en', sourceEn]]) {
    assert.ok(changesLine(text).includes(effective ?? PENDING_DATE), `${name}: سطر «التغييرات» بتاريخ السريان، أو ⟨تاريخ النشر⟩ قبل تثبيته`);
    if (effective) assert.equal(bareMarks(text), 0, `${name}: لا ⟨تاريخ النشر⟩ في النص بعد --effective`);
  }
  const current = generate();
  assert.equal(current.effective, effective);
  if (effective) {
    assert.ok(current.text.includes(`تسري هذه السياسة اعتبارًا من ${effective}.`));
    assert.ok(current.text.includes(`صدر في ${effective}`));
    assert.equal(current.text.includes('⟨'), false);
  } else {
    assert.equal(current.text.includes('تسري هذه السياسة'), false);
    assert.ok(current.text.includes(`صدر في ${PENDING_DATE}`));
    assert.throws(() => generate({ strict: true }), /تاريخ السريان غير مثبت/, '--strict يرفض النشر قبل التاريخ');
  }
  // --effective على المصدر بحاله قبل النشر، باللغتين.
  for (const [name, text] of [['ar', pendingOf(source)], ['en', pendingOf(sourceEn)]]) {
    assert.equal(effectiveDateOf(text), null, name);
    assert.ok(changesLine(text).includes(PENDING_DATE), `${name}: سطر «التغييرات» بتاريخ الصدور ⟨تاريخ النشر⟩`);
    const dated = withEffectiveDate(text, '2026-12-01');
    assert.equal(effectiveDateOf(dated), '2026-12-01', name);
    assert.ok(changesLine(dated).includes('2026-12-01'), `${name}: --effective يملأ سطر «التغييرات»`);
    assert.equal(bareMarks(dated), 0, `${name}: لا ⟨تاريخ النشر⟩ في النص بعد --effective`);
    // التنبيهات (لا تُنشر) تذكر العلامة اسمًا بين علامتي شيفرة، فتبقى كما هي.
    const notes = (t) => t.split('\n').filter((l) => l.startsWith('>')).join('\n');
    assert.equal(notes(dated), notes(text), `${name}: التنبيهات كما هي`);
  }
  // غير المثبت: يُولَّد بلا سطر «تسري…» وفيه «صدر في ⟨تاريخ النشر⟩»، و--strict يرفضه.
  const pending = generate({ source: pendingOf(source) });
  assert.equal(pending.effective, null);
  assert.equal(pending.text.includes('تسري هذه السياسة'), false);
  assert.ok(pending.text.includes(`صدر في ${PENDING_DATE}`));
  assert.throws(() => generate({ source: pendingOf(source), strict: true }), /تاريخ السريان غير مثبت/, '--strict يرفض النشر قبل التاريخ');
  // المثبت: --strict يقبله بالتاريخ في المقدمة وسطر «التغييرات»، بلا ⟨…⟩.
  const published = generate({ source: withEffectiveDate(pendingOf(source), '2026-12-01'), strict: true }).text;
  assert.match(published, /تسري هذه السياسة اعتبارًا من 2026-12-01\./);
  assert.ok(published.includes('صدر في 2026-12-01'));
  assert.equal(published.includes('⟨'), false);
  // تثبيت سطر الرأس وحده (بيد) لا يمر: ⟨تاريخ النشر⟩ الباقي في النص لا يُنشر.
  const headOnly = pendingOf(source).replace(/^- \*\*تاريخ السريان:\*\* .+$/m, '- **تاريخ السريان:** 2026-12-01');
  assert.throws(() => generate({ source: headOnly }), /ما لا يُنشر: ⟨تاريخ النشر⟩/);
  assert.equal(effectiveDateOf(undated), null);
  assert.throws(() => generate({ source: undated, strict: true }), /تاريخ السريان غير مثبت/, '--strict يرفض النشر قبل التاريخ');
  assert.equal(effectiveDateOf(withEffectiveDate(undated, '2026-11-04')), '2026-11-04');
  assert.throws(() => withEffectiveDate(undated, '2026-13-40'), /غير صالح/);
  assert.throws(() => withEffectiveDate(undated, '1 ديسمبر'), /غير صالح/);
  assert.throws(() => effectiveDateOf(undated.replace('- **تاريخ السريان:** ⟨تاريخ النشر⟩', '- **تاريخ السريان:** غدًا')), /غير صالح/);
  assert.throws(() => withEffectiveDate(undated, '2026-02-30'), /غير صالح/, 'تاريخ لا وجود له');
});

test('كل مسار في جداول أدلة نصوص الموقع موجود، وكل نص بقسم رأس وجدول أدلة', () => {
  for (const file of ['privacy.md', 'help.md', 'tarjuman.md', 'credits.md']) {
    const text = readFileSync(path.join(ROOT, 'docs/site', file), 'utf8');
    assert.ok(text.includes('\n## الرأس\n') || text.includes('\n## البيانات الوصفية\n'), `${file}: قسم الرأس`);
    const at = text.indexOf('## جدول الأدلة (للمراجعة، لا يُنشر)');
    assert.ok(at > 0, `${file}: جدول الأدلة`);
    const paths = [...new Set([...text.slice(at).matchAll(/`((?:src|docs|scripts|test|store)\/[^`\s]*?)`/g)].map((m) => m[1].replace(/\/$/, '')))];
    assert.ok(paths.length > 5, file);
    for (const p of paths) assert.ok(existsSync(path.join(ROOT, p)), `${file}: ${p}`);
  }
});
