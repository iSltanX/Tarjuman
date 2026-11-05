// انحدارات C2 (تدقيق 7a66f91): كتابتان من سياقين على مساحة واحدة. محوّلة من verify/storage (new-corrupt وsto01
// وversion-collision وplayer) وverify-ds/storage (tj05-race). المقبول في كل زوج: حزمة متسقة تُقرأ، وكل كتابة إما طُبّقت
// وأثرها باقٍ، وإما رُفضت برمز صريح؛ لا «حُفظ» يضيع، ولا تلف (ST_CORRUPT_RECORD)، ولا عودة بعد الحذف أو المسح.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStore } from '../../../src/core/store/index.js';
import { createController } from '../../../src/content/controller.js';
import { saveSlot, writePosition } from '../../../src/pages/editor/persist.js';
import { activateSlot, applyUpload, deleteSlot, deleteVideoData, renameSlot } from '../../../src/pages/library/actions.js';
import { withActiveSlot } from '../../../src/core/model/bundle.js';
import { createMemoryArea } from '../../helpers/chrome-storage.js';
import { NOW, makeCues } from '../../helpers/fixtures.js';
import { sampleBundle, seedBundle } from '../../helpers/fixtures-v2.js';
import { armBeforeSet, settled, turns } from '../../helpers/store-race.js';

const ID = 'AAAAAAAAAAA';
const VKEY = `video:${ID}`;

async function env({ sameClock = false, third = true } = {}) {
  const area = createMemoryArea({ unlimited: true });
  let t = Date.parse(NOW);
  const now = sameClock ? () => Date.parse(NOW) + 60_000 : () => (t += 1000);
  const a = createStore({ area, now });
  const b = createStore({ area, now });
  await seedBundle(createStore({ area, now: () => Date.parse(NOW) }), sampleBundle({ videoId: ID, third }));
  await a.ready();
  await b.ready();
  await area.flush();
  return { area, a, b, now };
}

const readable = (area) => createStore({ area }).getBundle(ID).then((bundle) => ({ ok: true, bundle }), (e) => ({ ok: false, code: e.code, detail: e.detail }));
const keysOf = (area) => Object.keys(area.dump()).filter((k) => k.endsWith(ID)).sort();

async function player(store) {
  const c = createController({ store, page: {}, extractor: null });
  await c.start(ID);
  return c;
}

// ── U06: الخليط ─────────────────────────────────────────────────────────────

const pairs = {
  'مشغّل ± × تفعيل الخانة 2 في المحفوظات': {
    A: async ({ a }) => { const c = await player(a); return () => c.nudgeOffset(1); },
    B: ({ b, now }) => activateSlot({ store: b, videoId: ID, n: 2, now }),
    check: (bundle) => assert.equal(bundle.active, 2, 'التفعيل باقٍ'),
  },
  'المحرّر: حفظ آخر موضع بـexpect × تفعيل الخانة 2': {
    A: async ({ a, now }) => { const opened = await a.getBundle(ID); return () => writePosition(a, ID, opened, 1, 2, { now }); },
    B: ({ b, now }) => activateSlot({ store: b, videoId: ID, n: 2, now }),
    check: (bundle) => assert.equal(bundle.active, 2, 'التفعيل باقٍ'),
  },
  'المحرّر: حفظ الخانة 1 × تفعيل الخانة 3 من المشغّل': {
    A: async ({ a, now }) => {
      const opened = await a.getBundle(ID);
      const cues = structuredClone(opened.slots[0].track.current);
      cues[0].text = 'نص-المحرّر';
      return () => saveSlot(a, ID, opened, 1, { cues, offsetChanged: false, offsetMs: 0 }, { now });
    },
    B: async ({ b }) => (await player(b)).activateSlot(3),
    check: (bundle) => assert.equal(bundle.active, 3, 'التفعيل باقٍ'),
  },
  'تسمية الخانة 2 × حذف الخانة 1 النشطة في تبويب آخر': {
    A: async ({ a }) => () => renameSlot({ store: a, videoId: ID, n: 2, name: 'اسم' }),
    B: async ({ b, now }) => deleteSlot({ store: b, videoId: ID, n: 1, now, expect: await b.getBundle(ID) }),
    check: (bundle) => {
      assert.equal(bundle.slots[0].track, null, 'الخانة 1 محذوفة');
      assert.ok(bundle.slots[1].track, 'الخانة 2 باقية');
    },
  },
};

for (const [name, p] of Object.entries(pairs)) {
  test(`U06 (ترتيب مفروض): ${name} — لا خليط، والفعلان باقيان أو أحدهما مرفوض صراحة`, async () => {
    const e = await env();
    const runA = await p.A(e);
    const other = armBeforeSet(e.area, VKEY, () => p.B(e));
    const ra = await settled(runA());
    const rb = await other;
    await e.area.flush();
    await turns(5);
    const r = await readable(e.area);
    assert.ok(r.ok, `الحزمة تُقرأ (${r.code} ${r.detail ?? ''})`);
    assert.ok(ra.ok, `الأول مطبّق: ${ra.code}`);
    if (rb.ok) p.check(r.bundle);
    else assert.match(rb.code, /^(ST_CONFLICT|PG_DELETE_STALE)$/);
  });
}

test('U06 (رشقة ± بلا خطاف): تفعيل من تبويب آخر بين نقرتين لا يترك حزمة تالفة', async () => {
  const { area, a, b } = await env({ third: false });
  const A = await player(a);
  a.onChange((c) => A.handleStoreChange(c));
  await turns(5);
  const p1 = A.nudgeOffset(1);
  await b.updateBundle(ID, (x) => withActiveSlot(x, 2, NOW));
  await area.flush();
  const p2 = A.nudgeOffset(1);
  await Promise.all([p1, p2]);
  await area.flush();
  await turns(10);
  const r = await readable(area);
  assert.ok(r.ok, `الحزمة تُقرأ (${r.code} ${r.detail ?? ''})`);
  assert.equal(A.getState().error, null);
});

// ── U07: ضياع التحديث ─────────────────────────────────────────────────────

test('U07 (أ): حفظان من محرّرين على النسخة نفسها — يُرفض أحدهما بـST_CONFLICT ولا يضيع «حُفظ»', async () => {
  const e = await env();
  const opened = await e.a.getBundle(ID);
  const openedB = await e.b.getBundle(ID);
  const edit = (b, text) => {
    const cues = structuredClone(b.slots[0].track.current);
    cues[0].text = text;
    return cues;
  };
  const other = armBeforeSet(e.area, VKEY, () => saveSlot(e.b, ID, openedB, 1, { cues: edit(openedB, 'نص-B'), offsetChanged: false, offsetMs: 0 }, { now: e.now }));
  const ra = await settled(saveSlot(e.a, ID, opened, 1, { cues: edit(opened, 'نص-A'), offsetChanged: false, offsetMs: 0 }, { now: e.now }));
  const rb = await other;
  const stored = (await e.a.getBundle(ID)).slots[0].track.current[0].text;
  assert.equal([ra, rb].filter((r) => r.ok).length, 1, 'ينجح حفظ واحد');
  const lost = [ra, rb].find((r) => !r.ok);
  assert.equal(lost.code, 'ST_CONFLICT');
  assert.equal(stored, ra.ok ? 'نص-A' : 'نص-B', 'المخزَّن هو الناجح');
});

test('U07 (أ، N02): كاتبان في الملي ثانية نفسها على النسخة نفسها — لا يُعدّ أحدهما صدى للآخر', async () => {
  const e = await env({ sameClock: true });
  const opened = await e.a.getBundle(ID);
  const openedB = await e.b.getBundle(ID);
  const cues = (b, text) => b.slots[0].track.current.map((c, i) => (i === 0 ? { ...c, text } : c));
  const [ra, rb] = await Promise.all([
    settled(saveSlot(e.a, ID, opened, 1, { cues: cues(opened, 'نص-A'), offsetChanged: false, offsetMs: 0 }, { now: e.now })),
    settled(saveSlot(e.b, ID, openedB, 1, { cues: cues(openedB, 'نص-B'), offsetChanged: false, offsetMs: 0 }, { now: e.now })),
  ]);
  assert.equal([ra, rb].filter((r) => r.ok).length, 1, 'ينجح حفظ واحد');
  assert.equal([ra, rb].find((r) => !r.ok).code, 'ST_CONFLICT');
});

test('U07 (ب): حذف مؤكد لكل البيانات أثناء حفظ متأخر — لا يعود الفيديو جزئيًا', async () => {
  const e = await env();
  const opened = await e.a.getBundle(ID);
  const openedB = await e.b.getBundle(ID);
  const cues = structuredClone(opened.slots[0].track.current);
  cues[0].text = 'نص-A';
  const other = armBeforeSet(e.area, VKEY, () => deleteVideoData({ store: e.b, videoId: ID, scope: 'all', expect: openedB, now: e.now }));
  const ra = await settled(saveSlot(e.a, ID, opened, 1, { cues, offsetChanged: false, offsetMs: 0 }, { now: e.now }));
  const rb = await other;
  await e.area.flush();
  assert.ok(!(ra.ok && rb.ok), 'لا ينجح الحذف والحفظ معًا');
  if (rb.ok) assert.deepEqual(keysOf(e.area), [], 'المحذوف لا يعود');
  else {
    assert.equal(rb.code, 'PG_DELETE_STALE');
    const r = await readable(e.area);
    assert.ok(r.ok);
    assert.equal(r.bundle.slots.filter((s) => s.track).length, 3, 'الحزمة كاملة');
  }
});

test('U07 (TJ-05 أ): حفظ المحرّر و± المشغّل معًا — يبقى الاثنان أو يُرفض الحفظ صراحة', async () => {
  for (const order of ['editor-first', 'player-first']) {
    const e = await env();
    const c = await player(e.b);
    const opened = await e.a.getBundle(ID);
    const step = c.getState().settings.offsetStepMs;
    const cues = opened.slots[0].track.current.map((x) => ({ ...x, text: `${x.text} [تعديل]` }));
    const save = () => settled(saveSlot(e.a, ID, opened, 1, { cues, offsetChanged: false, offsetMs: opened.slots[0].offsetMs }, { now: e.now }));
    const nudge = () => settled(c.nudgeOffset(1));
    const [rs] = order === 'editor-first' ? await Promise.all([save(), nudge()]) : (await Promise.all([nudge(), save()])).reverse();
    await e.area.flush();
    const end = await e.a.getBundle(ID);
    assert.equal(end.slots[0].offsetMs, opened.slots[0].offsetMs + step, `${order}: الضغطة باقية`);
    if (rs.ok) assert.ok(end.slots[0].track.current[0].text.includes('[تعديل]'), `${order}: «حُفظ» والتعديل باقٍ`);
    else assert.equal(rs.code, 'ST_CONFLICT', `${order}: الرفض صريح`);
  }
});

test('U07 (TJ-05 ب): رفع من المحفوظات بـexpect و± معًا — لا «استُبدلت» كاذبة', async () => {
  const e = await env();
  const c = await player(e.b);
  const bundle = await e.a.getBundle(ID);
  const settings = await e.a.getSettings();
  const result = { ok: true, fileName: `${ID}.ملف-جديد.ar.srt`, cues: makeCues(5, { text: (i) => `ملف جديد ${i}` }), comparison: null, fingerprintId: null, notes: [], warnings: [] };
  const [u] = await Promise.all([
    settled(applyUpload({ store: e.a, bundle, settings, result, n: 1, fingerprintId: null, now: e.now })),
    settled(c.nudgeOffset(1)),
  ]);
  await e.area.flush();
  const end = await e.a.getBundle(ID);
  if (u.ok) assert.ok(end.slots[0].track.fileName.includes('ملف-جديد'), 'الرفع الناجح باقٍ');
  else assert.match(u.code, /^(ST_CONFLICT|PG_DELETE_STALE)$/);
});

test('U07 (N21): setPrefs وsetSettings من سياقين دافئين لمجموعتين مختلفتين — تبقى الرقعتان', async () => {
  const e = await env();
  await e.a.getPrefs();
  await e.b.getPrefs();
  const term = { source: 'alpha', target: 'ألفا', note: null };
  await Promise.all([e.a.setPrefs({ glossary: { terms: [term] } }), e.b.setPrefs({ ui: { panelOpen: true } })]);
  const prefs = await createStore({ area: e.area }).getPrefs();
  assert.deepEqual(prefs.glossary.terms.map((x) => x.source), ['alpha']);
  assert.equal(prefs.ui.panelOpen, true);
  await Promise.all([e.a.setSettings({ offsetStepMs: 1000 }), e.b.setSettings({ displayModeDefault: 'dual' })]);
  const settings = await createStore({ area: e.area }).getSettings();
  assert.equal(settings.offsetStepMs, 1000);
  assert.equal(settings.displayModeDefault, 'dual');
});

test('U07 (N22): «مسح كل البيانات» و± المشغّل في الطريق — لا يعود من الفيديو شيء', async () => {
  const e = await env();
  const c = await player(e.a);
  const other = armBeforeSet(e.area, VKEY, () => e.b.clearAll());
  await settled(c.nudgeOffset(1));
  const rb = await other;
  assert.ok(rb.ok, `المسح نجح: ${rb.code}`);
  await e.area.flush();
  assert.deepEqual(keysOf(e.area), [], 'لا مفتاح للفيديو بعد المسح');
});
