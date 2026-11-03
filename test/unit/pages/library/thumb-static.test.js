// الاستثناء المسمّى لصور الفيديو في الفحص الثابت (قرار سلطان 2026-11-03) حصري بدقة: البادئة `https://i.ytimg.com/vi/` وحدها في
// `pages/library/thumb.js` وحده تمرّ، وكل ما عداها يبقى ممنوعًا (النطاق في ملف آخر، وغير البادئة في ملف الصورة، وأي قناة
// شبكة fetch وXHR وImage() ولو في ملف الصورة). يُشغَّل الفحص على نسخة مؤقتة من src تُزرع فيها المخالفات (نمط static-downloads).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const run = (src) => spawnSync(process.execPath, [path.join(ROOT, 'scripts/check-static.mjs'), '--src', src], { encoding: 'utf8' });
const THUMB = path.join('pages', 'library', 'thumb.js');

async function withTree(mutate) {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'tj-thumb-static-'));
  try {
    await cp(path.join(ROOT, 'src'), dir, { recursive: true, filter: (p) => !p.includes(`${path.sep}fonts${path.sep}`) });
    await mutate(dir);
    return run(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
const appendTo = (rel, text) => async (dir) => {
  const p = path.join(dir, rel);
  await writeFile(p, `${await readFile(p, 'utf8')}\n${text}\n`);
};

test('الشجرة الحالية ناجحة: بادئة الصورة في thumb.js مسموحة', () => {
  const r = run(path.join(ROOT, 'src'));
  assert.equal(r.status, 0, r.stderr);
});

test('البادئة نفسها في أي ملف آخر ممنوعة (المحفوظات وغيرها)', async () => {
  for (const rel of [path.join('pages', 'library', 'view.js'), path.join('pages', 'settings', 'view.js'), path.join('core', 'model', 'ids.js'), path.join('player', 'overlay', 'fonts.js')]) {
    const r = await withTree(appendTo(rel, "export const stray = 'https://i.ytimg.com/vi/';"));
    assert.equal(r.status, 1, rel);
    assert.match(r.stderr, new RegExp(`${rel.replace(/[\\/.]/g, '[\\\\/.]')}:\\d+: نطاق خارجي https://i\\.ytimg\\.com/vi/`), rel);
  }
});

test('في ملف الصورة نفسه: غير البادئة المسمّاة ممنوع (رابط كامل، ونطاق آخر من يوتيوب، ومضيف آخر، وبلا مسار vi)', async () => {
  const bad = [
    "export const a = 'https://i.ytimg.com/vi/abc/mqdefault.jpg';",
    "export const b = 'https://i.ytimg.com/';",
    "export const c = 'https://img.youtube.com/vi/';",
    "export const d = 'https://example.com/vi/';",
    "export const e = 'http://i.ytimg.com/vi/';",
    "export const f = '//i.ytimg.com/vi/';",
  ];
  for (const line of bad) {
    const r = await withTree(appendTo(THUMB, line));
    assert.equal(r.status, 1, line);
    assert.match(r.stderr, /thumb\.js:\d+: نطاق خارجي/, line);
  }
});

test('قنوات الشبكة ممنوعة حتى في ملف الصورة: fetch وXMLHttpRequest وnew Image() وsendBeacon', async () => {
  const cases = [
    ['fetch', "export const load = (id) => fetch(`https://i.ytimg.com/vi/${id}`);", /thumb\.js:\d+: طلب شبكة من الإضافة/],
    ['xhr', 'export const x = () => new XMLHttpRequest();', /thumb\.js:\d+: طلب شبكة من الإضافة/],
    ['image', 'export const y = () => new Image();', /thumb\.js:\d+: قنوات شبكة ممنوعة/],
    ['beacon', "export const z = () => navigator.sendBeacon('x');", /thumb\.js:\d+: قنوات شبكة ممنوعة/],
  ];
  for (const [name, line, re] of cases) {
    const r = await withTree(appendTo(THUMB, line));
    assert.equal(r.status, 1, name);
    assert.match(r.stderr, re, name);
  }
});

test('الاستثناء لا يرفع بقية القيود: InnerTube وinnerHTML وlocalStorage ما زالت ممنوعة في ملف الصورة', async () => {
  for (const line of ['export const u = "youtubei/v1/player";', 'export const h = (n) => { n.innerHTML = "x"; };', 'export const s = () => localStorage.getItem("k");']) {
    const r = await withTree(appendTo(THUMB, line));
    assert.equal(r.status, 1, line);
  }
});
