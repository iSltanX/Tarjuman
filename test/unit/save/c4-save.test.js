// تدقيق 7a66f91، المرحلة C4 (U34): متى صدر معرّف التنزيل فلا بديل Blob أبدًا. حالة «غير محسوم» (SV_UNSETTLED) حين
// يتعذّر الاستعلام عن نتيجته أو يغيب عنصره، والرابط لا يُلغى فورًا. وفي سكربت المحتوى لا يُنزَّل بديل إلا حين لم تصل
// الرسالة أصلًا. كلها فشلت على الشيفرة السابقة (ازدواج الملف، أو استثناء خارج SaveResult).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSaveService } from '../../../src/background/save-service.js';
import { PENDING_REVOKE_MS, saveFile } from '../../../src/core/save/index.js';
import { messageFor } from '../../../src/core/errors/index.js';
import { createStore } from '../../../src/core/store/index.js';
import { createMemoryArea } from '../../helpers/chrome-storage.js';
import { NOW } from '../../helpers/fixtures.js';

const fast = { pollMs: 1, timeoutMs: 50, wait: async () => {} };
const file = { name: 'iG9CE55wbtY.en.manual.normal.srt', text: '1\n00:00:01,000 --> 00:00:02,000\nhello\n' };
const store = () => createStore({ area: createMemoryArea({ unlimited: true }), now: () => Date.parse(NOW) });

/** واجهة تنزيلات: download يصدر معرّفًا، وsearch يتبع السيناريو (in_progress، missing، throw، أو حالة). */
function downloadsWith(script) {
  const calls = { download: 0, search: 0 };
  return {
    calls,
    async download() {
      calls.download++;
      return 41;
    },
    async search({ id }) {
      const step = script[Math.min(calls.search++, script.length - 1)];
      if (step === 'throw') throw new Error('synthetic search failure');
      if (step === 'missing') return [];
      return [{ id, state: step, error: step === 'interrupted' ? 'FILE_FAILED' : undefined, exists: true, filename: '/x' }];
    },
  };
}

/** نافذة صفحة إضافة وهمية: تسجّل إنشاء الروابط وإلغاءها ومؤقتاتها. */
function pageDoc() {
  const log = { revoked: [], timers: [] };
  const win = {
    URL: { createObjectURL: () => 'blob:tarjuman/1', revokeObjectURL: (u) => log.revoked.push(u) },
    Blob: class { constructor(parts) { this.parts = parts; } },
    setTimeout: (fn, ms) => log.timers.push({ fn, ms }),
  };
  return { log, doc: { defaultView: win } };
}

test('U34 (الصفحة): رفض search بعد إصدار المعرّف «غير محسوم» بلا بديل، ونتيجة ضمن SaveResult، والرابط يبقى', async () => {
  for (const script of [['throw'], ['in_progress', 'throw'], ['missing'], ['in_progress', 'missing']]) {
    const s = store();
    const { log, doc } = pageDoc();
    let fellBack = 0;
    const downloads = downloadsWith(script);
    const r = await saveFile(file, { api: { downloads }, store: s, settle: fast, doc, fallback: () => { fellBack++; } });
    assert.deepEqual(r, { ok: false, code: 'SV_UNSETTLED' }, script.join(','));
    assert.equal(fellBack, 0, 'لا ملف ثانٍ');
    assert.equal(downloads.calls.download, 1);
    assert.deepEqual(log.revoked, [], 'لا إلغاء فوري للرابط والتنزيل ربما يقرؤه');
    assert.deepEqual(log.timers.map((t) => t.ms), [PENDING_REVOKE_MS]);
  }
});

test('U34 (الصفحة): التنزيل الذي يعلن المتصفح فشله (interrupted بغير الإلغاء) ما زال يرجع إلى Blob', async () => {
  const { doc } = pageDoc();
  let fellBack = 0;
  const r = await saveFile(file, { api: { downloads: downloadsWith(['interrupted']) }, store: store(), settle: fast, doc, fallback: () => { fellBack++; } });
  assert.deepEqual(r, { ok: true, mode: 'blob', downloadId: null });
  assert.equal(fellBack, 1);
});

const ID = 'abcdefghijklmnopabcdefghijklmnop';
const runtime = { id: ID, getURL: (p) => `chrome-extension://${ID}/${p}`, onMessage: { addListener() {}, removeListener() {} } };
const fromYoutube = { id: ID, tab: { id: 3 }, url: 'https://www.youtube.com/watch?v=iG9CE55wbtY' };

test('U34 (العامل ثم سكربت المحتوى): رفض search أو غياب العنصر يعيد SV_UNSETTLED، فلا ينزّل سكربت المحتوى بديلًا', async () => {
  for (const script of [['throw'], ['missing']]) {
    const s = store();
    await s.setPrefs({ saveLocation: { mode: 'downloads', folder: 'Tarjuman' } });
    const svc = createSaveService({ runtime, downloads: downloadsWith(script), store: s, settle: fast, env: {} });
    const reply = await svc.handle({ type: 'tj:save-file', v: 1, file }, fromYoutube);
    assert.deepEqual(reply, { v: 1, ok: false, code: 'SV_UNSETTLED' });
    let fellBack = 0;
    const r = await saveFile(file, { api: { runtime: { sendMessage: async () => reply } }, fallback: () => { fellBack++; } });
    assert.deepEqual(r, { ok: false, code: 'SV_UNSETTLED' });
    assert.equal(fellBack, 0);
  }
});

test('U34 (سكربت المحتوى): القناة التي تنغلق بعد الإرسال SV_NO_REPLY بلا بديل؛ وما لم يصل أصلًا يرجع إلى Blob', async () => {
  let fellBack = 0;
  const fallback = () => { fellBack++; };
  const rejecting = (message) => ({ sendMessage: async () => { throw new Error(message); } });
  for (const closed of [
    'A listener indicated an asynchronous response by returning true, but the message channel closed before a response was received',
    'The message port closed before a response was received.',
    'Message manager disconnected',
  ]) {
    assert.deepEqual(await saveFile(file, { api: { runtime: rejecting(closed) }, fallback }), { ok: false, code: 'SV_NO_REPLY' }, closed);
  }
  assert.equal(fellBack, 0, 'العامل ربما بدأ التنزيل: لا ملف ثانٍ');
  // لم تصل الرسالة: لا مستقبل، أو سياق الإضافة لم يعد صالحًا (رمي متزامن).
  assert.deepEqual(await saveFile(file, { api: { runtime: rejecting('Could not establish connection. Receiving end does not exist.') }, fallback }), { ok: true, mode: 'blob', downloadId: null });
  const sync = { sendMessage: () => { throw new Error('Extension context invalidated.'); } };
  assert.deepEqual(await saveFile(file, { api: { runtime: sync }, fallback }), { ok: true, mode: 'blob', downloadId: null });
  assert.equal(fellBack, 2);
});

test('U34: لرمز SV_UNSETTLED رسالة تقول إن التنزيل بدأ وتطلب التحقق من التنزيلات', () => {
  const text = messageFor('SV_UNSETTLED');
  assert.notEqual(text, 'SV_UNSETTLED');
  assert.match(text, /التنزيلات/);
});
