// القائمة المنسدلة تُفتح إلى الأعلى حين يقطعها أسفل النافذة ويتسع ما فوق زرها أكثر مما تحته (2026-11-10: كانت قائمة صف المحفوظات
// الأخير تُقطع أسفل الشاشة)، وإلى الأسفل غير ذلك، وبلا قياس (بيئة بلا تخطيط) كما كانت.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMenu } from '../../../src/ui/menu.js';
import { newDocument } from '../pages/library/fake-dom.js';

const rect = (top, bottom) => () => ({ top, bottom, left: 0, right: 0, width: 0, height: bottom - top });

test('القائمة إلى الأعلى عند ضيق ما تحتها، وإلى الأسفل عند سعته، وبلا قياس إلى الأسفل', () => {
  const doc = newDocument();
  const m = createMenu({ label: 'المزيد', items: [{ id: 'a', label: 'بند', onSelect() {} }], doc });
  doc.body.append(m.root);
  const up = () => m.menu.classList.contains('tj-menu__list--up');
  const max = () => m.menu.style.getPropertyValue('--tj-menu-max');

  m.open();
  assert.equal(up(), false, 'بلا نافذة ولا قياس: إلى الأسفل');
  m.close();

  doc.defaultView = { innerHeight: 800 };
  m.button.getBoundingClientRect = rect(700, 732);
  m.menu.getBoundingClientRect = rect(736, 1100);
  m.open();
  assert.equal(up(), true, 'تتجاوز أسفل النافذة وما فوق الزر أوسع: إلى الأعلى');
  m.close();

  m.button.getBoundingClientRect = rect(100, 132);
  m.menu.getBoundingClientRect = rect(136, 500);
  m.open();
  assert.equal(up(), false, 'تتسع تحت الزر: إلى الأسفل، والصنف القديم يُزال');
  m.close();

  m.button.getBoundingClientRect = rect(200, 232);
  m.menu.getBoundingClientRect = rect(236, 900);
  m.open();
  assert.equal(up(), false, 'تتجاوز لكن ما تحت الزر أوسع مما فوقه: تبقى إلى الأسفل');
  assert.equal(max(), '556px', 'وحدّها ما تحت الزر (800 − 232 − 12)، فتُمرَّر من داخلها');
  m.close();

  // مراجعة مستقلة (2026-11-10): نافذة قصيرة وما فوق الزر أوسع لكنه لا يتسع لها كلها ⇒ إلى الأعلى بحدّ ما فوق الزر، لا تتجاوز الحافة.
  doc.defaultView = { innerHeight: 500 };
  m.button.getBoundingClientRect = rect(260, 292);
  m.menu.getBoundingClientRect = rect(296, 596);
  m.open();
  assert.equal(up(), true);
  assert.equal(max(), '248px', 'ما فوق الزر 260 − 12');
  m.close();

  doc.defaultView = { innerHeight: 800 };
  m.button.getBoundingClientRect = rect(100, 132);
  m.menu.getBoundingClientRect = rect(136, 500);
  m.open();
  assert.equal(max(), '', 'متسعة: لا حد من الفتحة السابقة');
});
