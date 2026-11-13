// العامل الخلفي للحفظ وحده (P10-AC9): يقبل رسالة الحفظ من سكربت ترجمان أو صفحة الإضافة وحدهما، ويقرأ الوضع من
// التفضيلات لا من الرسالة، ويتحقق قبل أي تنزيل، ويحفظ النص UTF-8 في رابط data:، ويسجّل المعرّف. وفي Firefox (رابط blob:)
// تبقى صفحة الحدث حية من إنشاء الرابط حتى يُحسم التنزيل أو السقف (تحقق Gemini، B4).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSaveService, dataUrl, fileUrl } from '../../../src/background/save-service.js';
import { PENDING_REVOKE_MS, SETTLE } from '../../../src/core/save/index.js';
import { createStore } from '../../../src/core/store/index.js';
import { createMemoryArea } from '../../helpers/chrome-storage.js';
import { NOW } from '../../helpers/fixtures.js';

const ID = 'abcdefghijklmnopabcdefghijklmnop';
const runtime = { id: ID, getURL: (p) => `chrome-extension://${ID}/${p}`, onMessage: { listeners: new Set(), addListener(f) { this.listeners.add(f); }, removeListener(f) { this.listeners.delete(f); } } };
const fromYoutube = { id: ID, tab: { id: 3 }, url: 'https://www.youtube.com/watch?v=iG9CE55wbtY' };
const fromPage = { id: ID, url: `chrome-extension://${ID}/pages/library/index.html` };

/** عامل الخدمة في Chromium: لا URL.createObjectURL، فرابط data:. */
const WORKER_ENV = {};
function make({ mode = 'downloads', folder = 'Tarjuman', env = WORKER_ENV, downloads: given, settle = { pollMs: 1, timeoutMs: 10, wait: async () => {} } } = {}) {
  const store = createStore({ area: createMemoryArea({ unlimited: true }), now: () => Date.parse(NOW) });
  const calls = [];
  const downloads = given ?? {
    async download(o) { calls.push(o); return 12; },
    async search({ id }) { return [{ id, state: 'complete', exists: true, filename: '/x' }]; },
  };
  const svc = createSaveService({ runtime, downloads, store, settle, env });
  return { svc, store, calls, ready: store.setPrefs({ saveLocation: { mode, folder } }) };
}

// يفرّغ الوعود المعلّقة (استدعاءات search الوهمية وما بعدها) بين خطوات الساعة.
const flush = async () => {
  for (let i = 0; i < 6; i++) await new Promise((r) => setImmediate(r));
};

/** ساعة وهمية: setTimeout وclearTimeout بزمن افتراضي، وadvance تنفّذ ما حان بالترتيب، وpending ما بقي من مؤقتات. */
function fakeClock() {
  let now = 0;
  let seq = 0;
  const timers = new Map();
  return {
    get now() { return now; },
    get pending() { return timers.size; },
    setTimeout: (fn, ms = 0) => {
      timers.set(++seq, { at: now + ms, fn });
      return seq;
    },
    clearTimeout: (id) => { timers.delete(id); },
    async advance(ms) {
      const end = now + ms;
      for (;;) {
        await flush();
        let next = null;
        for (const [id, t] of timers) if (t.at <= end && (!next || t.at < next[1].at)) next = [id, t];
        if (!next) break;
        timers.delete(next[0]);
        now = next[1].at;
        next[1].fn();
      }
      now = end;
      await flush();
    },
  };
}

/** صفحة الخلفية في Firefox: URL.createObjectURL وBlob ومؤقتات الساعة. events يسجّل مؤقتات الخدمة نفسها (لا مؤقتات الانتظار). */
function firefoxEnv(clock, events = []) {
  const made = [];
  const revoked = [];
  const env = {
    Blob,
    URL: { createObjectURL: (b) => { made.push(b); return `blob:moz-extension://x/${made.length}`; }, revokeObjectURL: (u) => revoked.push(u) },
    setTimeout: (fn, ms) => { events.push({ at: clock.now, what: 'timer' }); return clock.setTimeout(fn, ms); },
    clearTimeout: clock.clearTimeout,
  };
  return { env, made, revoked, events };
}
const req = (file = { name: 'a.ar.srt', text: 'سطر عربي' }) => ({ type: 'tj:save-file', v: 1, file });

test('المرسِل: سكربت ترجمان على يوتيوب وصفحات الإضافة وحدهما؛ غيرهما بلا رد ولا تنزيل', async () => {
  const { svc, calls, ready } = make();
  await ready;
  assert.equal(svc.handle(req(), { id: 'otherextensionidotherextensionid', tab: { id: 1 }, url: 'https://www.youtube.com/' }), null);
  assert.equal(svc.handle(req(), { id: ID, tab: { id: 1 }, url: 'https://evil.example/' }), null);
  assert.equal(svc.handle(req(), { id: ID, url: 'https://www.youtube.com/' }), null, 'بلا تبويب ليس سكربت محتوى');
  assert.equal(svc.handle({ ...req(), mode: 'ask' }, fromYoutube), null, 'رسالة بحقل زائد تُتجاهل');
  assert.equal(svc.handle({ type: 'tj:get-video-state', v: 1 }, fromYoutube), null);
  assert.equal(calls.length, 0);
  assert.deepEqual(await svc.handle(req(), fromYoutube), { v: 1, ok: true, mode: 'downloads', downloadId: 12 });
  assert.deepEqual(await svc.handle(req(), fromPage), { v: 1, ok: true, mode: 'downloads', downloadId: 12 });
});

test('الوضع من التفضيلات لا من الرسالة، والنص UTF-8 في رابط data:، والمعرّف يُسجَّل', async () => {
  const { svc, calls, store, ready } = make({ mode: 'subfolder', folder: 'ترجماتي' });
  await ready;
  const r = await svc.handle(req(), fromYoutube);
  assert.deepEqual(r, { v: 1, ok: true, mode: 'subfolder', downloadId: 12 });
  assert.equal(calls[0].filename, 'ترجماتي/a.ar.srt');
  assert.equal(calls[0].saveAs, false);
  assert.equal(calls[0].conflictAction, 'uniquify');
  const [head, b64] = calls[0].url.split(',');
  assert.equal(head, 'data:application/x-subrip;charset=utf-8;base64');
  assert.equal(Buffer.from(b64, 'base64').toString('utf8'), 'سطر عربي');
  assert.equal((await store.getLastSave()).downloadId, 12);
});

test('التحقق قبل أي تنزيل: اسم مسار أو امتداد آخر أو حجم فوق حد القناة', async () => {
  const { svc, calls, ready } = make();
  await ready;
  assert.deepEqual(await svc.handle(req({ name: '../../x.srt', text: '' }), fromYoutube), { v: 1, ok: false, code: 'SV_BAD_FILE' });
  assert.deepEqual(await svc.handle(req({ name: 'x.html', text: '' }), fromYoutube), { v: 1, ok: false, code: 'SV_BAD_FILE' });
  assert.deepEqual(await svc.handle(req({ name: 'x.srt', text: 'x'.repeat(16 * 1024 * 1024 + 1) }), fromYoutube), { v: 1, ok: false, code: 'SV_TOO_LARGE' });
  assert.equal(calls.length, 0);
});

test('المستمع يرد بوعد (return true) لرسالة الحفظ وحدها', async () => {
  const { svc, ready } = make();
  await ready;
  const off = svc.install();
  const [listener] = runtime.onMessage.listeners;
  let replied;
  const done = new Promise((r) => { replied = r; });
  assert.equal(listener(req(), fromYoutube, replied), true);
  assert.deepEqual(await done, { v: 1, ok: true, mode: 'downloads', downloadId: 12 });
  assert.equal(listener({ type: 'x' }, fromYoutube, () => assert.fail('لا رد')), undefined);
  off();
  assert.equal(runtime.onMessage.listeners.size, 0);
});

test('صفحة خلفية فيها URL.createObjectURL (Firefox يرفض data: في downloads.download، جولة النشر T3): رابط blob: بالنص نفسه، ويُلغى بعد التنزيل', async () => {
  const clock = fakeClock();
  const { env, made, revoked } = firefoxEnv(clock);
  const { svc, calls, ready } = make({ mode: 'subfolder', folder: 'ترجماتي', env });
  await ready;
  assert.deepEqual(await svc.handle(req(), fromYoutube), { v: 1, ok: true, mode: 'subfolder', downloadId: 12 });
  assert.equal(calls[0].url, 'blob:moz-extension://x/1');
  assert.equal(calls[0].filename, 'ترجماتي/a.ar.srt', 'مكان الحفظ المختار كما هو');
  assert.equal(made[0].type, 'application/x-subrip;charset=utf-8');
  assert.equal(await made[0].text(), 'سطر عربي');
  assert.deepEqual(revoked, ['blob:moz-extension://x/1']);
  assert.equal(clock.pending, 0, 'اكتمل التنزيل: لا مؤقت باقٍ');
  // والعامل في Chromium بلا createObjectURL: data: كما كان.
  assert.match(fileUrl('x', 'text/plain', {}).url, /^data:text\/plain;base64,/);
});

test('dataUrl: نص عربي كبير بدفعات دون فقد', () => {
  const text = 'ترجمان '.repeat(20000);
  const b64 = dataUrl(text, 'text/plain;charset=utf-8').split(',')[1];
  assert.equal(Buffer.from(b64, 'base64').toString('utf8'), text);
});

// تحقق Gemini، B4: صفحة الحدث في Firefox تنام بعد نحو 30 ث بلا استدعاء لواجهة الإضافة، فيتلف رابط blob: (قيس في Firefox 160:
// NetworkError عند 45 ث)، واستطلاع downloads.search أبقاها حية. ومع «اسأل عن مكان الحفظ» يُعرض حوار النظام قبل أن يُنشأ التنزيل.
const IDLE_MS = 30 * 1000;
const MIN = 60 * 1000;

/**
 * تنزيلات Firefox وهمية بالساعة: download معلّق ما دام «حوار الحفظ» مفتوحًا، ثم accept(state) يصدر المعرّف، وcancel
 * وfail يرفضانه. وsearch بالمعرّف وحده يسجّل زمنه؛ وحالة كل تنزيل في states ('throw' يرفض الاستعلام).
 */
function dialogDownloads(clock, events = []) {
  const states = new Map();
  const dialogs = [];
  const searches = [];
  let next = 70;
  return {
    states,
    dialogs,
    searches,
    download(o) {
      events.push({ at: clock.now, what: 'download', url: o.url });
      return new Promise((resolve, reject) => {
        dialogs.push({
          accept(state = 'in_progress') {
            const id = next++;
            states.set(id, state);
            resolve(id);
            return id;
          },
          cancel: () => reject(new Error('Download canceled by the user')),
          fail: () => reject(new Error('Access denied')),
        });
      });
    },
    async search(q) {
      assert.deepEqual(Object.keys(q), ['id'], 'search بالمعرّف وحده');
      searches.push({ at: clock.now, id: q.id });
      const state = states.get(q.id);
      if (state === 'throw') throw new Error('synthetic search failure');
      return state ? [{ id: q.id, state, error: state === 'interrupted' ? 'FILE_FAILED' : undefined }] : [];
    },
  };
}

/** حية في [from, to]: لا فجوة بلا استدعاء لواجهة التنزيلات تبلغ مهلة الخمول. */
function assertAlive(searches, from, to, label) {
  const at = [from, ...searches.map((s) => s.at).filter((t) => t > from && t < to), to];
  const gap = Math.max(...at.slice(1).map((t, i) => t - at[i]));
  assert.ok(gap < IDLE_MS, `${label}: ${gap / 1000} ث بلا استدعاء، فتنام صفحة الحدث ويتلف رابط blob:`);
}

/** حفظ من سكربت المحتوى في صفحة خلفية Firefox، بانتظار النتيجة بالمهلة الحقيقية على الساعة الوهمية. */
async function firefoxSave({ mode = 'ask' } = {}) {
  const clock = fakeClock();
  const { env, revoked, events } = firefoxEnv(clock);
  const downloads = dialogDownloads(clock, events);
  const settle = { ...SETTLE, wait: (ms) => new Promise((r) => clock.setTimeout(r, ms)) };
  const { svc, ready } = make({ mode, env, downloads, settle });
  await ready;
  return { clock, events, revoked, downloads, save: () => svc.handle(req(), fromYoutube) };
}

/** توقف: لا استعلام بعد الآن ولو مرت ساعة، ولا مؤقت باقٍ (ومؤقت إلغاء الرابط، إن وُجد، نُفّذ). */
async function assertStopped(clock, downloads, label) {
  const count = downloads.searches.length;
  await clock.advance(60 * MIN);
  assert.equal(downloads.searches.length, count, `${label}: لا استعلام بعد التوقف`);
  assert.equal(clock.pending, 0, `${label}: لا مؤقت باقٍ`);
}

test('B4: الإبقاء يبدأ مع رابط blob: قبل downloads.download، ويستمر وحوار «حفظ باسم» مفتوح قبل إنشاء التنزيل', async () => {
  const { clock, events, revoked, downloads, save } = await firefoxSave();
  const p = save();
  await clock.advance(0);
  assert.equal(downloads.dialogs.length, 1, 'الحوار مفتوح والتنزيل لم يُنشأ');
  const timer = events.findIndex((e) => e.what === 'timer');
  assert.ok(timer !== -1 && timer < events.findIndex((e) => e.what === 'download'), 'الإبقاء يبدأ قبل downloads.download');
  await clock.advance(5 * MIN);
  assertAlive(downloads.searches, 0, clock.now, 'الحوار مفتوح خمس دقائق');
  assert.ok(downloads.searches.length <= 60, `استطلاع خفيف: ${downloads.searches.length} استعلامًا في خمس دقائق`);
  assert.ok(downloads.searches.every((s) => !downloads.states.has(s.id)), 'قبل صدور المعرّف لا يطابق الاستعلام تنزيلًا');
  assert.deepEqual(revoked, [], 'الرابط حي والحوار مفتوح');
  const id = downloads.dialogs[0].accept('complete');
  assert.deepEqual(await p, { v: 1, ok: true, mode: 'ask', downloadId: id });
  assert.deepEqual(revoked, ['blob:moz-extension://x/1']);
  await assertStopped(clock, downloads, 'اكتمل');
});

test('B4: والتنزيل «جارٍ» بعد مهلة انتظار النتيجة (pending) يستمر الإبقاء بمعرّفه وحده، ويتوقف باكتماله', async () => {
  const { clock, revoked, downloads, save } = await firefoxSave();
  const p = save();
  await clock.advance(20 * 1000);
  const id = downloads.dialogs[0].accept('in_progress');
  await clock.advance(SETTLE.timeoutMs + SETTLE.pollMs);
  assert.deepEqual(await p, { v: 1, ok: true, mode: 'ask', downloadId: id, pending: true });
  const settled = clock.now;
  await clock.advance(4 * MIN);
  assertAlive(downloads.searches, 0, clock.now, 'التنزيل جارٍ بعد مهلة الانتظار');
  assert.ok(downloads.searches.filter((s) => s.at > settled).every((s) => s.id === id), 'بعد مهلة الانتظار: بمعرّفه وحده');
  assert.ok(downloads.searches.every((s) => s.id === id || !downloads.states.has(s.id)), 'وقبلها بمعرّفه أو بمعرّف لا يطابق تنزيلًا');
  assert.deepEqual(revoked, [], 'الرابط باقٍ ما دام التنزيل جاريًا');
  downloads.states.set(id, 'complete');
  await clock.advance(15 * 1000);
  await assertStopped(clock, downloads, 'اكتمل بعد مهلة الانتظار');
  assert.deepEqual(revoked, ['blob:moz-extension://x/1']);
});

test('B4: يتوقف الإبقاء في كل مسار بلا مؤقت باقٍ: إلغاء الحوار، وخطأ downloads.download، والفشل، والانقطاع بعد pending، وغياب العنصر', async () => {
  // الحوار مفتوح 45 ث (فوق مهلة الخمول) ثم يُغلق بـclose؛ والرد وعد لا يُنتظر هنا (pending ينتظر الساعة).
  const closeAfter45s = async (close) => {
    const f = await firefoxSave();
    const reply = f.save();
    await f.clock.advance(45 * 1000);
    assertAlive(f.downloads.searches, 0, f.clock.now, 'الحوار مفتوح 45 ث');
    return { ...f, reply, id: close(f.downloads.dialogs[0]) };
  };
  for (const [label, close, code] of [
    ['إلغاء الحوار', (d) => d.cancel(), 'SV_CANCELLED'],
    ['خطأ في downloads.download', (d) => d.fail(), 'SV_FAILED'],
    ['انقطع التنزيل فور إنشائه', (d) => d.accept('interrupted'), 'SV_FAILED'],
  ]) {
    const { clock, downloads, revoked, reply } = await closeAfter45s(close);
    assert.deepEqual(await reply, { v: 1, ok: false, code }, label);
    assert.equal(clock.pending, 0, `${label}: توقف فورًا`);
    assert.deepEqual(revoked, ['blob:moz-extension://x/1'], `${label}: الرابط أُلغي فورًا`);
    await assertStopped(clock, downloads, label);
  }
  // بعد pending: انقطع (ومنه إلغاء المستخدم من لوحة التنزيلات)، أو مُحي عنصره من السجل.
  for (const [label, end] of [['انقطع بعد pending', (s, id) => s.set(id, 'interrupted')], ['غاب العنصر بعد pending', (s, id) => s.delete(id)]]) {
    const { clock, downloads, revoked, reply, id } = await closeAfter45s((d) => d.accept('in_progress'));
    await clock.advance(SETTLE.timeoutMs + SETTLE.pollMs);
    assert.deepEqual(await reply, { v: 1, ok: true, mode: 'ask', downloadId: id, pending: true }, label);
    await clock.advance(MIN);
    end(downloads.states, id);
    const at = clock.now;
    await clock.advance(15 * 1000);
    assert.ok(downloads.searches.some((s) => s.at > at), `${label}: ما زال يستعلم حتى يرى الحسم`);
    await assertStopped(clock, downloads, label);
    assert.deepEqual(revoked, ['blob:moz-extension://x/1'], label);
  }
});

test('B4: بسقف عشر دقائق من إنشاء الرابط: حوار لا يُغلق، أو تنزيل يبقى «جاريًا»، أو استعلام يتعذّر؛ ثم يتوقف', async () => {
  {
    const { clock, downloads, save } = await firefoxSave();
    save();
    await clock.advance(PENDING_REVOKE_MS - 10 * 1000);
    assertAlive(downloads.searches, 0, clock.now, 'حوار لا يُغلق، قبل السقف');
    await clock.advance(60 * MIN);
    assert.ok(downloads.searches.every((s) => s.at <= PENDING_REVOKE_MS), 'لا استعلام بعد السقف');
    assert.equal(clock.pending, 0, 'حوار لا يُغلق: لا مؤقت باقٍ');
  }
  for (const [state, code] of [['in_progress', null], ['throw', 'SV_UNSETTLED']]) {
    const { clock, downloads, revoked, save } = await firefoxSave();
    const p = save();
    await clock.advance(MIN);
    const id = downloads.dialogs[0].accept(state);
    await clock.advance(SETTLE.timeoutMs + SETTLE.pollMs);
    assert.deepEqual(await p, code ? { v: 1, ok: false, code } : { v: 1, ok: true, mode: 'ask', downloadId: id, pending: true }, state);
    await clock.advance(PENDING_REVOKE_MS - 10 * 1000 - clock.now);
    assertAlive(downloads.searches, 0, clock.now, `${state}: قبل السقف`);
    await clock.advance(10 * 1000);
    await assertStopped(clock, downloads, state);
    assert.ok(downloads.searches.every((s) => s.at <= PENDING_REVOKE_MS), `${state}: لا استعلام بعد السقف`);
    assert.deepEqual(revoked, ['blob:moz-extension://x/1'], `${state}: أُلغي الرابط بمؤقته كما كان`);
  }
});

test('B4: حفظان متزامنان: انتهاء أحدهما لا يوقف إبقاء الآخر، ولكل رابط إلغاؤه', async () => {
  const { clock, downloads, revoked, save } = await firefoxSave();
  const a = save();
  await clock.advance(5 * 1000);
  const b = save();
  await clock.advance(20 * 1000);
  assert.equal(downloads.dialogs.length, 2, 'حواران مفتوحان');
  downloads.dialogs[0].accept('complete');
  assert.equal((await a).ok, true);
  assert.deepEqual(revoked, ['blob:moz-extension://x/1'], 'رابط الأول وحده');
  const aDone = clock.now;
  await clock.advance(3 * MIN);
  assertAlive(downloads.searches, aDone, clock.now, 'الثاني والحوار مفتوح بعد انتهاء الأول');
  downloads.dialogs[1].cancel();
  assert.deepEqual(await b, { v: 1, ok: false, code: 'SV_CANCELLED' });
  assert.deepEqual(revoked, ['blob:moz-extension://x/1', 'blob:moz-extension://x/2']);
  await assertStopped(clock, downloads, 'الحفظان');
});

test('B4: عامل Chromium (رابط data:) بلا إبقاء كما كان: لا مؤقت ولا استعلام والحوار مفتوح', async () => {
  const clock = fakeClock();
  const events = [];
  const downloads = dialogDownloads(clock, events);
  const env = { setTimeout: (fn, ms) => { events.push({ what: 'timer' }); return clock.setTimeout(fn, ms); }, clearTimeout: clock.clearTimeout };
  const { svc, ready } = make({ mode: 'ask', env, downloads, settle: { ...SETTLE, wait: (ms) => new Promise((r) => clock.setTimeout(r, ms)) } });
  await ready;
  const p = svc.handle(req(), fromYoutube);
  await clock.advance(MIN);
  assert.match(events.find((e) => e.what === 'download').url, /^data:/);
  assert.equal(downloads.searches.length, 0);
  assert.equal(clock.pending, 0);
  const id = downloads.dialogs[0].accept('complete');
  assert.deepEqual(await p, { v: 1, ok: true, mode: 'ask', downloadId: id });
  assert.equal(events.filter((e) => e.what === 'timer').length, 0, 'لا مؤقت للخدمة');
});
