// أدوات الخطة (تدقيق 5fedcb9، GM-020): المتطلب بمعيار «جزئي» في مرحلة متحققة «متحقق جزئيًا» لا «لم يُثبت»، وأدلة كتلة
// الحالة كائنات { label, path } موجودة على القرص؛ وأدلة المستودع نفسه كلها كذلك (ضاعت سجلات P4 بتجاهل *.log دون تنبيه).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fsReader, loadPlan } from '../../../tools/plan/lib/load.mjs';
import { requirementState } from '../../../tools/plan/lib/state.mjs';
import { validateDocs, validateEvidence } from '../../../tools/plan/lib/validate.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

test('حالة المتطلب: «جزئي» في مرحلة متحققة «متحقق جزئيًا»، والبقية كما كانت', () => {
  assert.equal(requirementState([{ result: 'partial', verified: true }]), 'partial', 'R28: معياره الوحيد جزئي ومرحلته متحققة');
  assert.equal(requirementState([{ result: 'pass', verified: true }, { result: 'partial', verified: true }]), 'partial');
  assert.equal(requirementState([{ result: 'pass', verified: true }, { result: 'pass', verified: true }]), 'verified');
  assert.equal(requirementState([{ result: 'pass', verified: false }]), 'delivered');
  assert.equal(requirementState([{ result: 'partial', verified: false }]), 'planned', 'الجزئي في فرع غير مدمج لا يُحتسب');
  assert.equal(requirementState([]), 'planned');
});

test('أدلة كتلة الحالة: النص بلا مسار والمسار الغائب تنبيهان؛ والموجود والأنماط والمجلدات لا', () => {
  const files = new Set(['docs/evidence/X/README.md']);
  const read = (p) => (files.has(p) ? 'x' : null);
  const block = {
    data: {
      evidence: [
        'docs/evidence/X/README.md',
        { label: 'سجل', path: 'docs/evidence/X/unit.log' },
        { label: 'المجلد', path: 'docs/evidence/X/' },
        { label: 'اللقطات', path: 'docs/evidence/X/*.png' },
        { label: 'الجدول', path: 'docs/evidence/X/README.md' },
      ],
    },
  };
  const out = validateEvidence({ id: 'PX' }, block, read, 'docs/phases/PX.md');
  assert.deepEqual(out.map((o) => [o.level, o.text.includes('بلا مسار'), o.text.includes('غير موجود')]), [['warn', true, false], ['warn', false, true]]);
  assert.match(out[1].text, /unit\.log/);
});

test('أدلة المستودع: كل دليل في كتل الحالة كائن بمسار موجود', () => {
  const read = fsReader(ROOT);
  const { plan } = loadPlan(read);
  const bad = validateDocs(plan, read).filter((o) => /دليل بلا مسار|الدليل غير موجود/.test(o.text));
  assert.deepEqual(bad.map((o) => o.text), []);
});
