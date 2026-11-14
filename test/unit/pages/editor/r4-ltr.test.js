// الجولة الرابعة (بند سلطان): في المحرّر رسالة «حُفظ ‹الملف› …» تعرض الاسم عنصرًا ذريًا معزولًا LTR فلا ينكسر مع الجملة العربية فتنقلب
// أجزاؤه، واسم المجلد (يكتبه المستخدم) معزول اتجاهًا (FSI…PDI)؛ وكذلك نصّا البحث والاستبدال في معاينة «استبدال الكل» واسم الخانة في
// «آخر موضع»: نص لاتيني بينه سهم وأقواس لا يصير مقطعًا لاتينيًا واحدًا يقلب جهة الجملة.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStore } from '../../../../src/core/store/index.js';
import { messageFor } from '../../../../src/core/errors/index.js';
import { mountEditor } from '../../../../src/pages/editor/app.js';
import { previewPatch } from '../../../../src/pages/editor/complete-panel.js';
import { renderComparison } from '../../../../src/pages/editor/panels.js';
import { readPatch } from '../../../../src/core/import/index.js';
import { formatSrtTime } from '../../../../src/core/srt/time.js';
import { englishTrack, fingerprint } from '../../../helpers/fixtures.js';
import { fileOf } from '../../../fixtures/srt/index.js';
import { renderResume } from '../../../../src/pages/editor/review-panel.js';
import { saveMessage } from '../../../../src/pages/editor/text.js';
import { createMemoryArea } from '../../../helpers/chrome-storage.js';
import { NOW, makeCues } from '../../../helpers/fixtures.js';
import { sampleBundle, seedBundle } from '../../../helpers/fixtures-v2.js';
import { editorDocument } from '../../../helpers/editor-dom.js';
import { buttonNamed, findAll, newDocument, settle } from '../library/fake-dom.js';

const LRI = String.fromCodePoint(0x2066);
const FSI = String.fromCodePoint(0x2068);
const PDI = String.fromCodePoint(0x2069);
const bdis = (root) => findAll(root, (e) => e.tagName === 'bdi');

async function mounted({ bundle = sampleBundle(), saveFile } = {}) {
  const area = createMemoryArea({ unlimited: true });
  let at = Date.parse(NOW);
  const now = () => (at += 1000);
  const store = createStore({ area, now });
  await seedBundle(store, bundle);
  const env = editorDocument({ videoId: bundle.videoId });
  const editor = await mountEditor(env.root, { videoId: bundle.videoId, store, doc: env.doc, now, ...(saveFile ? { saveFile } : {}) });
  await env.flush();
  return { editor, env, doc: env.doc, store, videoId: bundle.videoId };
}

test('saveMessage: اسم الملف الطويل LTR واسم المجلد اللاتيني معزول اتجاهًا', () => {
  const name = '-KA3zmDkEUQs.ar.dual-en-GB.from-ar.asr.normal.srt';
  const text = saveMessage({ ok: true, mode: 'subfolder' }, name, { mode: 'subfolder', folder: 'My-Subs (v2).' }, messageFor).text;
  assert.equal(text, `حُفظ ${LRI}${name}${PDI} في مجلد ${FSI}My-Subs (v2).${PDI} داخل التنزيلات.`);
});

test('رسالة الحفظ بعد التصدير: اسم الملف عنصر bdi ذري معزول LTR يلتف داخله، والنص المرئي كما هو', async () => {
  const saved = [];
  const m = await mounted({ saveFile: async (file) => { saved.push(file); return { ok: true, mode: 'downloads' }; } });
  m.editor.setView('original');
  await m.env.flush();
  buttonNamed(m.env.root, 'تصدير النسخة المرفوعة').click();
  await settle();
  m.doc.querySelector('dialog[open]').close('download');
  await settle(8);
  assert.equal(saved.length, 1);
  const name = saved[0].name;
  const span = m.env.root.querySelector('.ed-toast').querySelectorAll('span')[0];
  assert.equal(span.textContent, `حُفظ ${LRI}${name}${PDI} في مجلد التنزيلات.`, 'النص المرئي كما هو');
  const [iso] = bdis(span);
  assert.ok(iso, 'الاسم داخل عنصر');
  assert.equal(iso.dir, 'ltr');
  assert.ok(iso.classList.contains('tj-ltr--wrap'));
  assert.equal(iso.textContent, `${LRI}${name}${PDI}`);
});

test('معاينة «استبدال الكل»: نصّا البحث والاستبدال اللاتينيان معزولان اتجاهًا حول السهم', async () => {
  const b = sampleBundle();
  const t = b.slots[0].track;
  const cues = makeCues(3, { text: (i) => `Hello (world) ${i}` });
  t.original = cues;
  t.current = cues.map((c) => ({ ...c }));
  t.fingerprintId = null;
  t.comparison = null;
  b.slots[0].marks = [];
  b.slots[0].position = null;
  b.record.arabic = structuredClone(t);
  const m = await mounted({ bundle: b });
  const searchIn = m.env.root.querySelector('input[type=search]');
  searchIn.value = 'Hello';
  searchIn.dispatchEvent({ type: 'input' });
  await m.env.flush();
  buttonNamed(m.env.root, 'استبدال').click();
  const replaceIn = m.env.root.querySelector('.ed-search__replace input');
  replaceIn.value = 'Bye.';
  replaceIn.dispatchEvent({ type: 'input' });
  await m.env.flush();
  buttonNamed(m.env.root, 'معاينة استبدال الكل…').click();
  await m.env.flush(1);
  const intro = m.doc.querySelector('dialog[open]').querySelectorAll('p')[0].textContent;
  assert.ok(intro.startsWith(`«${FSI}Hello${PDI}» ← «${FSI}Bye.${PDI}».`), intro);
});

test('«آخر موضع»: اسم الخانة اللاتيني معزول اتجاهًا', () => {
  const doc = newDocument();
  const box = doc.createElement('div');
  renderResume(box, { doc, items: [{ slot: 2, name: 'Pro (v2).', n: 4, editing: false }, { slot: 3, name: null, n: null, editing: true }], onResume: () => {} });
  const texts = box.querySelectorAll('li').map((li) => li.querySelectorAll('span')[0].textContent);
  assert.equal(texts[0], `الترجمة 2 «${FSI}Pro (v2).${PDI}»`);
  assert.equal(texts[1], 'الترجمة 3 (قيد التحرير)');
});

// ---- تحقق 2.3.0 (ص-١٨): اسم الجزء ومعرّف الفيديو في ملاحظات الاستيراد وتحذير ملف الاستكمال ----
const PART = '-KA3zmDkEUQ.ar.from-en.manual.normal.part01of02.srt';
const iso = (s) => `${LRI}${s}${PDI}`;

test('ص-١٨: ملاحظات الاستيراد في لوحة المقارنة: اسم الجزء وأسماء الدمج عناصر bdi ذرية، والنص المرئي كما هو', () => {
  const env = editorDocument({ videoId: 'AAAAAAAAAAA' });
  const box = env.doc.createElement('section');
  const two = PART.replace('01of02', '02of02');
  const notes = [`دُمج ملفان بحسب أرقام المقاطع: ${iso(PART)}، ${iso(two)}.`, `«${iso(PART)}»: ${messageFor('IM_NOTE_FENCE')}`, 'ملاحظة بلا اسم'];
  renderComparison(box, { doc: env.doc, report: null, notes, readOnly: false, onRestore: () => {}, onJumpN: () => {} });
  const items = findAll(box, (e) => e.tagName === 'li' && e.parentNode?.parentNode?.classList?.contains('ed-notes'));
  assert.deepEqual(items.map((li) => li.textContent), notes, 'النص المرئي كما هو');
  assert.deepEqual(bdis(items[0]).map((e) => e.textContent), [iso(PART), iso(two)]);
  assert.deepEqual(bdis(items[1]).map((e) => e.textContent), [iso(PART)]);
  assert.equal(bdis(items[2]).length, 0, 'وبلا مقطع معزول نص كما هو');
  for (const e of bdis(items[0])) assert.ok(e.dir === 'ltr' && e.classList.contains('tj-ltr--wrap'), 'ذري يلتف داخله');
});

test('ص-١٨: معاينة ملف الاستكمال بجزأين: معرّف الفيديو الآخر في التحذير وملاحظة الجزء عنصران ذريان', async () => {
  const en = Array.from({ length: 6 }, (_, i) => ({ n: i + 1, startMs: 1000 + i * 3000, endMs: 3000 + i * 3000, text: `Line ${i + 1}` }));
  const fp = fingerprint({ videoId: 'AAAAAAAAAAA', track: englishTrack({ cues: en }) });
  const current = en.filter((c) => c.n !== 2 && c.n !== 5).map((c) => ({ ...c, text: `سطر ${c.n}` }));
  const srt = (n) => `${n}\n${formatSrtTime(en[n - 1].startMs)} --> ${formatSrtTime(en[n - 1].endMs)}\nمستكمل ${n}\n`;
  const read = await readPatch([fileOf(`\`\`\`srt\n${srt(2)}\`\`\`\n`, PART), fileOf(srt(5), 'AAAAAAAAAAA.ar.part02of02.srt')], { fingerprint: fp, cues: current });
  assert.equal(read.ok, true, JSON.stringify(read.error));
  const env = editorDocument({ videoId: 'AAAAAAAAAAA' });
  const done = previewPatch({ doc: env.doc, plan: read.plan });
  await settle();
  const dlg = env.doc.querySelector('dialog[open]');
  const alert = findAll(dlg, (e) => e.classList?.contains('tj-alert__text') && e.textContent.includes('يدل على فيديو آخر'))[0];
  assert.ok(alert, 'تحذير الفيديو الآخر');
  assert.deepEqual(bdis(alert).map((e) => e.textContent), [iso('-KA3zmDkEUQ')]);
  const note = findAll(dlg, (e) => e.tagName === 'li' && e.textContent.startsWith('«'))[0];
  assert.equal(note.textContent, `«${iso(PART)}»: ${messageFor('IM_NOTE_FENCE')}`);
  assert.deepEqual(bdis(note).map((e) => e.textContent), [iso(PART)]);
  dlg.close('cancel');
  assert.equal(await done, null);
});
