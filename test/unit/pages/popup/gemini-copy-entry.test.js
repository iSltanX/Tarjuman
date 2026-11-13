// تحقق Gemini، الجولة الثانية، B1، نافذة الأيقونة: «نسخ تشخيص الصفحة» كان ينتظر تشخيص الصفحة واسم المتصفح ثم يستدعي writeText،
// فإن غادر التركيزُ أثناء الجمع رفضها Chromium. الآن navigator.clipboard.write بـClipboardItem يحمل وعد التقرير، في النقرة نفسها؛
// وwriteText احتياطًا بعد الجمع حين لا ClipboardItem. تُحمَّل نقطة الدخول pages/popup/main.js ببيئة وهمية (c8-entry-env)، مرة
// واحدة في هذه العملية، على صفحة فيديو أدواتها مركّبة فيظهر الرابط.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createEntryEnv } from '../../../helpers/c8-entry-env.js';
import { settle, textOf } from '../library/fake-dom.js';

const A = 'AAAAAAAAAAA';
const reply = {
  v: 1, ok: true, watch: true, videoId: A, title: 'فيديو', loading: false, english: { captured: [], saved: [] }, arabic: null,
  view: { displayOffsetMs: 0, displayMode: 'ar' }, mounted: { overlay: 'mounted', controls: 'mounted' },
};
let gathering = null;
const env = createEntryEnv({
  tabs: {
    query: async () => [{ id: 7 }],
    sendMessage: async (id, msg) => {
      if (msg?.type === 'tj:get-video-state') return reply;
      if (msg?.type === 'tj:get-page-diagnostics') return gathering.promise;
      return undefined;
    },
  },
});

function deferred() {
  let resolve;
  const promise = new Promise((r) => { resolve = r; });
  return { promise, resolve };
}

/** حافظة وهمية: write يقرأ النص من ClipboardItem حين يُحلّ وعده، وwriteText يكتب مباشرة. */
function fakeClipboard() {
  const log = { write: 0, writeText: 0, texts: [] };
  return {
    log,
    clipboard: {
      async write(items) {
        log.write++;
        const blob = await items[0].data['text/plain'];
        log.texts.push(await blob.text());
      },
      async writeText(text) {
        log.writeText++;
        log.texts.push(text);
      },
    },
  };
}
class FakeClipboardItem {
  constructor(data) { this.data = data; }
}

/** يثبّت البيئة والحافظة (وClipboardItem إن طُلب) حول fn ثم يعيد المتغيرات العامة. */
async function around({ clipboard, item }, fn) {
  const restoreEnv = env.install();
  const saved = { navigator: Object.getOwnPropertyDescriptor(globalThis, 'navigator'), item: Object.getOwnPropertyDescriptor(globalThis, 'ClipboardItem') };
  Object.defineProperty(globalThis, 'navigator', { value: { clipboard }, configurable: true, writable: true });
  if (item) Object.defineProperty(globalThis, 'ClipboardItem', { value: item, configurable: true, writable: true });
  else delete globalThis.ClipboardItem;
  try {
    return await fn();
  } finally {
    for (const [key, d] of [['navigator', saved.navigator], ['ClipboardItem', saved.item]]) {
      if (d) Object.defineProperty(globalThis, key, d); else delete globalThis[key];
    }
    restoreEnv();
  }
}

const restoreLoad = env.install();
try {
  await import('../../../../src/pages/popup/main.js');
  await settle(30);
  await new Promise((r) => setImmediate(r));
  await settle(30);
} finally {
  restoreLoad();
}
const diagButton = () => env.doc.querySelectorAll('button[data-action]').find((b) => b.getAttribute('data-action') === 'diagnostics');
const resultText = () => textOf(env.doc.querySelectorAll('span').find((s) => s.classList.contains('tj-popup__diag-result')));

test('B1: «نسخ تشخيص الصفحة» يستدعي clipboard.write بوعد التقرير في النقرة نفسها، قبل اكتمال تشخيص الصفحة', async () => {
  assert.ok(diagButton(), 'رابط التشخيص ظاهر على صفحة فيديو أدواتها مركّبة');
  const { clipboard, log } = fakeClipboard();
  gathering = deferred();
  await around({ clipboard, item: FakeClipboardItem }, async () => {
    diagButton().dispatchEvent({ type: 'click' });
    assert.equal(log.write, 1, 'الحافظة استُدعيت قبل أول await في المعالج');
    assert.equal(log.writeText, 0);
    assert.deepEqual(log.texts, [], 'والتقرير لم يكتمل بعد');
    gathering.resolve({ v: 1, ok: true, sections: { controller: { state: 'ok' } } });
    await settle(30);
  });
  assert.equal(log.texts.length, 1);
  assert.match(log.texts[0], /"popup"/, 'التقرير نفسه');
  assert.equal(log.texts[0].includes(A), false, 'بلا معرّف الفيديو');
  assert.equal(resultText(), 'نُسخ التشخيص');
});

test('B1: بلا ClipboardItem: writeText احتياطًا بعد الجمع، والنتيجة «نُسخ»', async () => {
  const { clipboard, log } = fakeClipboard();
  gathering = deferred();
  await around({ clipboard, item: null }, async () => {
    diagButton().dispatchEvent({ type: 'click' });
    assert.equal(log.write, 0);
    gathering.resolve({ v: 1, ok: true, sections: { controller: { state: 'ok' } } });
    await settle(30);
  });
  assert.equal(log.writeText, 1);
  assert.match(log.texts[0], /"popup"/);
  assert.equal(resultText(), 'نُسخ التشخيص');
});
