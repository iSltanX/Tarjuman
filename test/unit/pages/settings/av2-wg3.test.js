// التدقيق الموحد V2، WG-3 على صفحة الإعدادات الحقيقية (createSettings بـDOM وهمي فوق تخزين بمحاكاة)، بنمط c7-settings.test.js:
// U-021 وU-022 (استعادة اللغات: لا نجاح كاذب ولا رسالة مضللة) وU-023 (معاينة سجل تالف لا تطمس إصلاحًا لاحقًا).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createBackup, readBackup, planRestore, restoreItems, runRestore } from '../../../../src/core/backup/index.js';
import { TjError, messageFor } from '../../../../src/core/errors/index.js';
import { createStore } from '../../../../src/core/store/index.js';
import { videoKey } from '../../../../src/core/store/keys.js';
import { createSettings } from '../../../../src/pages/settings/view.js';
import { createMemoryArea } from '../../../helpers/chrome-storage.js';
import { NOW } from '../../../helpers/fixtures.js';
import { samplePrefs, sampleBundle, seedBundle } from '../../../helpers/fixtures-v2.js';
import { buttonNamed, findAll, newDocument, settle, textOf } from '../library/fake-dom.js';

const ID = 'AAAAAAAAAAA';
const noPause = () => Promise.resolve();
const asFile = (text) => ({ size: text.length, text: async () => text });

function newStore(area = createMemoryArea({ unlimited: true, chromiumKeyOrder: true })) {
  let t = Date.parse(NOW);
  return { area, store: createStore({ area, now: () => (t += 1000) }) };
}

async function mount({ store, area }) {
  await area.flush();
  const doc = newDocument();
  const answers = [];
  let picked = null;
  const settings = createSettings({
    store, doc, version: '2.0.0', now: () => Date.parse('2026-11-05T10:00:00.000Z'), pause: noPause,
    clipboardWrite: async () => {}, diagnosticsText: async () => '{}',
    saveFile: async () => ({ ok: true, mode: 'downloads', downloadId: 1 }), savedPath: async () => null,
    pickFile: async () => picked,
    confirm: async (o) => { const a = answers.shift(); if (typeof a === 'function') await a(o); return a !== undefined && a !== false; },
    setTimer: () => 0, clearTimer: () => {},
  });
  doc.body.append(settings.root);
  await settings.load();
  await settle(10);
  return { settings, doc, answers, root: settings.root, pick: (f) => { picked = f; } };
}
const checkbox = (root, label) => findAll(root, (e) => e.tagName === 'input' && e.getAttribute('type') === 'checkbox').find((b) => textOf(b.parentNode) === label);
const dataSec = (m) => m.root.querySelector('#data');

function faultyStore(failLang) {
  const dst = newStore();
  const calls = { settings: 0, prefs: 0, lang: 0 };
  const faulty = Object.create(dst.store);
  faulty.setSettings = (p) => { calls.settings++; return dst.store.setSettings(p); };
  faulty.setPrefs = (p) => { calls.prefs++; return dst.store.setPrefs(p); };
  faulty.setLangPrefs = (p) => { calls.lang++; return calls.lang <= failLang ? Promise.reject(new TjError('ST_WRITE_FAILED')) : dst.store.setLangPrefs(p); };
  return { ...dst, faulty, calls };
}

async function backupText() {
  const src = newStore();
  await seedBundle(src.store, sampleBundle({ videoId: ID }));
  await src.store.setSettings({ offsetStepMs: 1000 });
  await src.store.setPrefs(samplePrefs());
  await src.store.setLangPrefs({ pair: { from: 'ja', to: 'en' }, remember: false, recent: ['ja', 'fr'], video: { videoId: ID, pair: { from: 'ja', to: 'en' } } });
  return (await createBackup({ store: src.store, appVersion: '2.0.0', pause: noPause })).text;
}

async function restoreVia(m, text) {
  m.pick(asFile(text));
  m.answers.push((o) => { checkbox(o.content, 'استعادة الإعدادات والقاموس').checked = true; });
  await m.settings.data.restoreFromFile();
  await settle(15);
}

test('AV2 U-021: فشل اللغات مرتين يُبقي BK_RESTORE_PARTIAL وزر المحاولة، ونجاحها في الثالثة يعطي DONE وكتابة الإعدادات والقاموس مرة واحدة', async () => {
  const text = await backupText();
  const d = faultyStore(2);
  const m = await mount({ store: d.faulty, area: d.area });
  await restoreVia(m, text);
  assert.ok(textOf(dataSec(m)).includes(messageFor('BK_RESTORE_PARTIAL')));
  assert.ok(buttonNamed(dataSec(m), 'أعد المحاولة') !== null);
  buttonNamed(dataSec(m), 'أعد المحاولة').click();
  await settle(20);
  const second = textOf(dataSec(m));
  assert.ok(second.includes(messageFor('BK_RESTORE_PARTIAL')), 'ما زال الفشل: لا نجاح كاذب');
  assert.equal(second.includes('اكتملت الاستعادة.'), false);
  assert.ok(buttonNamed(dataSec(m), 'أعد المحاولة') !== null, 'الزر باقٍ بعد الفشل الثاني');
  assert.deepEqual((await d.store.getLangPrefs()).pair, { from: 'auto', to: 'ar' }, 'اللغات على الافتراضي فعلًا');
  buttonNamed(dataSec(m), 'أعد المحاولة').click();
  await settle(20);
  const third = textOf(dataSec(m));
  assert.ok(third.includes(messageFor('BK_RESTORE_DONE')));
  assert.ok(third.includes('استُعيدت تفضيلات اللغات.'));
  assert.equal(buttonNamed(dataSec(m), 'أعد المحاولة'), null);
  assert.deepEqual([d.calls.settings, d.calls.prefs, d.calls.lang], [1, 1, 3]);
  assert.deepEqual((await d.store.getLangPrefs()).pair, { from: 'ja', to: 'en' });
});

test('AV2 U-022: فشل اللغات وحدها يعرض رسالة اللغات لا «تعذّرت استعادة الإعدادات والقاموس»', async () => {
  const text = await backupText();
  const d = faultyStore(1);
  const m = await mount({ store: d.faulty, area: d.area });
  await restoreVia(m, text);
  const t = textOf(dataSec(m));
  assert.ok(t.includes(messageFor('BK_RESTORE_LANGS_PART_FAILED')));
  assert.equal(t.includes(messageFor('BK_RESTORE_SETTINGS_FAILED')), false);
  assert.ok(t.includes('استُعيدت الإعدادات'), 'ما استُعيد يُقال');
  assert.equal((await d.store.getSettings()).offsetStepMs, 1000);
});

test('AV2 U-023: معاينة سجل تالف بلا مُلخّص ثم إصلاحه من تبويب آخر قبل التأكيد يُبقي الإصلاح ويعرض BK_RESTORE_CHANGED', async () => {
  const mk = async (title) => {
    const s = newStore(createMemoryArea({ unlimited: true })).store;
    const b = sampleBundle({ videoId: ID });
    b.record.title = title;
    await seedBundle(s, b);
    return (await createBackup({ store: s, appVersion: '2.0.0', pause: noPause })).text;
  };
  const OLD = await mk('نسخة قديمة');
  const NEW = await mk('إصلاح أحدث من تبويب آخر');
  const area = createMemoryArea({ unlimited: true });
  let t = Date.parse(NOW);
  const storeA = createStore({ area, now: () => (t += 1000) });
  const storeB = createStore({ area, now: () => (t += 1000) });
  await storeA.listIndex();
  area.rawSet(videoKey(ID), { damaged: true });
  await area.flush();
  const m = await mount({ store: storeA, area });
  m.pick(asFile(OLD));
  m.answers.push(async (o) => {
    const box = findAll(o.content, (e) => e.tagName === 'input' && e.getAttribute('data-video') === ID)[0];
    box.checked = true;
    box.dispatchEvent({ type: 'change' });
    const read = await readBackup(asFile(NEW), { pause: noPause });
    const plan = planRestore(read, await storeB.unreadableVideos(), new Map());
    const rep = await runRestore({ store: storeB, ...restoreItems(plan, 'all'), pause: noPause });
    assert.equal(rep.replaced.length, 1);
    await area.flush();
  });
  await m.settings.data.restoreFromFile();
  await settle(20);
  assert.equal((await storeA.getVideo(ID)).title, 'إصلاح أحدث من تبويب آخر');
  assert.ok(textOf(dataSec(m)).includes(messageFor('BK_RESTORE_CHANGED', { n: 1 })));
});

test('AV2 U-023: السجل التالف الباقي تالفًا حتى التأكيد يُستبدل كما الآن', async () => {
  const s = newStore(createMemoryArea({ unlimited: true })).store;
  const b = sampleBundle({ videoId: ID });
  b.record.title = 'من النسخة';
  await seedBundle(s, b);
  const text = (await createBackup({ store: s, appVersion: '2.0.0', pause: noPause })).text;
  const area = createMemoryArea({ unlimited: true });
  const store = createStore({ area, now: () => Date.parse(NOW) });
  await store.listIndex();
  area.rawSet(videoKey(ID), { damaged: true });
  await area.flush();
  const m = await mount({ store, area });
  m.pick(asFile(text));
  m.answers.push((o) => {
    const box = findAll(o.content, (e) => e.tagName === 'input' && e.getAttribute('data-video') === ID)[0];
    box.checked = true;
    box.dispatchEvent({ type: 'change' });
  });
  await m.settings.data.restoreFromFile();
  await settle(20);
  assert.equal((await store.getVideo(ID)).title, 'من النسخة');
  assert.equal(textOf(dataSec(m)).includes(messageFor('BK_RESTORE_CHANGED', { n: 1 })), false);
});
