// تحقق Gemini، الجولة الثانية، B1: «نسخ تقرير التشخيص» في الإعدادات وفي تنبيه خطأ المحفوظات كان يجمع التقرير (await) ثم يستدعي
// الحافظة، فإن غادر التركيزُ أثناء الجمع رفضها Chromium («Document is not focused»). الآن تُستدعى الحافظة لحظة النقرة بوعد التقرير
// (ClipboardItem بوعد في الإنتاج، src/ui/clipboard.js)، قبل أي انتظار؛ والنتيجة («نُسخ» أو «تعذّر») بعد اكتمال الكتابة.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStore } from '../../../src/core/store/index.js';
import { createSettings } from '../../../src/pages/settings/view.js';
import { createLibrary } from '../../../src/pages/library/view.js';
import { createMemoryArea } from '../../helpers/chrome-storage.js';
import { NOW, videoRecord } from '../../helpers/fixtures.js';
import { buttonNamed, findAll, newDocument, settle, textOf } from './library/fake-dom.js';

const REPORT = '{"tarjuman":"b1"}';

/** وعد يُحسم من الخارج: التقرير «يُجمع» حتى يُطلق. */
function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

/** حافظة البيئة: تسجّل ما سُلّم إليها لحظة الاستدعاء (نصًا أو وعدًا)، وتكتب النص حين يكتمل. */
function clipboardSpy() {
  const calls = [];
  const written = [];
  return {
    calls, written,
    write: (text) => {
      calls.push(text);
      return Promise.resolve(text).then((s) => { written.push(s); });
    },
  };
}

const timers = { setTimer: () => 0, clearTimer: () => {} };

async function settingsWith({ clip, diagnosticsText }) {
  const area = createMemoryArea({ unlimited: true });
  let t = Date.parse(NOW);
  const store = createStore({ area, now: () => (t += 1000) });
  const doc = newDocument();
  const settings = createSettings({ store, doc, version: '2.2.0', clipboardWrite: clip.write, diagnosticsText, confirm: async () => false, ...timers });
  doc.body.append(settings.root);
  await settings.load();
  const diag = findAll(settings.root, (e) => e.tagName === 'section' && textOf(e.querySelector('h2') ?? { textContent: '' }) === 'التشخيص')[0];
  const marks = () => findAll(diag, (e) => e.classList.contains('tj-saved')).map(textOf).filter(Boolean);
  return { diag, marks };
}

async function libraryErrorWith({ clip, diagnosticsText }) {
  const area = createMemoryArea({ unlimited: true });
  let t = Date.parse(NOW);
  const store = createStore({ area, now: () => (t += 1000) });
  await store.updateVideo('AAAAAAAAAAA', () => videoRecord());
  await area.flush();
  const doc = newDocument();
  const lib = createLibrary({
    store, doc, now: () => Date.parse(NOW), openTab: async () => {}, openPage: async () => {}, saveFile: async () => ({ ok: true }),
    clipboardWrite: clip.write, pickFiles: async () => null, diagnosticsText, confirm: async () => false, ...timers,
  });
  doc.body.append(lib.root);
  area.failNext('getKeys', new Error('boom'));
  await lib.load();
  const alert = lib.root.querySelector('.lib-state--error');
  return { alert, root: lib.root };
}

test('B1: الإعدادات «نسخ تقرير التشخيص» تستدعي الحافظة لحظة النقرة قبل اكتمال الجمع، ثم «نُسخ»', async () => {
  const clip = clipboardSpy();
  const gathering = deferred();
  const m = await settingsWith({ clip, diagnosticsText: () => gathering.promise });
  buttonNamed(m.diag, 'نسخ تقرير التشخيص').click();
  assert.equal(clip.calls.length, 1, 'الحافظة استُدعيت في النقرة نفسها، لا بعد await');
  assert.deepEqual(clip.written, [], 'والتقرير لم يكتمل بعد');
  gathering.resolve(REPORT);
  await settle();
  assert.deepEqual(clip.written, [REPORT]);
  assert.deepEqual(m.marks(), ['نُسخ تقرير التشخيص.']);
});

test('B1: الإعدادات: تعذّر الجمع أو الكتابة ← «تعذّر النسخ» كما كان', async () => {
  const clip = clipboardSpy();
  const gathering = deferred();
  const m = await settingsWith({ clip, diagnosticsText: () => gathering.promise });
  buttonNamed(m.diag, 'نسخ تقرير التشخيص').click();
  assert.equal(clip.calls.length, 1);
  gathering.reject(new Error('تعذّر الجمع'));
  await settle();
  assert.deepEqual(clip.written, []);
  assert.deepEqual(m.marks(), ['تعذّر نسخ تقرير التشخيص إلى الحافظة. أعد المحاولة.']);
});

test('B1: المحفوظات، تنبيه الخطأ: «نسخ تقرير التشخيص» تستدعي الحافظة لحظة النقرة قبل اكتمال الجمع', async () => {
  const clip = clipboardSpy();
  const gathering = deferred();
  const m = await libraryErrorWith({ clip, diagnosticsText: () => gathering.promise });
  assert.ok(m.alert, 'تنبيه الخطأ ظاهر');
  buttonNamed(m.alert, 'نسخ تقرير التشخيص').click();
  assert.equal(clip.calls.length, 1, 'الحافظة استُدعيت في النقرة نفسها');
  assert.deepEqual(clip.written, []);
  gathering.resolve(REPORT);
  await settle();
  assert.deepEqual(clip.written, [REPORT]);
});
