// «قطّة القلم» (الهوية الخامسة «التاء»، اللوحة 07، docs/identity.md §٥) في كل سطح يرسم أيقونات ترجمان، والجملة الحالية في
// قائمة «مزامنة بجملة» لا تُعرف باللون وحده (الثابت ٥ في خطة 3.0.0). التحقق المستقل لـ3.0.0 (ت٣-v3-identity-1 و٢ و٣): لوحة
// النص كانت ترسم الأيقونات نفسها (src/ui/icons.js) بأطراف وزوايا مدوّرة، وحُذف خط الإبراز من الجملة الحالية فبقيت صبغة
// تمييزها عن القائمة 1.35:1، ولا اختبار يسقط بأيٍّ منهما.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { panelCss } from '../../../src/player/panel/styles.js';
import { layerCss } from '../../../src/player/controls/styles.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const read = (rel) => readFileSync(path.join(ROOT, rel), 'utf8');

/** ملفات الشيفرة والأنماط في src/ (بلا الخطوط والصور). */
function sources(dir = 'src') {
  const out = [];
  for (const name of readdirSync(path.join(ROOT, dir))) {
    const rel = `${dir}/${name}`;
    if (statSync(path.join(ROOT, rel)).isDirectory()) out.push(...sources(rel));
    else if (/\.(js|css|html)$/.test(name)) out.push(rel);
  }
  return out;
}

/** تصريحات أول قاعدة بهذا المحدد حرفيًا في نص CSS. */
function rule(cssText, selector) {
  const at = cssText.indexOf(`${selector} {`);
  assert.ok(at >= 0, selector);
  const start = cssText.indexOf('{', at) + 1;
  return cssText.slice(start, cssText.indexOf('}', start));
}

test('قطّة القلم: لا طرف ولا وصلة مدوّرة في أي أيقونة من src/، بالـCSS أو بسمات SVG', () => {
  const round = /stroke-line(?:cap|join)\s*['"]?\s*[:=,]\s*['"]?round/;
  const hits = sources().filter((rel) => round.test(read(rel).replace(/\/\*[\s\S]*?\*\//g, '')));
  assert.deepEqual(hits, []);
});

test('قطّة القلم: أيقونات لوحة النص (.ic) بنهايات مقطوعة ووصلات حادة كـ.tj-icon في الصفحات', () => {
  const ic = rule(panelCss(), '.ic');
  assert.match(ic, /stroke-linecap:\s*butt/);
  assert.match(ic, /stroke-linejoin:\s*miter/);
  assert.match(rule(read('src/ui/components.css'), '.tj-icon'), /stroke-linecap:\s*butt;[^}]*stroke-linejoin:\s*miter/);
});

test('مزامنة بجملة: الجملة الحالية بخط إبراز في بداية الصف بالاتجاهين، لا بالصبغة وحدها', () => {
  const cssText = layerCss();
  const rtl = rule(cssText, 'button.item.sentence[aria-current="true"]');
  assert.match(rtl, /box-shadow:\s*inset -3px 0 0 var\(--tj-p-accent\)/, 'الخط في اليمين (البداية في RTL)');
  const ltr = rule(cssText, '.layer[dir="ltr"] button.item.sentence[aria-current="true"]');
  assert.match(ltr, /box-shadow:\s*inset 3px 0 0 var\(--tj-p-accent\)/, 'الخط في اليسار (البداية في LTR)');
});
