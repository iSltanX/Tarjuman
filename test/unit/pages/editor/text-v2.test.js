// نصوص المحرّر في الإصدار الثاني (P14-AC1 وAC9): خانة التحرير تُفرَّق عن النشطة في الاسم والسطر، والعمود المرجعي، ورسالة
// الحفظ تتبع «مكان حفظ ملفات الترجمة».
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { activeSlotLine, editSlotLabel, refLabel, refOptionLabel, saveMessage, slotFallback } from '../../../../src/pages/editor/text.js';
import { messageFor } from '../../../../src/core/errors/index.js';
import { absoluteTime } from '../../../../src/pages/library/model.js';

test('خانة التحرير والنشطة: الاسم والسطر يفرّقان بينهما، والحفظ هنا لا يغيّر النشطة', () => {
  assert.equal(editSlotLabel({ n: 2, filled: true, active: false }, { editing: true }), 'الترجمة 2، قيد التحرير');
  assert.equal(editSlotLabel({ n: 1, filled: true, active: true }, { editing: false }), 'الترجمة 1، النشطة في المشغّل');
  assert.equal(editSlotLabel({ n: 3, filled: false, active: false }, { editing: false }), 'الترجمة 3، فارغة');
  // اسم الخانة معزول اتجاهًا (FSI…PDI) فلا تنقلب علامات ترقيم اسم إنجليزي (تدقيق 7a66f91، U27).
  const iso = (t) => `${String.fromCodePoint(0x2068)}${t}${String.fromCodePoint(0x2069)}`;
  assert.ok(activeSlotLine(2, 1, 'مراجعة').startsWith(`تحرّر الترجمة 2 «${iso('مراجعة')}». النشطة في المشغّل الترجمة 1، والحفظ هنا لا يغيّرها`));
  assert.equal(activeSlotLine(1, 1, null), 'تحرّر الترجمة 1، وهي النشطة في المشغّل.');
  assert.equal(refOptionLabel('en'), 'الأصل', 'بلا لغة معروفة (AA3)');
  assert.equal(refOptionLabel('en', null, 'en'), 'الإنجليزية');
  assert.equal(refOptionLabel('en', null, 'ja'), 'اليابانية', 'باسم لغة المسار الفعلية');
  assert.equal(refOptionLabel(3, 'قديمة'), `الترجمة 3 — ${iso('قديمة')}`);
  assert.equal(slotFallback(3, 1), 'الترجمة 3 فارغة، فعُرضت الترجمة 1.');
});

test('رسالة الحفظ تتبع «مكان حفظ ملفات الترجمة»: التنزيلات، والمجلد الفرعي، والسؤال، والرجوع إلى المعتاد، والإلغاء', () => {
  const loc = { mode: 'subfolder', folder: 'ترجمات' };
  // اسم الملف معزول LTR (تدقيق 7a66f91، C6، U49).
  const a = `${String.fromCodePoint(0x2066)}a.srt${String.fromCodePoint(0x2069)}`;
  assert.equal(saveMessage({ ok: true, mode: 'downloads' }, 'a.srt', loc, messageFor).text, `حُفظ ${a} في مجلد التنزيلات.`);
  assert.equal(saveMessage({ ok: true, mode: 'subfolder' }, 'a.srt', loc, messageFor).text, `حُفظ ${a} في مجلد ترجمات داخل التنزيلات.`);
  // التاريخ بصيغة المحفوظات وتوقيت الجهاز (تدقيق Fable، UX-07: كان ISO خامًا بتوقيت UTC)، والعدّ بصيغه («جزآن»).
  const at = absoluteTime('2026-11-02T10:05:00.000Z');
  assert.ok(at && !at.includes('T'), at);
  assert.equal(refLabel({ trackKey: 'en|manual', mode: 'normal', parts: [{}, {}, {}], createdAt: '2026-11-02T10:05:00.000Z' }), `يدوي · عادي · 3 أجزاء · ${at}`);
  assert.equal(refLabel({ trackKey: 'en|manual', mode: 'normal', parts: [{}, {}], createdAt: '2026-11-02T10:05:00.000Z' }), `يدوي · عادي · جزآن · ${at}`);
  assert.equal(refLabel({ trackKey: 'en|asr', mode: 'long', parts: null, createdAt: '2026-11-02T10:05:00.000Z' }), `تلقائي · مقاطع أطول · ${at}`);
  assert.equal(saveMessage({ ok: true, mode: 'ask' }, 'a.srt', loc, messageFor).text, `حُفظ ${a} حيث اخترت.`);
  const blob = saveMessage({ ok: true, mode: 'blob' }, 'a.srt', loc, messageFor);
  assert.equal(blob.tone, 'info');
  assert.ok(blob.text.includes(messageFor('SV_FALLBACK_BLOB')));
  assert.equal(saveMessage({ ok: false, code: 'SV_CANCELLED' }, 'a.srt', loc, messageFor).tone, 'info');
  assert.equal(saveMessage({ ok: false, code: 'SV_BAD_FILE' }, 'a.srt', loc, messageFor).tone, 'danger');
});
