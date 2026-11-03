// إشعارات الأطراف الثالثة (جولة النشر T4): الملف المتتبَّع هو ما يولّده notices.mjs من ملفات ترجمان، وكل خط مشحون منسوب،
// وكل أيقونة في الواجهة مصنّفة (من Lucide كما هي، أو معدّلة، أو مرسومة لترجمان)، فأيقونة جديدة بلا تصنيف تُفشل الاختبار،
// والبناء يشحن الملف في جذر الحزمة، والتدقيق يكشف غيابه أو نقصه.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { LUCIDE_ICONS, LUCIDE_LICENSE, NOTICES_FILE, ORIGINAL_ICONS, generate, shippedFonts } from '../../../scripts/release/notices.mjs';
import { auditPackage } from '../../../scripts/release/audit.mjs';
import { ICONS } from '../../../src/ui/icons.js';
import { SUBTITLE_FONT_LIST } from '../../../src/ui/subtitle-fonts.js';
import { UI_FONT_LIST } from '../../../src/ui/ui-fonts.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const notices = await readFile(path.join(ROOT, NOTICES_FILE), 'utf8');

test('الملف المتتبَّع يطابق ما يولّده المولّد من ملفات ترجمان (لا نص بيد)', () => {
  assert.ok(notices === generate(), 'شغّل node scripts/release/notices.mjs');
  assert.ok(notices.startsWith('THIRD-PARTY NOTICES — Tarjuman (ترجمان)'));
  assert.equal(/mijhar|مِجهَر|preact/i.test(notices), false, 'لا شيء من مشروع آخر');
});

test('كل خط مشحون منسوب بسطر حقوقه من رخصته، والمراعي مرة واحدة وإن خدم الترجمة والواجهة', async () => {
  const fonts = shippedFonts();
  const licenses = new Set([...SUBTITLE_FONT_LIST, ...UI_FONT_LIST].map((f) => f.license));
  assert.equal(fonts.length, licenses.size);
  assert.deepEqual(fonts.map((f) => f.name), ['Almarai', 'Noto Sans Arabic', 'Tajawal', 'Markazi Text', 'Cairo']);
  for (const f of fonts) {
    const head = (await readFile(path.join(ROOT, 'src', f.license), 'utf8')).split('\n')[0].trim();
    assert.ok(notices.includes(head), `${f.name}: ${head}`);
    for (const file of f.files) assert.ok(notices.includes(file), file);
  }
  assert.ok(notices.includes('SIL OPEN FONT LICENSE Version 1.1'));
});

test('ترخيص Lucide منسوخ حرفيًا بقسم Feather، ودوال esbuild بترخيصها، وأدوات البناء بإصدارات ملف القفل', async () => {
  const lucide = (await readFile(path.join(ROOT, LUCIDE_LICENSE), 'utf8')).trimEnd();
  assert.match(lucide, /^ISC License\n\nCopyright \(c\) \d{4} Lucide Icons and Contributors/);
  assert.match(lucide, /derived from the Feather project/);
  assert.match(lucide, /Copyright \(c\) 2013-present Cole Bemis/);
  assert.ok(notices.includes(lucide));
  assert.match(notices, /1\.3 Bundler helpers — esbuild [\d.]+ \(MIT\)[\s\S]*Copyright \(c\) 2020 Evan Wallace/);
  const lock = JSON.parse(await readFile(path.join(ROOT, 'package-lock.json'), 'utf8'));
  for (const name of ['esbuild', 'web-ext']) assert.ok(notices.includes(`* ${name} ${lock.packages[`node_modules/${name}`].version} — `), name);
});

test('كل أيقونة في مجموعة الواجهة مصنّفة مرة واحدة، والأسماء المسجّلة موجودة في ملفاتها', async () => {
  const ui = LUCIDE_ICONS['src/ui/icons.js'];
  const classified = [...Object.keys(ui.unchanged), ...Object.keys(ui.adapted), ...ORIGINAL_ICONS['src/ui/icons.js']];
  assert.deepEqual([...classified].sort(), Object.keys(ICONS).sort(), 'أيقونة جديدة في src/ui/icons.js تُسجَّل في notices.mjs');
  assert.equal(new Set(classified).size, classified.length, 'لا أيقونة في صنفين');
  const files = new Set([...Object.keys(LUCIDE_ICONS), ...Object.keys(ORIGINAL_ICONS)]);
  for (const file of files) {
    const text = await readFile(path.join(ROOT, file), 'utf8');
    const names = [...Object.keys(LUCIDE_ICONS[file]?.unchanged ?? {}), ...Object.keys(LUCIDE_ICONS[file]?.adapted ?? {}), ...(ORIGINAL_ICONS[file] ?? [])];
    for (const n of names) assert.ok(new RegExp(`^\\s+'?${n}'?: [[(]`, 'm').test(text), `${file}: ${n}`);
  }
});

test('البناء يشحن الإشعارات في جذر الحزمة، والتدقيق يكشف غيابها ونقص نسبة خط أو Lucide', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'tj-t4-notices-'));
  try {
    const out = path.join(dir, 'pkg');
    const r = spawnSync(process.execPath, [path.join(ROOT, 'scripts/build.mjs'), '--out', out], { cwd: ROOT, encoding: 'utf8' });
    assert.equal(r.status, 0, r.stderr);
    assert.ok((await readFile(path.join(out, NOTICES_FILE), 'utf8')) === notices);
    const ok = await auditPackage(out);
    assert.equal(ok.checks.find((c) => c.id === 'third-party-notices').ok, true);
    assert.equal(ok.checks.find((c) => c.id === 'only-expected-files').ok, true);

    const cut = path.join(dir, 'cut');
    await cp(out, cut, { recursive: true });
    await writeFile(path.join(cut, NOTICES_FILE), notices.replace('Copyright 2018 Boutros International.', '').replace('ISC License\n\nCopyright (c)', 'Copyright (c)'));
    const bad = (await auditPackage(cut)).checks.find((c) => c.id === 'third-party-notices');
    assert.equal(bad.ok, false);
    assert.ok(bad.detail.missing.includes('ui/fonts/subtitle/tajawal-OFL.txt') && bad.detail.missing.includes('Lucide (ISC) وFeather (MIT)'));

    await rm(path.join(cut, NOTICES_FILE));
    const gone = await auditPackage(cut);
    assert.equal(gone.checks.find((c) => c.id === 'third-party-notices').ok, false);
    assert.equal(gone.ok, false);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
