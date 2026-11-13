// تحقق مستقل من الجولة الثانية (2026-11-13، §١٠ وح-18): أخطاء نص في الفهرس فاتت مسح ع-٢٦ وع-٢٧. الضمير بعد المعدود يطابقه
// (المفرد والمثنى والجمع)، والجمع الإنجليزي بالعدد، ورسالة البحث تسمّي الزرين الظاهرين لا سهمين صارا أيقونتين، و«original file»
// لفظًا واحدًا في الفهرس الإنجليزي.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { setLocale, t } from '../../../src/i18n/index.js';
import { COUNT_FORMS, formatCount } from '../../../src/ui/format.js';
import { messageFor } from '../../../src/core/errors/index.js';

const NS = [1, 2, 3, 11, 100];
const reset = (ctx) => ctx.after(() => setLocale('ar'));
const src = (file) => readFileSync(new URL(`../../../src/${file}`, import.meta.url), 'utf8');
const PLACES = ['في موضعه', 'في موضعَيهما', 'في مواضعها', 'في مواضعها', 'في مواضعها'];

test('§١٠ (٢): ملخص «الاستكمال» في المحرّر «مقطع واحد في موضعه» و«مقطعان في موضعَيهما» كسطر المشغّل والمحفوظات', (ctx) => {
  reset(ctx);
  NS.forEach((n, i) => {
    const count = formatCount(n, COUNT_FORMS.cue);
    assert.ok(t('editor.complete.summary', { n, count, replace: n, insert: 0 }).startsWith(`${count} ${PLACES[i]}: ${n} استبدال و0 إدراج.`), `ar ${n}`);
  });
  assert.ok(src('pages/editor/complete-panel.js').includes("t('editor.complete.summary', { n: plan.items.length, count: formatCount(plan.items.length, COUNT_FORMS.cue)"), 'الموضع يمرر العدد خامًا');
  setLocale('en');
  assert.ok(t('editor.complete.summary', { n: 2, count: '2 segments', replace: 2, insert: 0 }).startsWith('2 segments in place: 2 replaced and 0 inserted.'));
});

test('§١٠ (٣): «تُخطّيت ترجمتان لا توافق حروفهما… حدّد لغتَيهما»، والإنجليزية «was/were» و«its/their» بالعدد', (ctx) => {
  reset(ctx);
  const forms = () => t('settings.langs.translationCount');
  const msg = (n) => messageFor('PG_LANG_ASSIGN_SKIPPED', { n: formatCount(n, forms()), count: n });
  assert.equal(msg(1), 'عُيّنت اللغة لما وافقت حروفه، وتُخطّيت ترجمة واحدة لا توافق حروفها اللغة المختارة؛ حدّد لغتها من قائمة «الترجمة» في المشغّل.');
  assert.equal(msg(2), 'عُيّنت اللغة لما وافقت حروفه، وتُخطّيت ترجمتان لا توافق حروفهما اللغة المختارة؛ حدّد لغتَيهما من قائمة «الترجمة» في المشغّل.');
  for (const n of [3, 11, 100]) assert.match(msg(n), /لا توافق حروفها اللغة المختارة؛ حدّد لغتها /, `ar ${n}`);
  assert.ok(src('pages/settings/langs.js').includes("messageFor('PG_LANG_ASSIGN_SKIPPED', { n: formatCount(skipped, translationForms()), count: skipped })"), 'الموضع يمرر العدد خامًا');
  setLocale('en');
  assert.equal(msg(1), 'The language was set for videos whose script matched; 1 translation whose script doesn’t match the chosen language was skipped. Set its language from the Translation menu in the player.');
  assert.equal(msg(2), 'The language was set for videos whose script matched; 2 translations whose script doesn’t match the chosen language were skipped. Set their language from the Translation menu in the player.');
});

test('ح-18 (تحقق مستقل): «لا مطابقات أخرى» تسمّي زرّي «السابقة» و«التالية» الظاهرين، لا سهمين صارا أيقونتين ولا مفاتيح أسهم', (ctx) => {
  reset(ctx);
  assert.equal(t('editor.search.noOthers'), 'لا مطابقات أخرى خارج ما استُبدل؛ اختر نتيجة بزرّي السابقة والتالية لتستبدلها.');
  setLocale('en');
  assert.equal(t('editor.search.noOthers'), 'No other matches outside what was just replaced; pick a result with the Previous and Next buttons to replace it.');
  for (const loc of ['ar', 'en']) {
    setLocale(loc);
    assert.doesNotMatch(t('editor.search.noOthers'), /[↑↓]/, loc);
  }
});

test('§١٠ (٩): «the original file» لفظًا واحدًا في الفهرس الإنجليزي، لا «the original’s file»', (ctx) => {
  reset(ctx);
  setLocale('en');
  const text = messageFor('CT_FINGERPRINT_VIDEO_CHANGED');
  assert.doesNotMatch(text, /original’s file/);
  assert.equal(text, 'The video changed before the original file finished downloading, so it won’t be possible to compare it with your translation later. To make that possible, go back to that video and download the original file again.');
  assert.doesNotMatch(src('i18n/en/errors.js'), /original’s file/);
});

test('ن-٩ (نقض ح-12): شارة البيانات الإنجليزية تطابق العربية «ترجماتك وإعداداتك في متصفحك» ولا توسّع الوعد إلى «data»', (ctx) => {
  reset(ctx);
  assert.equal(t('common.nav.yourData'), 'ترجماتك وإعداداتك في متصفحك');
  setLocale('en');
  // الصيغة الأدق من bc1c9af: صور المحفوظات حين تُفعَّل تُطلب من يوتيوب بمعرّف الفيديو، فلا يُقال إن «بياناتك» كلها في المتصفح.
  assert.equal(t('common.nav.yourData'), 'Your translations and settings stay in your browser');
  assert.doesNotMatch(t('common.nav.yourData'), /\bdata\b/i);
});

test('ح-4 (تحقق مستقل): فعل «علّم للمراجعة» بلفظ إنجليزي واحد قصير في قائمة المشغّل وصف لوحة النص', (ctx) => {
  reset(ctx);
  assert.equal(t('player.controls.markReview'), t('player.panel.markRow'), 'العربية لفظ واحد');
  setLocale('en');
  const label = t('player.controls.markReview');
  assert.equal(t('player.panel.markRow'), label, 'زر الصف وزر القائمة بالاسم نفسه');
  assert.ok(t('player.panel.markRowTip').startsWith(`${label}: `), 'التلميح يبدأ بالاسم');
  // «Review later» نحو 74 بكسل بمقاييس المراعي العريض 13 من نحو 87 متاحة في زر القائمة (قياس 47485fe)، فلا يلتف.
  assert.equal(label, 'Review later');
  for (const k of ['player.controls.markReview', 'player.panel.markRow', 'player.panel.markRowTip']) assert.doesNotMatch(t(k), /Mark for review/, k);
});
