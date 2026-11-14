// تحقق 2.3.0 (ص-١٨، بقرار سلطان): ثغرات في حارسين من الفحص الثابت نجت منها طفرات في مجسّ التحقق الأخير (c-guards/static)، ولا مخالفة
// في src اليوم.
// - R39 (أسماء يوتيوب الداخلية في youtube-dom.js وحده): الاسم بحروف كبيرة كما في tagName، والمعرّف في محدد سمة، وأسماء يوتيوب خارج
//   النمطين (html5-video-player وhtml5-main-video وcaption-window وtp-yt- وyt-action و#masthead و#player-container)، وسطر capture.js
//   المستثنى مكرَّرًا في ملفه. والاسم المركّب من أجزاء (جمع أو join أو قالب يقسم البادئة) خارج حدّه: نصي يكشف النسيان لا التمويه.
// - سطر الموافقة (permissions.request في سطرين معتمدين): الوصول بالأقواس والسلسلة الاختيارية، والاسم المستعار للكائن وتفكيكه، وتعديل
//   قائمة الأصول YOUTUBE_MATCHES أو تعريفها، والسطر المعتمد مكرَّرًا في ملفه.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { appendFile, cp, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const tmp = await realpath(await mkdtemp(path.join(os.tmpdir(), 'tj-r39-consent-')));
test.after(() => rm(tmp, { recursive: true, force: true }));
const base = path.join(tmp, 'src');
await cp(path.join(ROOT, 'src'), base, { recursive: true, filter: (p) => !p.includes(`${path.sep}fonts${path.sep}`) });

let n = 0;
/** نسخة من src يُلحق بملف فيها سطر (أو يُستبدل نص)، ونتيجة الفحص الثابت عليها. */
async function staticWith(rel, change) {
  const dir = path.join(tmp, `case-${++n}`);
  await cp(base, dir, { recursive: true });
  const file = path.join(dir, rel);
  if (typeof change === 'string') await appendFile(file, `\n${change}\n`);
  else await writeFile(file, change(await readFile(file, 'utf8')));
  return spawnSync(process.execPath, [path.join(ROOT, 'scripts/check-static.mjs'), '--src', dir], { cwd: ROOT, encoding: 'utf8' });
}

const PANEL = 'player/panel/column.js';
const CAPTURE = 'main-world/capture.js';
const R39 = 'اسم يوتيوب داخلي خارج src/player/youtube-dom.js';

test('R39: الأسماء بحروف كبيرة، والمعرّف في محدد سمة، وأسماء يوتيوب خارج النمطين، كلها خارج youtube-dom.js مخالفة', async () => {
  const cases = {
    'tagName بحروف كبيرة': "export const _m = (el) => el.tagName === 'YTD-WATCH-FLEXY';",
    '[id="secondary"]': "export const _m = (doc) => doc.querySelector('[id=\"secondary\"]');",
    "[id='below']": "export const _m = (doc) => doc.querySelector(\"[id='below']\");",
    '.html5-video-player': "export const _m = (doc) => doc.querySelector('.html5-video-player');",
    'video.html5-main-video': "export const _m = (doc) => doc.querySelector('video.html5-main-video');",
    '.caption-window': "export const _m = (doc) => doc.querySelector('.caption-window');",
    'tp-yt-paper-dialog': "export const _m = (doc) => doc.querySelector('tp-yt-paper-dialog');",
    'حدث yt-action': "document.addEventListener('yt-action', () => {});",
    '#masthead-container': "export const _m = (doc) => doc.querySelector('#masthead-container');",
    '#player-container': "export const _m = (doc) => doc.querySelector('#player-container');",
    "getElementById('player-container')": "export const _m = (doc) => doc.getElementById('player-container');",
  };
  for (const [label, line] of Object.entries(cases)) {
    const r = await staticWith(PANEL, line);
    assert.equal(r.status, 1, `${label}: ${r.stdout}`);
    assert.ok(r.stderr.includes(`${PANEL}:`) && r.stderr.includes(R39), `${label}: ${r.stderr}`);
  }
});

test('R39: سطر capture.js المستثنى مرة واحدة في ملفه، ومكرَّره في دالة أخرى مخالفة', async () => {
  const r = await staticWith(CAPTURE, 'export function _m() {\n  const r = window.ytInitialPlayerResponse;\n  return r;\n}');
  assert.equal(r.status, 1, r.stdout);
  assert.match(r.stderr, /main-world\/capture\.js: سطر معتمد مكرَّر 2 مرات: const r = window\.ytInitialPlayerResponse;/);
});

const YA = 'core/consent/youtube-access.js';
const APPROVED = 'return Promise.resolve(api.permissions.request({ origins: [...YOUTUBE_MATCHES] })).then((granted) => granted === true, () => false);';

test('سطر الموافقة: الأقواس والسلسلة الاختيارية، والاسم المستعار والتفكيك في ملف آخر أو في ملف الموافقة نفسه، كلها مخالفة', async () => {
  const cases = [
    ['pages/popup/main.js', "export const _m = (api) => api.permissions['request']({ origins: ['https://*/*'] });", /واجهة تحتاج إذنًا غير معتمد/],
    ['pages/popup/main.js', "export const _m = (api) => api.permissions?.request({ origins: ['https://*/*'] });", /واجهة تحتاج إذنًا غير معتمد/],
    ['pages/popup/main.js', "export const _m = (api) => { const p = api.permissions; return p.request({ origins: ['https://*/*'] }); };", /كائن الأذونات خارج ملفي الموافقة/],
    ['pages/popup/main.js', "export const _m = ({ permissions: { request } }) => request({ origins: ['https://*/*'] });", /كائن الأذونات خارج ملفي الموافقة/],
    ['pages/settings/main.js', "export const _m = (chrome) => { const { permissions } = chrome; return permissions; };", /كائن الأذونات خارج ملفي الموافقة/],
    ['pages/settings/main.js', "export const _m = () => globalThis.chrome['permissions'];", /كائن الأذونات خارج ملفي الموافقة/],
    [YA, "export const _m = (api) => { const p = api.permissions; return p.request({ origins: ['https://*/*'] }); };", /طلب إذن خارج السطر المعتمد/],
    [YA, `export function _m(api) {\n  ${APPROVED}\n}`, /سطر معتمد مكرَّر 2 مرات/],
  ];
  for (const [rel, line, want] of cases) {
    const r = await staticWith(rel, line);
    assert.equal(r.status, 1, `${rel}: ${line}\n${r.stdout}`);
    assert.match(r.stderr, want, `${rel}: ${line}\n${r.stderr}`);
  }
});

test('سطر الموافقة: قائمة الأصول YOUTUBE_MATCHES تُنسخ نشرًا ولا تُعدَّل، وتعريفها بقيمة البيان', async () => {
  const pushed = await staticWith(YA, 'YOUTUBE_MATCHES.push("https://*/*");');
  assert.equal(pushed.status, 1);
  assert.match(pushed.stderr, /youtube-access\.js:\d+: YOUTUBE_MATCHES يُنسخ نشرًا/);
  const widened = await staticWith('core/model/ids.js', (text) => text.replace("export const YOUTUBE_MATCHES = Object.freeze(['https://www.youtube.com/*']);", "export const YOUTUBE_MATCHES = Object.freeze(['https://*/*']);"));
  assert.equal(widened.status, 1);
  assert.match(widened.stderr, /core\/model\/ids\.js: تعريف YOUTUBE_MATCHES غائب أو بغير قيمة content_scripts\.matches/);
});

test('الفحص الثابت على src نفسه ناجح بالقواعد الجديدة', () => {
  const r = spawnSync(process.execPath, [path.join(ROOT, 'scripts/check-static.mjs'), '--src', base], { cwd: ROOT, encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
});
