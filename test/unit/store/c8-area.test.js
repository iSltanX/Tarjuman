// تدقيق 7a66f91، U103 (T-01): دوال chromeLocalArea الثماني كانت بلا استدعاء لأن محاكاة الاختبار تعطي getKeys وgetBytesInUse دائمًا.
// هنا كائن chrome وهمي صغير يُمرَّر مباشرة، بما فيه الواجهات الناقصة (Firefox قبل 144 بلا getBytesInUse، وقبل 143 بلا getKeys).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chromeLocalArea } from '../../../src/core/store/area.js';

/** كائن chrome وهمي: يسجّل كل استدعاء، و`omit` يحذف دوال من storage.local كما في المتصفحات القديمة. */
function fakeChrome({ omit = [], permissions, quota, data = { a: 1, b: 2 } } = {}) {
  const calls = [];
  const listeners = new Set();
  const local = {
    get: async (k) => { calls.push(['get', k]); return { ...data }; },
    set: async (i) => { calls.push(['set', i]); },
    remove: async (k) => { calls.push(['remove', k]); },
    clear: async () => { calls.push(['clear']); },
    getKeys: async () => { calls.push(['getKeys']); return Object.keys(data); },
    getBytesInUse: async (k) => { calls.push(['getBytesInUse', k]); return 42; },
  };
  for (const name of omit) delete local[name];
  if (quota !== undefined) local.QUOTA_BYTES = quota;
  const chrome = {
    runtime: { getManifest: () => (permissions === undefined ? {} : { permissions }) },
    storage: {
      local,
      onChanged: {
        addListener: (fn) => { calls.push(['addListener']); listeners.add(fn); },
        removeListener: (fn) => { calls.push(['removeListener']); listeners.delete(fn); },
      },
    },
  };
  return { chrome, calls, listeners };
}

test('get وset وremove وclear تمرَّر إلى storage.local بوسائطها كما هي', async () => {
  const { chrome, calls } = fakeChrome();
  const area = chromeLocalArea(chrome);
  assert.deepEqual(await area.get(['a']), { a: 1, b: 2 });
  await area.set({ x: 1 });
  await area.remove('x');
  await area.clear();
  assert.deepEqual(calls, [['get', ['a']], ['set', { x: 1 }], ['remove', 'x'], ['clear']]);
});

test('getKeys: تُستعمل الدالة الأصلية حين توجد', async () => {
  const { chrome, calls } = fakeChrome();
  assert.deepEqual(await chromeLocalArea(chrome).getKeys(), ['a', 'b']);
  assert.deepEqual(calls, [['getKeys']]);
});

test('getKeys: حين تغيب (Firefox قبل 143) يُقرأ كل شيء ويُكتفى بمفاتيحه', async () => {
  const { chrome, calls } = fakeChrome({ omit: ['getKeys'] });
  assert.deepEqual(await chromeLocalArea(chrome).getKeys(), ['a', 'b']);
  assert.deepEqual(calls, [['get', null]]);
});

test('getBytesInUse: تمرَّر المفاتيح إلى الدالة الأصلية', async () => {
  const { chrome, calls } = fakeChrome();
  const area = chromeLocalArea(chrome);
  assert.equal(await area.getBytesInUse(null), 42);
  assert.equal(await area.getBytesInUse(['a']), 42);
  assert.deepEqual(calls, [['getBytesInUse', null], ['getBytesInUse', ['a']]]);
});

test('getBytesInUse: غيابها (Firefox قبل 144) لا يُعطِّل بناء المحوّل، والاستدعاء ينتهي بخطأ أو برقم لا بتعليق', async () => {
  const { chrome } = fakeChrome({ omit: ['getBytesInUse'] });
  const area = chromeLocalArea(chrome); // البناء لا يرمي
  assert.equal(typeof area.getBytesInUse, 'function');
  // السلوك المطلوب: يرمي (فيحوّله المتجر إلى ST_READ_FAILED، مسار U03) أو يعيد رقمًا إن أُضيف بديل؛ لا قيمة أخرى.
  const out = await Promise.resolve().then(() => area.getBytesInUse(null)).then((v) => ({ v }), (e) => ({ e }));
  assert.ok(out.e instanceof Error || (Number.isFinite(out.v) && out.v >= 0), `ناتج غير متوقع: ${String(out.e ?? out.v)}`);
});

test('الحصة والإذن: QUOTA_BYTES من الواجهة أو 10 ميبي، وunlimited من إذن unlimitedStorage', () => {
  const a = chromeLocalArea(fakeChrome().chrome);
  assert.equal(a.quotaBytes, 10485760);
  assert.equal(a.unlimited, false);
  const b = chromeLocalArea(fakeChrome({ quota: 5000, permissions: ['storage', 'unlimitedStorage'] }).chrome);
  assert.equal(b.quotaBytes, 5000);
  assert.equal(b.unlimited, true);
  assert.equal(chromeLocalArea(fakeChrome({ permissions: ['storage'] }).chrome).unlimited, false);
});

test('onChanged: يمرّر تغييرات المنطقة local وحدها، ويعيد دالة إلغاء تزيل المستمع نفسه', () => {
  const { chrome, listeners, calls } = fakeChrome();
  const area = chromeLocalArea(chrome);
  const seen = [];
  const off = area.onChanged((c) => seen.push(c));
  assert.equal(listeners.size, 1);
  const [handler] = listeners;
  handler({ k: { newValue: 1 } }, 'local');
  handler({ k: { newValue: 2 } }, 'sync');
  handler({ k: { newValue: 3 } }, 'session');
  assert.deepEqual(seen, [{ k: { newValue: 1 } }]);
  off();
  assert.equal(listeners.size, 0);
  assert.deepEqual(calls.filter((c) => c[0].endsWith('Listener')).map((c) => c[0]), ['addListener', 'removeListener']);
});

test('onChanged: يرمي حين يرمي addListener (واجهة ناقصة)، ولا يسجّل شيئًا', () => {
  const { chrome } = fakeChrome();
  chrome.storage.onChanged.addListener = () => { throw new Error('boom'); };
  const area = chromeLocalArea(chrome);
  assert.throws(() => area.onChanged(() => {}), /boom/);
});

test('onChanged: مستمع يرمي لا يُبتلع داخل المحوّل (يصل إلى مُطلِق الحدث)', () => {
  const { chrome, listeners } = fakeChrome();
  chromeLocalArea(chrome).onChanged(() => { throw new Error('listener'); });
  const [handler] = listeners;
  assert.throws(() => handler({}, 'local'), /listener/);
});

test('بلا storage.onChanged في الواجهة: يرمي TypeError عند الاشتراك فقط', () => {
  const { chrome } = fakeChrome();
  delete chrome.storage.onChanged;
  const area = chromeLocalArea(chrome);
  assert.throws(() => area.onChanged(() => {}), TypeError);
});

test('الإفتراضي: بلا وسيط يُقرأ globalThis.chrome', () => {
  const prev = globalThis.chrome;
  try {
    globalThis.chrome = fakeChrome({ quota: 7 }).chrome;
    assert.equal(chromeLocalArea().quotaBytes, 7);
  } finally {
    if (prev === undefined) delete globalThis.chrome; else globalThis.chrome = prev;
  }
});
