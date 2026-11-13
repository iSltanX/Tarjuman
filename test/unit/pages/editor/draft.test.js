// مسودة المحرّر (الفكرة ٩، ح-48): الكتابة بعد ثانيتين من السكون وبحد أقصى كل 15 ثانية، والتفريغ فورًا عند الإخفاء وpagehide، ولا
// كتابة ما لم تتغير نسخة الجلسة؛ والحذف بعد الحفظ و«تجاهل التغييرات» و«التبديل دون حفظ» وعند فتح خانة نظيفة (ومنها التالفة)؛ واللافتة
// الثابتة بحالاتها الثلاث (الهوية نفسها «استعادة / تجاهل»، والإزاحة وحدها تُتبنّى الحاضرة، والمحتوى تغيّر «تنزيل / تجاهل») وإمساك
// الكتابة ما دامت قائمة، ونتيجة كل فعل في المنطقة الحية. العقد تُقارن بـassert.ok(a === b) لا بـassert.equal (انظر fake-dom.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStore } from '../../../../src/core/store/index.js';
import { draftOf } from '../../../../src/core/model/draft.js';
import { mountEditor } from '../../../../src/pages/editor/app.js';
import { DRAFT_IDLE_MS, DRAFT_MAX_MS } from '../../../../src/pages/editor/draft.js';
import { createMemoryArea } from '../../../helpers/chrome-storage.js';
import { NOW } from '../../../helpers/fixtures.js';
import { sampleBundle, seedBundle } from '../../../helpers/fixtures-v2.js';
import { editorDocument, settle } from '../../../helpers/editor-dom.js';
import { findAll, textOf } from '../library/fake-dom.js';

const DRAFT_TEXT = 'تعديل من جلسة انهارت قبل الحفظ';

/**
 * مخزن بحزمة العيّنة، ومسودة مزروعة اختياريًا قبل الفتح (seed يعيد مسودة من الخانة المحفوظة)، ثم المحرّر مركّبًا.
 * @param {{ seed?: (slot: object, store: object) => object | Promise<object>, before?: (store: object) => Promise<void> }} [o]
 */
async function mounted({ seed, before } = {}) {
  const area = createMemoryArea({ unlimited: true });
  let at = Date.parse(NOW);
  const now = () => (at += 1000);
  const store = createStore({ area, now });
  const bundle = sampleBundle();
  await seedBundle(store, bundle);
  const id = bundle.videoId;
  if (seed) {
    const slot = (await store.getBundle(id)).slots[0];
    await store.setDraft(id, 1, await seed(slot, store));
  }
  if (before) await before(store);
  const calls = { set: 0, clear: 0 };
  const saved = [];
  const wrapped = {
    ...store,
    setDraft: (...args) => { calls.set++; return store.setDraft(...args); },
    clearDraft: (...args) => { calls.clear++; return store.clearDraft(...args); },
  };
  const env = editorDocument({ videoId: id });
  const editor = await mountEditor(env.root, {
    videoId: id, store: wrapped, doc: env.doc, now, saveFile: async (file) => { saved.push(file); return { ok: true, mode: 'downloads', downloadId: 1 }; },
  });
  assert.ok(editor, 'رُكّب المحرّر');
  await settle(10);
  const stored = () => area.dump()[`draft:${id}`]?.slots ?? null;
  return { area, store, env, editor, id, calls, saved, stored };
}

/** مسودة على الخانة كما هي بنص معدّل في المقطع الأول. */
const draftOn = (slot, { text = DRAFT_TEXT, offsetMs = slot.offsetMs, committedMs = 0, savedAt = '2026-11-01T11:00:00.000Z', base } = {}) => {
  const d = draftOf({ cues: slot.track.current.map((c, i) => (i === 0 ? { ...c, text } : c)), offsetMs, committedMs }, slot, savedAt);
  return base ? { ...d, base: { ...d.base, ...base } } : d;
};
const banner = (env) => findAll(env.root, (e) => e.getAttribute?.('data-fid') === 'draftBanner')[0] ?? null;
const byFid = (env, fid) => findAll(env.root, (e) => e.getAttribute?.('data-fid') === fid)[0] ?? null;
const openDialogEl = (env) => env.doc.querySelector('dialog[open]');

test('الفكرة ٩: الكتابة بعد ثانيتين من السكون لا قبلها، والجلسة بمقاطعها وإزاحتها وهوية الخانة', async () => {
  const { env: env2, editor: ed2, stored: stored2, calls } = await mounted();
  ed2.state.session.setText(0, 'تعديل أول');
  await env2.advance(DRAFT_IDLE_MS - 100);
  await settle(10);
  assert.equal(calls.set, 0, 'قبل ثانيتين لا كتابة');
  ed2.state.session.setText(0, 'تعديل ثانٍ');
  await env2.advance(DRAFT_IDLE_MS - 100);
  await settle(10);
  assert.equal(calls.set, 0, 'كل تغيير يعيد السكون');
  await env2.advance(200);
  await settle(10);
  assert.equal(calls.set, 1, 'بعد ثانيتين من آخر تغيير');
  const [d] = stored2();
  assert.equal(d.cues[0].text, 'تعديل ثانٍ');
  assert.deepEqual(d.base, { fileName: ed2.state.info.track.fileName, importedAt: ed2.state.info.track.importedAt, editedAt: ed2.state.info.track.editedAt, offsetMs: 500 });
  assert.deepEqual([d.offsetMs, d.committedMs], [500, 0]);
});

test('الفكرة ٩: الكتابة المتصلة تُكتب بحد أقصى كل 15 ثانية ولو لم يسكن المستخدم', async () => {
  const { env, editor, calls, stored } = await mounted();
  for (let i = 1; i <= 14; i++) {
    editor.state.session.setText(0, `حرف ${i}`);
    await env.advance(1000);
  }
  await settle(10);
  assert.equal(calls.set, 0, 'قبل 15 ثانية لا كتابة والسكون لم يقع');
  editor.state.session.setText(0, 'حرف 15');
  await env.advance(DRAFT_MAX_MS - 14 * 1000 + 10);
  await settle(10);
  assert.equal(calls.set, 1, 'عند 15 ثانية من أول تغيير لم يُكتب');
  assert.equal(stored()[0].cues[0].text, 'حرف 15');
});

test('الفكرة ٩: التفريغ فورًا عند إخفاء التبويب وعند pagehide، ولا كتابة إن لم تتغير نسخة الجلسة', async () => {
  const { env, editor, calls, stored } = await mounted();
  env.fireWin('pagehide');
  env.doc.visibilityState = 'hidden';
  env.fireDoc({ type: 'visibilitychange' });
  await settle(10);
  assert.deepEqual(calls, { set: 0, clear: 0 }, 'بلا تغيير لا كتابة ولا حذف');
  editor.state.session.setText(0, 'قبل الإخفاء');
  env.fireDoc({ type: 'visibilitychange' });
  await settle(10);
  assert.equal(calls.set, 1, 'كُتبت عند الإخفاء دون انتظار السكون');
  assert.equal(stored()[0].cues[0].text, 'قبل الإخفاء');
  env.fireWin('pagehide');
  await env.advance(DRAFT_MAX_MS);
  await settle(10);
  assert.equal(calls.set, 1, 'النسخة نفسها لا تُكتب مرة ثانية');
  editor.state.session.setText(0, 'قبل المغادرة');
  env.fireWin('pagehide');
  await settle(10);
  assert.equal(calls.set, 2);
  assert.equal(stored()[0].cues[0].text, 'قبل المغادرة');
});

test('الفكرة ٩: الحفظ يحذف المسودة، و«تجاهل التغييرات» يحذفها، والتراجع إلى المحفوظ يحذفها بعد السكون', async () => {
  const { env, editor, stored } = await mounted();
  editor.state.session.setText(0, 'تعديل يُحفظ');
  await editor.draft.flush();
  assert.ok(stored());
  await editor.save();
  await settle(10);
  await editor.draft.flush();
  assert.equal(stored(), null, 'بعد نجاح الحفظ');

  editor.state.session.setText(0, 'تعديل يُتجاهل');
  await editor.draft.flush();
  assert.ok(stored());
  const discard = findAll(env.root, (e) => e.tagName === 'button' && textOf(e) === 'تجاهل التغييرات')[0];
  discard.click();
  await settle();
  openDialogEl(env).close('discard');
  await settle(10);
  await editor.draft.flush();
  assert.equal(stored(), null, 'بعد «تجاهل التغييرات»');

  editor.state.session.setText(0, 'تعديل يُتراجع عنه');
  await editor.draft.flush();
  assert.ok(stored());
  editor.state.session.undo();
  await env.advance(DRAFT_IDLE_MS);
  await settle(10);
  assert.equal(stored(), null, 'جلسة بلا تغيير غير محفوظ لا مسودة لها');
});

test('الفكرة ٩: «التبديل دون حفظ» يحذف مسودة الخانة المغادَرة، والتبديل بلا تغييرات يكتب حالها قبل الفتح', async () => {
  const { env, editor, stored } = await mounted();
  editor.state.session.setText(0, 'في الخانة الأولى');
  await editor.draft.flush();
  assert.ok(stored()[0]);
  const switching = editor.switchSlot(2);
  await settle();
  openDialogEl(env).close('switch');
  await switching;
  await settle(10);
  assert.equal(editor.state.slot, 2);
  assert.equal(stored(), null, 'تجوهلت تغييراتها فحُذفت مسودتها');

  // وبلا تغييرات (تراجعٌ أعاد المحفوظ ومؤقّت المسودة لم يحن): تُكتب حال الخانة المغادَرة قبل فتح غيرها، فلا تبقى مسودة قديمة لها.
  editor.state.session.setText(0, 'في الخانة الثانية');
  await editor.draft.flush();
  assert.ok(stored()[1]);
  editor.state.session.undo();
  await editor.switchSlot(1);
  await settle(10);
  assert.equal(editor.state.slot, 1, 'بلا حوار');
  assert.equal(stored(), null, 'حُذفت قبل الفتح لا بعد مؤقّت يحين على جلسة أخرى');
});

test('الفكرة ٩: فتح خانة نظيفة يحذف المسودة التالفة والمطابقة للمحفوظ، ولا يمس مسودة خانة أخرى', async () => {
  const corrupt = await mounted();
  corrupt.area.rawSet(`draft:${corrupt.id}`, 'تالف');
  // فتح جديد على المساحة نفسها.
  const env = editorDocument({ videoId: corrupt.id });
  await mountEditor(env.root, { videoId: corrupt.id, store: corrupt.store, doc: env.doc });
  await settle(15);
  assert.equal(corrupt.area.dump()[`draft:${corrupt.id}`], undefined, 'التالفة حُذفت عند الفتح');

  const equal = await mounted({ seed: (slot) => draftOn(slot, { text: slot.track.current[0].text }) });
  assert.equal(banner(equal.env), null, 'لا شيء لاستعادته');
  await equal.editor.draft.flush();
  assert.equal(equal.stored(), null, 'المطابقة للمحفوظ حُذفت');

  const other = await mounted({
    seed: async (slot, store) => {
      const second = (await store.getBundle('AAAAAAAAAAA')).slots[1];
      await store.setDraft('AAAAAAAAAAA', 2, draftOf({ cues: second.track.original.map((c) => ({ ...c, text: `${c.text} م` })), offsetMs: second.offsetMs, committedMs: 0 }, second, NOW));
      return draftOn(slot, { text: slot.track.current[0].text });
    },
  });
  await other.editor.draft.flush();
  assert.equal(other.stored()[0], null);
  assert.ok(other.stored()[1], 'مسودة الخانة الثانية باقية');
});

test('الفكرة ٩: الهوية نفسها: لافتة ثابتة «استعادة / تجاهل» تُمسك الكتابة، والاستعادة خطوة واحدة يُتراجع عنها وتُعلَن نتيجتها', async () => {
  const { env, editor, stored, calls } = await mounted({ seed: (slot) => draftOn(slot) });
  const b = banner(env);
  assert.ok(b, 'اللافتة ظاهرة');
  assert.equal(b.getAttribute('data-kind'), 'same');
  assert.match(textOf(b), /تعديلات لم تُحفظ/);
  assert.match(textOf(b), /آخر حفظ للمسودة:/);
  assert.ok(byFid(env, 'draftRestore') && byFid(env, 'draftDiscard'));
  assert.equal(byFid(env, 'draftDownload'), null);
  assert.deepEqual(editor.draft.offer.kind, 'same');
  assert.equal(editor.draft.held, true);
  assert.equal(editor.state.session.cueAt(0).text === DRAFT_TEXT, false, 'لا استعادة بصمت');
  const before = structuredClone(stored());
  await env.advance(DRAFT_MAX_MS + 1000);
  env.fireWin('pagehide');
  await settle(10);
  assert.equal(calls.set, 0, 'لا كتابة ما دامت اللافتة');
  assert.deepEqual(stored(), before);

  byFid(env, 'draftRestore').click();
  await settle(10);
  assert.equal(banner(env), null, 'زالت بعد الاستعادة');
  assert.equal(editor.state.session.cueAt(0).text, DRAFT_TEXT);
  assert.equal(editor.state.session.historySize, 1);
  assert.equal(editor.state.session.undoKind, 'rescue');
  assert.equal(editor.draft.held, false);
  const toastEl = env.root.querySelector('.ed-toast');
  assert.equal(toastEl.getAttribute('role'), 'status');
  assert.match(textOf(toastEl), /^استُعيدت المسودة: لديك تغيير واحد غير محفوظ\. احفظ لتثبيت ذلك/);
  editor.state.session.undo();
  assert.equal(editor.state.session.cueAt(0).text === DRAFT_TEXT, false, 'التراجع يعيد المحفوظ');
  assert.equal(editor.state.session.dirty, false);
});

test('الفكرة ٩: الاستعادة فوق تعديلات كُتبت والطلب قائم تطلب تأكيدًا، والإلغاء لا يغيّر شيئًا', async () => {
  const { env, editor } = await mounted({ seed: (slot) => draftOn(slot) });
  editor.state.session.setText(2, 'كُتب والطلب قائم');
  byFid(env, 'draftRestore').click();
  await settle();
  const dlg = openDialogEl(env);
  assert.ok(dlg, 'تأكيد');
  assert.match(textOf(dlg), /لديك تغيير واحد غير محفوظ\. ستُفقد حين تحل المسودة محل ما في المحرّر الآن\./);
  dlg.close('cancel');
  await settle(10);
  assert.equal(editor.state.session.cueAt(2).text, 'كُتب والطلب قائم');
  assert.ok(banner(env), 'اللافتة باقية');
  byFid(env, 'draftRestore').click();
  await settle();
  openDialogEl(env).close('restore');
  await settle(10);
  assert.equal(editor.state.session.cueAt(0).text, DRAFT_TEXT);
  assert.equal(editor.state.session.cueAt(2).text === 'كُتب والطلب قائم', false);
});

test('الفكرة ٩: الإزاحة وحدها تغيّرت بعد المسودة (± من المشغّل): تُستعاد بالإزاحة الحاضرة، وتقول اللافتة ذلك', async () => {
  const { env, editor } = await mounted({
    seed: (slot) => draftOn(slot),
    before: async (store) => {
      await store.updateBundle('AAAAAAAAAAA', (b) => ({
        ...b, record: { ...b.record, view: { ...b.record.view, displayOffsetMs: 800 } }, slots: b.slots.map((x) => (x.n === 1 ? { ...x, offsetMs: 800 } : x)),
      }));
    },
  });
  const b = banner(env);
  assert.equal(b.getAttribute('data-kind'), 'offset');
  assert.match(textOf(b), /وتغيّرت إزاحة العرض بعدها من المشغّل، فتُستعاد بالإزاحة الحالية\./);
  byFid(env, 'draftRestore').click();
  await settle(10);
  assert.equal(editor.state.session.cueAt(0).text, DRAFT_TEXT);
  assert.equal(editor.state.session.offsetMs, 800, 'الإزاحة الحاضرة لا إزاحة المسودة');
  assert.equal(editor.state.session.offsetChanged, false);
});

test('الفكرة ٩: تغيّر محتوى الخانة بعد المسودة: «تنزيل المسودة (SRT) / تجاهل» بلا دمج، والتنزيل باسم يميّزها، والتجاهل بتأكيد يحذفها', async () => {
  const { env, editor, saved, stored } = await mounted({ seed: (slot) => draftOn(slot, { base: { editedAt: '2026-10-01T09:00:00.000Z' } }) });
  const b = banner(env);
  assert.equal(b.getAttribute('data-kind'), 'changed');
  assert.match(textOf(b), /تعديلات لم تُحفظ على نسخة أقدم/);
  assert.equal(byFid(env, 'draftRestore'), null, 'لا استعادة فوقها');
  assert.equal(editor.state.session.cueAt(0).text === DRAFT_TEXT, false);
  byFid(env, 'draftDownload').click();
  await settle(10);
  assert.equal(saved.length, 1);
  assert.match(saved[0].name, /^AAAAAAAAAAA\.draft\.[a-z]+\.srt$/);
  assert.ok(saved[0].text.includes(DRAFT_TEXT), 'نص المسودة في الملف');
  assert.ok(banner(env), 'التنزيل لا يحذفها');
  byFid(env, 'draftDiscard').click();
  await settle();
  const dlg = openDialogEl(env);
  assert.match(textOf(dlg), /تُحذف تعديلات المسودة نهائيًا/);
  dlg.close('discard');
  await settle(10);
  assert.equal(banner(env), null);
  assert.equal(stored(), null, 'حُذفت');
  assert.match(textOf(env.root.querySelector('.ed-toast')), /حُذفت المسودة\./);
  assert.equal(editor.draft.held, false);
});
