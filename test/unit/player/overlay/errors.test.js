// رموز مجال الطبقة PL_: ببادئتها وبرسائل عربية تقول ما حدث وما يُفعل، ويحملها TjError بتفاصيل منقّاة.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MESSAGES, PREFIXES } from '../../../../src/core/errors/overlay.js';
import { TjError, hasCode, messageFor } from '../../../../src/core/errors/index.js';
import { findSecrets } from '../../../../src/core/diagnostics/sanitize.js';

test('كل رمز يبدأ بـPL_ ورسالته عربية وفيها ما يمكن فعله', () => {
  assert.deepEqual([...PREFIXES], ['PL_']);
  assert.ok(Object.keys(MESSAGES).length >= 3);
  for (const [code, msg] of Object.entries(MESSAGES)) {
    assert.match(code, /^PL_[A-Z0-9_]+$/);
    assert.ok(hasCode(code), `${code} غير مسجّل في الفهرس`);
    assert.equal(messageFor(code), msg);
    assert.match(msg, /[؀-ۿ]/);
    assert.match(msg, /أعد|اخرج|انسخ/, `${code}: بلا خطوة تالية`);
  }
});

test('TjError بتفاصيل منقّاة من الروابط والرموز', () => {
  const e = new TjError('PL_MOUNT_FAILED', { detail: 'TypeError at https://www.youtube.com/api/timedtext?pot=AAAAAAAAAAAAAAAAAAAAAAAA' });
  assert.equal(e.code, 'PL_MOUNT_FAILED');
  assert.equal(findSecrets(e.detail).length, 0);
});
