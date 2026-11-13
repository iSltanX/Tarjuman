// copyText (تحقق Gemini، B1، src/ui/clipboard.js): النص الجاهز بـwriteText كما كان؛ ووعد النص بـclipboard.write وClipboardItem في
// الاستدعاء نفسه قبل اكتمال الجمع؛ وwriteText احتياطًا بعد الجمع حين لا ClipboardItem أو لا write أو يرفض المتصفح العنصر؛ وتعذّر
// الجمع نفسه فشل لا يُكتب معه شيء.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { copyText } from '../../../src/ui/clipboard.js';

class Item {
  constructor(data) { this.data = data; }
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

/** حافظة وهمية: write تقرأ Blob العنصر حين يُحلّ (أو تُرفض بما يُعطى)، وwriteText تكتب مباشرة. */
function fakeClipboard({ writeFails = null, writeThrows = false } = {}) {
  const log = { order: [], texts: [] };
  return {
    log,
    async write(items) {
      log.order.push('write');
      if (writeThrows) throw new TypeError('ClipboardItem promise not supported');
      const blob = await items[0].data['text/plain'];
      if (writeFails) throw writeFails;
      log.texts.push(await blob.text());
    },
    async writeText(text) {
      log.order.push('writeText');
      log.texts.push(text);
    },
  };
}

test('B1: النص الجاهز يُكتب بـwriteText كما كان، ولا ClipboardItem', async () => {
  const clipboard = fakeClipboard();
  await copyText('نص', { clipboard, Item });
  assert.deepEqual(clipboard.log.order, ['writeText']);
  assert.deepEqual(clipboard.log.texts, ['نص']);
});

test('B1: وعد النص ← clipboard.write في الاستدعاء نفسه، قبل اكتمال الجمع، ثم النص كاملًا', async () => {
  const clipboard = fakeClipboard();
  const gathering = deferred();
  const done = copyText(gathering.promise, { clipboard, Item });
  assert.deepEqual(clipboard.log.order, ['write'], 'متزامنًا، بلا انتظار');
  assert.deepEqual(clipboard.log.texts, []);
  gathering.resolve('{"tarjuman":"b1"}');
  await done;
  assert.deepEqual(clipboard.log.texts, ['{"tarjuman":"b1"}']);
  assert.deepEqual(clipboard.log.order, ['write'], 'لا writeText بعد نجاح write');
});

test('B1: بلا ClipboardItem أو بلا clipboard.write ← writeText بعد الجمع (الاحتياط)', async () => {
  for (const env of [{ Item: undefined }, { Item, noWrite: true }]) {
    const clipboard = fakeClipboard();
    if (env.noWrite) delete clipboard.write;
    await copyText(Promise.resolve('تقرير'), { clipboard: env.noWrite ? { writeText: clipboard.writeText } : clipboard, Item: env.Item });
    assert.deepEqual(clipboard.log.order, ['writeText']);
    assert.deepEqual(clipboard.log.texts, ['تقرير']);
  }
});

test('B1: المتصفح يرفض العنصر (رميًا أو رفضًا) ← writeText بالنص المكتمل', async () => {
  const thrown = fakeClipboard({ writeThrows: true });
  await copyText(Promise.resolve('أ'), { clipboard: thrown, Item });
  assert.deepEqual(thrown.log.order, ['write', 'writeText']);
  assert.deepEqual(thrown.log.texts, ['أ']);
  const refused = fakeClipboard({ writeFails: new DOMException('Document is not focused.', 'NotAllowedError') });
  await copyText(Promise.resolve('ب'), { clipboard: refused, Item });
  assert.deepEqual(refused.log.order, ['write', 'writeText']);
  assert.deepEqual(refused.log.texts, ['ب']);
});

test('B1: تعذّر الجمع نفسه ← رفض بخطئه، ولا writeText', async () => {
  const clipboard = fakeClipboard();
  const gathering = deferred();
  const done = copyText(gathering.promise, { clipboard, Item });
  gathering.reject(new Error('تعذّر الجمع'));
  await assert.rejects(done, /تعذّر الجمع/);
  assert.deepEqual(clipboard.log.order, ['write']);
  assert.deepEqual(clipboard.log.texts, []);
});

test('B1: الطريقتان مرفوضتان ← رفض يصل إلى المستدعي («تعذّر النسخ»)', async () => {
  const clipboard = {
    async write() { throw new DOMException('Document is not focused.', 'NotAllowedError'); },
    async writeText() { throw new DOMException('Document is not focused.', 'NotAllowedError'); },
  };
  await assert.rejects(copyText(Promise.resolve('x'), { clipboard, Item }), /not focused/);
  await assert.rejects(copyText('x', { clipboard, Item }), /not focused/);
  await assert.rejects(copyText('x', { clipboard: undefined, Item }), TypeError, 'لا حافظة أصلًا: رفض لا رمي متزامن');
});
