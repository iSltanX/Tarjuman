// الكاتب الواحد (عقد storage §١٢ وmessages §٨؛ تدقيق 7a66f91، C2، قرار سلطان Q15): الاختبارات الإلزامية في Q15 بالناقل الحقيقي
// والعامل الوهمي (test/helpers/store-env.js): توقف العامل قبل الكتابة وبعدها ثم الإعادة بعد إيقاظه، و«مسح كل البيانات» مع
// كتابة معلّقة، وكتابتان من سياقين على النسخة نفسها؛ ثم تحقق الكاتب من الطلب، وفحص المرسِل في خدمة العامل، وقاعدة الفحص الثابت.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cp, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createStore, createWriter, messageTransport, versionOf } from '../../../src/core/store/index.js';
import { createController } from '../../../src/content/controller.js';
import { saveSlot } from '../../../src/pages/editor/persist.js';
import { CONTENT_SCRIPT_OPS, createStoreService } from '../../../src/background/store-service.js';
import { storeRequest } from '../../../src/core/model/messages.js';
import { createMemoryArea } from '../../helpers/chrome-storage.js';
import { videoRecord } from '../../helpers/fixtures.js';
import { sampleBundle, seedBundle } from '../../helpers/fixtures-v2.js';
import { draftOf } from '../../../src/core/model/draft.js';
import { storeEnv } from '../../helpers/store-env.js';
import { settled, turns } from '../../helpers/store-race.js';

const ID = 'AAAAAAAAAAA';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

async function seeded() {
  const env = storeEnv();
  const seedStore = env.context();
  await seedBundle(seedStore, sampleBundle({ videoId: ID, third: true }));
  await env.area.flush();
  return env;
}

async function player(store) {
  const c = createController({ store, page: {}, extractor: null });
  await c.start(ID);
  return c;
}

const keysOf = (area) => Object.keys(area.dump()).filter((k) => k.endsWith(ID)).sort();
const readable = (area) => createStore({ area }).getBundle(ID).then((b) => ({ ok: true, b }), (e) => ({ ok: false, code: e.code }));

// ── توقف العامل وإعادة المحاولة (Q15) ──────────────────────────────────────

test('Q15: العامل يتوقف بعد set وقبل الرد — الإعادة بعد إيقاظه تُطبّق ± مرة واحدة بالضبط، ولا تلف', async () => {
  const env = await seeded();
  const c = await player(env.context());
  const step = c.getState().settings.offsetStepMs;
  env.sent.length = 0;
  env.restartAfter('put');
  await c.nudgeOffset(1);
  assert.equal(c.getState().error, null, 'المستخدم لا يرى خطأ');
  const r = await readable(env.area);
  assert.ok(r.ok, r.code);
  assert.equal(r.b.slots[0].offsetMs, 500 + step, 'ضغطة واحدة لا اثنتان');
  assert.equal(env.sent.filter((x) => x.op === 'put').length, 2, 'أُرسل الطلب مرتين بمعرّف واحد');
  assert.equal(new Set(env.sent.filter((x) => x.op === 'put').map((x) => x.wid)).size, 1);
});

test('Q15: الرد يضيع والعامل حي — الإعادة تأخذ الرد المحفوظ ولا تكتب مرتين', async () => {
  const env = await seeded();
  const c = await player(env.context());
  const step = c.getState().settings.offsetStepMs;
  const before = (await readable(env.area)).b.record.rev;
  env.dropReply('put');
  await c.nudgeOffset(1);
  const r = await readable(env.area);
  assert.equal(r.b.slots[0].offsetMs, 500 + step);
  assert.equal(r.b.record.rev, before + 1, 'كتابة واحدة');
});

test('Q15: القناة تفشل قبل الوصول (عامل لم يبدأ) — الإعادة تكتب مرة واحدة', async () => {
  const env = await seeded();
  const s = env.context();
  env.failBefore('put');
  const next = await s.updateBundle(ID, (b) => ({ ...b, slots: b.slots.map((x) => (x.n === 2 ? { ...x, name: 'بعد الإيقاظ' } : x)) }));
  assert.equal(next.slots[1].name, 'بعد الإيقاظ');
  assert.equal((await readable(env.area)).b.slots[1].name, 'بعد الإيقاظ');
});

test('Q15: العامل لا يستجيب بعد كل الإعادات — ST_WRITE_FAILED ظاهرًا، ولا كتابة مباشرة بديلة (D2)', async () => {
  const env = await seeded();
  const s = env.context();
  const before = env.area.dump();
  env.sent.length = 0;
  env.down(4);
  await assert.rejects(s.setPrefs({ ui: { panelOpen: true } }), { code: 'ST_WRITE_FAILED' });
  assert.deepEqual(env.area.dump(), before, 'لا شيء كُتب');
  assert.equal(env.sent.filter((x) => x.op === 'prefs').length, 4, 'محاولة ثم ثلاث إعادات');
});

test('Q15: توقف العامل في منتصف استعادة كبيرة ثم إعادة تشغيله — كل فيديو كامل أو غائب', async () => {
  const src = createStore({ area: createMemoryArea({ unlimited: true }) });
  const { createBackup } = await import('../../../src/core/backup/create.js');
  const { readBackup } = await import('../../../src/core/backup/read.js');
  const { planRestore, restoreItems, runRestore } = await import('../../../src/core/backup/restore.js');
  const ids = ['AAAAAAAAAAA', 'BBBBBBBBBBB', 'CCCCCCCCCCC', 'DDDDDDDDDDD'];
  for (const id of ids) await seedBundle(src, sampleBundle({ videoId: id, third: true }));
  const read = await readBackup((await createBackup({ store: src, appVersion: '1.1.0' })).text);
  const env = storeEnv();
  const target = env.context();
  env.restartAfter('put');
  env.failBefore('put');
  const report = await runRestore({ store: target, items: restoreItems(planRestore(read, []), new Set()).items, pause: async () => {} });
  assert.deepEqual(report.added.sort(), ids, `أضيف الكل: ${JSON.stringify(report)}`);
  for (const id of ids) {
    const b = await createStore({ area: env.area }).getBundle(id);
    assert.equal(b.slots.filter((x) => x.track).length, 3, `${id} كامل`);
    assert.ok(b.previous, `${id} بسابقته`);
  }
});

// ── «مسح كل البيانات» مع كتابة معلّقة (Q15، N22) ─────────────────────────

test('Q15: ± حُسبت قبل المسح ووصلت الكاتب بعده — لا تعيد الفيديو، ولا يبقى غير meta', async () => {
  const env = await seeded();
  const c = await player(env.context());
  const settings = env.context();
  const held = env.hold('put');
  const nudge = settled(c.nudgeOffset(1));
  await held.reached;
  await settings.clearAll();
  held.release();
  const r = await nudge;
  assert.ok(r.ok, `الضغطة لا ترمي: ${r.code}`);
  await env.area.flush();
  assert.deepEqual(keysOf(env.area), [], 'لا مفتاح للفيديو');
  assert.deepEqual(Object.keys(env.area.dump()), ['meta']);
});

test('Q15: حفظ المحرّر معلّق ثم «مسح كل البيانات» — يُرفض الحفظ صراحة ولا يعود شيء', async () => {
  const env = await seeded();
  const editor = env.context();
  const settings = env.context();
  const opened = await editor.getBundle(ID);
  const cues = structuredClone(opened.slots[0].track.current);
  cues[0].text = 'بعد المسح';
  const held = env.hold('put');
  const save = settled(saveSlot(editor, ID, opened, 1, { cues, offsetChanged: false, offsetMs: 0 }, { now: env.now }));
  await held.reached;
  await settings.clearAll();
  held.release();
  const r = await save;
  assert.equal(r.code, 'ST_CONFLICT');
  assert.deepEqual(keysOf(env.area), []);
});

test('Q15: «مسح كل البيانات» ينتظر كتابة وصلت الكاتب قبله، ثم يمسحها', async () => {
  const env = await seeded();
  const s = env.context();
  const settings = env.context();
  let writing;
  const area = env.area;
  const set = area.set;
  area.set = async (items) => {
    if (items[`video:${ID}`]) {
      area.set = set;
      writing = settings.clearAll();
      await turns(10);
    }
    return set(items);
  };
  await s.updateBundle(ID, (b) => ({ ...b, slots: b.slots.map((x) => (x.n === 2 ? { ...x, name: 'قبل المسح' } : x)) }));
  await writing;
  await area.flush();
  assert.deepEqual(Object.keys(area.dump()), ['meta']);
});

test('المسح: تعذّر قراءة التفضيلات يرفضه بـST_READ_FAILED ولا يمحو شيئًا، فلا يعود إطفاء الصور إلى افتراضه بصمت', async () => {
  const area = createMemoryArea({ unlimited: true });
  const s = createStore({ area });
  await s.setPrefs({ ui: { thumbnails: false } });
  await s.updateVideo(ID, () => videoRecord({ videoId: ID }));
  const before = area.dump();
  area.failNext('get');
  await assert.rejects(s.clearAll(), { code: 'ST_READ_FAILED' });
  assert.deepEqual(area.dump(), before);
  await s.clearAll();
  assert.equal((await s.getPrefs()).ui.thumbnails, false, 'والمسح الناجح يبقي الإطفاء');
});

// ── سياقان على النسخة نفسها عبر العامل ──────────────────────────────────────

test('Q15: حفظان من محرّرين على النسخة نفسها، والثاني يصل الكاتب بعد الأول — ST_CONFLICT للثاني', async () => {
  const env = await seeded();
  const a = env.context();
  const b = env.context();
  const openedA = await a.getBundle(ID);
  const openedB = await b.getBundle(ID);
  const edit = (o, text) => o.slots[0].track.current.map((x, i) => (i === 0 ? { ...x, text } : x));
  const held = env.hold('put');
  const first = settled(saveSlot(a, ID, openedA, 1, { cues: edit(openedA, 'A'), offsetChanged: false, offsetMs: 0 }, { now: env.now }));
  await held.reached;
  const second = await settled(saveSlot(b, ID, openedB, 1, { cues: edit(openedB, 'B'), offsetChanged: false, offsetMs: 0 }, { now: env.now }));
  held.release();
  const r1 = await first;
  assert.ok(second.ok, 'الثاني وصل أولًا فنجح');
  assert.equal(r1.code, 'ST_CONFLICT', 'والأول المعلّق رُفض');
  assert.equal((await readable(env.area)).b.slots[0].track.current[0].text, 'B');
});

// ── تحقق الكاتب من الطلب ───────────────────────────────────────────────────

test('الكاتب: مفاتيح فيديو آخر، وقيمة لا تجتاز مدققها، ومُلخّص لا يطابق السجل — MD_INVALID ولا كتابة', async () => {
  const area = createMemoryArea({ unlimited: true });
  const writer = createWriter({ area });
  const rec = videoRecord({ videoId: ID });
  const { summarizeVideo } = await import('../../../src/core/model/video.js');
  const index = summarizeVideo(rec);
  const send = (items) => writer.handle(storeRequest('put', { videoId: ID, base: 'none', items }, 'wid-test-0001-' + Math.random()));
  const r1 = await send({ [`video:${ID}`]: rec, [`index:${ID}`]: index, 'video:BBBBBBBBBBB': rec });
  assert.equal(r1.code, 'MD_INVALID');
  const r2 = await send({ [`video:${ID}`]: { ...rec, rev: 'x' }, [`index:${ID}`]: index });
  assert.equal(r2.code, 'MD_INVALID');
  const r3 = await send({ [`video:${ID}`]: rec, [`index:${ID}`]: { ...index, rev: rec.rev + 1 } });
  assert.equal(r3.code, 'MD_INVALID');
  const r4 = await send({ [`video:${ID}`]: rec, [`index:${ID}`]: index, [`marks:${ID}`]: { broken: true } });
  assert.equal(r4.code, 'MD_INVALID');
  assert.deepEqual(area.dump(), {}, 'لا كتابة');
  const ok = await send({ [`video:${ID}`]: rec, [`index:${ID}`]: index });
  assert.equal(ok.ok, true);
});

test('الكاتب: مُلخّص فاسد أو مفقود لا يرفض كتابة صحيحة (المقارنة بالسجل نفسه)', async () => {
  const area = createMemoryArea({ unlimited: true });
  const s = createStore({ area });
  await s.updateVideo(ID, () => videoRecord({ videoId: ID }));
  area.rawSet(`index:${ID}`, { broken: true });
  const next = await s.updateVideo(ID, (r) => ({ ...r, title: 'بعد فساد المُلخّص' }));
  assert.equal(next.title, 'بعد فساد المُلخّص');
  await area.remove([`index:${ID}`]);
  const again = await s.updateVideo(ID, (r) => ({ ...r, title: 'بعد فقده' }));
  assert.equal(again.title, 'بعد فقده');
  assert.equal(versionOf(area.dump()[`index:${ID}`]), versionOf(again), 'المُلخّص يعود مطابقًا');
});

test('الكاتب: طلبان بالمعرّف نفسه في الأثناء — يُطبَّق مرة واحدة ويأخذان الرد نفسه', async () => {
  const area = createMemoryArea({ unlimited: true });
  const writer = createWriter({ area });
  const req = storeRequest('prefs', { term: { source: 'alpha', target: 'ألفا', note: null } }, 'wid-same-000001');
  const [x, y] = await Promise.all([writer.handle(req), writer.handle(structuredClone(req))]);
  assert.deepEqual(x, y);
  assert.equal(x.value.added, true);
  const again = await writer.handle(structuredClone(req));
  assert.equal(again.value.added, true, 'الرد المحفوظ لا «مكرر»');
  assert.equal(area.dump().prefs.glossary.terms.length, 1);
});

test('الكاتب: حذف بنسخة أو ببصمة قديمتين يُرفض، والفيديو المحذوف أصلًا نجاح', async () => {
  const area = createMemoryArea({ unlimited: true });
  const s = createStore({ area });
  const shown = await s.updateVideo(ID, () => videoRecord({ videoId: ID }));
  const print = await s.rawPrint(ID);
  await s.updateVideo(ID, (r) => ({ ...r, title: 'تغيّر' }));
  await assert.rejects(s.deleteVideo(ID, { expect: shown }), { code: 'ST_CONFLICT' });
  await assert.rejects(s.deleteVideo(ID, { print }), { code: 'ST_CONFLICT' });
  assert.ok(await s.getVideo(ID), 'لم يُحذف');
  await s.deleteVideo(ID, { print: await s.rawPrint(ID) });
  assert.deepEqual(keysOf(area), []);
  await s.deleteVideo(ID, { expect: shown });
});

// ── الناقل وخدمة العامل ─────────────────────────────────────────────────────

test('الناقل: رسالة أكبر من حد القناة تُرفض بـST_WRITE_FAILED دون إعادة', async () => {
  let calls = 0;
  const t = messageTransport({ sendMessage: () => { calls++; throw new Error('Message length exceeded maximum allowed length.'); } }, { sleep: () => Promise.resolve() });
  const r = await t.send(storeRequest('prefs', { patch: {} }, 'wid-large-00001'));
  assert.equal(r.code, 'ST_WRITE_FAILED');
  assert.equal(calls, 1);
});

test('خدمة العامل: tj:store من سكربت ترجمان على يوتيوب أو صفحة الإضافة وحدهما', async () => {
  const runtime = { id: 'ext', getURL: (p) => `chrome-extension://ext/${p}`, onMessage: { addListener() {}, removeListener() {} } };
  const svc = createStoreService({ runtime, writer: createWriter({ area: createMemoryArea() }) });
  const req = storeRequest('prefs', { patch: { ui: { panelOpen: true } } }, 'wid-sender-0001');
  assert.equal(svc.handle(req, { id: 'other', url: 'chrome-extension://other/x.html' }), null, 'إضافة أخرى');
  assert.equal(svc.handle(req, { id: 'ext', url: 'https://evil.example/', tab: {} }), null, 'موقع آخر');
  assert.equal(svc.handle({ ...req, op: 'eval' }, { id: 'ext', url: 'chrome-extension://ext/pages/settings/index.html' }), null, 'عملية غير معروفة');
  assert.equal((await svc.handle(req, { id: 'ext', url: 'chrome-extension://ext/pages/settings/index.html' })).ok, true);
  assert.equal((await svc.handle({ ...req, wid: 'wid-sender-0002' }, { id: 'ext', url: 'https://www.youtube.com/watch?v=x', tab: { id: 1 } })).ok, true);
});

// ── قوائم المصطلحات لكل زوج (الفكرة ٨، storage §١٥) ─────────────────────────

test('الفكرة ٨: عملية glossaries لصفحات الإضافة وحدها، وسكربت يوتيوب يُرفض فيها بالشكل المعتاد ولا يُكتب شيء', async () => {
  const runtime = { id: 'ext', getURL: (p) => `chrome-extension://ext/${p}`, onMessage: { addListener() {}, removeListener() {} } };
  const area = createMemoryArea();
  const svc = createStoreService({ runtime, writer: createWriter({ area }) });
  assert.equal(CONTENT_SCRIPT_OPS.includes('glossaries'), false);
  const youtube = { id: 'ext', url: 'https://www.youtube.com/watch?v=x', tab: { id: 1 } };
  for (const [i, args] of [{ add: { from: 'en', to: 'ar' } }, { value: { schema: 1, lists: [] } }].entries()) {
    assert.deepEqual(await svc.handle(storeRequest('glossaries', args, `wid-gloss-yt-${i}`), youtube), { v: 1, ok: false, code: 'TJ_BAD_MESSAGE', detail: null });
  }
  assert.equal(area.dump().glossaries, undefined, 'لم يُكتب شيء من سكربت المحتوى');
  const r = await svc.handle(storeRequest('glossaries', { add: { from: 'en', to: 'ar' } }, 'wid-gloss-page-1'), { id: 'ext', url: 'chrome-extension://ext/pages/settings/index.html' });
  assert.equal(r.ok, true);
  assert.deepEqual(area.dump().glossaries, { schema: 1, lists: [{ from: 'en', to: 'ar', terms: [] }] });
});

test('الفكرة ٨: تعديلات القوائم من صفحتين على أحدث قيمة في الكاتب لا يُسقط بعضها بعضًا، وonChange يحملها، و«مسح كل البيانات» يزيلها', async () => {
  const env = storeEnv();
  const a = env.context();
  const b = env.context();
  const seen = [];
  const off = b.onChange((c) => { if (c.glossaries) seen.push(c.glossaries.newValue); });
  const EN_AR = { from: 'en', to: 'ar' };
  assert.equal((await a.addGlossaryList(EN_AR)).added, true);
  assert.equal((await b.addGlossaryList({ from: 'EN', to: 'ar' })).reason, 'duplicate', 'القائمة نفسها بصيغة أخرى');
  // صفحتان تضيفان معًا: كلٌّ على أحدث قيمة عند الكاتب، فلا يمحو أحدهما ما أضافه الآخر.
  const [x, y] = await Promise.all([a.addListTerm(EN_AR, { source: 'prompt', target: 'موجِّه', note: null }), b.addListTerm(EN_AR, { source: 'token', target: 'رمز', note: null })]);
  assert.equal(x.added && y.added, true);
  assert.deepEqual((await a.getGlossaries()).lists[0].terms.map((t) => t.source).sort(), ['prompt', 'token']);
  assert.equal((await b.addListTerm(EN_AR, { source: 'PROMPT', target: 'x', note: null })).reason, 'duplicate');
  assert.equal((await a.removeListTerm(EN_AR, 'Token')).removed, true);
  await assert.rejects(a.addListTerm({ from: 'en', to: 'en' }, { source: 'q', target: 'ق', note: null }), (e) => e.code === 'MD_INVALID');
  await assert.rejects(a.setGlossaries({ schema: 1, lists: [{ from: 'en', to: 'ar', terms: [], extra: 1 }] }), (e) => e.code === 'MD_INVALID');
  await env.area.flush();
  assert.ok(seen.length >= 3, 'التغيير يصل الصفحة الأخرى');
  assert.deepEqual(seen.at(-1).lists[0].terms.map((t) => t.source), ['prompt']);
  // التفضيلات والقاموس العام لا تمسهما القوائم.
  assert.equal(env.area.dump().prefs, undefined);
  await a.clearAll();
  assert.equal(env.area.dump().glossaries, undefined, '«مسح كل البيانات» يزيل المفتاح');
  assert.deepEqual(await a.getGlossaries(), { schema: 1, lists: [] });
  off();
});

// ── مسودة المحرّر (الفكرة ٩، ح-48، storage §١٦) ───────────────────────────

/** مسودة على الخانة n من الحزمة المحفوظة، بآخر حفظ at. */
async function draftFor(store, id, n = 1, at = '2026-11-05T10:00:00.000Z') {
  const slot = (await store.getBundle(id)).slots[n - 1];
  return draftOf({ cues: (slot.track.current ?? slot.track.original).map((c, i) => (i === 0 ? { ...c, text: `مسودة ${at}` } : c)), offsetMs: slot.offsetMs, committedMs: 0 }, slot, at);
}

test('الفكرة ٩: عملية draft لصفحات الإضافة وحدها، وسكربت يوتيوب يُرفض فيها بالشكل المعتاد ولا يُكتب شيء', async () => {
  const runtime = { id: 'ext', getURL: (p) => `chrome-extension://ext/${p}`, onMessage: { addListener() {}, removeListener() {} } };
  const area = createMemoryArea({ unlimited: true });
  const s = createStore({ area });
  await seedBundle(s, sampleBundle({ videoId: ID }));
  const draft = await draftFor(s, ID);
  const svc = createStoreService({ runtime, writer: createWriter({ area }) });
  assert.equal(CONTENT_SCRIPT_OPS.includes('draft'), false);
  const youtube = { id: 'ext', url: 'https://www.youtube.com/watch?v=x', tab: { id: 1 } };
  assert.deepEqual(await svc.handle(storeRequest('draft', { videoId: ID, slot: 1, draft }, 'wid-draft-yt-01'), youtube), { v: 1, ok: false, code: 'TJ_BAD_MESSAGE', detail: null });
  assert.equal(area.dump()[`draft:${ID}`], undefined, 'لم يُكتب شيء من سكربت المحتوى');
  const page = { id: 'ext', url: 'chrome-extension://ext/pages/editor/index.html' };
  assert.deepEqual(await svc.handle(storeRequest('draft', { videoId: ID, slot: 1, draft }, 'wid-draft-pg-01'), page), { v: 1, ok: true, value: { stored: true } });
  assert.deepEqual(area.dump()[`draft:${ID}`].slots[0], draft);
  // orphan في CONTENT_SCRIPT_OPS أصلًا، ويمسح المسودة مع التوابع حين لا سجل (مقبول، التحقق D).
  assert.equal(CONTENT_SCRIPT_OPS.includes('orphan'), true);
});

test('الفكرة ٩: المسودة في طابور الفيديو: مسودة حُسبت قبل الحذف ووصلت الكاتب بعده تُرفض ST_NO_RECORD ولا تعيد مفتاحًا، والتي سبقته يزيلها', async () => {
  const env = await seeded();
  const editor = env.context();
  const library = env.context();
  const draft = await draftFor(editor, ID);
  const gate = env.hold('draft');
  const late = editor.setDraft(ID, 1, draft).then(() => 'ok', (e) => e.code);
  await gate.reached;
  await library.deleteVideo(ID);
  gate.release();
  assert.equal(await late, 'ST_NO_RECORD');
  assert.deepEqual(keysOf(env.area), [], 'لا مسودة لفيديو محذوف');
  // والعكس: مسودة كُتبت ثم حذف الفيديو يزيلها في كتابته نفسها.
  const env2 = await seeded();
  const s = env2.context();
  await s.setDraft(ID, 1, await draftFor(s, ID));
  assert.ok(env2.area.dump()[`draft:${ID}`]);
  await s.updateBundle(ID, () => null);
  assert.deepEqual(keysOf(env2.area), []);
});

test('الفكرة ٩: إعادة إرسال المسودة نفسها بعد توقف العامل لا تكتب مرتين، والحذف المكرر نجاح', async () => {
  const env = await seeded();
  const s = env.context();
  const draft = await draftFor(s, ID);
  env.restartAfter('draft');
  assert.deepEqual(await s.setDraft(ID, 1, draft), { stored: true });
  assert.equal(env.sent.filter((x) => x.op === 'draft').length, 2, 'أُرسل الطلب مرتين بمعرّف واحد');
  assert.deepEqual(env.area.dump()[`draft:${ID}`].slots, [draft, null, null]);
  assert.equal(await s.clearDraft(ID, 1), true);
  assert.equal(env.area.dump()[`draft:${ID}`], undefined);
  assert.deepEqual(await createWriter({ area: env.area }).handle(storeRequest('draft', { videoId: ID, slot: 1, draft: null }, 'wid-draft-again1')), { v: 1, ok: true, value: { stored: false } });
});

test('الفكرة ٩: سقف خمس مسودات: إنشاء السادسة يطرد أقدمها بآخر حفظ فيها، وتحديث مسودة قائمة لا يطرد شيئًا', async () => {
  const area = createMemoryArea({ unlimited: true });
  const s = createStore({ area });
  const ids = ['AAAAAAAAAA1', 'AAAAAAAAAA2', 'AAAAAAAAAA3', 'AAAAAAAAAA4', 'AAAAAAAAAA5', 'AAAAAAAAAA6'];
  for (const id of ids) await seedBundle(s, sampleBundle({ videoId: id }));
  // آخر حفظ لكل مسودة: الثانية أقدمها، والأولى تُحدَّث لاحقًا فتصير أحدث.
  const at = (m) => `2026-11-05T10:0${m}:00.000Z`;
  const order = { AAAAAAAAAA1: 0, AAAAAAAAAA2: 1, AAAAAAAAAA3: 2, AAAAAAAAAA4: 3, AAAAAAAAAA5: 4 };
  for (const id of ids.slice(0, 5)) await s.setDraft(id, 1, await draftFor(s, id, 1, at(order[id])));
  await s.setDraft('AAAAAAAAAA1', 2, await draftFor(s, 'AAAAAAAAAA1', 2, at(8)));
  const drafts = () => Object.keys(area.dump()).filter((k) => k.startsWith('draft:')).sort();
  assert.equal(drafts().length, 5, 'خانة ثانية لفيديو له مسودة لا تطرد شيئًا');
  await s.setDraft('AAAAAAAAAA6', 1, await draftFor(s, 'AAAAAAAAAA6', 1, at(9)));
  assert.deepEqual(drafts(), ['draft:AAAAAAAAAA1', 'draft:AAAAAAAAAA3', 'draft:AAAAAAAAAA4', 'draft:AAAAAAAAAA5', 'draft:AAAAAAAAAA6'], 'طُردت الثانية (أقدم آخر حفظ)');
  assert.ok(area.dump()['video:AAAAAAAAAA2'], 'الطرد للمسودة وحدها: الفيديو باقٍ');
});

test('الفكرة ٩: الطرد يعيد القراءة داخل طابور الفيديو المطرود: مسودة كُتبت له بعد الحصر تبقى', async () => {
  const area = createMemoryArea({ unlimited: true });
  const ids = ['AAAAAAAAAA1', 'AAAAAAAAAA2', 'AAAAAAAAAA3', 'AAAAAAAAAA4', 'AAAAAAAAAA5', 'AAAAAAAAAA6'];
  const s = createStore({ area });
  for (const id of ids) await seedBundle(s, sampleBundle({ videoId: id }));
  for (const [i, id] of ids.slice(0, 5).entries()) await s.setDraft(id, 1, await draftFor(s, id, 1, `2026-11-05T10:0${i}:00.000Z`));
  const fresh = await draftFor(s, 'AAAAAAAAAA1', 1, '2026-11-05T11:00:00.000Z');
  // كاتب على المساحة نفسها يُحقن فيه أن تُقرأ المسودات للترتيب ثم تُكتب مسودة جديدة لأقدمها قبل طرده (كتابة من طابوره).
  let injected = false;
  const get = async (keys) => {
    const out = await area.get(keys);
    if (!injected && Array.isArray(keys) && keys.length > 1 && keys.every((k) => k.startsWith('draft:'))) {
      injected = true;
      await area.set({ 'draft:AAAAAAAAAA1': { schema: 1, videoId: 'AAAAAAAAAA1', slots: [fresh, null, null] } });
    }
    return out;
  };
  const writer = createWriter({ area: { ...area, get } });
  const sixth = await draftFor(s, 'AAAAAAAAAA6', 1, '2026-11-05T10:09:00.000Z');
  assert.equal((await writer.handle(storeRequest('draft', { videoId: 'AAAAAAAAAA6', slot: 1, draft: sixth }, 'wid-draft-race01'))).ok, true);
  assert.equal(injected, true);
  assert.deepEqual(area.dump()['draft:AAAAAAAAAA1'].slots[0], fresh, 'كُتبت بعد الترتيب فلم تُطرد');
  assert.equal(Object.keys(area.dump()).filter((k) => k.startsWith('draft:')).length, 6, 'فوق الحد مؤقتًا حتى الإنشاء التالي، ولا فقد');
});

// ── الفحص الثابت ───────────────────────────────────────────────────────────

test('الفحص الثابت: set وremove وclear على المساحة خارج writer.js وmigrate.js مخالفة', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'tj-static-writer-'));
  try {
    await cp(path.join(ROOT, 'src'), dir, { recursive: true, filter: (p) => !p.includes(`${path.sep}fonts${path.sep}`) });
    await writeFile(path.join(dir, 'core', 'store', 'evil.js'), 'export const x = (area) => area.set({ a: 1 });\nexport const y = (area) => area.clear();\n');
    const r = spawnSync(process.execPath, [path.join(ROOT, 'scripts/check-static.mjs'), '--src', dir], { encoding: 'utf8' });
    assert.equal(r.status, 1);
    assert.match(r.stderr, /core\/store\/evil\.js:1: الكتابة في التخزين عبر الكاتب الواحد وحده/);
    assert.match(r.stderr, /core\/store\/evil\.js:2: الكتابة في التخزين عبر الكاتب الواحد وحده/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
