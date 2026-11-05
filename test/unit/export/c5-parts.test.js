// تدقيق 7a66f91، المرحلة C5، U31 (القرار Q23): خطة التقسيم splitPlan تبقي الأجزاء ضمن حد الرفع (50 ملفًا وحجم كل ملف)،
// وتعارض الشرطين خطأ واضح قبل التنزيل. واجهة جديدة، وسلوكها عبر buildExport في c5-export.test.js.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CONTENT_SPLIT } from '../../../src/core/export/index.js';
import { UPLOAD_LIMITS, splitPlan } from '../../../src/core/export/parts.js';
import { MAX_FILES, MAX_FILE_BYTES } from '../../../src/core/import/index.js';
import { TjError } from '../../../src/core/errors/index.js';
import { makeCues } from '../../helpers/fixtures.js';

const tjCode = (fn) => {
  try {
    fn();
  } catch (e) {
    assert.ok(e instanceof TjError, `خطأ غير متوقع: ${e?.stack ?? e}`);
    return e;
  }
  return assert.fail('كان يجب أن يُرفض');
};

test('U31: حد الرفع حدّ الاستيراد نفسه (50 ملفًا و5 م.ب للملف)', () => {
  assert.deepEqual(UPLOAD_LIMITS, { files: MAX_FILES, bytes: MAX_FILE_BYTES });
  assert.deepEqual([MAX_FILES, MAX_FILE_BYTES], [50, 5 * 1024 * 1024]);
});

test('U31: لكل عدد حتى 50,000 ولكل حجم مسموح، لا تتجاوز الخطة 50 جزءًا، ويُرفع الحجم بتنبيه حين يلزم', () => {
  for (const count of [51, 2501, 9999, 10001, 25001, 50000]) {
    const cues = makeCues(count, { durMs: 900, gapMs: 100, text: () => 'x.' });
    for (const size of [50, 51, 199, 200, 999, 2000]) {
      for (const by of ['content', 'count']) {
        const plan = splitPlan(cues, { size, by });
        if (count <= size) {
          assert.equal(plan, null);
          continue;
        }
        assert.ok(plan.ranges.length <= 50, `${count}/${size}/${by}: ${plan.ranges.length}`);
        assert.equal(plan.raised, Math.ceil(count / size) > 50, `${count}/${size}/${by}`);
        assert.equal(plan.ranges.at(-1).to, count);
      }
    }
  }
});

test('U31: تعارض الشرطين خطأ واضح (EX_SPLIT_IMPOSSIBLE)، وجزء أكبر من الحد بحجم يمكن تصغيره EX_SPLIT_PART_TOO_LARGE', () => {
  const cues = makeCues(40, { text: () => 'x'.repeat(400) });
  const tight = tjCode(() => splitPlan(cues, { size: 4, by: 'count' }, { files: 10, bytes: 1500 }));
  assert.equal(tight.code, 'EX_SPLIT_IMPOSSIBLE');
  const raisedTight = tjCode(() => splitPlan(cues, { size: 2, by: 'count' }, { files: 10, bytes: 1500 }));
  assert.equal(raisedTight.code, 'EX_SPLIT_IMPOSSIBLE', 'الحجم مرفوع إلى الحد الأدنى ولا يتسع');
  const smaller = tjCode(() => splitPlan(cues, { size: 8, by: 'count' }, { files: 10, bytes: 5000 }));
  assert.equal(smaller.code, 'EX_SPLIT_PART_TOO_LARGE');
  assert.equal(splitPlan(cues, { size: 5, by: 'count' }, { files: 10, bytes: 5000 }).ranges.length, 8);
  assert.equal(CONTENT_SPLIT.tolerance, 0.15, 'حارس: التفاوت كما هو');
});
