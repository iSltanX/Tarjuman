// قراءة الملف (R12): UTF-8 بتحقق صارم لا تخمين، وحد أقصى للحجم قبل القراءة، وبيانات ثنائية، وفشل القراءة.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MAX_FILE_BYTES, readFileText } from '../../../src/core/import/read-file.js';
import { TjError } from '../../../src/core/errors/index.js';
import { fileOf } from '../../fixtures/srt/index.js';

const code = async (promise) => {
  try {
    await promise;
  } catch (e) {
    assert.ok(e instanceof TjError, `خطأ غير متوقع: ${e}`);
    return e;
  }
  return assert.fail('كان يجب أن يُرفض');
};

test('نص UTF-8 يُقرأ كما هو، والـBOM يبقى للمحلّل ليتعامل معه', async () => {
  assert.equal(await readFileText(fileOf('1\nمرحبًا\n')), '1\nمرحبًا\n');
  assert.equal(await readFileText(fileOf(new Uint8Array([0xef, 0xbb, 0xbf, 0x31]))), '\uFEFF1');
  assert.equal(await readFileText(fileOf('')), '');
});

test('Windows-1256 وUTF-16 وبايتات UTF-8 غير صالحة: IM_NOT_UTF8 برسالة تقول ما يُفعل', async () => {
  const cp1256 = new Uint8Array([0xe3, 0xd1, 0xcd, 0xc8, 0xc7]);
  const utf16le = Buffer.from('\uFEFF1\n00:00:01,000 --> 00:00:02,000\nمرحبًا\n', 'utf16le');
  const utf16be = Buffer.from(utf16le).swap16();
  for (const [label, bytes] of [['cp1256', cp1256], ['utf16le', utf16le], ['utf16be', utf16be], ['utf8 مقطوع', new Uint8Array([0xd9])], ['utf8 غير صالح', new Uint8Array([0xc3, 0x28])]]) {
    const e = await code(readFileText(fileOf(bytes)));
    assert.equal(e.code, 'IM_NOT_UTF8', label);
    assert.match(e.message, /UTF-8/);
  }
});

test('بايت NUL يعني ملفًا ثنائيًا لا نصًا', async () => {
  assert.equal((await code(readFileText(fileOf('1\n\u0000\n')))).code, 'IM_NOT_TEXT');
  assert.equal((await code(readFileText(fileOf(Buffer.from('1\n2\n', 'utf16le'))))).code, 'IM_NOT_TEXT', 'UTF-16 لاتيني بلا BOM');
});

test('الحجم يُفحص قبل القراءة: ما فوق الحد لا يُقرأ أصلًا', async () => {
  let read = false;
  const huge = { name: 'huge.srt', size: MAX_FILE_BYTES + 1, arrayBuffer: async () => { read = true; return new ArrayBuffer(0); } };
  const e = await code(readFileText(huge));
  assert.equal(e.code, 'IM_FILE_TOO_LARGE');
  assert.equal(read, false);
  assert.match(e.message, /5 م\.ب/);
  const edge = { name: 'edge.srt', size: MAX_FILE_BYTES, arrayBuffer: async () => new TextEncoder().encode('x').buffer };
  assert.equal(await readFileText(edge), 'x');
});

test('حجم يُعلَن صغيرًا والمحتوى كبير يُرفض أيضًا بعد القراءة', async () => {
  const liar = { name: 'liar.srt', size: 10, arrayBuffer: async () => new ArrayBuffer(MAX_FILE_BYTES + 1) };
  assert.equal((await code(readFileText(liar))).code, 'IM_FILE_TOO_LARGE');
});

test('فشل القراءة وما ليس ملفًا: IM_READ_FAILED', async () => {
  const broken = { name: 'x.srt', size: 3, arrayBuffer: async () => { throw new Error('boom'); } };
  assert.equal((await code(readFileText(broken))).code, 'IM_READ_FAILED');
  for (const notFile of [null, undefined, 'نص', 42, {}]) assert.equal((await code(readFileText(notFile))).code, 'IM_READ_FAILED', String(notFile));
});
