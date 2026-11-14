// الجولة الرابعة (بند سلطان، لقطة في Chrome على macOS): في قائمة «تنزيل الأصل» بعد التنزيل انكسر سطر «نُزّل
// KA3zmDkEUQs.en.from-ar.asr.normal.srt» فظهر «نُزّل -KA3zmDkEUQs.en.from» ثم «ar.asr.normal.srt». الاسم كان معزولًا نصًّا (LRI…PDI منذ
// تدقيق 7a66f91، U49)، لكن الترتيب ثنائي الاتجاه يُطبَّق سطرًا سطرًا بعد الكسر. الآن الاسم عنصر bdi ذري (.iso، inline-block) ينتقل كله
// إلى سطره ويلتف داخله بترتيب LTR. واسم الخانة (يكتبه المستخدم) معزول اتجاهًا (FSI…PDI) في التلميحات وسطر حالة اللوحة.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { layerCss } from '../../../../src/player/controls/styles.js';
import { downloadedLine, replaceSlotTitle } from '../../../../src/player/controls/text.js';
import { statusParts } from '../../../../src/player/panel/text.js';
import { isolate } from '../../../../src/ui/format.js';
import { messageFor } from '../../../../src/core/errors/index.js';
import { ltrInline } from '../../../../src/ui/format.js';
import { arabic, chooseFiles, click, makeState, matched, mountPage, settle, trackInfo } from './harness.js';

const LRI = String.fromCodePoint(0x2066);
const FSI = String.fromCodePoint(0x2068);
const PDI = String.fromCodePoint(0x2069);
// اسم لقطة سلطان، وأطول منه بشرطة في أوله وأجزاء، واسم بلا فواصل.
const NAMES = ['KA3zmDkEUQs.en.from-ar.asr.normal.srt', '-KA3zmDkEUQs.en.from-ar.asr.normal.part12of12.with-a-much-longer-tail.srt', 'KA3zmDkEUQs_en_from_ar_asr_normal_without_any_break_opportunity.srt'];

/** تنزيل من قائمة «تنزيل الأصل» باسم ملف معطى (يُستبدل في ناتج buildExport الوهمي). */
async function downloadNamed(name) {
  const page = mountPage({ state: makeState({ captured: [trackInfo()] }) });
  const build = page.flows.exportFlow.buildExport;
  page.flows.exportFlow.buildExport = (spec) => {
    const r = build.call(page.flows.exportFlow, spec);
    return { ...r, files: r.files.map((f) => ({ ...f, name })) };
  };
  click(page.ui.btn('download'));
  click(page.ui.item('تنزيل الملف'));
  await settle();
  return page;
}

test('«نُزّل …»: اسم الملف الطويل عنصر bdi ذري معزول LTR في سطر النتيجة، خارجه «نُزّل» وحدها، والنص المرئي كما هو', async () => {
  for (const name of NAMES) {
    const page = await downloadNamed(name);
    assert.deepEqual(page.flows.downloads.map((d) => d.name), [name]);
    const line = page.ui.menu().querySelector('.line[data-fid="saveLine"]');
    assert.ok(line, 'سطر النتيجة');
    assert.equal(line.getAttribute('data-tone'), 'ok');
    const text = line.querySelector('.line__text');
    assert.equal(text.textContent, downloadedLine(name), 'النص المرئي كما هو');
    const iso = text.querySelectorAll('bdi.iso');
    assert.equal(iso.length, 1, 'الاسم في عنصر واحد');
    assert.equal(iso[0].getAttribute('dir'), 'ltr');
    assert.equal(iso[0].textContent, `${LRI}${name}${PDI}`);
    const outside = text.children.filter((c) => c !== iso[0]).map((c) => c.textContent).join('');
    assert.equal(outside, 'نُزّل ', 'خارج العنصر الكلمة العربية وحدها، فلا ينكسر الاسم مع الجملة');
  }
});

test('أنماط القائمة: .iso عنصر ذري معزول LTR بعرض سطره يلتف داخله، ولا يغيّر مقاس الخط', () => {
  const css = layerCss();
  const rule = /\.iso \{([^}]*)\}/.exec(css)?.[1] ?? '';
  for (const decl of ['display: inline-block', 'max-width: 100%', 'direction: ltr', 'unicode-bidi: isolate', 'overflow-wrap: anywhere']) assert.ok(rule.includes(decl), `${decl} في .iso`);
  assert.equal(/font|width: \d/.test(rule.replace('max-width: 100%', '')), false, 'لا خط ولا عرض ثابت');
});

test('اسم الخانة اللاتيني معزول اتجاهًا (FSI…PDI): تلميح «استبدال الترجمة 2 — …» وسطر حالة اللوحة', () => {
  const name = 'Pro (v2).';
  const title = replaceSlotTitle({ n: 2, active: false, filled: true, name });
  assert.ok(title.endsWith(`— ${FSI}${name}${PDI}`), title);
  assert.equal(title.replace(isolate(name), '').includes(name), false);
  const parts = statusParts({ slot: 2, name, count: 3 });
  assert.equal(parts[1], `الترجمة 2 «${FSI}${name}${PDI}»`);
});

// ---- تحقق 2.3.0 (ص-١٨): أسماء الأجزاء في الرفع متعدد الأجزاء ----
// خطأ الرفع وتحذيره وملاحظاته تحمل اسم الجزء معزولًا LTR (core/import وcore/errors/import.js)، فترسمه القائمة والرسالة العابرة عنصر
// bdi ذريًا (.iso) كسطر «نُزّل …»، لا نصًّا يتوزع على سطرين مع الجملة.
const PART_A = NAMES[1];
const PART_B = '-KA3zmDkEUQs.en.from-ar.asr.normal.part13of12.srt';

/** عناصر .iso في عقدة ونصوصها، وما خارجها. */
function isoOf(node) {
  const iso = node.querySelectorAll('bdi.iso');
  for (const b of iso) assert.equal(b.getAttribute('dir'), 'ltr');
  return iso.map((b) => b.textContent);
}

test('ص-١٨: خطأ الرفع في رسالة عابرة: اسما الجزأين عنصرا bdi ذريان، والنص المرئي كما هو', async () => {
  const page = mountPage();
  const message = messageFor('IM_PARTS_OVERLAP', { a: PART_A, b: PART_B, from: 1, to: 4 });
  page.flows.readResult = () => ({ ok: false, error: { code: 'IM_PARTS_OVERLAP', message } });
  click(page.ui.btn('upload'));
  chooseFiles(page.ui, [{ name: PART_A }, { name: PART_B }]);
  await settle();
  const box = page.ui.layerHost().shadowRoot.querySelector('.toasts').children[0];
  assert.equal(box.getAttribute('data-tone'), 'error');
  const text = box.querySelector('.text');
  assert.equal(text.textContent, message, 'النص المرئي كما هو');
  assert.deepEqual(isoOf(text), [ltrInline(PART_A), ltrInline(PART_B)]);
});

test('ص-١٨: خطأ الاستبدال في قائمة العرض وملاحظة الجزء فيها: الاسم عنصر bdi ذري', async () => {
  const note = `«${ltrInline(PART_A)}»: ${messageFor('IM_NOTE_FENCE')}`;
  const page = mountPage({ state: makeState({ arabic: arabic({ comparison: matched({ notes: [note] }) }) }) });
  click(page.ui.btn('upload'));
  const shown = page.ui.menu().querySelector('.note');
  assert.equal(shown.textContent, note);
  assert.deepEqual(isoOf(shown), [ltrInline(PART_A)], 'ملاحظة الجزء المحفوظة');

  const message = `«${ltrInline(PART_B)}»: ${messageFor('IM_BAD_TIME', { line: 14 })}`;
  page.flows.readResult = () => ({ ok: false, error: { code: 'IM_BAD_TIME', message, line: 14 } });
  click(page.ui.field('replace'));
  chooseFiles(page.ui, [{ name: PART_A }, { name: PART_B }]);
  await settle();
  const alert = page.ui.menu().querySelector('.alert[data-tone="error"]');
  assert.ok(alert, 'الخطأ في القائمة نفسها');
  assert.equal(alert.textContent, message);
  // والمثال الزمني في الرسالة معزول من قبل (TIME_EXAMPLE)، فهو عنصر ثانٍ.
  assert.deepEqual(isoOf(alert), [ltrInline(PART_B), ltrInline('00:00:01,000 --> 00:00:03,500')]);
});

test('ص-١٨: تحذير الفجوة بين جزأين في قائمة العرض بعد الرفع: الاسمان عنصران ذريان', async () => {
  const page = mountPage();
  page.flows.readResult = (files) => ({
    ok: true, fileName: files[0].name, cues: [], fingerprintId: 'fp_test000001', notes: [], comparison: matched(),
    warnings: [{ code: 'IM_PARTS_GAP', params: { a: PART_A, b: PART_B, from: 5, to: 6 } }],
  });
  click(page.ui.btn('upload'));
  chooseFiles(page.ui, [{ name: PART_A }, { name: PART_B }]);
  await settle();
  const warn = page.ui.menu().querySelector('.alert[data-tone="warn"]');
  assert.ok(warn, page.ui.menuText());
  assert.equal(warn.textContent, messageFor('IM_PARTS_GAP', { a: PART_A, b: PART_B, from: 5, to: 6 }));
  assert.deepEqual(isoOf(warn), [ltrInline(PART_A), ltrInline(PART_B)]);
});
