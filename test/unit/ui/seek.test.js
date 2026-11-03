// أداة القفز للصفحات (P10-AC5، عقد interfaces §١٤): تجد تبويب الفيديو المفتوح بسؤال التبويبات عن حالتها لا بقراءة
// عناوينها (بلا إذن tabs)، وتختار الأحدث استعمالًا عند التعدد، وتفتح تبويبًا جديدًا عند الزمن إن لم تجده.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findVideoTabs, jumpToVideo, openVideo } from '../../../src/ui/seek.js';

const A = 'AAAAAAAAAAA';
const reply = (videoId) => ({ v: 1, ok: true, watch: true, videoId, title: null, loading: false, english: { captured: [], saved: [] }, arabic: null, view: { displayOffsetMs: 0, displayMode: 'ar' }, mounted: { overlay: 'mounted', controls: 'mounted' } });

/** تبويبات وهمية: لكل تبويب رده على طلب الحالة (أو لا رد) ورده على القفز. */
function fakeTabs(list, { seekReply = (m) => ({ v: 1, ok: true, ms: m.ms }) } = {}) {
  const calls = { query: [], sent: [], update: [], create: [], focus: [] };
  const tabs = {
    async query(q) { calls.query.push(q); return list.map(({ answer, ...t }) => t); },
    async sendMessage(id, m) {
      calls.sent.push([id, m.type]);
      const t = list.find((x) => x.id === id);
      if (m.type === 'tj:seek') return seekReply(m);
      if (!t?.answer) throw new Error('Could not establish connection. Receiving end does not exist.');
      return t.answer;
    },
    async update(id, p) { calls.update.push([id, p]); return {}; },
    async create(p) { calls.create.push(p); return { id: 99 }; },
  };
  const windows = { async update(id, p) { calls.focus.push([id, p]); return {}; } };
  return { tabs, windows, calls };
}

test('التبويب المفتوح: يُعرف برد سكربت ترجمان وحده، والأحدث استعمالًا أولًا، ثم يُجلب ويُرسل إليه القفز', async () => {
  const f = fakeTabs([
    { id: 1, windowId: 1, active: true, lastAccessed: 100 },
    { id: 2, windowId: 1, active: false, lastAccessed: 300, answer: reply(A) },
    { id: 3, windowId: 2, active: false, lastAccessed: 500, answer: reply('BBBBBBBBBBB') },
    { id: 4, windowId: 2, active: true, lastAccessed: 400, answer: reply(A) },
  ]);
  assert.deepEqual((await findVideoTabs(A, f)).map((t) => t.id), [4, 2]);
  const r = await jumpToVideo({ videoId: A, ms: 61000 }, f);
  assert.deepEqual(r, { ok: true, via: 'open', tabId: 4 });
  assert.deepEqual(f.calls.query[0], {}, 'بلا فلتر عنوان: لا يحتاج إذن tabs');
  assert.deepEqual(f.calls.update.at(-1), [4, { active: true }]);
  assert.deepEqual(f.calls.focus.at(-1), [2, { focused: true }]);
  assert.deepEqual(f.calls.sent.filter(([, t]) => t === 'tj:seek'), [[4, 'tj:seek']]);
  assert.equal(f.calls.create.length, 0);
});

test('لا تبويب للفيديو: تبويب جديد عند الزمن بالثواني؛ والمعرّف التالف يُرفض', async () => {
  const f = fakeTabs([{ id: 1, windowId: 1, active: true }]);
  assert.deepEqual(await jumpToVideo({ videoId: A, ms: 61999 }, f), { ok: true, via: 'new', tabId: 99 });
  assert.deepEqual(f.calls.create, [{ url: `https://www.youtube.com/watch?v=${A}&t=61s` }]);
  assert.deepEqual(await jumpToVideo({ videoId: 'bad', ms: 0 }, f), { ok: false, code: 'TJ_BAD_VIDEO_ID' });
});

test('رفض القفز يعيد رمزه، وغياب الرد TJ_SEEK_FAILED', async () => {
  const wrong = fakeTabs([{ id: 2, windowId: 1, answer: reply(A) }], { seekReply: () => ({ v: 1, ok: false, code: 'TJ_WRONG_VIDEO' }) });
  assert.deepEqual(await jumpToVideo({ videoId: A, ms: 0 }, wrong), { ok: false, code: 'TJ_WRONG_VIDEO' });
  const silent = fakeTabs([{ id: 2, windowId: 1, answer: reply(A) }], { seekReply: () => undefined });
  assert.deepEqual(await jumpToVideo({ videoId: A, ms: 0 }, silent), { ok: false, code: 'TJ_SEEK_FAILED' });
});

test('openVideo: تبويب الفيديو المفتوح يُجلب كما هو بلا tj:seek (لا يعود إلى أوله)، وإلا تبويب جديد بلا زمن', async () => {
  const f = fakeTabs([{ id: 2, windowId: 7, active: false, lastAccessed: 300, answer: reply(A) }]);
  assert.deepEqual(await openVideo(A, f), { ok: true, via: 'open', tabId: 2 });
  assert.deepEqual(f.calls.update.at(-1), [2, { active: true }]);
  assert.deepEqual(f.calls.focus.at(-1), [7, { focused: true }]);
  assert.equal(f.calls.sent.filter(([, type]) => type === 'tj:seek').length, 0, 'لا قفز زمني');
  const g = fakeTabs([{ id: 1, windowId: 1, active: true, lastAccessed: 100 }]);
  assert.deepEqual(await openVideo(A, g), { ok: true, via: 'new', tabId: 99 });
  assert.deepEqual(g.calls.create, [{ url: `https://www.youtube.com/watch?v=${A}` }]);
  assert.deepEqual(await openVideo('bad', g), { ok: false, code: 'TJ_BAD_VIDEO_ID' });
  const broken = fakeTabs([]);
  broken.tabs.query = async () => { throw new Error('x'); };
  assert.deepEqual(await openVideo(A, broken), { ok: false, code: 'PG_OPEN_FAILED' });
});

