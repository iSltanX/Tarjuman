// تحقق 2.3.0 الأخير (ص-١٩ و§١٢.٢ في تقريره): نصوص فاتت الجولات. اسم واحد للأمر الخامس «إعادة الجملة» مصدرًا كالأوامر الأربعة
// الأخرى، و«ب» ملتصقة باسم اللغة العربي بلا تطويل («بلغة هاواي» لا «بـلغة هاواي»)، ووصف قسم «العرض» يذكر صف الاختصارات،
// والمعدود في رسالة تعيين اللغة الإنجليزية ترجمات من أولها. وبنود «رأي» في §١٢.٢ (٩–١٤) كما حُسمت: حالُ الإخفاء في رسالة الأمر
// بالإنجليزية، وبند التصدير في سجل المتجر، وسطر حد المصطلحات، وحذف المسودة في «التغييرات»، و«the Editor».
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { setLocale, t } from '../../../src/i18n/index.js';
import { arabicName, attachPrefix, knownLanguages, withBa, withLa } from '../../../src/core/lang/index.js';
import { languageValues } from '../../../src/core/export/instructions.js';
import { messageFor } from '../../../src/core/errors/index.js';
import { formatCount } from '../../../src/ui/format.js';
import { modeToast } from '../../../src/player/controls/text.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const read = (rel) => readFileSync(path.join(ROOT, rel), 'utf8');
const filesIn = (dir, ext) => readdirSync(path.join(ROOT, dir), { recursive: true }).filter((f) => f.endsWith(ext)).map((f) => path.join(dir, f));
const reset = (ctx) => ctx.after(() => setLocale('ar'));

test('ص-١٩ (٣): الأمر الخامس «إعادة الجملة» مصدرًا في كل نص، ولا صيغة الأمر منه في نص يراه المستخدم ولا في الوثائق والشيفرة', () => {
  const locales = JSON.parse(read('src/_locales/ar/messages.json'));
  assert.ok(locales.cmdReplayLine.message.startsWith('إعادة الجملة: '), locales.cmdReplayLine.message);
  assert.ok(t('settings.shortcuts.what').includes('وإعادة الجملة.'));
  assert.ok(read('docs/user-guide.md').split('\n').includes('| إعادة الجملة | ينقل الفيديو إلى بداية الجملة الظاهرة، وإلا آخر جملة بدأت، دون أن يشغّله أو يوقفه. لا يعمل أثناء الإعلان. |'));
  assert.ok(read('docs/site/help.md').includes('وإعادة الجملة (ينقل الفيديو إلى بداية الجملة الظاهرة)'));
  assert.ok(read('docs/product-spec.md').includes('و«إعادة الجملة»: القفز إلى بداية الجملة الظاهرة'));
  // CHANGELOG.md وdocs/known-limitations.md تكتبهما الجلسة الرئيسية.
  const scanned = ['src/_locales/ar/messages.json', 'README.md', 'PRIVACY.md', 'docs/user-guide.md', 'docs/product-spec.md',
    ...filesIn('docs/site', '.md'), ...filesIn('docs/contracts', '.md'), ...filesIn('store', '.md'), ...filesIn('src', '.js'), ...filesIn('test/unit', '.js')];
  const OLD = ['أعد', 'الجملة'].join(' ');
  for (const rel of scanned) assert.ok(!read(rel).includes(OLD), `${rel}: ${OLD}`);
});

test('ص-١٩ (٤): «ب» تلتصق باسم اللغة العربي بلا تطويل، والتطويل قبل ما لا يبدأ بحرف عربي وحده', (ctx) => {
  reset(ctx);
  assert.equal(withBa('العربية'), 'بالعربية');
  assert.equal(withBa('لغة هاواي'), 'بلغة هاواي');
  assert.equal(withBa('دزونكا'), 'بدزونكا');
  assert.equal(withBa('Klingon'), 'بـKlingon');
  assert.equal(withBa('3'), 'بـ3');
  assert.equal(withBa('٣'), 'بـ٣', 'الرقم العربي الهندي رقم لا حرف');
  assert.equal(t('common.track.roundTrip.lead', { name: 'لغة هاواي', known: true }), 'الفيديو بلغة هاواي أصلًا:');
  assert.equal(t('common.track.roundTrip.lead', { name: 'العربية', known: true }), 'الفيديو بالعربية أصلًا:');
  assert.equal(t('common.track.roundTrip.lead', { name: 'xx', known: false }), 'الفيديو بلغة xx أصلًا:');
  assert.equal(t('popup.status.translationIn', { name: 'دزونكا', code: 'dz', known: true }), 'ترجمة بدزونكا');
  assert.equal(t('popup.status.translationIn', { name: 'اليابانية', code: 'ja', known: true }), 'ترجمة باليابانية');
  assert.equal(languageValues('xx', 'ar').in, 'بلغة xx');
  // كل اسم يعرفه المتصفح (ومنه ما لا يبدأ بـ«ال»: «لغة هاواي» و«دزونكا» و«كيشوا»…) في المواضع الثلاثة: سطر المسار المترجم إلى
  // لغته، وسطر الترجمة في نافذة الإضافة، و{{in_source}} و{{in_target}} في تعليمات الترجمة.
  const codes = [...knownLanguages('ar').map((l) => l.code), 'haw', 'fil', 'ckb', 'yue'];
  let bare = 0;
  for (const code of codes) {
    const name = arabicName(code);
    if (!name) continue;
    if (!name.startsWith('ال')) bare += 1;
    for (const out of [t('common.track.roundTrip.lead', { name, known: true }), t('popup.status.translationIn', { name, code, known: true }), languageValues(code, 'ar').in]) {
      assert.doesNotMatch(out, /بـ\p{Script=Arabic}/u, `${code}: ${out}`);
      assert.ok(out.includes(`ب${name}`), `${code}: ${out}`);
    }
  }
  assert.ok(bare >= 3, `أسماء لا تبدأ بـ«ال»: ${bare}`);
});

test('ص-١٩ (٥): وصف قسم «العرض» يذكر صفوفه كلها بترتيبها: لغة الواجهة، ثم شكل الترجمة، ثم اللوحة، ثم الاختصارات، ثم الصور', (ctx) => {
  reset(ctx);
  const desc = () => t('settings.sections.display.desc');
  assert.equal(desc(), 'لغة الواجهة، وشكل الترجمة فوق الفيديو، ولوحة النص المتزامن وزرها، واختصارات لوحة المفاتيح، وصور الفيديو في المحفوظات.');
  const at = (label) => desc().toLowerCase().indexOf(label.toLowerCase());
  const order = () => [t('settings.uiLocale.title'), t('settings.shortcuts.label')].map(at);
  assert.ok(order().every((i) => i >= 0) && order()[0] < order()[1], 'ar');
  setLocale('en');
  assert.equal(desc(), 'The interface language, how the translation looks over the video, the synced transcript panel and its button, keyboard shortcuts, and video thumbnails in Library.');
  assert.ok(order().every((i) => i >= 0) && order()[0] < order()[1], 'en');
});

test('ص-١٩ (٤) بالقاعدة كلها: «ل» كـ«ب» بلا تطويل قبل حرف عربي («لترجمتين»، «للعربية»)، وبتطويل قبل رقم أو لاتيني أو علامة', (ctx) => {
  reset(ctx);
  assert.equal(withLa('ترجمة واحدة'), 'لترجمة واحدة');
  assert.equal(withLa('ترجمتين'), 'لترجمتين');
  assert.equal(withLa('العربية'), 'للعربية', 'اللام مع «ال» تُسقط الألف');
  assert.equal(withLa('لغة هاواي'), 'للغة هاواي');
  assert.equal(withLa('3 ترجمات'), 'لـ3 ترجمات');
  assert.equal(withLa('Klingon'), 'لـKlingon');
  assert.equal(withLa('«عنوان»'), 'لـ«عنوان»');
  assert.equal(attachPrefix('ب', 'العربية'), withBa('العربية'));
  assert.equal(attachPrefix('ب', 'العربية'), 'بالعربية', 'الباء مع «ال» تبقي الألف');
  // عنوان تأكيد «تعيين لغتها» في الإعدادات ← «اللغات»: المعدود مجرور بصيغته بعد اللام.
  const title = (n) => t('settings.langs.assignTitle', { name: 'العربية', count: formatCount(n, t('settings.langs.translationCount'), { case: 'gen' }) });
  assert.equal(title(1), 'تعيين العربية لترجمة واحدة؟');
  assert.equal(title(2), 'تعيين العربية لترجمتين؟');
  assert.equal(title(3), 'تعيين العربية لـ3 ترجمات؟');
  assert.equal(title(11), 'تعيين العربية لـ11 ترجمة؟');
  setLocale('en');
  assert.equal(t('settings.langs.assignTitle', { name: 'Arabic', count: '2 translations' }), 'Set Arabic for 2 translations?');
  // ولا قالب في الفهرس العربي ورسائل الأخطاء يلصق «بـ» أو «لـ» أو «كـ» بمتغيّر إلا بالدالة، أو قبل رقم دائمًا (خطوة الإزاحة).
  const files = [...filesIn('src/i18n/ar', '.js'), ...filesIn('src/core/errors', '.js'), 'src/core/export/instructions.js'];
  const glued = files.flatMap((rel) => read(rel).split('\n').filter((l) => /(?<!\p{Script=Arabic})(?:[بلك]|لل)ـ?(?:\{|\$\{)/u.test(l)).map((l) => `${rel}: ${l.trim()}`));
  assert.deepEqual(glued.map((l) => l.includes('`بـ${(tenths / 10).toFixed(1)} ث`')), [true], glued.join('\n'));
});

test('ص-١٩ (٦): رسالة تعيين اللغة الإنجليزية تعدّ ترجمات من أولها، لا فيديوهات ثم ترجمات', (ctx) => {
  reset(ctx);
  setLocale('en');
  const forms = () => t('settings.langs.translationCount');
  const msg = (n) => messageFor('PG_LANG_ASSIGN_SKIPPED', { n: formatCount(n, forms()), count: n });
  for (const n of [1, 2, 3]) {
    assert.ok(msg(n).startsWith('The language was set for translations whose script matched; '), msg(n));
    assert.doesNotMatch(msg(n), /videos?\b/, msg(n));
  }
});

test('§١٢.٢ (٩): رسالة أمر الوضع بالإنجليزية تقول الحال «Translation hidden» لا الأمر، والعربية باسم خيار القائمة', (ctx) => {
  reset(ctx);
  assert.equal(modeToast('off'), 'وضع العرض: إخفاء الترجمة');
  setLocale('en');
  assert.equal(modeToast('off'), 'Display mode: Translation hidden');
  assert.equal(modeToast('ar'), 'Display mode: Translation only');
  assert.equal(t('player.controls.modeOff'), 'Hide translation', 'خيار القائمة نفسه باقٍ');
});

test('§١٢.٢ (١٠): بند التصدير في سجل الإصدار العربي للمتجر جملة كأخواته، لا «التصدير ملف»', () => {
  const after = read('store/listing.ar.md').split('<!-- field: amo.releaseNotes -->')[1];
  const block = after.slice(0, after.indexOf('\n```\n'));
  assert.ok(block.includes('\n• تصدير الترجمة ملف SRT أو WebVTT، وحدها أو مع الأصل في سطر تحت كل مقطع للمشاهدة في مشغّل آخر.\n'), block);
  assert.ok(!block.includes('• التصدير ملف'));
});

test('§١٢.٢ (١٢): سطر «يُرسل أول 100» العام يرجع إلى كل زوج منها، ويذكر قائمة «أي لغة» في ترتيب الإرفاق', (ctx) => {
  reset(ctx);
  assert.equal(t('settings.glossary.sentCapGeneral', { max: '100 مصطلح' }),
    'مع بعض قوائم الأزواج تزيد المصطلحات على 100 مصطلح، فيُرسل أول 100 مصطلح مع تعليمات كل زوج منها: قائمته أولًا، ثم قائمة «أي لغة» إلى اللغة نفسها إن وُجدت، ثم القاموس العام.');
  assert.ok(t('settings.glossary.sentCapGeneral', { max: '' }).includes(`«${t('settings.glossary.anySource')}»`));
  setLocale('en');
  assert.equal(t('settings.glossary.sentCapGeneral', { max: '100 terms' }),
    'With some pair lists there are more than 100 terms, so only the first 100 terms are sent with each such pair’s instructions: its list first, then the “Any language” list into the same language if there is one, then the general glossary.');
  assert.ok(t('settings.glossary.sentCapGeneral', { max: '' }).includes(`“${t('settings.glossary.anySource')}”`));
});

test('§١٢.٢ (١٣): سطر الإصدار في «التغييرات» يسند الحذف إلى المسودة وحدها، لا إلى قوائم المصطلحات معها', () => {
  // كان السطر سطر 2.3.0، وصار سطر 3.0.0 حين رُفع الرقم (ST4)؛ فالإصدار من package.json لا رقم مكتوب.
  const { version } = JSON.parse(read('package.json'));
  for (const rel of ['docs/site/privacy.md', 'PRIVACY.md']) {
    const line = read(rel).split('\n').find((l) => l.startsWith(`- **الإصدار ${version}،`));
    assert.ok(line?.includes('ومسودة تعديلاتك في المحرّر ما لم تحفظها، والمسودة تُحذف حين تحفظ تعديلاتها أو تتجاهلها.'), rel);
  }
});

test('§١٢.٢ (١٤): «the Editor» اسم صفحة بحرف كبير كـ«Library» و«Settings» في كل نص إنجليزي', () => {
  const english = [...filesIn('src/i18n/en', '.js'), ...filesIn('docs/site', '.en.md'), 'store/listing.en.md', 'store/reviewers.en.md'];
  for (const rel of english) assert.doesNotMatch(read(rel), /\b[Tt]he editor\b/, rel);
});
