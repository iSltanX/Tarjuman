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

async function checkSnapshot(dir) {
  const snap = JSON.parse(await readFile(path.join(dir, 'SNAPSHOT.json'), 'utf8'));
  const files = (await walk(path.join(dir, 'src'))).map((f) => path.relative(dir, f).split(path.sep).join('/')).sort();
  assert.deepEqual(files, Object.keys(snap.blobs).sort(), 'لا ملف زائد ولا ناقص');
  for (const f of files) assert.equal(blobSha(await readFile(path.join(dir, f))), snap.blobs[f], f);
  return snap;
}

test('لقطة tj-v1 مطابقة للوسم ملفًا ملفًا', async () => {
  const snap = await checkSnapshot(DIR);
  assert.equal(snap.tag, 'tj-v1');
});

// لقطة 1.1.0 (AA1): نموذج التخزين والنسخ الاحتياطي كما نُشر في المتاجر، لتثبت اختبارات التوافق أن 1.1.0 يقرأ ما يكتبه 2.0.0.
test('لقطة 1.1.0 مطابقة لالتزامها ملفًا ملفًا', async () => {
  const snap = await checkSnapshot(path.resolve(DIR, '../v1.1'));
  assert.equal(snap.version, '1.1.0');
  assert.equal(snap.commit, '594e8043c7323da1dc5af10a1e0c8c1ecb472edc');
});
