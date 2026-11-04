// الشعار «المعيّنان المتشابكان» (docs/identity-v3.md): التركيب بصندوق لوحة التصميم ونسبتها، والاسم بقاعدة nonzero (لا تقطيع)
// والعلامة بقاعدة evenodd (التداخل مفرّغ)، والمجموعات الثلاث باقية لثبات الواجهة، وعلامة شبكة 48 هي علامة التركيب نفسها مصغّرة.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { LOGO_RATIO, LOGO_VIEWBOX, MARK_PATH, MARK_VIEWBOX, logo } from '../../../src/ui/logo.js';
import { newDocument } from '../pages/library/fake-dom.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const nums = (d) => [...d.matchAll(/-?\d+(?:\.\d+)?/g)].map((m) => Number(m[0]));

test('التركيب: صندوق اللوحة ونسبتها، والعرض من الارتفاع، والاسم المقروء أو الزخرفي', () => {
  assert.equal(LOGO_VIEWBOX, '0 8.5 190.27 45.21');
  assert.equal(LOGO_RATIO, 190.27 / 45.21);
  const doc = newDocument();
  const svg = logo({ height: 24, doc });
  assert.equal(svg.getAttribute('viewBox'), LOGO_VIEWBOX);
  assert.equal(svg.getAttribute('class'), 'tj-logo');
  assert.equal(svg.getAttribute('height'), '24');
  assert.equal(svg.getAttribute('width'), String(Math.round(24 * LOGO_RATIO)));
  assert.equal(svg.getAttribute('role'), 'img');
  assert.equal(svg.getAttribute('aria-label'), 'ترجمان');
  const deco = logo({ height: 18, label: null, className: 'x', doc });
  assert.equal(deco.getAttribute('aria-hidden'), 'true');
  assert.equal(deco.getAttribute('role'), null);
  assert.equal(deco.getAttribute('class'), 'tj-logo x');
});

test('الاسم مسار واحد بقاعدة nonzero، والعلامة بقاعدة evenodd، ومجموعة النقاط فارغة', () => {
  const svg = logo({ doc: newDocument() });
  const groups = [...svg.children];
  assert.deepEqual(groups.map((g) => g.getAttribute('class')), ['tj-logo__word', 'tj-logo__glyph', 'tj-logo__dots']);
  const [word, glyph, dots] = groups;
  assert.equal([...word.children].length, 1);
  assert.equal([...word.children][0].getAttribute('fill-rule'), 'nonzero', 'evenodd كان سبب التقطيع المرفوض');
  assert.equal([...glyph.children].length, 1);
  assert.equal([...glyph.children][0].getAttribute('fill-rule'), 'evenodd', 'تداخل المعيّنين مفرّغ');
  assert.equal([...dots.children].length, 0, 'لا نقاط منفصلة');
  // الاسم داخل الصندوق ويسار العلامة؛ والعلامة معيّنان متساويان.
  const w = nums([...word.children][0].getAttribute('d'));
  const g = nums([...glyph.children][0].getAttribute('d'));
  const xs = (a) => a.filter((_, i) => i % 2 === 0);
  const ys = (a) => a.filter((_, i) => i % 2 === 1);
  assert.ok(Math.max(...xs(g)) <= 190.27 && Math.min(...xs(g)) > 140, 'العلامة يمين التركيب');
  assert.ok(Math.min(...ys(g)) >= 8.5 && Math.max(...ys(g)) <= 8.5 + 45.21);
  assert.ok(Math.min(...w) >= 0 && Math.max(...w) < 140, 'الاسم يسار العلامة داخل الصندوق');
});

test('علامة شبكة 48 هي علامة التركيب نفسها (×1.2 ثم نقل)، وصندوقها وحدها بهامش متساوٍ', () => {
  const svg = logo({ doc: newDocument() });
  const big = nums([...[...svg.children][1].children][0].getAttribute('d'));
  const small = nums(MARK_PATH);
  assert.equal(big.length, small.length);
  const [dx, dy] = [big[0] - small[0] * 1.2, big[1] - small[1] * 1.2];
  small.forEach((v, i) => assert.ok(Math.abs(big[i] - (v * 1.2 + (i % 2 ? dy : dx))) < 0.011, `النقطة ${i}`));
  assert.equal(MARK_VIEWBOX, '1 8 46 32');
  const [x0, y0, w, h] = MARK_VIEWBOX.split(' ').map(Number);
  const mx = small.filter((_, i) => i % 2 === 0);
  const my = small.filter((_, i) => i % 2 === 1);
  assert.equal(+(Math.min(...mx) - x0).toFixed(2), +(x0 + w - Math.max(...mx)).toFixed(2), 'هامش أفقي متساوٍ');
  assert.equal(+(Math.min(...my) - y0).toFixed(2), +(y0 + h - Math.max(...my)).toFixed(2), 'هامش رأسي متساوٍ');
});

test('سكربت المحتوى لا يستورد إلا العلامة: dom.js بلا logo() ولا مسار الاسم', () => {
  const dom = readFileSync(path.join(ROOT, 'src/player/panel/dom.js'), 'utf8');
  assert.match(dom, /import \{ MARK_PATH, MARK_VIEWBOX \} from '..\/..\/ui\/logo.js';/);
  assert.doesNotMatch(dom, /\blogo\(/);
});
