// تحقق 2.3.0 الأخير (ص-١٩ و§١٢.٢ في تقريره): نصوص فاتت الجولات. اسم واحد للأمر الخامس «إعادة الجملة» مصدرًا كالأوامر الأربعة
// الأخرى، و«ب» ملتصقة باسم اللغة العربي بلا تطويل («بلغة هاواي» لا «بـلغة هاواي»)، ووصف قسم «العرض» يذكر صف الاختصارات،
// والمعدود في رسالة تعيين اللغة الإنجليزية ترجمات من أولها.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { setLocale, t } from '../../../src/i18n/index.js';
import { arabicName, knownLanguages, withBa } from '../../../src/core/lang/index.js';
import { languageValues } from '../../../src/core/export/instructions.js';
import { messageFor } from '../../../src/core/errors/index.js';
import { formatCount } from '../../../src/ui/format.js';

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

test('ص-١٩ (٥): وصف قسم «العرض» يذكر صف اختصارات لوحة المفاتيح بترتيب صفوفه', (ctx) => {
  reset(ctx);
  assert.equal(t('settings.sections.display.desc'), 'شكل الترجمة فوق الفيديو، ولوحة النص المتزامن وزرها، واختصارات لوحة المفاتيح، وصور الفيديو في المحفوظات.');
  assert.ok(t('settings.sections.display.desc').includes(t('settings.shortcuts.label')));
  setLocale('en');
  assert.equal(t('settings.sections.display.desc'), 'How the translation looks over the video, the synced transcript panel and its button, keyboard shortcuts, and video thumbnails in Library.');
  assert.ok(t('settings.sections.display.desc').includes(t('settings.shortcuts.label').toLowerCase()));
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
