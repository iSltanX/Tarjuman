// حقول المحرّر: الزمن بصيغة HH:MM:SS,mmm وقيمة النقل بالثواني. لا تخمين: ما لا يطابق الصيغة يُرفض.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseSeconds, parseTimecode } from '../../../src/core/edit/index.js';
import { formatTimecode } from '../../../src/ui/format.js';

test('الزمن: الصيغة المعتمدة، والنقطة بدل الفاصلة، والساعة برقم واحد', () => {
  assert.deepEqual(parseTimecode('00:04:01,200'), { ok: true, ms: 241200 });
  assert.deepEqual(parseTimecode(' 01:02:03.004 '), { ok: true, ms: 3723004 });
  assert.deepEqual(parseTimecode('0:00:10,500'), { ok: true, ms: 10500 });
  assert.deepEqual(parseTimecode('100:00:00,000'), { ok: true, ms: 360000000 });
});

test('الزمن: الأرقام العربية والفاصلة العشرية العربية تُقبل كما تُكتب', () => {
  assert.deepEqual(parseTimecode('٠٠:٠١:٠٢٫٥٠٠'), { ok: true, ms: 62500 });
  assert.deepEqual(parseTimecode('۰۰:۰۰:۰۵,۰۰۰'), { ok: true, ms: 5000 });
});

test('الزمن السالب يُقرأ سالبًا ليُعرض خطأً، ولا يُقصّ', () => {
  assert.deepEqual(parseTimecode('-00:00:01,000'), { ok: true, ms: -1000 });
  assert.deepEqual(parseTimecode('−00:00:01,500'), { ok: true, ms: -1500 });
});

test('الزمن: ما لا يطابق الصيغة يُرفض بلا تخمين', () => {
  for (const bad of ['', '1:2:3', '00:60:00,000', '00:00:61,000', '00:00:01,5', '00:00:01', '00:00:01,0000', 'abc', '00:00:01,000x', '1000:00:00,000', null, 12]) {
    assert.equal(parseTimecode(bad).ok, false, String(bad));
  }
});

test('الزمن: ذهاب وإياب مع formatTimecode للعرض، ومنه السالب', () => {
  for (const ms of [0, 1, 999, 61000, 3723004, 359999999, -1500]) {
    assert.deepEqual(parseTimecode(formatTimecode(ms)), { ok: true, ms }, String(ms));
  }
});

test('الثواني: إشارة اختيارية وكسور حتى ثلاث خانات بأي فاصلة', () => {
  assert.deepEqual(parseSeconds('0.5'), { ok: true, ms: 500 });
  assert.deepEqual(parseSeconds('+1'), { ok: true, ms: 1000 });
  assert.deepEqual(parseSeconds('-2.25'), { ok: true, ms: -2250 });
  assert.deepEqual(parseSeconds('−0,1'), { ok: true, ms: -100 });
  assert.deepEqual(parseSeconds('٫٥'), { ok: true, ms: 500 });
  assert.deepEqual(parseSeconds('١٢٫٠٠١'), { ok: true, ms: 12001 });
  assert.deepEqual(parseSeconds('0'), { ok: true, ms: 0 });
});

test('الثواني: الصيغ غير الصالحة وما يتجاوز الحد مرفوضة', () => {
  for (const bad of ['', '+', '1.2345', '1e3', '١ ٢', '--1', '0x10', '360001', undefined]) {
    assert.equal(parseSeconds(bad).ok, false, String(bad));
  }
});

test('الفاصلة العربية «،» من لوحة المفاتيح العربية مقبولة في الزمن والثواني (مراجعة)', () => {
  assert.deepEqual(parseTimecode('00:01:02،500'), { ok: true, ms: 62500 });
  assert.deepEqual(parseSeconds('0،5'), { ok: true, ms: 500 });
  assert.deepEqual(parseSeconds('−١،٢٥'), { ok: true, ms: -1250 });
});
