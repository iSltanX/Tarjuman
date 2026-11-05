// انحدارات C2 في المحفوظات (تدقيق 7a66f91) بالواجهة الحقيقية فوق DOM وهمي ومخزنين على مساحة واحدة. محوّلة من
// verify/storage (corrupt وprev-race وaud021) وverify-ds/storage (tj04-corrupt، وFS-1 في findings-extra):
//   U08 السجل التالف يُحذف من الواجهة بتأكيد خاص، وبنود الكتابة الأخرى تعرض هذا المخرج.
//   U10 «استعادة النسخة السابقة» بتأكيد قديم لا تُنفَّذ على حالة غير التي عرضها الحوار.
//   U14 حذف خانة حُذفت من تبويب آخر يقول ذلك، لا «لم يعد الفيديو محفوظًا».
//   U95 «تراجع» التفعيل لا يفرض الخانة القديمة فوق تفعيل من تبويب آخر.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStore } from '../../../../src/core/store/index.js';
import { createLibrary } from '../../../../src/pages/library/view.js';
import { deleteSlot } from '../../../../src/pages/library/actions.js';
import { withActiveSlot, withSlotUpload } from '../../../../src/core/model/bundle.js';
import { messageFor } from '../../../../src/core/errors/index.js';
import { createMemoryArea } from '../../../helpers/chrome-storage.js';
import { NOW, makeCues } from '../../../helpers/fixtures.js';
import { sampleBundle, seedBundle } from '../../../helpers/fixtures-v2.js';
import { buttonNamed, newDocument, settle, textOf } from './fake-dom.js';

const ID = 'AAAAAAAAAAA';
const known = (code) => {
  assert.notEqual(messageFor(code), messageFor('TJ_UNEXPECTED'), `الرمز ${code} مسجّل برسالة`);
  return messageFor(code);
};

function timers() {
  let n = 0;
  const q = new Map();
  return {
    setTimer: (fn, ms) => { q.set(++n, { fn, ms }); return n; },
    clearTimer: (id) => q.delete(id),
    async runAll() {
      for (let i = 0; i < 20 && q.size; i++) {
        const b = [...q.values()];
        q.clear();
        for (const t of b) t.fn();
        await settle(2);
      }
    },
  };
}

async function mount({ bundle = sampleBundle({ videoId: ID, third: true }), corrupt = null, confirm } = {}) {
  let t = Date.parse(NOW);
  const area = createMemoryArea({ unlimited: true });
  const store = createStore({ area, now: () => (t += 1000) });
  const other = createStore({ area, now: () => (t += 1000) });
  await seedBundle(store, bundle);
  if (corrupt) corrupt(area);
  await area.flush();
  const doc = newDocument();
  const clock = timers();
  const confirms = [];
  const shown = [];
  const lib = createLibrary({
    store, doc, now: () => Date.parse(NOW) + 3600e3, openTab: async () => {}, openPage: async () => {},
    saveFile: async () => ({ ok: true }), clipboardWrite: async () => {}, pickFiles: async () => null, diagnosticsText: async () => '{}',
    setTimer: clock.setTimer, clearTimer: clock.clearTimer,
    confirm: async (o) => {
      confirms.push(o);
      return confirm ? confirm(o, { other, area, clock, now: () => (t += 1000) }) : true;
    },
  });
  doc.body.append(lib.root);
  const orig = lib.toaster.show.bind(lib.toaster);
  lib.toaster.show = (text, tone, o) => {
    shown.push({ text, tone, action: o?.action ?? null });
    return orig(text, tone, o);
  };
  await lib.load();
  const row = () => lib.root.querySelectorAll('li.lib-row').find((r) => r.getAttribute('data-video') === ID);
  return { area, store, other, doc, lib, clock, confirms, shown, row, now: () => (t += 1000) };
}

const keysOf = (area) => Object.keys(area.dump()).filter((k) => k.endsWith(ID)).sort();

async function menuItem(m, label) {
  const more = buttonNamed(m.row(), 'المزيد');
  more.click();
  const item = more.parentNode.querySelectorAll('[role=menuitem]').find((i) => textOf(i).startsWith(label));
  assert.ok(item, `بند «${label}»`);
  item.click();
  await settle(20);
}

// ── U08 ───────────────────────────────────────────────────────────────────

for (const [name, corrupt] of [
  ['تابع العلامات تالف والسجل سليم', (area) => area.rawSet(`marks:${ID}`, { broken: true })],
  ['السجل تالف والفهرس سليم', (area) => area.rawSet(`video:${ID}`, { broken: true })],
]) {
  test(`U08: ${name} — «حذف بيانات الفيديو…» يفتح تأكيدًا خاصًا ويحذفه`, async () => {
    const m = await mount({ corrupt });
    assert.ok(m.row(), 'الصف معروض');
    await assert.rejects(m.store.getBundle(ID), { code: 'ST_CORRUPT_RECORD' });
    await menuItem(m, 'حذف بيانات الفيديو');
    assert.equal(m.confirms.length, 1, 'فُتح تأكيد');
    await m.area.flush();
    await settle(20);
    assert.deepEqual(keysOf(m.area), [], 'حُذفت كل مفاتيح الفيديو');
    assert.ok(m.shown.some((s) => s.text === known('PG_UNREADABLE_DELETED')));
  });
}

test('U08: بند كتابة آخر على سجل تالف يعرض مخرج الحذف لا رسالة مسدودة', async () => {
  const m = await mount({ corrupt: (area) => area.rawSet(`marks:${ID}`, { broken: true }) });
  await menuItem(m, 'حذف الترجمة النشطة');
  assert.equal(m.confirms.length, 0, 'لا تأكيد حذف عادي لسجل لا يُقرأ');
  const err = m.shown.find((s) => s.tone === 'danger');
  assert.ok(err, 'رسالة خطأ');
  assert.equal(err.text, messageFor('ST_CORRUPT_RECORD'));
  assert.ok(err.action, 'ومعها إجراء الحذف');
  err.action.onClick();
  await settle(20);
  assert.equal(m.confirms.length, 1, 'الإجراء يفتح تأكيد الحذف الخاص');
  await m.area.flush();
  await settle(20);
  assert.deepEqual(keysOf(m.area), []);
});

// ── U10 ───────────────────────────────────────────────────────────────────

for (const [name, { prevFrom, replaceSlot }] of [
  ['السابقة من 2 والتبويب الآخر يستبدل 1', { prevFrom: 2, replaceSlot: 1 }],
  ['السابقة من 2 والتبويب الآخر يستبدل 3', { prevFrom: 2, replaceSlot: 3 }],
  ['السابقة من 1 والتبويب الآخر يستبدل 2', { prevFrom: 1, replaceSlot: 2 }],
]) {
  test(`U10: استعادة السابقة بتأكيد قديم (${name}) — تُرفض بـPG_RESTORE_STALE ولا يتغير شيء`, async () => {
    const b0 = sampleBundle({ videoId: ID, third: true });
    b0.previous = { ...b0.previous, from: prevFrom };
    let racedBundle = null;
    const m = await mount({
      bundle: b0,
      confirm: async (o, { other, area, clock, now }) => {
        await other.updateBundle(ID, (b) => withSlotUpload(b, replaceSlot, {
          videoId: ID, fileName: `${ID}.جديد-${replaceSlot}.ar.srt`, cues: makeCues(4, { text: (i) => `جديد ${i}` }),
          comparison: null, fingerprintId: null, notes: [], displayModeDefault: 'ar', current: null,
        }, new Date(now()).toISOString(), { replace: true }).bundle);
        racedBundle = await other.getBundle(ID);
        await area.flush();
        await clock.runAll();
        await settle(10);
        return true;
      },
    });
    buttonNamed(m.row(), 'إظهار الترجمات').click();
    await settle(10);
    buttonNamed(m.row().querySelector('.lib-exp .lib-prevl'), 'استعادة').click();
    await settle(20);
    await m.area.flush();
    await m.clock.runAll();
    const after = await m.store.getBundle(ID);
    assert.deepEqual(after.slots.map((s) => s.track?.fileName ?? null), racedBundle.slots.map((s) => s.track?.fileName ?? null), 'الخانات كما تركها التبويب الآخر');
    assert.equal(after.previous?.track.fileName ?? null, racedBundle.previous?.track.fileName ?? null, 'والسابقة كذلك');
    assert.ok(m.shown.some((s) => s.text === known('PG_RESTORE_STALE')));
  });
}

test('U10 (ضابط): استعادة السابقة بلا تغيير من مكان آخر تنجح', async () => {
  const m = await mount();
  buttonNamed(m.row(), 'إظهار الترجمات').click();
  await settle(10);
  const before = await m.store.getBundle(ID);
  buttonNamed(m.row().querySelector('.lib-exp .lib-prevl'), 'استعادة').click();
  await settle(20);
  const after = await m.store.getBundle(ID);
  assert.equal(after.slots[before.previous.from - 1].track.fileName, before.previous.track.fileName);
});

// ── U14 ───────────────────────────────────────────────────────────────────

test('U14: حذف خانة حذفها تبويب آخر — رسالة «حُذفت هذه الترجمة» والفيديو باقٍ', async () => {
  const m = await mount();
  buttonNamed(m.row(), 'إظهار الترجمات').click();
  await settle(10);
  const staleCard = m.row().querySelector('.lib-exp section[data-slot="3"]');
  await deleteSlot({ store: m.other, videoId: ID, n: 3, now: m.now });
  buttonNamed(staleCard, 'حذف…').click();
  await settle(20);
  const texts = m.shown.map((s) => s.text);
  assert.ok(texts.includes(known('PG_SLOT_GONE')), texts.join(' | '));
  assert.ok(!texts.includes(messageFor('PG_VIDEO_GONE')));
  assert.ok(await m.store.getBundle(ID), 'الفيديو باقٍ');
  assert.equal(m.confirms.length, 0, 'لا تأكيد لخانة غائبة');
});

// ── U95 ───────────────────────────────────────────────────────────────────

test('U95: «تراجع» التفعيل بعد تفعيل من تبويب آخر — يُرفض بـPG_UNDO_STALE وتبقى خانة التبويب الآخر', async () => {
  const m = await mount();
  m.row().querySelectorAll('button.lib-chip').find((b) => b.getAttribute('data-slot') === '2').click();
  await settle(20);
  const toast = m.shown.find((s) => s.action?.label === 'تراجع');
  assert.ok(toast, 'رسالة التفعيل بتراجع');
  assert.equal((await m.store.getBundle(ID)).active, 2);
  await m.other.updateBundle(ID, (b) => withActiveSlot(b, 3, NOW));
  toast.action.onClick();
  await settle(20);
  assert.equal((await m.store.getBundle(ID)).active, 3, 'تفعيل التبويب الآخر باقٍ');
  assert.ok(m.shown.some((s) => s.text === known('PG_UNDO_STALE')));
});

test('U95 (ضابط): «تراجع» بلا تغيير من مكان آخر يعيد الخانة السابقة', async () => {
  const m = await mount();
  m.row().querySelectorAll('button.lib-chip').find((b) => b.getAttribute('data-slot') === '2').click();
  await settle(20);
  m.shown.find((s) => s.action?.label === 'تراجع').action.onClick();
  await settle(20);
  assert.equal((await m.store.getBundle(ID)).active, 1);
});
