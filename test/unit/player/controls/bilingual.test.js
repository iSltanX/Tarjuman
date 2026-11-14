// الفكرة ١١ (ح-49) في رفع المشغّل: القراءة بمسارات الأصل المحفوظة، والملف المصدَّر «مع الأصل» لا يُحفظ مباشرة ولو كان أول رفع:
// التأكيد بتحذير IM_BILINGUAL وزر «أزل سطر الأصل من كل مقطع». لا يُزال شيء بلا نقرة، والنقرة تحدّث التأكيد نفسه وتنقل التركيز إلى
// سطر ما أُزيل، و«حفظ» بعدها يحمّل الترجمة وحدها بملاحظتها.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildSubtitleExport } from '../../../../src/core/export/index.js';
import { bilingualCheck, readImport } from '../../../../src/core/import/index.js';
import { A, AR_CUES, chooseFiles, click, makeState, mountPage, settle } from './harness.js';

const EN = AR_CUES.map((c) => ({ ...c, text: `line ${c.n}` }));
const ENGLISH = [{ key: 'en|manual', lang: 'en', kind: 'manual', capturedAt: '2026-11-01T12:00:00.000Z', source: 'capture', cues: EN }];
const DUAL = AR_CUES.map((c, i) => ({ ...c, text: `${c.text}\n${EN[i].text}` }));
const loads = (page) => page.controller.calls.filter((c) => c[0] === 'loadArabicInto');
const WARN = 'يبدو الملف مصدَّرًا مع الأصل: آخر سطر في 5 مقاطع (من 5) هو نص الأصل نفسه. إن حُفظ هكذا صار الأصل جزءًا من نص الترجمة.';

async function uploadDual(dual = DUAL) {
  const page = mountPage({ state: makeState({ saved: { fingerprints: [], english: ENGLISH } }) });
  // نتيجة القراءة كما تعيدها readImport بمسارات الأصل: الحارس من النواة نفسها.
  page.flows.readResult = (files) => ({
    ok: true, fileName: files[0].name, cues: dual, comparison: null, fingerprintId: null, notes: [], warnings: [], lang: 'ar', ambiguous: null,
    bilingual: bilingualCheck(dual, ENGLISH),
  });
  click(page.ui.btn('upload'));
  chooseFiles(page.ui, [{ name: 'x.ar.dual-en.srt' }]);
  await settle();
  return page;
}

test('ح-49: القراءة بمسارات الأصل المحفوظة، وأول رفع لملف ثنائي يفتح التأكيد بالتحذير وزر الإزالة ولا يُحفظ مباشرة', async () => {
  const page = await uploadDual();
  assert.strictEqual(page.flows.reads[0].opts.originals, ENGLISH);
  assert.equal(loads(page).length, 0, 'لا حفظ قبل التأكيد');
  const alert = page.ui.menu().querySelectorAll('.alert').find((a) => a.textContent.includes('يبدو الملف مصدَّرًا مع الأصل'));
  assert.ok(alert, page.ui.menuText());
  assert.equal(alert.getAttribute('role'), 'alert');
  assert.ok(alert.textContent.startsWith(WARN));
  const btn = page.ui.field('stripOriginal');
  assert.equal(btn.textContent, 'أزل سطر الأصل من كل مقطع');
  assert.ok(alert.contains(btn), 'الزر داخل التحذير');
});

test('ح-49: لا يُزال شيء بلا نقرة: «حفظ» مباشرة يحمّل الملف كما هو', async () => {
  const page = await uploadDual();
  click(page.ui.item('حفظ'));
  await settle();
  assert.equal(loads(page).length, 1);
  assert.equal(loads(page)[0][2].cues[0].text, 'سطر 1\nline 1');
});

test('ح-49: الزر بلوحة المفاتيح يزيل سطر الأصل في التأكيد نفسه وينقل التركيز إلى سطر ما أُزيل، و«حفظ» يحمّل الترجمة وحدها بملاحظتها', async () => {
  const page = await uploadDual();
  // detail = 0: تفعيل بلوحة المفاتيح؛ ونقرة الفأرة لا تُبقي التركيز في القائمة أصلًا (GM-003).
  click(page.ui.field('stripOriginal'), 0);
  await settle();
  assert.equal(page.ui.field('stripOriginal'), null, 'زال الزر');
  assert.ok(!page.ui.menuText().includes('يبدو الملف مصدَّرًا مع الأصل'), 'وزال التحذير');
  const line = page.ui.field('stripped');
  assert.equal(line.textContent, 'أُزيل بطلبك سطر الأصل (آخر سطر) من 5 مقاطع.');
  assert.ok(page.env.doc._focused === line, 'التركيز على سطر ما أُزيل');
  assert.equal(loads(page).length, 0, 'ولا حفظ قبل «حفظ»');
  click(page.ui.item('حفظ'));
  await settle();
  const input = loads(page)[0][2];
  assert.deepEqual(input.cues.map((c) => c.text), AR_CUES.map((c) => c.text));
  assert.equal(input.notes.at(-1), 'أُزيل بطلبك سطر الأصل (آخر سطر) من 5 مقاطع.');
});

test('تحقق 2.3.0 (ص-١٣، ح-53): بقراءة حقيقية لملف ترجمان الثنائي، «أزل سطر الأصل» يجعل لغة الملف لغة اسمه في التأكيد وفي الحفظ', async () => {
  // الملف كما يصدّره ترجمان «مع الأصل» (ID.ar.dual-en.srt)، ويقرؤه readImport الحقيقي بمسارات الأصل: نصه الثنائي لا يجتاز فحص
  // الكتابة فلغته null قبل الإزالة، ولا «إلى» محفوظة لهذا الفيديو. كانت تبقى «غير محددة» بعد الإزالة وتُحفظ null.
  const dual = buildSubtitleExport({ videoId: A, cues: AR_CUES, lang: 'ar', format: 'srt', bilingual: true, original: EN, sourceLang: 'en' });
  assert.equal(dual.name, `${A}.ar.dual-en.srt`);
  const page = mountPage({ state: makeState({ saved: { fingerprints: [], english: ENGLISH } }) });
  page.flows.importFlow.readImport = readImport;
  click(page.ui.btn('upload'));
  chooseFiles(page.ui, [new File([dual.text], dual.name)]);
  await settle();
  assert.ok(page.ui.field('stripOriginal'), page.ui.menuText());
  const langField = () => page.ui.field('uploadLang');
  assert.equal(langField().value, '', 'قبل الإزالة: «غير محددة» كما تعيدها القراءة الحقيقية');
  click(page.ui.field('stripOriginal'), 0);
  await settle();
  assert.equal(langField()?.value, 'ar', page.ui.menuText());
  click(page.ui.item('حفظ'));
  await settle();
  const input = loads(page)[0][2];
  assert.equal(input.lang, 'ar');
  assert.deepEqual(input.cues.map((c) => c.text), AR_CUES.map((c) => c.text), 'الترجمة وحدها');
});

test('ص-١٣: بلا رمز في الاسم تُعاد «إلى» بعد الإزالة على نص الترجمة وحده، واختيار المستخدم قبل الإزالة يبقى', async () => {
  const dual = buildSubtitleExport({ videoId: A, cues: AR_CUES, lang: 'ar', format: 'srt', bilingual: true, original: EN, sourceLang: 'en' });
  const prefs = { schema: 1, pair: { from: 'auto', to: 'ar' }, remember: true, recent: [], videos: {} };
  const open = async () => {
    const page = mountPage({ state: makeState({ saved: { fingerprints: [], english: ENGLISH }, langPrefs: prefs }) });
    page.flows.importFlow.readImport = readImport;
    click(page.ui.btn('upload'));
    chooseFiles(page.ui, [new File([dual.text], 'talk.srt')]);
    await settle();
    return page;
  };
  // «إلى» عربية والنص الثنائي لا يوافقها قبل الإزالة، ويوافقها بعدها.
  const page = await open();
  assert.equal(page.ui.field('uploadLang').value, '');
  click(page.ui.field('stripOriginal'), 0);
  await settle();
  assert.equal(page.ui.field('uploadLang').value, 'ar');
  click(page.ui.item('حفظ'));
  await settle();
  assert.equal(loads(page)[0][2].lang, 'ar');
  // ما اختاره المستخدم قبل الإزالة لا تستبدله المقترحة.
  const chosen = await open();
  const sel = chosen.ui.field('uploadLang');
  sel.value = 'fa';
  sel.dispatchEvent({ type: 'change' });
  click(chosen.ui.field('stripOriginal'), 0);
  await settle();
  assert.equal(chosen.ui.field('uploadLang').value, 'fa');
  click(chosen.ui.item('حفظ'));
  await settle();
  assert.equal(loads(chosen)[0][2].lang, 'fa');
});

test('تحقق 2.3.0 (ص-٢٣): الثنائي المعكوس في التأكيد: التحذير يقول «أول سطر»، والزر يحذفه، وسطر ما أُزيل يقول «(أول سطر)»', async () => {
  const page = await uploadDual(AR_CUES.map((c, i) => ({ ...c, text: `${EN[i].text}\n${c.text}` })));
  const alert = page.ui.menu().querySelectorAll('.alert').find((a) => a.textContent.includes('يبدو الملف مصدَّرًا مع الأصل'));
  assert.ok(alert?.textContent.startsWith('يبدو الملف مصدَّرًا مع الأصل: أول سطر في 5 مقاطع (من 5) هو نص الأصل نفسه.'), page.ui.menuText());
  click(page.ui.field('stripOriginal'), 0);
  await settle();
  assert.equal(page.ui.field('stripped').textContent, 'أُزيل بطلبك سطر الأصل (أول سطر) من 5 مقاطع.');
  click(page.ui.item('حفظ'));
  await settle();
  const input = loads(page)[0][2];
  assert.deepEqual(input.cues.map((c) => c.text), AR_CUES.map((c) => c.text), 'الترجمة وحدها');
  assert.equal(input.notes.at(-1), 'أُزيل بطلبك سطر الأصل (أول سطر) من 5 مقاطع.');
});
