// سباق التنقل في المتحكم (تحقق Gemini، ع-٥، البند 37): كل فعل يكتب في سجل الفيديو أو حزمته، وكل قراءة لاحقة لسجله، يبدأ على
// الفيديو A ثم يتنقل المستخدم إلى B قبل أن تنتهي. المطلوب في كل مسار: حالة B كما حُمّلت (سجلها وعرضها وإشعارها وترجمتها)، لا شيء
// من A، وكتابة A وقعت على A وحده. كان المختبَر من حراس «انتهت العملية بعد التنقل» حارس تحميل setVideo وحده، فنجت طفرات حذف
// الحارس في writeRecord وwriteBundle وreloadIfNewer وloadArabic وactivateSlot وloadArabicInto (M16 وN02 وN03 وK01 إلى K03)، ومنها
// عرض ترجمة A فوق B.
// البوابة على المخزن الحقيقي: «بعد الحفظ» تقع الكتابة في التخزين ثم يتأخر ردها (يصل حدثها والمتحكم ما زال على A)، و«قبل الحفظ»
// يتأخر الطلب نفسه فتقع الكتابة بعد التنقل. وبعد انتهاء الفعل «نكزة» من المستخرج (التقاط يصل) تعيد حساب الحالة كما في الصفحة،
// فيظهر ما بقي في ذاكرة المتحكم ولو لم يُبلَّغ به.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createController } from '../../../src/content/controller.js';
import { createStore } from '../../../src/core/store/index.js';
import { DEFAULT_SETTINGS } from '../../../src/core/model/settings.js';
import { withView } from '../../../src/core/model/transitions.js';
import { createMemoryArea } from '../../helpers/chrome-storage.js';
import { NOW, fakeExtractor, fingerprint, englishTrack, makeCues, videoRecord } from '../../helpers/fixtures.js';
import { sampleBundle, seedBundle } from '../../helpers/fixtures-v2.js';

const A = 'AAAAAAAAAAA';
const B = 'BBBBBBBBBBB';
const clock = (start = Date.parse(NOW)) => {
  let t = start;
  return () => (t += 1000);
};
const settle = async (area) => {
  for (let i = 0; i < 4; i++) {
    await area.flush();
    await new Promise((r) => setTimeout(r, 0));
  }
};

/**
 * مخزن حقيقي ببوابة على getVideo وupdateVideo وupdateBundle لفيديو بعينه: arm يحبس الاستدعاء التالي (بعد الحفظ أو قبله).
 * @param {ReturnType<typeof createStore>} real
 */
function gated(real) {
  const traps = [];
  const wrap = (name) => async (id, ...rest) => {
    const i = traps.findIndex((t) => t.name === name && t.id === id);
    const trap = i < 0 ? null : traps.splice(i, 1)[0];
    if (trap?.phase === 'before') {
      trap.hit();
      await trap.open;
    }
    const r = await real[name](id, ...rest);
    if (trap?.phase === 'after') {
      trap.hit();
      await trap.open;
    }
    return r;
  };
  return {
    store: { ...real, getVideo: wrap('getVideo'), updateVideo: wrap('updateVideo'), updateBundle: wrap('updateBundle') },
    /** @param {'getVideo' | 'updateVideo' | 'updateBundle'} name @param {string} id @param {'before' | 'after'} [phase] */
    arm(name, id, phase = 'after') {
      let hit;
      let release;
      const reached = new Promise((r) => { hit = r; });
      const open = new Promise((r) => { release = r; });
      traps.push({ name, id, phase, hit, open });
      return { reached, release };
    },
  };
}

/** B: فيديو محفوظ بترجمة وإزاحة ووضع غير ما لـA، فأي تسرّب من A يظهر. */
const recordB = () => videoRecord({ videoId: B, offset: 900, mode: 'ar', cues: makeCues(4, { text: (i) => `ترجمة B ${i}` }) });

async function setup({ v2 = false, tracks = [] } = {}) {
  const area = createMemoryArea({ unlimited: true });
  const seed = createStore({ area, now: clock() });
  if (v2) await seedBundle(seed, sampleBundle({ videoId: A }));
  else await seed.updateVideo(A, () => videoRecord({ videoId: A, offset: 700, mode: 'dual' }));
  await seed.updateVideo(B, () => recordB());
  await area.flush();
  const real = createStore({ area, now: clock() });
  const gate = gated(real);
  const ex = fakeExtractor({ videoId: A, tracks });
  const c = createController({ store: gate.store, extractor: ex, page: { title: () => 'عنوان', durationMs: () => 90000 }, now: clock() });
  real.onChange((ch) => c.handleStoreChange(ch));
  const other = createStore({ area, now: clock(Date.parse(NOW) + 333) });
  await c.start(A);
  return { area, real, gate, ex, c, other };
}

/** ما يراه المستخدم من حالة الفيديو المعروض (قيم لا عقد). */
const look = (s) => ({
  videoId: s.videoId, loading: s.loading, savedVideo: s.saved?.videoId ?? null, rev: s.saved?.rev ?? null, view: { ...s.view },
  notice: s.notice?.code ?? null, error: s.error?.code ?? null, arabic: s.arabic?.fileName ?? null, firstCue: s.arabic?.cues[0]?.text ?? null,
  activeSlot: s.activeSlot, marks: s.marks?.items.length ?? null, title: s.title,
});

const B_STATE = {
  videoId: B, loading: false, savedVideo: B, rev: 1, view: { displayOffsetMs: 900, displayMode: 'ar' }, notice: 'ST_RESTORED', error: null,
  arabic: `${B}.ar.srt`, firstCue: 'ترجمة B 1', activeSlot: 1, marks: 0, title: 'عنوان تجريبي',
};

const settled = (p) => Promise.resolve(p).then((value) => ({ ok: true, value }), (err) => ({ ok: false, code: err?.code ?? String(err) }));

/**
 * الفعل يبدأ على A، والتنقل إلى B يكتمل وهو معلّق عند بوابته، ثم يكتمل الفعل. ثم: حالة B كما حُمّلت، وسجل B المخزَّن كما هو،
 * وأثر الفعل في A وحده (check)، ويظهر في A بالعودة إليه.
 */
async function raceWrite({ v2 = false, tracks, arrange, act, method, phase, check, back }) {
  const ctx = await setup({ v2, tracks });
  const { area, real, gate, ex, c } = ctx;
  const before = await arrange?.(ctx);
  const t = gate.arm(method, A, phase);
  const p = settled(act(c, before));
  await t.reached;
  await area.flush(); // حدث الكتابة («بعد الحفظ») يصل والمتحكم ما زال على A
  await c.setVideo(B);
  assert.deepEqual(look(c.getState()), B_STATE, 'B بعد التنقل');
  t.release();
  const r = await p;
  assert.equal(r.ok, true, r.code);
  await settle(area);
  ex.setTracks([]); // التقاط يصل: الحالة تُحسب من جديد
  assert.deepEqual(look(c.getState()), B_STATE, 'حالة B بعد أن انتهى فعل A');
  const storedB = await real.getVideo(B);
  assert.equal(storedB.rev, 1, 'سجل B لم يُكتب');
  assert.deepEqual(storedB.view, { displayOffsetMs: 900, displayMode: 'ar' });
  await check(real, r.value);
  await c.setVideo(A);
  back?.(c.getState());
}

const upload = (label, n = 4) => ({ fileName: `${label}.srt`, cues: makeCues(n, { text: (i) => `${label} ${i}` }), comparison: null, fingerprintId: null, notes: [] });
const EN_TRACK = { key: 'en|manual', kind: 'manual', cues: makeCues(5, { text: (i) => `line ${i}` }) };

/** @type {Record<string, Omit<Parameters<typeof raceWrite>[0], 'phase'>>} */
const WRITES = {
  'setOffset (± في الإزاحة)': {
    method: 'updateVideo', act: (c) => c.setOffset(1500),
    check: async (real) => assert.equal((await real.getVideo(A)).view.displayOffsetMs, 1500),
    back: (s) => assert.equal(s.view.displayOffsetMs, 1500),
  },
  nudgeOffset: {
    method: 'updateVideo', act: (c) => c.nudgeOffset(1),
    check: async (real) => assert.equal((await real.getVideo(A)).view.displayOffsetMs, 700 + DEFAULT_SETTINGS.offsetStepMs),
  },
  resetOffset: {
    method: 'updateVideo', act: (c) => c.resetOffset(),
    check: async (real) => assert.equal((await real.getVideo(A)).view.displayOffsetMs, 0),
  },
  setDisplayMode: {
    method: 'updateVideo', act: (c) => c.setDisplayMode('off'),
    check: async (real) => assert.equal((await real.getVideo(A)).view.displayMode, 'off'),
  },
  'loadArabic (استبدال يصفّر الإزاحة)': {
    method: 'updateVideo', act: (c) => c.loadArabic(upload('بديلة'), { replace: true }),
    check: async (real, rec) => {
      assert.equal(rec.videoId, A);
      const a = await real.getVideo(A);
      assert.equal(a.arabic.fileName, 'بديلة.srt');
      assert.equal(a.view.displayOffsetMs, 0);
    },
    back: (s) => assert.equal(s.arabic.fileName, 'بديلة.srt'),
  },
  recordExport: {
    tracks: [EN_TRACK], method: 'updateVideo',
    act: (c) => c.recordExport({ trackKey: 'en|manual', fingerprint: fingerprint({ videoId: A, id: 'fp_race000001', track: englishTrack({ cues: EN_TRACK.cues }) }) }),
    check: async (real) => assert.ok((await real.getVideo(A)).fingerprints.some((f) => f.id === 'fp_race000001')),
  },
  recordSavedExport: {
    method: 'updateVideo',
    act: (c) => c.recordSavedExport({ trackKey: 'en|manual', fingerprint: fingerprint({ videoId: A, id: 'fp_race000002', mode: 'long' }) }),
    check: async (real, r) => {
      assert.equal(r.stored, true);
      assert.ok((await real.getVideo(A)).fingerprints.some((f) => f.id === 'fp_race000002'));
    },
  },
  'activateSlot (تبديل النشطة بإزاحتها)': {
    v2: true, method: 'updateBundle', act: (c) => c.activateSlot(2),
    check: async (real) => assert.equal((await real.getBundle(A)).active, 2),
    back: (s) => assert.equal(s.activeSlot, 2),
  },
  'loadArabicInto (الرفع إلى خانة فارغة يفعّلها)': {
    v2: true, method: 'updateBundle', act: (c) => c.loadArabicInto(3, upload('ثالثة')),
    check: async (real, r) => {
      assert.equal(r.activated, true);
      const b = await real.getBundle(A);
      assert.equal(b.active, 3);
      assert.equal(b.slots[2].track.fileName, 'ثالثة.srt');
    },
  },
  'loadArabicInto (استبدال خانة ممتلئة يحفظ السابقة)': {
    v2: true, method: 'updateBundle', act: (c) => c.loadArabicInto(2, upload('بديلة'), { replace: true }),
    check: async (real) => {
      const b = await real.getBundle(A);
      assert.equal(b.slots[1].track.fileName, 'بديلة.srt');
      assert.equal(b.previous.from, 2);
    },
  },
  'completeSlot (إكمال الترجمة)': {
    v2: true, method: 'updateBundle',
    arrange: async ({ real }) => {
      const track = (await real.getBundle(A)).slots[0].track;
      const base = track.current ?? track.original;
      return { n: 1, base, cues: base.map((c, i) => (i === 1 ? { ...c, text: 'مقطع أُكمل' } : c)), adds: 1, remaining: 0, renumbered: false };
    },
    act: (c, cont) => c.completeSlot(cont, 'أُكمل مقطع'),
    check: async (real) => assert.equal((await real.getBundle(A)).slots[0].track.current[1].text, 'مقطع أُكمل'),
  },
  'markAmbiguous (علّمها للمراجعة)': {
    v2: true, method: 'updateBundle', act: (c) => c.markAmbiguous([3, 4], 2),
    check: async (real, r) => {
      assert.equal(r.count, 2);
      assert.equal((await real.getBundle(A)).slots[1].marks.length, 3);
    },
  },
  'markAmbiguous: التراجع': {
    v2: true, method: 'updateBundle',
    arrange: ({ c }) => c.markAmbiguous([3, 4], 2),
    act: (c, done) => done.undo(),
    check: async (real) => assert.equal((await real.getBundle(A)).slots[1].marks.length, 1),
  },
  'markCue (تعليم مقطع)': {
    v2: true, method: 'updateBundle', act: (c) => c.markCue({ index: 1 }, 'todo'),
    check: async (real) => assert.equal((await real.getBundle(A)).slots[0].marks.length, 3),
    back: (s) => assert.equal(s.marks.items.length, 3),
  },
  'markCue: التراجع': {
    v2: true, method: 'updateBundle',
    arrange: ({ c }) => c.markCue({ index: 1 }, 'todo'),
    act: (c, done) => done.undo(),
    check: async (real) => assert.equal((await real.getBundle(A)).slots[0].marks.length, 2),
  },
  'setSlotLang (لغة الخانة)': {
    v2: true, method: 'updateBundle', act: (c) => c.setSlotLang(2, 'fr'),
    check: async (real) => assert.equal((await real.getBundle(A)).slots[1].track.lang, 'fr'),
  },
};

for (const [name, spec] of Object.entries(WRITES)) {
  for (const phase of /** @type {const} */ (['after', 'before'])) {
    test(`سباق التنقل: ${name}، والتنقل إلى B ${phase === 'after' ? 'بعد الحفظ وقبل الرد' : 'قبل وصول الطلب إلى التخزين'}`, () => raceWrite({ ...spec, phase }));
  }
}

// ---------------------------------------------------------------- القراءة: إعادة قراءة سجل A تنتهي بعد التنقل

test('سباق التنقل: حدث تخزين لـA من سياق آخر يبدأ إعادة القراءة، ثم التنقل إلى B قبل انتهائها، فلا تُعرض ترجمة A فوق B (M16)', async () => {
  const { area, gate, ex, c, other } = await setup();
  const t = gate.arm('getVideo', A);
  await other.updateVideo(A, (r) => withView(r, { displayOffsetMs: 300 }, new Date(Date.parse(NOW) + 5000).toISOString()));
  await area.flush();
  await t.reached;
  await c.setVideo(B);
  t.release();
  await settle(area);
  ex.setTracks([]);
  assert.deepEqual(look(c.getState()), B_STATE);
  await c.setVideo(A);
  assert.equal(c.getState().view.displayOffsetMs, 300, 'وما كتبه السياق الآخر يظهر بالعودة إلى A');
});

test('سباق التنقل: «إعادة القراءة» (reload) لـA تنتهي بعد التنقل إلى B فلا تغيّر حالته', async () => {
  const { area, gate, ex, c } = await setup({ v2: true });
  const t = gate.arm('getVideo', A);
  const p = c.reload();
  await t.reached;
  await c.setVideo(B);
  t.release();
  await p;
  await settle(area);
  ex.setTracks([]);
  assert.deepEqual(look(c.getState()), B_STATE);
});

test('سباق التنقل: قراءة A تفشل بعد التنقل إلى B فلا يظهر خطؤها على B', async () => {
  const { area, gate, ex, c, real } = await setup();
  const t = gate.arm('getVideo', A, 'before');
  const p = c.reload();
  await t.reached;
  await c.setVideo(B);
  real.getVideo = async () => { throw Object.assign(new Error('read'), { code: 'ST_READ_FAILED' }); };
  t.release();
  await p;
  await settle(area);
  ex.setTracks([]);
  assert.deepEqual(look(c.getState()), B_STATE);
});
