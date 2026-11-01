// الرسائل داخل المشغّل (figma-design-brief §٧.٢) ونصوص الأدوات النقية: إشعارات المتحكم (الاستعادة وتصفير الإزاحة)
// رسائل عابرة تُصرف بعد عرضها، وأخطاؤه الخلفية باقية حتى الإغلاق، ولا يبقى شيء منها بعد تبدّل الفيديو؛ والتلميحات
// والمعاني والملخص بالعربية الصحيحة والأرقام اللاتينية.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TOAST_MS } from '../../../../src/player/controls/session.js';
import {
  badgeTip, comparisonSummary, minusTip, nudgeFlash, offsetMeaning, parseSeconds, plusTip, shortTime, stepSeconds,
} from '../../../../src/player/controls/text.js';
import { arabic, makeState, matched, mountPage } from './harness.js';

test('إشعار الاستعادة رسالة معلومة عابرة (3 ث)، ثم يُصرف في المتحكم مرة واحدة', () => {
  const page = mountPage({ state: makeState({ arabic: arabic(), notice: { code: 'ST_RESTORED', tone: 'info', at: 7 } }) });
  assert.deepEqual(page.ui.toasts(), [{ tone: 'info', text: 'ⓘاستُعيدت ترجمتك المحفوظة لهذا الفيديو.' }]);
  page.env.win.advance(1);
  assert.deepEqual(page.controller.calls, [['dismissNotice']]);
  assert.equal(page.controller.getState().notice, null);
  assert.equal(page.ui.toasts().length, 1, 'الصرف لا يُخفي الرسالة قبل وقتها');
  page.env.win.advance(TOAST_MS);
  assert.deepEqual(page.ui.toasts(), []);
});

test('خطأ خلفي من المتحكم (قراءة أو حفظ): رسالة خطأ باقية بزر إغلاق، ولا تتكرر للخطأ نفسه', () => {
  const page = mountPage();
  const err = { code: 'ST_WRITE_FAILED', message: 'تعذّر الحفظ. أعد المحاولة، وإن تكرر فانسخ تقرير التشخيص.', detail: null };
  page.controller.set({ error: err });
  page.controller.set({ version: 9 });
  assert.equal(page.ui.toasts().length, 1);
  assert.equal(page.ui.toasts()[0].tone, 'error');
  page.env.win.advance(TOAST_MS * 4);
  assert.equal(page.ui.toasts().length, 1);
  page.ui.toastClose(0).dispatchEvent({ type: 'click', bubbles: true });
  assert.equal(page.ui.toasts().length, 0);
});

test('تبدّل الفيديو يمسح رسائل الفيديو السابق', () => {
  const page = mountPage();
  page.controller.set({ error: { code: 'ST_READ_FAILED', message: 'تعذّرت قراءة المحفوظات.', detail: null } });
  assert.equal(page.ui.toasts().length, 1);
  page.controller.set({ videoId: 'BBBBBBBBBBB', error: null });
  assert.equal(page.ui.toasts().length, 0);
});

test('الخطوة والتلميحات: «0.5» و«1» و«1.5»، والإشارة بمعناها', () => {
  assert.deepEqual([100, 300, 500, 1000, 1500, 10000].map(stepSeconds), ['0.1', '0.3', '0.5', '1', '1.5', '10']);
  assert.equal(minusTip(500), 'تقديم الترجمة 0.5 ث (تظهر أبكر)');
  assert.equal(plusTip(1000), 'تأخير الترجمة 1 ث (تظهر لاحقًا)');
  assert.equal(badgeTip(0), 'الإزاحة: 0.0 ث. اضغط للخيارات');
  assert.equal(badgeTip(500), 'الإزاحة: +0.5 ث (تظهر الترجمة لاحقًا). اضغط للخيارات');
  assert.equal(badgeTip(-1500), 'الإزاحة: −1.5 ث (تظهر الترجمة أبكر). اضغط للخيارات');
  assert.equal(nudgeFlash(1000), '+1.0 ث · تظهر لاحقًا');
  assert.equal(nudgeFlash(-500), '−0.5 ث · تظهر أبكر');
  assert.equal(nudgeFlash(0), '0.0 ث · في توقيتها المحفوظ');
});

test('معنى الإزاحة بالكلمات', () => {
  assert.equal(offsetMeaning(0), 'الترجمة في توقيتها المحفوظ');
  assert.equal(offsetMeaning(500), 'تظهر الترجمة لاحقًا بنصف ثانية');
  assert.equal(offsetMeaning(-1000), 'تظهر الترجمة أبكر بثانية واحدة');
  assert.equal(offsetMeaning(2000), 'تظهر الترجمة لاحقًا بثانيتين');
  assert.equal(offsetMeaning(-2300), 'تظهر الترجمة أبكر بـ2.3 ث');
});

test('ملخص المقارنة بالمطابقة العددية للصفة، وقائمة الأرقام المختصرة', () => {
  const s = (o) => comparisonSummary(matched({ matched: false, ...o })).text;
  assert.deepEqual(comparisonSummary(matched()), { tone: 'ok', text: 'مطابق للأصل ✓' });
  assert.deepEqual(comparisonSummary(null), { tone: 'info', text: 'لا بصمة للمقارنة؛ عُرض الملف كما هو.' });
  assert.equal(comparisonSummary(matched({ fingerprintId: null, matched: false })).tone, 'info');
  assert.equal(s({ missing: [5] }), 'مقطع واحد ناقص: 5');
  assert.equal(s({ missing: [5, 6] }), 'مقطعان ناقصان: 5، 6');
  assert.equal(s({ missing: [57, 58, 201] }), '3 مقاطع ناقصة: 57، 58، 201');
  assert.equal(s({ missing: Array.from({ length: 11 }, (_, i) => i + 1) }), '11 مقطعًا ناقصًا: 1، 2، 3، 4، 5، 6، …');
  assert.equal(s({ extra: [9, 10, 11] }), '3 مقاطع زائدة: 9، 10، 11');
  assert.equal(s({ drift: [{ n: 1 }, { n: 2 }] }), 'توقيت مختلف في مقطعين');
  assert.equal(s({ drift: Array.from({ length: 12 }, (_, i) => ({ n: i + 1 })) }), 'توقيت مختلف في 12 مقطعًا');
  assert.equal(s({ empty: [3], noArabic: [3, 4] }), 'مقطعان بلا ترجمة عربية', 'المكرر يُعدّ مرة');
  assert.equal(s({ missing: [2], drift: [{ n: 1 }] }), 'مقطع واحد ناقص: 2 · توقيت مختلف في مقطع واحد');
  assert.equal(s({ numbering: 'different' }), 'ترقيم المقاطع مختلف عن الأصل');
  assert.equal(comparisonSummary(matched({ matched: false })).tone, 'warn');
});

test('قراءة الثواني من الحقل', () => {
  assert.equal(parseSeconds('1.5'), 1.5);
  assert.equal(parseSeconds('-2.3'), -2.3);
  assert.equal(parseSeconds('+4'), 4);
  assert.equal(parseSeconds('−0.5'), -0.5, 'ناقص الطباعة');
  assert.equal(parseSeconds(' ٢٫٥ '), 2.5, 'أرقام وفاصلة عربية');
  assert.equal(parseSeconds('۳,۵'), 3.5, 'أرقام فارسية وفاصلة لاتينية');
  assert.equal(parseSeconds('.5'), 0.5);
  assert.equal(parseSeconds('\u200e-1'), -1, 'علامة اتجاه غير مرئية تُهمل');
  for (const bad of ['', 'abc', '1.2.3', '--1', '1e3', '1,2,3', null, undefined]) assert.equal(parseSeconds(bad), null, String(bad));
});

test('زمن مختصر للرسائل', () => {
  assert.equal(shortTime(760000), '12:40');
  assert.equal(shortTime(1085000), '18:05');
  assert.equal(shortTime(3725000), '1:02:05');
  assert.equal(shortTime(5000), '0:05');
});

test('الرسائل فوق القائمة المفتوحة لا فوق بنودها (كشفه الاختبار الحي)، وتعود فوق الشريط بعد إغلاقها', async () => {
  const { click, trackInfo, settle } = await import('./harness.js');
  const page = mountPage({ state: makeState({ captured: [trackInfo()] }) });
  const y = () => page.ui.layerHost().shadowRoot.querySelector('.toasts').style.getPropertyValue('--y');
  assert.equal(y(), '60px', 'فوق الشريط (48 + 12)');
  page.ui.menu().rect = { top: 0, left: 0, width: 300, height: 220, bottom: 220, right: 300 };
  click(page.ui.btn('download'));
  const menuY = parseInt(page.ui.menu().style.getPropertyValue('--y'), 10);
  assert.equal(y(), `${menuY + 220 + 12}px`, 'فوق أعلى القائمة');
  click(page.ui.item('نسخ تعليمات الترجمة'));
  await settle();
  assert.equal(page.ui.toasts().length, 1);
  click(page.ui.btn('download'));
  assert.equal(y(), '60px');
});
