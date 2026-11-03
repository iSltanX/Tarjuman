// تكامل النسخة الاحتياطية والمحفوظات (P13-AC2/AC4، ونقاط الربط في بوابة W7) على محاكاة التخزين: ما كتبه المتحكم (المشغّل)
// من ترجمات وعلامات وتفضيلات تشمله النسخة، وتُستعاد في «متصفح آخر» (مساحة أخرى) فتراه المحفوظات والمتحكم كما كان؛
// والإلغاء في حوار الرفع وفي معاينة الاستعادة لا يغيّر بصمة التخزين؛ والتفعيل من المحفوظات ينعكس في المتحكم.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createController } from '../../../src/content/controller.js';
import { createBackup, planRestore, readBackup, restoreItems, runRestore } from '../../../src/core/backup/index.js';
import { writeSrt } from '../../../src/core/srt/writer.js';
import { createStore } from '../../../src/core/store/index.js';
import { createLibrary } from '../../../src/pages/library/view.js';
import { createSettings } from '../../../src/pages/settings/view.js';
import { createMemoryArea } from '../../helpers/chrome-storage.js';
import { NOW, fakeExtractor, makeCues } from '../../helpers/fixtures.js';
import { samplePrefs } from '../../helpers/fixtures-v2.js';
import { buttonNamed, findAll, newDocument, settle, textOf } from '../../unit/pages/library/fake-dom.js';

const A = 'AAAAAAAAAAA';
const B = 'BBBBBBBBBBB';
const EN = makeCues(5, { text: (i) => `line ${i}` });
const noPause = () => Promise.resolve();
const clock = (start = Date.parse(NOW)) => {
  let t = start;
  return () => (t += 1000);
};
/** بصمة التخزين: SHA-256 لكل المفاتيح بقيمها مرتبة. */
const fingerprintOf = async (area) => {
  await area.flush();
  const dump = area.dump();
  return createHash('sha256').update(JSON.stringify(Object.keys(dump).sort().map((k) => [k, dump[k]]))).digest('hex');
};

/** «المشغّل» على مساحة: متحكم بمستخرج وهمي، يكتب كما يكتب في صفحة يوتيوب. */
async function player(area, videoId) {
  const store = createStore({ area, now: clock() });
  const extractor = fakeExtractor({ videoId, tracks: [{ key: 'en|manual', kind: 'manual', cues: EN }] });
  const controller = createController({ store, extractor, page: { title: () => `محاضرة ${videoId}`, durationMs: () => 30000 }, now: clock() });
  store.onChange((ch) => controller.handleStoreChange(ch));
  await controller.start(videoId);
  return { store, controller };
}

const arabic = (label, n = 5) => ({ fileName: `${label}.ar.srt`, cues: makeCues(n, { text: (i) => `${label} ${i}` }), comparison: null, fingerprintId: null, notes: [] });

test('ما كتبه المشغّل (ثلاث ترجمات وعلامات وسابقة وتفضيلات) تشمله النسخة، ويُستعاد في متصفح آخر كما كان للمحفوظات والمشغّل', async () => {
  const brave = createMemoryArea({ unlimited: true });
  const p = await player(brave, A);
  await p.controller.loadArabicInto(1, arabic('أولى'));
  await p.controller.loadArabicInto(2, arabic('ثانية'));
  await p.controller.loadArabicInto(1, arabic('أولى-جديدة'), { replace: true });
  await p.controller.markCue({ index: 1 }, 'todo');
  await p.controller.updatePrefs(samplePrefs());
  const other = await player(brave, B);
  await other.controller.loadArabic(arabic('ب'));
  await brave.flush();
  const original = await p.store.getBundle(A);
  assert.equal(original.previous.from, 1, 'سابقة من استبدال المشغّل');

  const built = await createBackup({ store: createStore({ area: brave }), appVersion: '0.3.0', pause: noPause });
  assert.equal(built.counts.videos, 2);
  assert.equal(built.counts.translations, 3);
  assert.equal(built.counts.marks, 1);
  assert.equal(built.counts.previous, 1);

  // «Chrome»: مساحة أخرى، تُستعاد فيها النسخة كاملة بالإعدادات والقاموس.
  const chrome = createMemoryArea({ unlimited: true });
  const target = createStore({ area: chrome, now: clock() });
  const read = await readBackup(built.text, { pause: noPause });
  const plan = planRestore(read, []);
  const report = await runRestore({ store: target, ...restoreItems(plan, new Set()), settings: read.settings.patch, prefs: read.prefs.patch, pause: noPause });
  assert.deepEqual(report.added.sort(), [A, B]);
  const restored = await target.getBundle(A);
  assert.deepEqual({ ...restored, record: { ...restored.record, rev: 0 } }, { ...original, record: { ...original.record, rev: 0 } });

  // المشغّل في «Chrome» يرى الترجمة النشطة وعلاماتها والقاموس.
  const pc = await player(chrome, A);
  const s = pc.controller.getState();
  // الثانية رُفعت إلى خانة فارغة ففُعّلت (Q16)، واستبدال الأولى غير النشطة لا يغيّر النشطة.
  assert.equal(s.activeSlot, 2);
  assert.equal(s.arabic.fileName, 'ثانية.ar.srt');
  assert.equal(restored.slots[0].track.fileName, 'أولى-جديدة.ar.srt');
  assert.equal(s.marks.items.length, 1);
  assert.equal(s.prefs.glossary.terms.length, 3);
  assert.deepEqual(s.slots.map((x) => x.filled), [true, true, false]);

  // والمحفوظات فيها بالأعداد نفسها.
  const doc = newDocument();
  const lib = createLibrary({
    store: target, doc, now: () => Date.parse(NOW), openTab: async () => {}, openPage: async () => {},
    saveFile: async () => ({ ok: true, mode: 'downloads', downloadId: 1 }), clipboardWrite: async () => {}, pickFiles: async () => null,
    diagnosticsText: async () => '{}', confirm: async () => false, setTimer: () => 0, clearTimer: () => {},
  });
  doc.body.append(lib.root);
  await lib.load();
  const chips = findAll(lib.root, (e) => e.classList.contains('tj-chip')).map((c) => c.getAttribute('aria-label'));
  assert.deepEqual(chips, ['الكل (2)', 'بانتظار الترجمة (0)', 'مترجمة (2)', 'معدّلة (0)', 'تحذيرات آلية (0)', 'تحتاج مراجعة (1)']);
});

test('التفعيل من المحفوظات ينعكس في المشغّل المفتوح على التخزين نفسه', async () => {
  const area = createMemoryArea({ unlimited: true });
  const p = await player(area, A);
  await p.controller.loadArabicInto(1, arabic('أولى'));
  await p.controller.loadArabicInto(2, arabic('ثانية'), { activate: false });
  await area.flush();
  assert.equal(p.controller.getState().activeSlot, 1);
  const doc = newDocument();
  const lib = createLibrary({
    store: createStore({ area, now: clock(Date.parse(NOW) + 500000) }), doc, now: () => Date.parse(NOW), openTab: async () => {}, openPage: async () => {},
    saveFile: async () => ({ ok: true, mode: 'downloads', downloadId: 1 }), clipboardWrite: async () => {}, pickFiles: async () => null,
    diagnosticsText: async () => '{}', confirm: async () => false, setTimer: () => 0, clearTimer: () => {},
  });
  doc.body.append(lib.root);
  await lib.load();
  const row = lib.root.querySelector(`li[data-video="${A}"]`);
  // الهوية «بُنّ على ورق»: التفعيل من بطاقة الترجمة في الصف الموسّع (بدل محدد الخانات في الصف).
  row.querySelector('.lib-toggle').click();
  await settle(10);
  const card = row.querySelector('.lib-card[data-slot="2"]');
  [...card.querySelectorAll('button')].find((b) => b.textContent.trim() === 'تفعيل').click();
  await settle(10);
  await area.flush();
  await settle(10);
  assert.equal(p.controller.getState().activeSlot, 2, 'المشغّل تبع التخزين');
  assert.equal(p.controller.getState().arabic.fileName, 'ثانية.ar.srt');
});

test('الإلغاء لا يغيّر بصمة التخزين: حوار الرفع في المحفوظات ومعاينة الاستعادة في الإعدادات', async () => {
  const area = createMemoryArea({ unlimited: true });
  const p = await player(area, A);
  await p.controller.loadArabicInto(1, arabic('أولى'));
  const store = createStore({ area, now: clock() });
  const before = await fingerprintOf(area);

  // المحفوظات: ملف جديد، والحوار يُلغى بعد عرض الفروق.
  const doc = newDocument();
  let shown = null;
  const lib = createLibrary({
    store, doc, now: () => Date.parse(NOW), openTab: async () => {}, openPage: async () => {},
    saveFile: async () => ({ ok: true, mode: 'downloads', downloadId: 1 }), clipboardWrite: async () => {},
    pickFiles: async () => [new File([writeSrt(makeCues(5, { text: (i) => `جديد ${i}` }))], 'x.ar.srt')],
    diagnosticsText: async () => '{}', confirm: async (o) => { shown = o; return false; }, setTimer: () => 0, clearTimer: () => {},
  });
  doc.body.append(lib.root);
  await lib.load();
  const more = buttonNamed(lib.root.querySelector(`li[data-video="${A}"]`), 'المزيد');
  more.click();
  more.parentNode.querySelectorAll('[role=menuitem]').find((i) => textOf(i).startsWith('رفع ترجمة')).click();
  await settle(10);
  assert.ok(shown, 'عُرض الحوار');
  assert.equal(await fingerprintOf(area), before, 'إلغاء الرفع بلا أثر');

  // الإعدادات: نسخة من مكتبة أخرى، والمعاينة تُلغى.
  const src = createMemoryArea({ unlimited: true });
  const q = await player(src, B);
  await q.controller.loadArabic(arabic('ب'));
  const built = await createBackup({ store: createStore({ area: src }), appVersion: '0.3.0', pause: noPause });
  const sdoc = newDocument();
  const settings = createSettings({
    store, doc: sdoc, version: '0.3.0', pause: noPause, clipboardWrite: async () => {}, diagnosticsText: async () => '{}',
    saveFile: async () => ({ ok: true, mode: 'downloads', downloadId: 1 }), savedPath: async () => null,
    pickFile: async () => ({ size: built.text.length, text: async () => built.text }),
    confirm: async () => false, setTimer: () => 0, clearTimer: () => {},
  });
  sdoc.body.append(settings.root);
  await settings.load();
  await settings.data.restoreFromFile();
  assert.equal(await fingerprintOf(area), before, 'إلغاء الاستعادة بلا أثر');
});
