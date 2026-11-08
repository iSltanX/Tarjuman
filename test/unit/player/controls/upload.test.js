// الرفع والعرض (P6-AC5، وP12-AC2 الجزء الآلي): دون ترجمة يفتح منتقي الملفات مباشرة، والفحص والمقارنة فوق readImport
// بالبصمات المحفوظة، ثم الحفظ في خانة (loadArabicInto) وملخص النتيجة؛ ومع ترجمة قائمة باسم الملف والملخص ووضع العرض،
// والرفع بتأكيد مضغوط: «حفظ في» بالخانات المحفوظة و«جديدة» لأول فارغة (الافتراضي)، وقرينة الاسم، وما يمسه الاستبدال
// و«إبقاء تعديلاتي».
// لا كتابة قبل التأكيد، ولا تحميل لنتيجة قُرئت لفيديو سابق.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TjError, messageFor } from '../../../../src/core/errors/index.js';
import { AR_CUES, arabic, chooseFiles, click, makeState, matched, mountPage, settle, slotTrack, withSlots } from './harness.js';

const file = (name) => ({ name });

test('دون ترجمة: زر الرفع يفتح منتقي الملفات مباشرة (لا قائمة)، ويقبل SRT وأجزاءه وTXT وMarkdown', () => {
  const page = mountPage();
  let opened = 0;
  page.ui.fileInput().addEventListener('click', () => opened++);
  click(page.ui.btn('upload'));
  assert.equal(opened, 1);
  assert.equal(page.ui.menuOpen(), false);
  assert.equal(page.ui.fileInput().getAttribute('accept'), '.srt,.txt,.md,application/x-subrip,text/plain,text/markdown');
  assert.equal(page.ui.fileInput().hasAttribute('multiple'), true);
  click(page.ui.btn('download'));
  assert.equal(page.ui.menuOpen(), true);
  click(page.ui.btn('upload'));
  assert.equal(page.ui.menuOpen(), false, 'فتح المنتقي يغلق القائمة المفتوحة');
  assert.equal(opened, 2);
});

test('اختيار ملف: فحص ومقارنة بالبصمات المحفوظة والإعدادات، ثم التحميل وملخص المقارنة في قائمة العرض', async () => {
  const fps = [{ id: 'fp_test000001' }];
  const page = mountPage({ state: makeState({ saved: { fingerprints: fps } }) });
  click(page.ui.btn('upload'));
  chooseFiles(page.ui, [file('talk.ar.srt')]);
  assert.equal(page.ui.btn('upload').querySelector('.load').hasAttribute('hidden'), false, 'فحص جارٍ');
  await settle();
  assert.deepEqual(page.flows.reads[0].names, ['talk.ar.srt']);
  assert.strictEqual(page.flows.reads[0].opts.fingerprints, fps);
  assert.strictEqual(page.flows.reads[0].opts.settings, page.controller.getState().settings);
  const load = page.controller.calls.find((c) => c[0] === 'loadArabicInto');
  assert.equal(load[1], 1, 'فيديو بلا ترجمة ولا قرينة: الخانة 1 مباشرة');
  assert.deepEqual(Object.keys(load[2]).sort(), ['comparison', 'cues', 'fileName', 'fingerprintId', 'lang', 'notes'], 'مدخل loadArabic بعقده، ولغة الملف (AA1)');
  assert.deepEqual(load[3], { replace: false, activate: undefined });
  assert.equal(page.flows.reviews[0].fileName, 'talk.ar.srt', 'فُحص الاسم قبل الحفظ');
  assert.equal('fingerprints' in page.flows.reviews[0], false, 'قرينة الاسم من الاسم وحده بلا ترتيب ثانٍ (تدقيق 7a66f91، Q24)');
  assert.equal(page.ui.menuLabel(), 'الترجمة');
  const text = page.ui.menuText();
  assert.match(text, /talk\.ar\.srt/);
  assert.match(text, /5 مقاطع/);
  assert.match(text, /مطابق للأصل/);
  assert.equal(text.includes('✓'), false, 'علامة المطابقة رمز SVG لا محرف');
  assert.ok(page.ui.menu().querySelector('.summary svg.glyph'));
  assert.doesNotMatch(text, /التفاصيل الكاملة في المحرّر/, 'لا فقرة شرح في القائمة («المشغّل للمشاهدة»)');
  // ترجمة واحدة: لا محدد أصلًا (لا «1» وحده ولا خانات فارغة).
  assert.equal(page.ui.menu().querySelectorAll('button.slot').length, 0);
  assert.equal(page.handle.diagnostics().session.imports, 1);
});

test('ملف تالف أو بترميز آخر: رسالة القراءة كما هي (برقم السطر) باقية حتى الإغلاق، ولا تحميل', async () => {
  const page = mountPage();
  page.flows.readResult = () => ({ ok: false, error: { code: 'IM_BAD_TIME', message: messageFor('IM_BAD_TIME', { line: 214 }), line: 214 } });
  click(page.ui.btn('upload'));
  chooseFiles(page.ui, [file('bad.srt')]);
  await settle();
  assert.equal(page.controller.calls.some((c) => c[0] === 'loadArabicInto'), false);
  assert.deepEqual(page.ui.toasts().map((t) => t.tone), ['error']);
  assert.match(page.ui.toasts()[0].text, /السطر 214/);
});

test('تحذيرات القراءة وملاحظات التنظيف تظهر في قائمة العرض بعد الرفع', async () => {
  const page = mountPage();
  page.flows.readResult = (files) => ({
    ok: true, fileName: files[0].name, cues: AR_CUES, fingerprintId: 'fp_test000001', notes: ['أُزيل سياج ``` حول الملف.'],
    comparison: matched({ notes: ['أُزيل سياج ``` حول الملف.'] }), warnings: [{ code: 'IM_NUMBERING_IRREGULAR', params: { n: 7, prev: 5 } }],
  });
  click(page.ui.btn('upload'));
  chooseFiles(page.ui, [file('x.srt')]);
  await settle();
  const text = page.ui.menuText();
  assert.match(text, /أُزيل سياج/);
  assert.match(text, /الترقيم غير متسلسل: جاء المقطع 7 بعد المقطع 5/);
});

test('مع ترجمة: قائمة العرض بالأوضاع الثلاثة، والمزدوج معطّل بسبب ظاهر دون مسار إنجليزي', () => {
  const page = mountPage({ state: makeState({ arabic: arabic() }) });
  click(page.ui.btn('upload'));
  assert.equal(page.ui.menuOpen(), true);
  const group = page.ui.menu().querySelector('.seg[aria-label="وضع العرض"]');
  const radios = group.querySelectorAll('[role="radio"]');
  assert.deepEqual(radios.map((r) => r.getAttribute('data-fid')), ['mode:ar', 'mode:dual', 'mode:off']);
  assert.equal(radios[0].getAttribute('aria-checked'), 'true');
  assert.equal(radios[1].getAttribute('aria-disabled'), 'true');
  assert.match(radios[1].getAttribute('aria-description'), /الأصل غير ملتقط لهذا الفيديو/, 'السبب لقارئ الشاشة');
  assert.match(radios[1].getAttribute('title'), /الأصل غير ملتقط لهذا الفيديو/, 'والسبب في التلميح');
  click(radios[1]);
  assert.equal(page.controller.calls.length, 0, 'المعطّل لا يُطبَّق');
  click(radios[2]);
  assert.deepEqual(page.controller.calls, [['setDisplayMode', 'off']]);
  assert.equal(page.ui.menu().querySelector('[data-fid="mode:off"]').getAttribute('aria-checked'), 'true');
  page.controller.set({ english: { key: 'en|manual', kind: 'manual', lang: 'en', cues: [], source: 'saved' } });
  click(page.ui.menu().querySelector('[data-fid="mode:dual"]'));
  assert.deepEqual(page.controller.calls.at(-1), ['setDisplayMode', 'dual']);
});

test('ملخص المقارنة بلونه: نقص بأرقامه، وتوقيت مختلف، وبلا بصمة', () => {
  const p1 = mountPage({ state: makeState({ arabic: arabic({ comparison: matched({ matched: false, missing: [57, 58, 201], countTarget: 2 }) }) }) });
  click(p1.ui.btn('upload'));
  const s1 = p1.ui.menu().querySelector('.summary');
  assert.equal(s1.textContent, '3 مقاطع ناقصة: 57، 58، 201');
  assert.equal(s1.getAttribute('data-tone'), 'warn');
  const p2 = mountPage({ state: makeState({ arabic: arabic({ comparison: matched({ matched: false, drift: Array.from({ length: 12 }, (_, i) => ({ n: i + 1, startDeltaMs: 300, endDeltaMs: 300 })) }) }) }) });
  click(p2.ui.btn('upload'));
  assert.equal(p2.ui.menu().querySelector('.summary').textContent, 'توقيت مختلف في 12 مقطعًا');
  const p3 = mountPage({ state: makeState({ arabic: arabic({ comparison: null }) }) });
  click(p3.ui.btn('upload'));
  assert.equal(p3.ui.menu().querySelector('.summary').textContent, 'لم يُنزَّل الأصل من ترجمان لهذا الفيديو، فلا مقارنة؛ يُعرض الملف كما هو.');
});

/** صفحة بترجمة في الخانة 1 (نشطة) وما يُعطى من غيرها، ثم الرفع من قائمة العرض حتى التأكيد المضغوط. */
async function uploadAgain({ tracks = [slotTrack()], offset = 0, name = 'new.ar.srt', read = null, hint = null, known = [] } = {}) {
  const page = mountPage({ state: makeState({ ...withSlots(tracks), view: { displayOffsetMs: offset, displayMode: 'ar' } }) });
  if (read) page.flows.readResult = read;
  page.flows.nameHint = hint;
  page.flows.known = known;
  click(page.ui.btn('upload'));
  let opened = 0;
  page.ui.fileInput().addEventListener('click', () => opened++);
  click(page.ui.item(tracks.filter(Boolean).length < 3 ? 'رفع ترجمة…' : 'استبدال…'));
  assert.equal(opened, 1);
  chooseFiles(page.ui, [file(name)]);
  await settle();
  return page;
}
const targets = (page) => page.ui.menu().querySelectorAll('button.slot').filter((b) => b.getAttribute('data-fid').startsWith('target:')).map((b) => [b.textContent, b.getAttribute('aria-checked'), b.getAttribute('data-filled'), b.getAttribute('aria-disabled')]);
const loads = (page) => page.controller.calls.filter((c) => c[0] === 'loadArabicInto');

test('رفع ثانٍ: تأكيد مضغوط بالملف وعدده وسطر الملخص، و«حفظ في» الافتراضي أول خانة فارغة، والحفظ يجعلها النشطة', async () => {
  const page = await uploadAgain({ read: (files) => ({ ok: true, fileName: files[0].name, cues: AR_CUES.slice(0, 4), comparison: matched({ matched: false, missing: [5], countTarget: 4 }), fingerprintId: 'fp_test000001', notes: [], warnings: [] }) });
  assert.equal(page.ui.menuLabel(), 'رفع ترجمة');
  const text = page.ui.menuText();
  assert.match(text, /new\.ar\.srt/);
  assert.match(text, /4 مقاطع/);
  assert.match(text, /مقطع واحد ناقص: 5/);
  assert.match(text, /حفظ في/);
  assert.deepEqual(targets(page), [['1', 'false', null, null], ['جديدة', 'true', null, null]], 'المحفوظة استبدالًا، ثم «جديدة» لأول فارغة، ولا خانات فارغة أرقامًا');
  assert.equal(page.ui.menu().querySelector('[data-fid="target:2"]').getAttribute('aria-label'), 'حفظ كترجمة جديدة');
  assert.equal(page.ui.menu().querySelector('[data-fid="target:1"]').getAttribute('aria-label'), 'استبدال الترجمة 1، نشطة');
  assert.ok(page.ui.menu().querySelector('[data-fid="target:3"]') === null);
  assert.equal(page.ui.menuText().includes('ستُصفَّر'), false, 'خانة فارغة: لا تصفير للمعروضة');
  assert.ok(page.ui.field('keep') === null, 'لا «إبقاء تعديلاتي» لخانة فارغة');
  assert.equal(loads(page).length, 0, 'لا شيء قبل التأكيد');
  click(page.ui.item('حفظ'));
  await settle();
  assert.deepEqual(loads(page)[0].slice(0, 2), ['loadArabicInto', 2]);
  assert.deepEqual(loads(page)[0][3], { replace: false, activate: undefined }, 'التفعيل بافتراض المتحكم (الفارغة تصبح النشطة)');
  assert.equal(page.controller.getState().activeSlot, 2);
  assert.equal(page.ui.menuLabel(), 'الترجمة');
  const slots = page.ui.menu().querySelectorAll('button.slot').filter((b) => b.getAttribute('data-fid').startsWith('slot:')).map((b) => [b.textContent, b.getAttribute('aria-checked')]);
  assert.deepEqual(slots, [['1', 'false'], ['2', 'true']], 'صار المحدد خيارين بعد الإضافة، والجديدة نشطة');
});

test('الاستبدال: اختيار خانة ممتلئة يجعل الزر «استبدال» بتنبيه تصفير الإزاحة للنشطة، والحفظ بالاستبدال', async () => {
  const page = await uploadAgain({ tracks: [slotTrack(), slotTrack({ fileName: 'b.srt' })], offset: 1500 });
  assert.deepEqual(targets(page).map((t) => t[1]), ['false', 'false', 'true']);
  click(page.ui.menu().querySelector('[data-fid="target:1"]'));
  assert.equal(page.ui.menuLabel(), 'استبدال الترجمة؟');
  assert.match(page.ui.menuText(), /ستُصفَّر إزاحة العرض لأن الملف الجديد يحمل توقيته\./);
  click(page.ui.menu().querySelector('[data-fid="target:2"]'));
  assert.equal(page.ui.menuText().includes('ستُصفَّر'), false, 'خانة غير نشطة: المعروض لا يتغير');
  click(page.ui.menu().querySelector('[data-fid="target:1"]'));
  click(page.ui.item('استبدال'));
  await settle();
  assert.deepEqual(loads(page)[0][3], { replace: true, activate: undefined });
  assert.equal(page.controller.getState().view.displayOffsetMs, 0);
  assert.match(page.ui.toasts().map((t) => t.text).join(), /صُفّرت إزاحة العرض لأن الملف الجديد يحمل توقيته\./, 'إشعار المتحكم رسالة عابرة');
});

test('الحفظ في خانة ممتلئة غير نشطة لا يغيّر المعروض، وإشعار حفظ السابقة', async () => {
  const page = await uploadAgain({ tracks: [slotTrack(), slotTrack({ fileName: 'b.srt' }), slotTrack({ fileName: 'c.srt' })] });
  assert.deepEqual(targets(page).map((t) => t[1]), ['true', 'false', 'false'], 'لا فارغة: الافتراضي النشطة');
  click(page.ui.menu().querySelector('[data-fid="target:3"]'));
  click(page.ui.item('استبدال'));
  await settle();
  assert.equal(page.controller.getState().activeSlot, 1);
  assert.equal(page.controller.getState().arabic.fileName, 'talk.ar.srt');
  assert.ok(page.ui.toasts().some((t) => t.text.includes(messageFor('ST_PREVIOUS_SAVED'))));
});

const EDITED = AR_CUES.map((c, i) => (i < 2 ? { ...c, text: `${c.text} — معدّل` } : c));
const THEIRS = AR_CUES.map((c, i) => (i === 4 ? { ...c, text: 'سطر جديد من الملف' } : c));
const THREE = () => [slotTrack({ current: EDITED }), slotTrack({ fileName: 'b.srt' }), slotTrack({ fileName: 'c.srt' })];
const readAs = (cues, comparison = matched()) => (files) => ({ ok: true, fileName: files[0].name, cues, comparison, fingerprintId: comparison?.fingerprintId ?? null, notes: [], warnings: [] });

test('استبدال خانة معدّلة: «سيُستبدل تعديلان يدويان»، و«إبقاء تعديلاتي» يدمج فوق الجديد', async () => {
  const page = await uploadAgain({ tracks: THREE(), read: readAs(THEIRS) });
  assert.match(page.ui.menuText(), /سيُستبدل تعديلان يدويان/);
  const keep = page.ui.field('keep');
  assert.equal(keep.hasAttribute('disabled'), false, 'المحاذاة تسمح');
  assert.equal(keep.getAttribute('aria-label'), 'إبقاء تعديلاتي');
  keep.checked = true;
  keep.dispatchEvent({ type: 'change', target: keep });
  assert.match(page.ui.menuText(), /تبقى تعديلاتك اليدوية\./);
  click(page.ui.item('استبدال'));
  await settle();
  const [, n, input, opts] = loads(page)[0];
  assert.equal(n, 1);
  assert.deepEqual(opts, { replace: true, activate: undefined });
  assert.strictEqual(input.cues, THEIRS, 'الأصل الجديد هو الملف');
  assert.deepEqual(input.current.map((c) => c.text), [EDITED[0].text, EDITED[1].text, AR_CUES[2].text, AR_CUES[3].text, 'سطر جديد من الملف'], 'التعديلات فوق الجديد');
});

test('دون «إبقاء تعديلاتي» يُستبدل الأصل والتعديلات معًا؛ والمحاذاة الضعيفة تعطّله بسببه في اسم الوصول', async () => {
  const plain = await uploadAgain({ tracks: THREE(), read: readAs(THEIRS) });
  click(plain.ui.item('استبدال'));
  await settle();
  assert.equal('current' in loads(plain)[0][2], false, 'بلا نسخة حالية');

  const far = AR_CUES.map((c, i) => ({ ...c, startMs: 500000 + i * 9000, endMs: 503000 + i * 9000, text: `آخر ${i}` }));
  const weak = await uploadAgain({ tracks: THREE(), read: readAs(far, null) });
  const keep = weak.ui.field('keep');
  assert.equal(keep.hasAttribute('disabled'), true);
  assert.equal(keep.getAttribute('aria-label'), `إبقاء تعديلاتي — ${messageFor('CT_KEEP_UNAVAILABLE')}`);
  assert.equal(keep.parentNode.getAttribute('title'), messageFor('CT_KEEP_UNAVAILABLE'), 'السبب في التلميح لا في سطر');
  assert.equal(weak.ui.menuText().includes(messageFor('CT_KEEP_UNAVAILABLE')), false);
});

test('قرينة الاسم: سطر «الاسم يشير إلى فيديو آخر» بعنوانه المحفوظ مقصوصًا، ولو كان أول رفع (فلا حفظ مباشر)', async () => {
  const long = 'محاضرة طويلة جدًا عن موضوع آخر تمامًا وعنوانها يتجاوز أربعين محرفًا';
  const page = mountPage();
  page.flows.nameHint = { videoId: 'BBBBBBBBBBB', differs: true };
  page.flows.known = [{ videoId: 'BBBBBBBBBBB', title: long }];
  click(page.ui.btn('upload'));
  chooseFiles(page.ui, [file('BBBBBBBBBBB.en.manual.normal.ar.srt')]);
  await settle();
  assert.equal(loads(page).length, 0, 'لا حفظ قبل التأكيد');
  assert.equal(page.flows.reviews[0].knownVideoIds[0], 'BBBBBBBBBBB');
  const line = page.ui.menu().querySelectorAll('.alert').map((a) => a.textContent).find((t) => t.includes('الاسم يشير'));
  // العنوان معزول FSI…PDI (تدقيق 7a66f91، C6، U49).
  assert.ok(line.startsWith(`الاسم يشير إلى فيديو آخر · ${String.fromCodePoint(0x2068)}محاضرة طويلة`));
  assert.ok(line.endsWith(`…${String.fromCodePoint(0x2069)}`));
  assert.equal(Array.from(line.split(' · ')[1]).length, 42);
  assert.deepEqual(targets(page), [], 'لا ترجمة محفوظة: لا محدد');
  assert.match(page.ui.menu().querySelector('.row.target').textContent, /حفظ فيتُحفظ ترجمةً جديدة/);
  click(page.ui.item('إلغاء'));
  assert.equal(page.ui.menuOpen(), false, 'بلا ترجمة: الإلغاء يغلق');
  assert.equal(loads(page).length, 0);
});

test('قرينة لفيديو غير محفوظ، أو تعذّر قراءة المحفوظات: السطر وحده بلا عنوان', async () => {
  const page = mountPage();
  page.flows.nameHint = { videoId: 'CCCCCCCCCCC', differs: true };
  page.flows.knownFails = true;
  click(page.ui.btn('upload'));
  chooseFiles(page.ui, [file('CCCCCCCCCCC.en.asr.normal.ar.srt')]);
  await settle();
  const alerts = page.ui.menu().querySelectorAll('.alert').map((a) => a.textContent);
  assert.ok(alerts.includes('الاسم يشير إلى فيديو آخر'));
});

test('إلغاء الرفع يعيد قائمة العرض ولا يحفظ شيئًا؛ وإعادة الضغط على الرفع تغلقها', async () => {
  const page = await uploadAgain();
  assert.equal(page.ui.menuLabel(), 'رفع ترجمة');
  click(page.ui.item('إلغاء'));
  assert.equal(page.ui.menuLabel(), 'الترجمة');
  assert.equal(loads(page).length, 0);
  click(page.ui.btn('upload'));
  assert.equal(page.ui.menuOpen(), false);
});

test('ترجمة أُضيفت من مكان آخر أثناء الفحص: يُطلب التأكيد بدل الحفظ الصامت في الخانة 1', async () => {
  const page = mountPage();
  let release;
  page.flows.readGate = new Promise((r) => (release = r));
  click(page.ui.btn('upload'));
  chooseFiles(page.ui, [file('a.srt')]);
  page.controller.set({ ...withSlots([slotTrack({ fileName: 'other.srt' })]) });
  release();
  await settle();
  await settle();
  assert.equal(page.ui.menuLabel(), 'رفع ترجمة');
  assert.deepEqual(targets(page).map((t) => [t[0], t[1]]), [['1', 'false'], ['جديدة', 'true']]);
  assert.equal(loads(page).length, 0);
});

test('امتلأت الخانة الهدف من سياق آخر قبل الحفظ: يبقى التأكيد مفتوحًا بسببه، ويصير «استبدال»', async () => {
  const page = await uploadAgain();
  const save = page.ui.item('حفظ');
  page.controller.loadArabicInto = async (n, input, opts) => {
    page.controller.calls.push(['loadArabicInto', n, input, opts]);
    page.controller.set({ ...withSlots([slotTrack(), slotTrack({ fileName: 'x.srt' })]) });
    throw new TjError('ST_ARABIC_EXISTS');
  };
  click(save);
  await settle();
  assert.equal(page.ui.menuOpen(), true);
  assert.equal(page.ui.menuLabel(), 'استبدال الترجمة؟');
  assert.ok(page.ui.menuText().includes(messageFor('ST_ARABIC_EXISTS')));
});

test('تبدّل الفيديو أثناء الفحص: لا تحميل لنتيجة الفيديو السابق على الجديد', async () => {
  const page = mountPage();
  let release;
  page.flows.readGate = new Promise((r) => (release = r));
  click(page.ui.btn('upload'));
  chooseFiles(page.ui, [file('a.srt')]);
  page.controller.set({ videoId: 'BBBBBBBBBBB' });
  release();
  await settle();
  await settle();
  assert.equal(loads(page).length, 0);
  assert.equal(page.ui.menuOpen(), false);
  assert.equal(page.ui.btn('upload').querySelector('.load').hasAttribute('hidden'), true, 'لا دوّار عالق على الفيديو الجديد');
});

test('إخفاق الحفظ عند التحميل: رسالة المتحكم كما هي', async () => {
  const page = mountPage({ controllerOpts: { loadFails: 'ST_QUOTA_EXCEEDED' } });
  click(page.ui.btn('upload'));
  chooseFiles(page.ui, [file('a.srt')]);
  await settle();
  await settle();
  assert.ok(page.ui.toasts().some((t) => t.tone === 'error' && t.text.includes(messageFor('ST_QUOTA_EXCEEDED'))));
});

test('تدقيق 5fedcb9 (GM-011): الرفع من المشغّل يعتمد المرجع الأقرب كالمحفوظات، لا الأحدث، حين تعددت التصديرات', async () => {
  const { readFor } = await import('../../../../src/player/controls/flows.js');
  const { readImport, reviewIncoming } = await import('../../../../src/core/import/index.js');
  const { writeSrt } = await import('../../../../src/core/srt/writer.js');
  const { DEFAULT_SETTINGS, normalizeSettings } = await import('../../../../src/core/model/settings.js');
  const { englishTrack, fingerprint, makeCues } = await import('../../../helpers/fixtures.js');
  const normal = englishTrack({ cues: makeCues(300, { text: (i) => `line ${i}` }) });
  const longCues = [];
  for (let i = 0; i < 300; i += 3) longCues.push({ n: longCues.length + 1, startMs: normal.cues[i].startMs, endMs: normal.cues[Math.min(i + 2, 299)].endMs, text: 'x' });
  const fpNormal = fingerprint({ track: normal, id: 'fp_normal00001', createdAt: '2026-11-01T10:00:00.000Z' });
  const fpLong = { ...fingerprint({ track: englishTrack({ cues: longCues }), id: 'fp_long0000001', mode: 'long', createdAt: '2026-11-01T11:00:00.000Z' }) };
  // ترجمة الوضع العادي ينقصها مقطع واحد (299): لا تطابق عدد أي بصمة، فكان readImport يختار الأحدث (الطويل).
  const ar = normal.cues.filter((_, i) => i !== 150).map((c) => ({ ...c, text: `ترجمة ${c.n}` }));
  const file = new File([writeSrt(ar)], 'AAAAAAAAAAA.ar.srt');
  const settings = normalizeSettings(DEFAULT_SETTINGS);
  const state = { videoId: 'AAAAAAAAAAA', saved: { fingerprints: [fpNormal, fpLong] }, settings };
  const controller = { getState: () => state };
  const r = await readFor({ controller, importFlow: { readImport, reviewIncoming }, files: [file] });
  assert.equal(r.ok, true);
  assert.equal(r.input.fingerprintId, fpNormal.id, 'المرجع الأقرب');
  assert.deepEqual([r.input.comparison.fingerprintId, r.input.comparison.countSource, r.input.comparison.extra.length], [fpNormal.id, 300, 0], 'التقرير بالمرجع الأقرب: لا 199 زائدًا على بصمة المئة');
  // والمحفوظات تختار المرجع نفسه للملف نفسه.
  const review = reviewIncoming({ fileName: file.name, cues: (await readImport([file], { fingerprints: [fpNormal, fpLong], settings })).cues, videoId: 'AAAAAAAAAAA', fingerprints: [fpNormal, fpLong] });
  assert.equal(review.suggested, fpNormal.id);
});

// ---- لغة الملف المرفوع (AA3) ----
const langPrefs = (to, videos = {}) => ({ schema: 1, pair: { from: 'auto', to }, remember: true, recent: [], videos });
const loaded = (page) => page.controller.calls.filter((c) => c[0] === 'loadArabicInto').at(-1)[2];

test('لغة الملف: الرمز الصريح في اسمه أولًا، وإلا «إلى» في نافذة الإضافة إن وافق نص الملف نص كتابتها، وإلا «غير محددة»', async () => {
  // بلا رمز في الاسم، و«إلى» عربية والنص عربي: العربية.
  const ar = mountPage({ state: makeState({ langPrefs: langPrefs('ar') }) });
  ar.flows.readResult = () => ({ ok: true, fileName: 'talk.srt', cues: AR_CUES, comparison: null, fingerprintId: null, notes: [], warnings: [], lang: null });
  click(ar.ui.btn('upload'));
  chooseFiles(ar.ui, [file('talk.srt')]);
  await settle();
  assert.equal(loaded(ar).lang, 'ar');
  // «إلى» عربية والنص لاتيني: لا يُوسم بالعربية فيُعرض بغير اتجاهه.
  const latin = mountPage({ state: makeState({ langPrefs: langPrefs('ar') }) });
  latin.flows.readResult = () => ({ ok: true, fileName: 'talk.srt', cues: AR_CUES.map((c) => ({ ...c, text: 'Bonjour à tous' })), comparison: null, fingerprintId: null, notes: [], warnings: [], lang: null });
  click(latin.ui.btn('upload'));
  chooseFiles(latin.ui, [file('talk.srt')]);
  await settle();
  assert.equal(loaded(latin).lang, null, '«غير محددة» حتى يختارها المستخدم');
  // «إلى» لهذا الفيديو من النافذة تتقدّم على الافتراضي.
  const per = mountPage({ state: makeState({ langPrefs: langPrefs('ar', { AAAAAAAAAAA: { from: 'en', to: 'fr' } }) }) });
  per.flows.readResult = () => ({ ok: true, fileName: 'talk.srt', cues: AR_CUES.map((c) => ({ ...c, text: 'Bonjour à tous' })), comparison: null, fingerprintId: null, notes: [], warnings: [], lang: null });
  click(per.ui.btn('upload'));
  chooseFiles(per.ui, [file('talk.srt')]);
  await settle();
  assert.equal(loaded(per).lang, 'fr');
  // الرمز الصريح في الاسم يحكم.
  const named = mountPage({ state: makeState({ langPrefs: langPrefs('ar') }) });
  named.flows.readResult = () => ({ ok: true, fileName: 'talk.ja.srt', cues: AR_CUES, comparison: null, fingerprintId: null, notes: [], warnings: [], lang: 'ja' });
  click(named.ui.btn('upload'));
  chooseFiles(named.ui, [file('talk.ja.srt')]);
  await settle();
  assert.equal(loaded(named).lang, 'ja');
});

test('لغة الملف في التأكيد: مقترحة من الاسم و«إلى»، ويغيّرها المستخدم قبل الحفظ', async () => {
  const page = mountPage({ state: makeState({ ...withSlots([slotTrack()]), langPrefs: langPrefs('ar') }) });
  page.flows.readResult = () => ({ ok: true, fileName: 'talk.es.srt', cues: AR_CUES, comparison: null, fingerprintId: null, notes: [], warnings: [], lang: 'es' });
  click(page.ui.btn('upload'));
  click(page.ui.item('رفع ترجمة…'));
  chooseFiles(page.ui, [file('talk.es.srt')]);
  await settle();
  const sel = page.ui.menu().querySelector('select.lang');
  assert.ok(sel, 'اختيار لغة الملف في التأكيد');
  assert.equal(sel.value, 'es');
  assert.deepEqual(sel.querySelectorAll('optgroup')[0].querySelectorAll('option').map((o) => o.getAttribute('value')), ['es', 'ar']);
  sel.value = 'pt';
  sel.dispatchEvent({ type: 'change' });
  click(page.ui.item('حفظ'));
  await settle();
  assert.equal(loaded(page).lang, 'pt');
});
