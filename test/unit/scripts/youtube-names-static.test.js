// الفكرة ١ (الجولة الثالثة): أسماء يوتيوب الداخلية غير الرسمية في src/player/youtube-dom.js وحده (R39، عقد interfaces §٧)، تفرضه
// قاعدة في RULES في scripts/check-static.mjs (لا في code-rules.mjs: تلك يطبّقها تدقيق الحزمة على الحزمة كلها، وفيها youtube-dom.js
// نفسه). حالات تُمنع، وأضداد قريبة تمر، والاستثناء الوحيد أسطر capture.js المراجَعة حرفيًا.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CODE_RULES } from '../../../scripts/code-rules.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const MSG = 'اسم يوتيوب داخلي خارج src/player/youtube-dom.js';
const checkStatic = (args = []) => spawnSync(process.execPath, [path.join(ROOT, 'scripts/check-static.mjs'), ...args], { cwd: ROOT, encoding: 'utf8' });

/** نسخة من src (بلا الخطوط) يُزرع فيها ما يُختبر، ثم الفحص الثابت عليها. */
async function staticWith(plant) {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'tj-yt-names-'));
  try {
    await cp(path.join(ROOT, 'src'), dir, { recursive: true, filter: (p) => !p.includes(`${path.sep}fonts${path.sep}`) });
    await plant(dir);
    return checkStatic(['--src', dir]);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
const append = async (file, text) => writeFile(file, `${await readFile(file, 'utf8')}\n${text}\n`);
/** أسطر ملف بعينه التي سمّاها الفحص بهذه القاعدة. */
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
const flagged = (stderr, rel) => [...stderr.matchAll(new RegExp(`- ${esc(rel)}:(\\d+): ${esc(MSG)}`, 'g'))].map((m) => Number(m[1]));

// كل سطر يُمنع وحده (رقمه في الملف المزروع رقمه هنا + 1).
const FORBIDDEN = [
  "export const a1 = (doc) => doc.querySelector('#movie_player .ytp-chrome-top');",
  "export const a2 = 'ytd-watch-flexy #secondary-inner';",
  "export const a3 = (doc) => doc.getElementById('movie_player');",
  'export const a4 = (doc, f) => doc.addEventListener(`yt-navigate-finish`, f);',
  "export const a5 = (doc, f) => doc.addEventListener('yt-page-data-updated', f);",
  "export const a6 = (doc, f) => doc.addEventListener('yt-player-updated', f);",
  "export const a7 = '#secondary';",
  "export const a8 = '#primary';",
  "export const a9 = '#below';",
  "export const a10 = '#columns';",
  "export const a11 = (el) => el.hasAttribute('is-single-column');",
  "export const a12 = (doc) => doc.documentElement.hasAttribute('dark');",
  "export const a13 = (mo, doc) => mo.observe(doc.documentElement, { attributes: true, attributeFilter: ['dark'] });",
  "export const a14 = 'html[dark] .x';",
  "export const a15 = (column) => column.id === 'below';",
  "export const a16 = (column) => column.id !== 'secondary-inner';",
  'export const a17 = () => globalThis.ytInitialPlayerResponse;',
  "export const a18 = (p) => p.getPlayerResponse();",
  "export const a19 = (doc) => doc.getElementById('below');",
  "export const a20 = 'x'; // ytp-autohide في تعليق بعد شيفرة يُفحص كسائر القواعد",
];
// أضداد قريبة تمر: أسماء ترجمان، والكلمات العامة، والتعليقات الكاملة.
const ALLOWED = [
  "export const b1 = (dark) => (dark ? 'dark' : 'light');",
  'export const b2 = \':root[data-theme="dark"] .tj-x { color: red; }\';',
  "export const b3 = (pr) => (pr ? 'beside' : 'below');",
  "export const b4 = (p) => p.place === 'below';",
  "export const b5 = { variant: 'primary', tone: 'secondary' };",
  "export const b6 = '#primary-action';",
  "export const b7 = 'yt-dlp';",
  "export const b8 = (el) => el.hasAttribute('data-dark');",
  "export const b9 = (el) => el.id === 'app';",
  '// #movie_player .ytp-autohide وytd-watch-flexy[is-single-column] وhtml[dark] في تعليق كامل لا تُفحص',
  '/* yt-navigate-finish وgetElementById(\'movie_player\') في تعليق كتلة */',
  "export const b10 = (m) => m.matches('(prefers-color-scheme: dark)');",
];

test('أسماء يوتيوب: الشجرة الحالية بلا مخالفة (column.js وsession.js يستوردان، وcapture.js بأسطره المراجَعة)', () => {
  const r = checkStatic();
  assert.equal(r.status, 0, r.stderr);
  assert.doesNotMatch(r.stderr, new RegExp(MSG));
});

test('أسماء يوتيوب: كل اسم داخلي في حرفية أو سطر شيفرة خارج youtube-dom.js يُمنع، والأضداد القريبة والتعليقات الكاملة تمر', async () => {
  const rel = path.join('content', 'yt-names-probe.js');
  const r = await staticWith(async (dir) => {
    await writeFile(path.join(dir, rel), `${[...FORBIDDEN, ...ALLOWED].join('\n')}\n`);
  });
  assert.equal(r.status, 1);
  assert.deepEqual(flagged(r.stderr, rel), FORBIDDEN.map((_, i) => i + 1), r.stderr);
});

test('أسماء يوتيوب: في CSS وHTML كذلك، وسمة data-theme لترجمان تمر', async () => {
  const css = path.join('ui', 'yt-names-probe.css');
  const html = path.join('pages', 'popup', 'yt-names-probe.html');
  const r = await staticWith(async (dir) => {
    await writeFile(path.join(dir, css), '.ytp-caption-window-container { display: none; }\n:root[data-theme="dark"] .tj-x { color: red; }\nhtml[dark] .tj-y { color: blue; }\n');
    await writeFile(path.join(dir, html), '<!doctype html>\n<div id="app" class="tj-x"></div>\n<div class="ytd-watch-flexy"></div>\n');
  });
  assert.deepEqual(flagged(r.stderr, css), [1, 3]);
  assert.deepEqual(flagged(r.stderr, html), [3]);
});

test('أسماء يوتيوب: youtube-dom.js يحويها، وcapture.js بأسطره المراجَعة حرفيًا وحدها، فسطر جديد فيه أو في ملف آخر يُمنع', async () => {
  const dom = path.join('player', 'youtube-dom.js');
  const capture = path.join('main-world', 'capture.js');
  const before = (await readFile(path.join(ROOT, 'src', capture), 'utf8')).split('\n').length;
  const r = await staticWith(async (dir) => {
    await append(path.join(dir, dom), "export const extra = '#movie_player .ytp-new-thing';");
    await append(path.join(dir, capture), "if (doc) doc.addEventListener('yt-navigate-start', scheduleTracks);");
    // السطر المراجَع نفسه في ملف آخر لا يمر: الاستثناء بالملف والسطر معًا.
    await append(path.join(dir, 'content', 'main.js'), 'const r = window.ytInitialPlayerResponse;');
  });
  assert.equal(r.status, 1);
  assert.deepEqual(flagged(r.stderr, dom), []);
  assert.deepEqual(flagged(r.stderr, capture), [before + 1], 'السطر الجديد وحده، لا الأسطر المراجَعة');
  assert.equal(flagged(r.stderr, path.join('content', 'main.js')).length, 1);
});

test('أسماء يوتيوب: القاعدة في الفحص الثابت لا في القواعد المشتركة مع تدقيق الحزمة (الحزمة فيها youtube-dom.js نفسه)', () => {
  for (const rule of CODE_RULES) {
    assert.ok(!rule.re.test("'#movie_player .ytp-right-controls'"), rule.id);
    assert.ok(!rule.re.test("'ytd-watch-flexy #secondary'"), rule.id);
  }
});
