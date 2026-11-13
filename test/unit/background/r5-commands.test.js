// الفكرة ١٠، المسار (ب) (ح-55): العامل الخلفي يسمع commands.onCommand ويرسل الأمر رسالةً واحدة (tj:command) إلى التبويب النشط:
// بمعرّف التبويب من وسيط الحدث (Chrome، وFirefox منذ 126 والحد الأدنى 144)، وإلا من tabs.query({ active, currentWindow }) احتياطًا.
// وكلاهما بلا إذن tabs (المعرّف يصل بلا العنوان). ولا شيء بلا تبويب، ولا لاسم غير الأسماء الخمسة، ورفض الإرسال (تبويب ليس يوتيوب، أو
// صفحة فُتحت قبل تثبيت الإضافة أو تحديثها) يُبتلع بصمت: لا مكان يُعرض فيه شيء بلا إذن جديد.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { installCommands } from '../../../src/background/commands.js';
import { COMMAND_NAMES, MSG, commandRequest, isCommandRequest } from '../../../src/core/model/messages.js';

function fakeApi({ active = [{ id: 42 }], queryFails = false, sendFails = false } = {}) {
  const listeners = [];
  const sent = [];
  const queries = [];
  return {
    sent, queries, listeners,
    commands: {
      onCommand: {
        addListener: (fn) => listeners.push(fn),
        removeListener: (fn) => listeners.splice(listeners.indexOf(fn), 1),
      },
    },
    tabs: {
      query: async (q) => {
        queries.push(q);
        if (queryFails) throw new Error('No current window');
        return active;
      },
      sendMessage: async (id, msg) => {
        sent.push([id, msg]);
        if (sendFails) throw new Error('Could not establish connection. Receiving end does not exist.');
        return { v: 1, ok: true };
      },
    },
  };
}

test('الرسالة: tj:command بالإصدار 1 واسم الأمر وحده، والأسماء الخمسة هي أوامر البيان', async () => {
  assert.equal(MSG.command, 'tj:command');
  assert.deepEqual([...COMMAND_NAMES], ['display-mode', 'offset-earlier', 'offset-later', 'mark-review', 'replay-line']);
  const manifest = JSON.parse(await (await import('node:fs/promises')).readFile(new URL('../../../src/manifest.json', import.meta.url), 'utf8'));
  assert.deepEqual(Object.keys(manifest.commands).sort(), [...COMMAND_NAMES].sort());
  for (const name of COMMAND_NAMES) {
    assert.deepEqual(commandRequest(name), { type: 'tj:command', v: 1, name });
    assert.equal(isCommandRequest(commandRequest(name)), true, name);
  }
  for (const bad of [
    { type: 'tj:command', v: 1, name: 'seek' }, { type: 'tj:command', v: 2, name: 'mark-review' }, { type: 'tj:command', v: 1 },
    { type: 'tj:command', v: 1, name: 'mark-review', ms: 5 }, { type: 'tj:seek', v: 1, name: 'mark-review' }, null, 'tj:command',
    { type: 'tj:command', v: 1, name: '_execute_action' }, { type: 'tj:command', v: 1, name: ['mark-review'] },
  ]) assert.equal(isCommandRequest(bad), false, JSON.stringify(bad));
});

test('أمر بتبويب في الوسيط: رسالة واحدة إلى ذلك التبويب، بلا استعلام', async () => {
  const api = fakeApi();
  const cmd = installCommands(api);
  assert.equal(api.listeners.length, 1, 'مستمع واحد لـonCommand');
  const reply = await cmd.handle('offset-later', { id: 7, active: true });
  assert.deepEqual(api.sent, [[7, { type: 'tj:command', v: 1, name: 'offset-later' }]]);
  assert.deepEqual(api.queries, [], 'لا استعلام والمعرّف في الوسيط');
  assert.deepEqual(reply, { v: 1, ok: true });
});

test('بلا تبويب في الوسيط (أو بمعرّف TAB_ID_NONE): التبويب النشط في النافذة الحالية احتياطًا', async () => {
  for (const tab of [undefined, null, {}, { id: -1 }, { id: '7' }]) {
    const api = fakeApi({ active: [{ id: 42 }] });
    await installCommands(api).handle('replay-line', tab);
    assert.deepEqual(api.queries, [{ active: true, currentWindow: true }], JSON.stringify(tab));
    assert.deepEqual(api.sent, [[42, { type: 'tj:command', v: 1, name: 'replay-line' }]], JSON.stringify(tab));
  }
});

test('لا تبويب نشط، أو تعذّر الاستعلام: لا رسالة ولا خطأ', async () => {
  for (const opts of [{ active: [] }, { active: [{}] }, { active: [{ id: -1 }] }, { queryFails: true }]) {
    const api = fakeApi(opts);
    assert.equal(await installCommands(api).handle('mark-review', undefined), null, JSON.stringify(opts));
    assert.deepEqual(api.sent, [], JSON.stringify(opts));
  }
});

test('اسم غير الأسماء الخمسة لا يُرسل', async () => {
  const api = fakeApi();
  const cmd = installCommands(api);
  for (const name of ['_execute_action', 'seek', '', undefined, 'MARK-REVIEW']) await cmd.handle(name, { id: 7 });
  assert.deepEqual(api.sent, []);
});

test('التبويب ليس يوتيوب (لا مستقبل): الرفض يُبتلع بصمت، ومستمع الحدث لا يرمي ولا يترك وعدًا مرفوضًا', async () => {
  const api = fakeApi({ sendFails: true });
  const cmd = installCommands(api);
  assert.equal(await cmd.handle('display-mode', { id: 9 }), null);
  const unhandled = [];
  const onUnhandled = (e) => unhandled.push(e);
  process.on('unhandledRejection', onUnhandled);
  try {
    assert.equal(api.listeners[0]('display-mode', { id: 9 }), undefined, 'المستمع لا يعيد شيئًا');
    await new Promise((r) => setTimeout(r, 10));
  } finally {
    process.off('unhandledRejection', onUnhandled);
  }
  assert.deepEqual(unhandled, []);
  assert.equal(api.sent.length, 2);
});

test('بلا واجهة الأوامر (متصفح أو بيئة بلاها): لا يرمي ولا يسجّل شيئًا', () => {
  assert.doesNotThrow(() => installCommands({ commands: undefined, tabs: undefined }));
  assert.doesNotThrow(() => installCommands({}));
  const api = fakeApi();
  const cmd = installCommands(api);
  cmd.dispose();
  assert.equal(api.listeners.length, 0, 'dispose يزيل المستمع');
});
