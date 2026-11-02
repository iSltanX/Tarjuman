// اللقطة المجمّدة من tj-v1 (test/fixtures/v1) لم تتغير: كل ملف يطابق بصمة كائنه في الوسم (git blob SHA-1) كما سُجّلت في
// SNAPSHOT.json، ولا ملف زائد. اختبارات التوافق لا تصح إلا على الإصدار الأول كما هو.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../fixtures/v1');
const blobSha = (buf) => createHash('sha1').update(Buffer.concat([Buffer.from(`blob ${buf.length}\0`), buf])).digest('hex');

async function walk(dir) {
  const out = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...(await walk(p)));
    else out.push(p);
  }
  return out;
}

test('لقطة tj-v1 مطابقة للوسم ملفًا ملفًا', async () => {
  const snap = JSON.parse(await readFile(path.join(DIR, 'SNAPSHOT.json'), 'utf8'));
  assert.equal(snap.tag, 'tj-v1');
  const files = (await walk(path.join(DIR, 'src'))).map((f) => path.relative(DIR, f).split(path.sep).join('/')).sort();
  assert.deepEqual(files, Object.keys(snap.blobs).sort(), 'لا ملف زائد ولا ناقص');
  for (const f of files) assert.equal(blobSha(await readFile(path.join(DIR, f))), snap.blobs[f], f);
});
