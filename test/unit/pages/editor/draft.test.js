// مسودة المحرّر (الفكرة ٩، ح-48): الكتابة بعد ثانيتين من السكون وبحد أقصى كل 15 ثانية، والتفريغ فورًا عند الإخفاء وpagehide، ولا
// كتابة ما لم تتغير نسخة الجلسة؛ والحذف بعد الحفظ و«تجاهل التغييرات» و«التبديل دون حفظ» وعند فتح خانة نظيفة (ومنها التالفة)؛ واللافتة
// الثابتة بحالاتها الثلاث (الهوية نفسها «استعادة / تجاهل»، والإزاحة وحدها تُتبنّى الحاضرة، والمحتوى تغيّر «تنزيل / تجاهل») وإمساك
// الكتابة ما دامت قائمة (ح-52: تعديلات الجلسة واللافتة قائمة لا تطمس المسودة التي لم يُقرَّر فيها، ولا يحذفها الحفظ ولا
// «التبديل دون حفظ» ولا المغادرة، والحافظ الممسَك خامد؛ وكانت إزالة شرط الإمساك تنجو من اختبارات المحرّر كلها، تحقق 2.3.0
// ص-٤)، والهوية بالمحتوى بعد تحرير لوحة النص ثم «تراجعها» (تحقق 2.3.0 ص-٦)، ونتيجة كل فعل في المنطقة الحية. العقد تُقارن
// بـassert.ok(a === b) لا بـassert.equal (انظر fake-dom.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createController } from '../../../../src/content/controller.js';
import { createStore } from '../../../../src/core/store/index.js';
import { classifyDraft, draftCuesHash, draftOf } from '../../../../src/core/model/draft.js';
import { mountEditor } from '../../../../src/pages/editor/app.js';
import { DRAFT_IDLE_MS, DRAFT_MAX_MS, createDraftKeeper } from '../../../../src/pages/editor/draft.js';
import { createMemoryArea } from '../../../helpers/chrome-storage.js';
import { NOW, fakeExtractor } from '../../../helpers/fixtures.js';
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
  const t = ed2.state.info.track;
  assert.deepEqual(d.base, { fileName: t.fileName, importedAt: t.importedAt, editedAt: t.editedAt, offsetMs: 500, cuesHash: draftCuesHash(t.current ?? t.original) });
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
  // مسودة بُنيت على نسخة أقدم من الترجمة (تاريخ تعديل آخر ومقاطع أخرى).
  const { env, editor, saved, stored } = await mounted({
    seed: (slot) => draftOn(slot, { base: { editedAt: '2026-10-01T09:00:00.000Z', cuesHash: draftCuesHash(slot.track.original) } }),
  });
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

test('ح-52: ما يُكتب في الجلسة واللافتة قائمة لا يحل محل المسودة المعروضة، لا بالسكون ولا بالحد الأقصى ولا بالإخفاء ولا pagehide؛ وبعد القرار يُكتب', async () => {
  const { env, editor, stored, calls } = await mounted({ seed: (slot) => draftOn(slot) });
  assert.ok(banner(env), 'اللافتة ظاهرة');
  assert.equal(editor.draft.held, true);
  const before = structuredClone(stored());
  editor.state.session.setText(2, 'كُتب واللافتة قائمة');
  assert.equal(editor.state.session.dirty, true, 'في الجلسة ما لم يُحفظ');
  await env.advance(DRAFT_IDLE_MS + 100);
  // كتابة متصلة أطول من الحد الأقصى.
  for (let i = 1; i <= 16; i++) {
    editor.state.session.setText(2, `حرف ${i}`);
    await env.advance(1000);
  }
  env.doc.visibilityState = 'hidden';
  env.fireDoc({ type: 'visibilitychange' });
  env.fireWin('pagehide');
  await editor.draft.flush();
  await settle(10);
  assert.deepEqual(calls, { set: 0, clear: 0 }, 'لا كتابة ولا حذف ما دامت اللافتة');
  assert.deepEqual(stored(), before, 'المسودة التي لم يُقرَّر فيها كما هي');
  assert.ok(banner(env), 'واللافتة باقية');

  // القرار («تجاهل» بتأكيد) يفك الإمساك: ما كُتب في أثنائها يُكتب مسودةً بعد السكون.
  env.doc.visibilityState = 'visible';
  byFid(env, 'draftDiscard').click();
  await settle();
  openDialogEl(env).close('discard');
  await settle(10);
  assert.equal(editor.draft.held, false);
  assert.equal(stored(), null, 'حُذفت المسودة السابقة');
  await env.advance(DRAFT_IDLE_MS + 100);
  await settle(10);
  assert.equal(stored()?.[0]?.cues[2].text, 'حرف 16', 'وكُتبت تعديلات الجلسة بعد القرار');
});

test('ح-52: «التبديل دون حفظ» والرجوع إلى «المحفوظات» واللافتة قائمة لا يحذفان المسودة التي لم يُقرَّر فيها، وتعود لافتتها', async () => {
  const a = await mounted({ seed: (slot) => draftOn(slot) });
  assert.ok(banner(a.env));
  const before = structuredClone(a.stored());
  a.editor.state.session.setText(2, 'كُتب واللافتة قائمة ثم تُرك');
  const switching = a.editor.switchSlot(2);
  await settle();
  openDialogEl(a.env).close('switch');
  await switching;
  await settle(10);
  assert.equal(a.editor.state.slot, 2);
  assert.deepEqual(a.stored(), before, 'تُجوهلت تعديلات الجلسة لا المسودة السابقة');
  await a.editor.switchSlot(1);
  await settle(10);
  assert.equal(a.editor.state.slot, 1, 'بلا حوار');
  assert.equal(banner(a.env)?.getAttribute('data-kind'), 'same', 'تعود لافتتها');

  const b = await mounted({ seed: (slot) => draftOn(slot) });
  assert.ok(banner(b.env));
  const kept = structuredClone(b.stored());
  findAll(b.env.root, (e) => e.classList?.contains?.('ed-back'))[0].click();
  await settle(10);
  assert.ok(b.env.doc.defaultView.location.assigned?.includes('library'), 'غادر إلى المحفوظات');
  assert.deepEqual(b.stored(), kept, 'المسودة باقية تنتظر قرارها');
  assert.equal(b.calls.clear, 0);
});

test('ح-52: الحفظ واللافتة قائمة لا يحذف المسودة التي لم يُقرَّر فيها: تبقى، وتصير لافتتها «تنزيل / تجاهل» لأن الخانة تغيّرت بعدها', async () => {
  const { env, editor, stored, calls } = await mounted({ seed: (slot) => draftOn(slot) });
  assert.equal(banner(env)?.getAttribute('data-kind'), 'same');
  const before = structuredClone(stored());
  editor.state.session.setText(2, 'كُتب واللافتة قائمة ثم حُفظ');
  await editor.save();
  await settle(10);
  assert.equal(editor.state.session.dirty, false, 'حُفظ');
  assert.equal(calls.clear, 0);
  assert.deepEqual(stored(), before, 'المسودة باقية');
  assert.equal(banner(env)?.getAttribute('data-kind'), 'changed', 'فلا تُستعاد فوق ما حُفظ بعدها');
  assert.equal(editor.draft.held, true);
});

/** نافذة بمؤقتات تُعدّ وتُطلق يدويًا، للحافظ وحده. */
function keeperWin() {
  let id = 0;
  const timers = new Map();
  return {
    setTimeout: (fn) => { timers.set(++id, fn); return id; },
    clearTimeout: (t) => { timers.delete(t); },
    armed: () => timers.size,
    fire: () => {
      const due = [...timers.values()];
      timers.clear();
      for (const fn of due) fn();
    },
  };
}

test('ح-52: الحافظ الممسَك خامد: لا يجدول مؤقتًا ولا يكتب ولا يحذف (ولو بـforce)، والإمساك يوقف ما جُدول؛ وبعد فكّه يكتب ما تغيّر في أثنائه', async () => {
  const win = keeperWin();
  const log = [];
  const store = {
    setDraft: async (id, slot, d) => { log.push(['set', slot, d.cues[0].text]); },
    clearDraft: async (id, slot) => { log.push(['clear', slot]); },
  };
  const session = { version: 0, dirty: false, offsetMs: 0, committedMs: 0, snapshot: () => [{ n: 1, startMs: 0, endMs: 1000, text: 'في الجلسة' }] };
  const opened = { track: { fileName: 'a.srt', importedAt: NOW, editedAt: null, original: session.snapshot(), current: null }, offsetMs: 0 };
  const keeper = createDraftKeeper({ win, store, videoId: 'AAAAAAAAAAA', now: () => Date.parse(NOW), current: () => ({ session, slot: 1, opened }) });

  session.version = 1;
  session.dirty = true;
  keeper.schedule();
  assert.equal(win.armed(), 2, 'السكون والحد الأقصى');
  keeper.hold(true);
  assert.equal(keeper.held, true);
  assert.equal(win.armed(), 0, 'الإمساك يوقف ما جُدول');
  session.version = 2;
  keeper.schedule();
  assert.equal(win.armed(), 0, 'ولا يُجدول شيء في أثنائه');
  await keeper.flush();
  await keeper.flush({ force: true });
  await keeper.drop(1);
  await keeper.settled();
  assert.deepEqual(log, [], 'لا كتابة ولا حذف في أثنائه');

  keeper.hold(false);
  keeper.schedule();
  assert.equal(win.armed(), 2);
  win.fire();
  await keeper.settled();
  assert.deepEqual(log, [['set', 1, 'في الجلسة']], 'ما تغيّر في أثنائه يُكتب بعد فكّه');
  await keeper.drop(1);
  assert.deepEqual(log.at(-1), ['clear', 1], 'والتجاهل بعده يحذف');
});

/** تحرير نص مقطع من لوحة النص في المشغّل (الفكرة ٦) على المخزن نفسه، و«تراجعه» إن طُلب. */
async function panelEdit(store, { index, text, undo }) {
  let at = Date.parse(NOW) + 60_000;
  const c = createController({ store, extractor: fakeExtractor(), page: { title: () => 'عنوان', durationMs: () => 90000 }, now: () => (at += 1000) });
  const off = store.onChange((ch) => c.handleStoreChange(ch));
  await c.start('AAAAAAAAAAA');
  const r = await c.editCueText({ index }, text);
  if (undo) await r.undo();
  off();
}

test('ص-٦: تحرير مقطع آخر من لوحة النص ثم «تراجعه» يعيد الخانة كما بُنيت عليها المسودة: «استعادة» لا «تنزيل»، ولو تغيّر تاريخ تعديلها', async () => {
  let editedAt = null;
  const { env, editor } = await mounted({
    seed: (slot) => {
      editedAt = slot.track.editedAt;
      return draftOn(slot);
    },
    before: (store) => panelEdit(store, { index: 2, text: 'نص من لوحة النص', undo: true }),
  });
  assert.ok(editedAt && editor.state.info.track.editedAt !== editedAt, 'تاريخ التعديل تغيّر بالتحرير وتراجعه');
  assert.equal(editor.state.info.cues[2].text, 'أولى 3 (معدّل)', 'والمقطع كما كان');
  assert.equal(banner(env)?.getAttribute('data-kind'), 'same');
  byFid(env, 'draftRestore').click();
  await settle(10);
  assert.equal(banner(env), null);
  assert.equal(editor.state.session.cueAt(0).text, DRAFT_TEXT, 'استُعيدت المسودة');
  assert.equal(editor.state.session.cueAt(2).text, 'أولى 3 (معدّل)');
});

test('ص-٦ (قيد): تحرير حقيقي من لوحة النص ولو في مقطع لم تمسه المسودة: «تنزيل المسودة / تجاهل»، فلا تُكتب فوق النص الأحدث', async () => {
  const { env, editor, stored } = await mounted({
    seed: (slot) => draftOn(slot),
    before: (store) => panelEdit(store, { index: 2, text: 'نص من لوحة النص', undo: false }),
  });
  assert.equal(editor.state.info.cues[2].text, 'نص من لوحة النص');
  assert.equal(banner(env)?.getAttribute('data-kind'), 'changed');
  assert.equal(byFid(env, 'draftRestore'), null, 'لا استعادة فوقه');
  assert.ok(stored()?.[0], 'والمسودة باقية');
});

/** مقاطع يُعدّ كل مرور عليها لحساب بصمتها (draftCuesHash يبدأ بـmap). */
function counted(cues) {
  const seen = { maps: 0 };
  const proxy = new Proxy(cues, {
    get(target, key, receiver) {
      if (key === 'map') seen.maps++;
      return Reflect.get(target, key, receiver);
    },
  });
  return { cues: proxy, seen };
}

test('ص-٩: بصمة مقاطع الأساس تُحسب مرة لكل خانة مفتوحة لا مع كل كتابة، وتُعاد حين يتغير الأساس (الترجمة أو مقاطعها أو تاريخ تعديلها)', async () => {
  const win = keeperWin();
  const written = [];
  const store = { setDraft: async (id, slot, d) => { written.push([slot, d.base.cuesHash]); }, clearDraft: async () => {} };
  const cue = (n, text) => ({ n, startMs: n * 1000, endMs: n * 1000 + 800, text });
  const session = { version: 0, dirty: true, offsetMs: 0, committedMs: 0, snapshot: () => [cue(1, 'في الجلسة')] };
  const plain = [cue(1, 'الأساس'), cue(2, 'الأساس 2')];
  const a = counted(plain);
  let opened = { track: { fileName: 'a.srt', importedAt: NOW, editedAt: null, original: a.cues, current: null }, offsetMs: 0 };
  let slot = 1;
  const keeper = createDraftKeeper({ win, store, videoId: 'AAAAAAAAAAA', now: () => Date.parse(NOW), current: () => ({ session, slot, opened: { ...opened } }) });
  const write = async () => {
    session.version++;
    await keeper.flush();
    await keeper.settled();
  };
  for (let k = 0; k < 5; k++) await write();
  assert.equal(written.length, 5, 'خمس كتابات');
  assert.equal(a.seen.maps, 1, 'والبصمة حُسبت مرة واحدة');
  assert.ok(written.every(([, h]) => h === draftCuesHash(plain)), 'وهي بصمة الأساس في كل كتابة');

  // الحفظ: الخانة نفسها من حزمة جديدة بمقاطع أخرى وتاريخ تعديل.
  const savedCues = [cue(1, 'المحفوظ'), cue(2, 'الأساس 2')];
  const b = counted(savedCues);
  opened = { track: { ...opened.track, current: b.cues, editedAt: '2026-11-01T12:30:00.000Z' }, offsetMs: 0 };
  await write();
  await write();
  assert.equal(b.seen.maps, 1, 'تُعاد بعد الحفظ مرة واحدة');
  assert.equal(written.at(-1)[1], draftCuesHash(savedCues));

  // كائن الترجمة نفسه بمقاطع أخرى، ثم بتاريخ تعديل آخر: تُعاد في الحالتين.
  const other = [cue(1, 'من مكان آخر'), cue(2, 'الأساس 2')];
  opened.track.current = other;
  await write();
  assert.equal(written.at(-1)[1], draftCuesHash(other));
  const c = counted(other);
  opened.track.current = c.cues;
  opened.track.editedAt = '2026-11-01T12:40:00.000Z';
  await write();
  assert.equal(c.seen.maps, 1);

  // تبديل الخانة: ترجمة أخرى.
  const second = [cue(1, 'الخانة الثانية')];
  slot = 2;
  opened = { track: { fileName: 'b.srt', importedAt: NOW, editedAt: null, original: second, current: null }, offsetMs: 0 };
  await write();
  assert.deepEqual(written.at(-1), [2, draftCuesHash(second)]);
});

test('ص-٩ وص-٦: بصمة الأساس في المسودة تتبع الخانة المفتوحة بعد الحفظ و«الرجوع إلى النسخة المرفوعة» وتبديل الخانة، فتبقى الهوية بالمحتوى «استعادة»', async () => {
  const { env, editor, store, id, stored } = await mounted();
  const slotNow = async (n) => (await store.getBundle(id)).slots[n - 1];
  /** تعديل ثم كتابة المسودة فورًا: بصمتها بصمة ما فُتح، وتصنيفها على الخانة كما خُزّنت «استعادة». */
  const draftNow = async (n, text) => {
    editor.state.session.setText(0, text);
    await editor.draft.flush();
    const d = stored()[n - 1];
    const s = await slotNow(n);
    assert.equal(d.base.cuesHash, draftCuesHash(s.track.current ?? s.track.original), `بصمة الخانة ${n} كما خُزّنت`);
    assert.equal(classifyDraft(d, s).kind, 'same');
    return d.base.cuesHash;
  };
  const first = await draftNow(1, 'قبل الحفظ');
  await editor.save();
  await settle(10);
  const afterSave = await draftNow(1, 'بعد الحفظ');
  assert.notEqual(afterSave, first, 'الحفظ غيّر الأساس فتغيّرت البصمة');

  findAll(env.root, (e) => e.tagName === 'button' && textOf(e).startsWith('الرجوع إلى النسخة المرفوعة'))[0].click();
  await settle();
  openDialogEl(env).close('restore');
  await settle(10);
  assert.equal((await slotNow(1)).track.current, null, 'رجعت إلى المرفوعة');
  const restored = await draftNow(1, 'بعد الرجوع');
  assert.equal(restored, draftCuesHash((await slotNow(1)).track.original));

  await editor.save();
  await settle(10);
  await editor.switchSlot(2);
  await settle(10);
  assert.equal(editor.state.slot, 2);
  const second = await draftNow(2, 'في الخانة الثانية');
  assert.notEqual(second, restored);
});
