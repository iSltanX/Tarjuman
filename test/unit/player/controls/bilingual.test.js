// الفكرة ١١ (ح-49) في رفع المشغّل: القراءة بمسارات الأصل المحفوظة، والملف المصدَّر «مع الأصل» لا يُحفظ مباشرة ولو كان أول رفع:
// التأكيد بتحذير IM_BILINGUAL وزر «أزل سطر الأصل من كل مقطع». لا يُزال شيء بلا نقرة، والنقرة تحدّث التأكيد نفسه وتنقل التركيز إلى
// سطر ما أُزيل، و«حفظ» بعدها يحمّل الترجمة وحدها بملاحظتها.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bilingualCheck } from '../../../../src/core/import/index.js';
import { AR_CUES, chooseFiles, click, makeState, mountPage, settle } from './harness.js';

const EN = AR_CUES.map((c) => ({ ...c, text: `line ${c.n}` }));
const ENGLISH = [{ key: 'en|manual', lang: 'en', kind: 'manual', capturedAt: '2026-11-01T12:00:00.000Z', source: 'capture', cues: EN }];
const DUAL = AR_CUES.map((c, i) => ({ ...c, text: `${c.text}\n${EN[i].text}` }));
const loads = (page) => page.controller.calls.filter((c) => c[0] === 'loadArabicInto');
const WARN = 'يبدو الملف مصدَّرًا مع الأصل: آخر سطر في 5 مقاطع (من 5) هو نص الأصل نفسه. إن حُفظ هكذا صار الأصل جزءًا من نص الترجمة.';

async function uploadDual() {
  const page = mountPage({ state: makeState({ saved: { fingerprints: [], english: ENGLISH } }) });
  // نتيجة القراءة كما تعيدها readImport بمسارات الأصل: الحارس من النواة نفسها.
  page.flows.readResult = (files) => ({
    ok: true, fileName: files[0].name, cues: DUAL, comparison: null, fingerprintId: null, notes: [], warnings: [], lang: 'ar', ambiguous: null,
    bilingual: bilingualCheck(DUAL, ENGLISH),
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
