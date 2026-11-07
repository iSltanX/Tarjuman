// آلة حالة «نسخ» (P7-AC6/AC7): عادي ← «تم النسخ» لثانيتين ← عادي، أو «أعد المحاولة» عند الرفض؛ والنص يُسلَّم إلى
// الحافظة ولا يُحفظ في الحالة ولا يُعلن ولا يُمرَّر إلى أي رسالة.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { COPY_SUCCESS_MS, createCopyState } from '../../../../src/pages/library/copy.js';
import { instructions } from '../../../../src/core/export/instructions.js';

const ID = 'aB3kL9mPq2X';

function harness({ write = async () => {}, buildText = () => instructions({ videoId: ID, title: 'عنوان', source: 'en', target: 'ar' }) } = {}) {
  const log = { states: [], announced: [], written: [], timers: [] };
  const copy = createCopyState({
    buildText,
    write: async (t) => { log.written.push(t); await write(t); },
    announce: (c) => log.announced.push(c),
    onState: (s) => log.states.push(s),
    setTimer: (fn, ms) => { const t = { fn, ms, cleared: false }; log.timers.push(t); return t; },
    clearTimer: (t) => { t.cleared = true; },
  });
  return { copy, log };
}

test('النجاح: يكتب النص المعتمد، ثم «تم النسخ» وإعلان، ثم يعود عاديًا بعد ثانيتين', async () => {
  const { copy, log } = harness();
  assert.equal(copy.state(), 'idle');
  assert.equal(await copy.copy(), 'success');
  assert.deepEqual(log.written, [instructions({ videoId: ID, title: 'عنوان', source: 'en', target: 'ar' })]);
  assert.deepEqual(log.states, ['success']);
  assert.deepEqual(log.announced, ['PG_COPY_DONE']);
  assert.equal(log.timers.length, 1);
  assert.equal(log.timers[0].ms, COPY_SUCCESS_MS);
  assert.equal(COPY_SUCCESS_MS, 2000);
  log.timers[0].fn();
  assert.deepEqual(log.states, ['success', 'idle']);
  assert.equal(copy.state(), 'idle');
});

test('رفض الحافظة: «أعد المحاولة» وإعلان الفشل، ولا مؤقت يعيده عاديًا', async () => {
  const { copy, log } = harness({ write: async () => { throw new DOMException('Document is not focused.', 'NotAllowedError'); } });
  assert.equal(await copy.copy(), 'error');
  assert.deepEqual(log.states, ['error']);
  assert.deepEqual(log.announced, ['PG_COPY_FAILED']);
  assert.equal(log.timers.length, 0);
  assert.equal(copy.state(), 'error');
});

test('إعادة المحاولة بعد الفشل تنجح وتصير «تم النسخ»', async () => {
  let fail = true;
  const { copy, log } = harness({ write: async () => { if (fail) throw new Error('رفض'); } });
  assert.equal(await copy.copy(), 'error');
  fail = false;
  assert.equal(await copy.copy(), 'success');
  assert.deepEqual(log.states, ['error', 'success']);
  assert.deepEqual(log.announced, ['PG_COPY_FAILED', 'PG_COPY_DONE']);
});

test('ضغطة ثانية أثناء «تم النسخ» تنسخ ثانية وتعيد العدّ ولا تترك مؤقتًا قديمًا', async () => {
  const { copy, log } = harness();
  await copy.copy();
  await copy.copy();
  assert.equal(log.written.length, 2);
  assert.equal(log.timers[0].cleared, true);
  assert.equal(log.timers[1].cleared, false);
  copy.dispose();
  assert.equal(log.timers[1].cleared, true);
});

test('معرّف غير صالح: لا نسخ ولا كتابة، والإعلان برمز المعرّف لا بالحافظة', async () => {
  const { copy, log } = harness({ buildText: () => instructions({ videoId: 'bad', title: 'x', source: 'en', target: 'ar' }) });
  assert.equal(await copy.copy(), 'error');
  assert.deepEqual(log.written, []);
  assert.deepEqual(log.announced, ['PG_COPY_BAD_ID']);
});

test('النص لا يتسرب: لا إلى الحالة ولا إلى الإعلانات ولا إلى المؤقتات', async () => {
  const { copy, log } = harness();
  await copy.copy();
  const text = log.written[0];
  const probe = 'ترجمة ملف ترجمة فيديو';
  assert.ok(text.includes(probe));
  for (const sink of [log.states, log.announced, log.timers.map((t) => t.ms), [copy.state()]]) {
    assert.equal(JSON.stringify(sink).includes(probe), false);
  }
});

test('ضغطتان متزامنتان: لا يبقى مؤقت قديم يعيد الزر عاديًا قبل ثانيتين من آخر نسخ', async () => {
  const { copy, log } = harness();
  await Promise.all([copy.copy(), copy.copy()]);
  const live = log.timers.filter((t) => !t.cleared);
  assert.equal(live.length, 1, 'مؤقت واحد حيّ');
  assert.equal(log.timers.length, 2);
  assert.equal(log.timers[0].cleared, true, 'مؤقت الأولى أُلغي عند نجاح الثانية');
  live[0].fn();
  assert.equal(copy.state(), 'idle');
});
