// ف2 (2026-11-10): السطر الطويل فوق الفيديو سطران متوازنان. عرض السطر محدود بنحو 42 حرفًا من خطه (em معايَر لكل خط)،
// وtext-wrap: balance، والخلفية على الكتلة كما كانت ويضيّقها العرض إلى أعرض سطر ملتفّ. تغيير في العرض وحده: نص المقطع لا
// يتغير، وفواصل الملف كما هي.
// والفحص البصري (سطران متقاربان عند 1920×1080 و640×360، وسطر من 30 حرفًا يبقى واحدًا) في جولة المشغّل المحلي ب16.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { overlayCss } from '../../../../src/player/overlay/styles.js';
import { createOverlayView } from '../../../../src/player/overlay/view.js';
import { mountOverlay } from '../../../../src/player/overlay/index.js';
import { DEFAULT_SETTINGS } from '../../../../src/core/model/settings.js';
import { LATIN_LINE_CAP_EM, SUBTITLE_FONT_LIST, subtitleFont } from '../../../../src/ui/subtitle-fonts.js';
import { previewStyle } from '../../../../src/pages/settings/model.js';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { addPlayer, createFakeEnv } from './fake-dom.js';
import { makeState, watchPage } from './harness.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const rule = (css, sel) => {
  const i = css.indexOf(`${sel} {`);
  assert.ok(i >= 0, `قاعدة ${sel}`);
  return css.slice(i, css.indexOf('}', i) + 1);
};

test('الورقة: حد عرض السطر بمتغير خطه وtext-wrap: balance، والخلفية والحشو والزاوية على الكتلة كما كانت', () => {
  const css = overlayCss();
  const line = rule(css, '.line');
  assert.match(line, /max-width: min\(100%, calc\(var\(--tj-cap\) \+ 20px\)\)/, 'الحد مع الحشو الأفقي، ولا يتجاوز عرض المسرح');
  assert.match(line, /text-wrap: balance/);
  assert.match(line, /overflow-wrap: anywhere/, 'كلمة أطول من الحد تنكسر ولا تخرج');
  assert.match(line, /padding: 2px 10px; border-radius: 4px/, 'ارتفاع الصندوق وحشوه وزاويته كما كانت');
  assert.match(rule(css, '.ar'), /--tj-cap: var\(--tj-cap-ar, 21\.6em\)/);
  assert.match(rule(css, '.en'), /--tj-cap: var\(--tj-cap-en, 19\.1em\)/, 'الحد نفسه لسطر الأصل في الوضع المزدوج');
  for (const bg of ['none', 'soft', 'solid']) assert.match(css, new RegExp(`\\.stage\\[data-bg="${bg}"\\] \\.line \\{`), bg);
  assert.doesNotMatch(css, /\.line \{[^}]*white-space: pre/, 'فواصل الملف أسطر مستقلة لا نص واحد');
});

test('المعايرة: لكل خط حد بوحدة em قريب من 42 حرفًا، وMarkazi أضيق، وللأصل اللاتيني حده', () => {
  const caps = Object.fromEntries(SUBTITLE_FONT_LIST.map((f) => [f.id, f.lineCapEm]));
  assert.deepEqual(caps, { almarai: 21.6, 'noto-sans-arabic': 21.8, tajawal: 21.8, markazi: 16.1 });
  // متوسط عرض الحرف العربي بين 0.38 و0.52 من em في هذه الخطوط: 42 حرفًا بين 15 و23 em.
  for (const [id, em] of Object.entries(caps)) assert.ok(em >= 15 && em <= 23, id);
  assert.ok(caps.markazi < caps.almarai);
  assert.equal(subtitleFont('unknown').lineCapEm, caps.almarai, 'المعرّف المجهول يأخذ الافتراضي');
  assert.equal(LATIN_LINE_CAP_EM, 19.1);
});

test('العرض: setFont يضع الحدين بوحدة em مع العائلة، ولا يكتب حدًا غير رقمي', () => {
  const env = createFakeEnv();
  const view = createOverlayView(env);
  view.setFont({ ar: '"A"', en: '"B"' });
  assert.equal(view.host.style.getPropertyValue('--tj-cap-ar'), '', 'بلا حد: الافتراضي من الورقة');
  view.setFont({ ar: '"A"', en: '"B"', capAr: 16.1, capEn: 19.1 });
  assert.equal(view.host.style.getPropertyValue('--tj-cap-ar'), '16.1em');
  assert.equal(view.host.style.getPropertyValue('--tj-cap-en'), '19.1em');
  view.setFont({ ar: '"A"', en: '"B"', capAr: Number.NaN });
  assert.equal(view.host.style.getPropertyValue('--tj-cap-ar'), '16.1em', 'قيمة غير صالحة لا تُكتب');
});

/** عرض في DOM وهمي، ومستطيلات النص التي يعيدها Range لكل سطر تُحدَّد في الاختبار. */
function rendered(rectsFor) {
  const env = createFakeEnv();
  const parts = addPlayer(env);
  env.doc.createRange = () => {
    let node = null;
    return { selectNodeContents: (n) => { node = n; }, getClientRects: () => rectsFor(node.textContent) };
  };
  const view = createOverlayView(env);
  view.attachTo(parts.player);
  // ظل الحاوية مغلق في المتصفح؛ في الوهمي نصل إليه عبر الـhost.
  const stage = view.host.shadowRoot.children.find((c) => c.className.includes('stage'));
  return { view, stage };
}
const rect = (left, width, top, height = 30) => ({ left, right: left + width, width, top, height });

test('العرض: نص المقطع كما هو، وكل سطر من الملف كتلته بنصه وحده', () => {
  const { view, stage } = rendered(() => []);
  const long = 'كما ترون، في هذه المنطقة بالتحديد يمكننا أن نرى كيف تغيّر المشهد تمامًا';
  view.render({ ar: [long, 'سطر ثانٍ من الملف'], en: ['And the English line.'] });
  assert.deepEqual(stage.children.map((c) => c.className), ['line ar', 'line ar', 'line en']);
  assert.deepEqual(stage.children.map((c) => c.textContent), [long, 'سطر ثانٍ من الملف', 'And the English line.']);
  assert.ok(stage.children.every((c) => c.children.length === 0));
});

test('العرض: السطر الملتفّ يضيق صندوقه إلى أعرض سطر فيه، والذي لم يلتفّ بلا عرض صريح ولو تعددت مستطيلاته', () => {
  const rects = {
    long: [rect(100, 300, 10), rect(90, 200, 40), rect(290, 120, 41)], // سطران، والثاني مستطيلان (اتجاهان) عرضه 320
    mixed: [rect(100, 150, 10), rect(250, 60, 11)], // سطر واحد من مستطيلين
  };
  const { view, stage } = rendered((text) => rects[text] ?? []);
  view.render({ ar: ['long', 'mixed'], en: [] });
  assert.equal(stage.children[0].style.getPropertyValue('width'), '341px', 'أعرض سطر 320 + حشو 20 + 1');
  assert.equal(stage.children[1].style.getPropertyValue('width'), '', 'سطر واحد: fit-content كما كان');
  rects.long = [rect(100, 500, 10)];
  view.setLayout({ fontPx: 40, anchor: 'bottom', offsetPx: 0 });
  assert.equal(stage.children[0].style.getPropertyValue('width'), '', 'تبدّل الحجم يعيد القياس من دون عرض صريح');
});

test('العرض: بلا Range (بيئة لا تقيس) لا يُكتب عرض', () => {
  const env = createFakeEnv();
  const parts = addPlayer(env);
  delete env.doc.createRange;
  const view = createOverlayView(env);
  view.attachTo(parts.player);
  view.render({ ar: ['سطر'], en: [] });
  const stage = view.host.shadowRoot.children.find((c) => c.className.includes('stage'));
  assert.equal(stage.children[0].style.getPropertyValue('width'), '');
});

test('الجلسة: حد الخط المختار للعربي وحد اللاتيني للأصل، ويتبدّل بتبديل الخط', () => {
  const page = watchPage({ state: makeState({ settings: { ...DEFAULT_SETTINGS, appearance: { ...DEFAULT_SETTINGS.appearance, font: 'markazi' } } }), height: 480 });
  mountOverlay(page.controller, { doc: page.env.doc, win: page.env.win, fonts: { ensure: async () => {}, diagnostics: () => ({}) } });
  const host = page.player.children.find((c) => c.id === 'tarjuman-overlay');
  assert.equal(host.style.getPropertyValue('--tj-cap-ar'), '16.1em');
  assert.equal(host.style.getPropertyValue('--tj-cap-en'), '19.1em');
  page.controller.set({ settings: { ...DEFAULT_SETTINGS, appearance: { ...DEFAULT_SETTINGS.appearance, font: 'tajawal' } } });
  assert.equal(host.style.getPropertyValue('--tj-cap-ar'), '21.8em');
});

test('المعاينة الحية في الإعدادات تلفّ بالطريقة نفسها: الحد من الخط المختار وbalance، والخلفية على السطر', async () => {
  assert.equal(previewStyle({ ...DEFAULT_SETTINGS.appearance, font: 'markazi' }).lineCap, '16.1em');
  assert.equal(previewStyle(DEFAULT_SETTINGS.appearance).lineCap, '21.6em');
  const css = await readFile(path.join(ROOT, 'src/pages/settings/settings.css'), 'utf8');
  assert.match(rule(css, '.st-preview__line'), /max-width: min\(100%, calc\(var\(--st-cap, 21\.6em\) \+ 16px\)\);[^}]*text-wrap: balance/);
  assert.match(css, /\.st-preview__stage\[data-bg="soft"\] \.st-preview__line \{/);
});
