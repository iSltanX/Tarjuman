// لغة الواجهة لا تمس البيانات: ملف الترجمة المصدَّر واسمه وبصمته متطابقة بايتًا في اللغتين، وجذر صفحة يوتيوب لا يكتب فيه إلا مسار صفحات الإضافة.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildExport } from '../../../src/core/export/index.js';
import { setLocale } from '../../../src/i18n/index.js';
import { realTrack } from '../../helpers/fixtures.js';

const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../src');

test('تصدير SRT: النص والاسم والبصمة لا تتغير بلغة الواجهة', (ctx) => {
  ctx.after(() => setLocale('ar'));
  const { cues } = realTrack('manual');
  const make = (mode, split) => buildExport({ videoId: 'iG9CE55wbtY', title: 'T', mode, split, now: '2026-11-08T00:00:00.000Z', rand: () => 0.5, track: { key: 'en|manual', lang: 'en', kind: 'manual', cues } });
  for (const [mode, split] of [['normal', null], ['long', null], ['normal', { size: 100 }]]) {
    setLocale('ar');
    const ar = make(mode, split);
    setLocale('en');
    const en = make(mode, split);
    assert.deepEqual(JSON.parse(JSON.stringify(en.files ?? en.file)), JSON.parse(JSON.stringify(ar.files ?? ar.file)), `${mode} ${split}`);
    assert.deepEqual(en.fingerprint, ar.fingerprint);
  }
});

async function walk(dir) {
  const out = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...(await walk(p)));
    else if (e.name.endsWith('.js')) out.push(p);
  }
  return out;
}

test('سياق يوتيوب لا يكتب lang ولا dir على جذر الصفحة', async () => {
  const writer = /documentElement[^;\n]*setAttribute|documentElement\.(lang|dir)\s*=/;
  const scoped = [...(await walk(path.join(SRC, 'player'))), ...(await walk(path.join(SRC, 'content')))];
  for (const f of scoped) assert.ok(!writer.test(await readFile(f, 'utf8')), path.relative(SRC, f));
  const content = await readFile(path.join(SRC, 'content/locale.js'), 'utf8');
  assert.ok(!content.includes('applyDocumentLocale'));
});
