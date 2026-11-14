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
import { groupCss, layerCss } from '../../../src/player/controls/styles.js';

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

/** تصريحات أول قاعدة تبدأ سطرها بهذا المحدد حرفيًا في نص CSS (لا محدد مركّب ينتهي به). */
function rule(cssText, selector) {
  const text = `\n${cssText}`;
  const hit = text.indexOf(`\n${selector} {`);
  assert.ok(hit >= 0, selector);
  cssText = text;
  const at = hit + 1;
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

test('زوايا اللوحات 09–12 في المشغّل والنافذة (ت٣-v3-identity-5): لا 6px خارج السلّم، وملاحظة النافذة تنبيهٌ بزاوية 8، وخطوة «تمّت» ممتلئة', () => {
  const cssText = layerCss();
  assert.match(rule(cssText, '.tip'), /border-radius: 3px/);
  assert.match(rule(cssText, 'label.item'), /border-radius: 3px/);
  assert.match(rule(cssText, '.toast button.x'), /border-radius: 4px/);
  assert.match(rule(cssText, '.toast button.act'), /border-radius: 4px/);
  assert.doesNotMatch(cssText, /border-radius: 6px/);
  const popup = read('src/pages/popup/popup.css');
  assert.match(rule(popup, '.tj-popup__note'), /border-radius: var\(--tj-radius-lg\)/);
  assert.match(rule(popup, '.tj-popup__step--done .tj-popup__step-n'), /background: var\(--tj-success\); color: var\(--tj-success-ink\)/);
});

test('شارتا «معدّلة» و«بانتظار الترجمة» في المحفوظات مسطّحتان كاللوحة 14 والنافذة، لا مؤطّرتان شفافتان (ت٣-v5b-identity-1)', () => {
  const lib = read('src/pages/library/library.css').replace(/\/\*[\s\S]*?\*\//g, '');
  assert.doesNotMatch(lib, /\.tj-pill--plain[^{}]*\{[^}]*(?:background:\s*transparent|box-shadow)/, 'لا تجاوز يفرّغ الشارة ويؤطّرها');
  const ui = read('src/ui/components.css');
  assert.match(rule(ui, '.tj-pill--edited'), /background: var\(--tj-edited-bg\)/);
  assert.match(rule(ui, '.tj-pill'), /background: var\(--tj-surface-2\)/, 'والمحايدة («بانتظار الترجمة») بالسطح الغائر');
});

/** نسبة تباين WCAG بين لونين رماديين بقيمة القناة 0–255. */
const contrast = (a, b) => {
  const lum = (v) => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

test('حلقة تركيز أزرار الشريط بهالة داكنة داخلية تجاورها، فتبلغ 3:1 فوق إطار أبيض أيضًا (الثابت ٥، ت٣-v5b-identity-3)', () => {
  const focus = rule(groupCss(), '.btn:focus-visible');
  assert.match(focus, /outline: 2px solid #FFFFFF; outline-offset: -6px/);
  const halo = /box-shadow: inset 0 0 0 (\d+)px rgb\(0 0 0 \/ (\d+)%\)/.exec(focus);
  assert.ok(halo, focus);
  assert.equal(Number(halo[1]), 4, 'الهالة تملأ ما بين حافة الزر والحلقة (إزاحتها 6 وعرضها 2) فتجاورها');
  // فوق إطار أبيض يرسم يوتيوب حاوية أزراره #B2B2B2 (مقيسة في المتصفحات الأربعة)، والحلقة البيضاء عليها 2.12:1.
  const container = 0xB2;
  const band = Math.round(container * (1 - Number(halo[2]) / 100));
  assert.ok(contrast(255, band) >= 3, `الحلقة على الهالة ${contrast(255, band).toFixed(2)}`);
  assert.ok(contrast(band, container) >= 3, `الهالة على الحاوية ${contrast(band, container).toFixed(2)}`);
});
