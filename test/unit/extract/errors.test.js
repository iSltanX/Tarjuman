// رموز الاستخراج والتصدير (P3-AC6): لكل رمز رسالة عربية تقول ما حدث وما يمكن فعله، بلا رابط ولا رمز.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MESSAGES, PREFIXES } from '../../../src/core/errors/extract.js';
import { TjError, hasCode, messageFor } from '../../../src/core/errors/index.js';
import { findSecrets } from '../../../src/core/diagnostics/sanitize.js';

const ARABIC = /[؀-ۿ]/;
// أفعال أمر تدل على أن الرسالة تقترح خطوة تالية.
const ACTION = /(?:^|[\s،.])(?:اختر|فعّل|أوقف|أعد|صحّح|أكمل|انسخ|عُد|جرّب|افتح|راجع|تأكد|صغّر|انتظر)(?=[\s،.]|$)/u;

test('كل رمز في المجال ببادئته ورسالته عربية تقول ما حدث وما يمكن فعله', () => {
  const entries = Object.entries(MESSAGES);
  assert.ok(entries.length >= 14, `رموز ${entries.length}`);
  for (const [code, msg] of entries) {
    assert.ok(PREFIXES.some((p) => code.startsWith(p)), `${code}: بادئة`);
    assert.ok(ARABIC.test(msg), `${code}: عربية`);
    assert.ok(ACTION.test(msg), `${code}: لا خطوة تالية في «${msg}»`);
    assert.ok(msg.trim().endsWith('.'), `${code}: تنتهي بنقطة`);
    assert.deepEqual(findSecrets(msg), [], `${code}: بلا رابط ولا رمز`);
    assert.ok(hasCode(code), `${code}: مسجّل في الفهرس`);
  }
});

test('رموز عقد الاستخراج كلها حاضرة', () => {
  for (const code of [
    'EX_WRONG_VIDEO', 'EX_NO_VIDEO', 'EX_NOT_ENGLISH', 'EX_TRANSLATED_TRACK', 'EX_EMPTY_BODY',
    'EX_UNSUPPORTED_FORMAT', 'EX_INVARIANT_FAILED', 'EX_BEYOND_DURATION', 'EX_MAYBE_INCOMPLETE', 'EX_LIVE', 'KIND_MISMATCH', 'EX_NO_TRACK',
  ]) assert.ok(MESSAGES[code], code);
});

test('القوالب تُملأ، والخطأ يحمل الرمز والرسالة', () => {
  const e = new TjError('EX_TIMING_INVALID', { params: { list: '3، 4' } });
  assert.equal(e.code, 'EX_TIMING_INVALID');
  assert.match(e.message, /متداخلة مع التالي: 3، 4\./);
  assert.equal(messageFor('EX_EMPTY_TEXT', { list: '7' }).includes('{'), false);
});
