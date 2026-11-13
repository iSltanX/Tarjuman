// الفكرة ١٠، المسار (ب) (ح-55): اختصارات لوحة مفاتيح اختيارية عبر مفتاح commands في البيان، **بلا suggested_key**، فهي غير مربوطة
// حتى يربطها المستخدم في صفحة اختصارات متصفحه. الفحص الثابت كان يمنع المفتاح كله، وصار يقبله بأسماء الأوامر الخمسة المعروفة وحدها،
// وبوصف من رسائل البيان باللغتين، ويرفض أي مفتاح مقترح أو اسم آخر أو حقل آخر، في بياني الهدفين.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { manifestMessages, manifestText, targetManifest } from '../../../scripts/targets.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const base = JSON.parse(await readFile(path.join(ROOT, 'src/manifest.json'), 'utf8'));
const node = (args) => spawnSync(process.execPath, args, { cwd: ROOT, encoding: 'utf8' });
const NAMES = ['display-mode', 'offset-earlier', 'offset-later', 'mark-review', 'replay-line'];

async function staticWith(mutate) {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'tj-r5-commands-'));
  try {
    await cp(path.join(ROOT, 'src'), dir, { recursive: true, filter: (p) => !p.includes(`${path.sep}fonts${path.sep}`) });
    const p = path.join(dir, 'manifest.json');
    const m = JSON.parse(await readFile(p, 'utf8'));
    mutate(m);
    await writeFile(p, JSON.stringify(m));
    return node([path.join(ROOT, 'scripts/check-static.mjs'), '--src', dir]);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

test('البيان: الأوامر الخمسة بأسمائها، بلا suggested_key ولا حقل غير الوصف، ولكلٍّ وصف باللغتين', async () => {
  assert.ok(base.commands && typeof base.commands === 'object', 'مفتاح commands في البيان');
  assert.deepEqual(Object.keys(base.commands).sort(), [...NAMES].sort());
  const messages = await manifestMessages(path.join(ROOT, 'src'));
  for (const name of NAMES) {
    const c = base.commands[name];
    assert.deepEqual(Object.keys(c), ['description'], `${name}: الوصف وحده (لا suggested_key ولا global)`);
    assert.match(c.description, /^__MSG_\w+__$/, `${name}: الوصف رسالة توطين`);
    for (const locale of ['ar', 'en']) {
      const text = manifestText(c.description, messages[locale]);
      assert.equal(typeof text, 'string', `${name} (${locale})`);
      assert.ok(text.trim().length > 0, `${name} (${locale}) غير فارغ`);
    }
  }
  assert.deepEqual(Object.keys(messages.ar).sort(), Object.keys(messages.en).sort(), 'مفاتيح اللغتين واحدة');
  // طبقة Firefox لا تمس الأوامر: الشكل نفسه في الهدفين، ولا إذن جديد.
  assert.deepEqual(targetManifest(base, 'firefox').commands, base.commands);
  assert.deepEqual(base.permissions, ['storage', 'unlimitedStorage', 'downloads'], 'لا tabs ولا إذن آخر');
});

test('الفحص الثابت: الشجرة الحالية بأوامرها ناجحة', () => {
  const r = node([path.join(ROOT, 'scripts/check-static.mjs')]);
  assert.equal(r.status, 0, r.stderr);
});

test('الفحص الثابت: suggested_key في أي أمر مرفوض في الهدفين', async () => {
  const r = await staticWith((m) => { m.commands['mark-review'].suggested_key = { default: 'Alt+Shift+M' }; });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /- manifest: commands\.mark-review\.suggested_key غير مسموح/);
  assert.match(r.stderr, /- manifest \(firefox\): commands\.mark-review\.suggested_key غير مسموح/);
});

test('الفحص الثابت: اسم أمر غير معروف (ومنه _execute_action)، أو أمر ناقص، أو حقل آخر، أو وصف بلا رسالة، مرفوض', async () => {
  const extra = await staticWith((m) => { m.commands._execute_action = { description: '__MSG_cmdMarkReview__' }; });
  assert.equal(extra.status, 1);
  assert.match(extra.stderr, /- manifest: commands: أمر غير معروف _execute_action/);
  const missing = await staticWith((m) => { delete m.commands['replay-line']; });
  assert.match(missing.stderr, /- manifest: commands: ينقص الأمر replay-line/);
  const global = await staticWith((m) => { m.commands['display-mode'].global = true; });
  assert.match(global.stderr, /- manifest: commands\.display-mode: حقل غير مسموح global/);
  const literal = await staticWith((m) => { m.commands['offset-later'].description = 'Later'; });
  assert.match(literal.stderr, /- manifest: commands\.offset-later\.description ليس رسالة توطين لها نص في اللغتين/);
  const unknownMsg = await staticWith((m) => { m.commands['offset-later'].description = '__MSG_noSuchMessage__'; });
  assert.match(unknownMsg.stderr, /- manifest: commands\.offset-later\.description ليس رسالة توطين لها نص في اللغتين/);
  const notObject = await staticWith((m) => { m.commands = ['display-mode']; });
  assert.match(notObject.stderr, /- manifest: commands ليس كائنًا بأسماء الأوامر/);
});

test('الفحص الثابت: بلا مفتاح commands أصلًا لا مخالفة (الأوامر اختيارية في البيان)', async () => {
  const r = await staticWith((m) => { delete m.commands; });
  assert.equal(r.status, 0, r.stderr);
});
