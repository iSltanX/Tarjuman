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
import { click, makeState, mountPage, settle, trackInfo } from './harness.js';

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
