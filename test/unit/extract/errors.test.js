// رموز الاستخراج والتصدير (P3-AC6): لكل رمز رسالة عربية تقول ما حدث وما يمكن فعله، بلا رابط ولا رمز.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MESSAGES, PREFIXES } from '../../../src/core/errors/extract.js';
import { TjError, hasCode, messageFor } from '../../../src/core/errors/index.js';
import { setLocale } from '../../../src/i18n/index.js';
import { findSecrets } from '../../../src/core/diagnostics/sanitize.js';

const ARABIC = /[؀-ۿ]/;
// أفعال أمر تدل على أن الرسالة تقترح خطوة تالية.
const ACTION = /(?:^|[\s،.])(?:اختر|فعّل|أوقف|أعد|صحّح|أكمل|انسخ|عُد|جرّب|افتح|راجع|راجعه|تأكد|صغّر|انتظر)(?=[\s،.]|$)/u;

// الرسائل الدالّة وعيّناتها: EX_UNSUPPORTED_FORMAT تسمّي الصيغة إن عُرفت (الفكرة ٤، الإنذار المبكر)، وبلا اسم كما كانت.
const FUNCTION_SAMPLES = { EX_UNSUPPORTED_FORMAT: [{}, { format: 'srv3' }, { format: 'vtt' }] };

test('كل رمز في المجال ببادئته ورسالته عربية تقول ما حدث وما يمكن فعله', () => {
  const entries = Object.entries(MESSAGES).flatMap(([code, msg]) => {
    if (typeof msg !== 'function') return [[code, msg]];
    assert.ok(Object.hasOwn(FUNCTION_SAMPLES, code), `${code}: رسالة دالّة بلا عيّنات`);
    return FUNCTION_SAMPLES[code].map((p) => [code, msg(p)]);
  });
  assert.ok(entries.length >= 14, `رموز ${entries.length}`);
  for (const [code, msg] of entries) {
    assert.equal(typeof msg, 'string', code);
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
    'EX_WRONG_VIDEO', 'EX_NO_VIDEO', 'EX_BAD_LANG', 'EX_EMPTY_BODY',
    'EX_UNSUPPORTED_FORMAT', 'EX_INVARIANT_FAILED', 'EX_BEYOND_DURATION', 'EX_MAYBE_INCOMPLETE', 'EX_LIVE', 'KIND_MISMATCH', 'EX_NO_TRACK',
  ]) assert.ok(MESSAGES[code], code);
});

test('القوالب تُملأ، والخطأ يحمل الرمز والرسالة', () => {
  const e = new TjError('EX_TIMING_INVALID', { params: { list: '3، 4' } });
  assert.equal(e.code, 'EX_TIMING_INVALID');
  assert.match(e.message, /متداخلة مع التالي: 3، 4\./);
  assert.equal(messageFor('EX_EMPTY_TEXT', { list: '7' }).includes('{'), false);
});

test('الفكرة ٤ (الإنذار المبكر): EX_UNSUPPORTED_FORMAT تسمّي الصيغة المرفوضة معزولةً، وبلا صيغة صالحة كما كانت', (ctx) => {
  ctx.after(() => setLocale('ar'));
  const LRI = String.fromCodePoint(0x2066);
  const PDI = String.fromCodePoint(0x2069);
  const plain = 'صيغة الترجمة غير مدعومة في هذه النسخة، فلم يُصدَّر شيء. جرّب فيديو آخر، وانسخ تقرير التشخيص لمراجعة الصيغة.';
  assert.equal(messageFor('EX_UNSUPPORTED_FORMAT'), plain, 'بلا معاملات: النص السابق حرفيًا');
  assert.equal(messageFor('EX_UNSUPPORTED_FORMAT', { format: 'srv3' }), plain.replace('صيغة الترجمة', `صيغة الترجمة (${LRI}srv3${PDI})`));
  assert.ok(messageFor('EX_UNSUPPORTED_FORMAT', { format: 'vtt' }).includes(`(${LRI}vtt${PDI})`));
  // لا يُعرض إلا رمز صيغة: النص الحر والرابط والفارغ وnull تعطي النص بلا اسم.
  for (const bad of [null, '', 'SRV3', 'srv3 x', '<b>', 'https://www.youtube.com/x', 7]) assert.equal(messageFor('EX_UNSUPPORTED_FORMAT', { format: bad }), plain, String(bad));
  setLocale('en');
  assert.equal(messageFor('EX_UNSUPPORTED_FORMAT'), 'This subtitle format isn’t supported in this version, so nothing was exported. Try another video, and copy the diagnostics report so the format can be checked.');
  assert.equal(messageFor('EX_UNSUPPORTED_FORMAT', { format: 'vtt' }), 'This subtitle format (vtt) isn’t supported in this version, so nothing was exported. Try another video, and copy the diagnostics report so the format can be checked.');
  assert.equal(messageFor('EX_UNSUPPORTED_FORMAT', { format: '<b>' }), messageFor('EX_UNSUPPORTED_FORMAT'));
});
