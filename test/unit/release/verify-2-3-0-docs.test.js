// حرّاس إصلاحات الوثائق في التحقق الأخير لـ2.3.0 (ص-٧ في السجل، وص-١٥ وص-١٦ وص-١٧، وتبرير storage في ص-٢٠). كانت بلا
// اختبار، فنقض التحقق المستقل لـ3.0.0 قرار «لا حارس» (ت٣-v2-fixes-5): قاعدة الخطة «لكل إصلاح اختبار يفشل بلا الإصلاح» لا
// تستثني الوثائق. وكل حارس يقرن النص بالشيفرة التي يصفها حيث توجد، فيسقط إن تغيّر أحدهما دون الآخر.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DRAFT_LIMITS } from '../../../src/core/model/draft.js';
import { DRAG_PX, TOUCH_DRAG_PX } from '../../../src/player/panel/transcript.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const read = (rel) => readFileSync(path.join(ROOT, rel), 'utf8');
/** قسم الإصدار الحالي في السجل: من أول «## » إلى الذي يليه. */
const currentSection = () => {
  const text = read('CHANGELOG.md');
  const start = text.indexOf('\n## ');
  const next = text.indexOf('\n## ', start + 1);
  return text.slice(start, next < 0 ? undefined : next);
};

test('ص-٧: السجل يقول سقف المسودات بعدد الفيديوهات كما تفعله الشيفرة، لا بعدد المسودات', () => {
  assert.equal(DRAFT_LIMITS.drafts, 5, 'السجل يقول «خمسة فيديوهات»: غيّره مع السقف');
  const section = currentSection();
  assert.ok(section.includes('خمسة فيديوهات على الأكثر، فإن جاء سادس حُذفت مسودات أقدمها.'));
  assert.doesNotMatch(section, /خمس مسودات/);
});

test('ص-١٥: عتبة السحب في السجل هي عتبتا الشيفرة (الفأرة والقلم، واللمس)', () => {
  const m = /والسحب ما تجاوز (\d+) بكسل بالفأرة والقلم، و(\d+) باللمس/.exec(currentSection());
  assert.ok(m, 'سطر السحب في لوحة النص يذكر العتبتين');
  assert.deepEqual([Number(m[1]), Number(m[2])], [DRAG_PX, TOUCH_DRAG_PX]);
});

test('ص-١٥: السجل يقول ما يحدث بالرجوع إلى 2.2.0، برسالة رفض النسخة الاحتياطية بنصها', () => {
  const line = currentSection().split('\n').find((l) => l.startsWith('- إن رجعت إلى 2.2.0 '));
  assert.ok(line, 'سطر الرجوع إلى 2.2.0');
  assert.match(line, /قوائم المصطلحات والمسودات/);
  const quoted = /«(هذه النسخة الاحتياطية من إصدار أحدث من ترجمان)…»/.exec(line);
  assert.ok(quoted, 'الرسالة مقتبسة');
  assert.ok(read('src/core/errors/backup.js').includes(`BK_VERSION_NEWER: '${quoted[1]}.`), 'الاقتباس بداية الرسالة نفسها');
});

test('ص-١٦: اختيار اللغة من ⚙ يغلق قائمة «تنزيل الأصل»، فالدليل والقيود يقولان افتحها مرة أخرى', () => {
  for (const rel of ['docs/user-guide.md', 'docs/known-limitations.md']) {
    const text = read(rel);
    assert.ok(text.includes('اختر اللغة من ⚙ ← الترجمة، ثم افتح القائمة مرة أخرى، لأن ⚙ يغلقها'), rel);
    assert.doesNotMatch(text, /⚙ ← الترجمة والقائمة مفتوحة/, rel);
  }
});

test('ص-١٦: قائمة الشارة اسمها «قائمة التوقيت» في المواصفة والدليل والقيود والسجل', () => {
  for (const rel of ['docs/product-spec.md', 'docs/user-guide.md', 'docs/known-limitations.md', 'CHANGELOG.md']) {
    assert.doesNotMatch(read(rel), /قائمة الشارة/, rel);
  }
});

test('ص-١٧: قائمة يوم النشر تعيد قراءة سياسات Mozilla قبل رفع AMO بعد 1 ديسمبر 2026', () => {
  assert.match(read('docs/release-day.md'), /وقبل رفع AMO بعد 1 ديسمبر 2026 تُعاد قراءة سياسات Mozilla المحدّثة/);
});

test('ص-٢٠: تبرير إذن storage يذكر المسودات بسقفها وقوائم المصطلحات', () => {
  const text = read('store/submission.md');
  const at = text.indexOf('<!-- field: reviewer.permission.storage -->');
  assert.ok(at >= 0);
  const block = text.slice(at, text.indexOf('```\n', text.indexOf('```text', at) + 7));
  assert.equal(DRAFT_LIMITS.drafts, 5);
  assert.match(block, /drafts of unsaved Editor edits \(for at most five videos;/);
  assert.match(block, /glossary terms and the term lists/);
});
