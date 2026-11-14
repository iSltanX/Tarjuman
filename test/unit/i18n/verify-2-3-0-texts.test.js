// تحقق 2.3.0 الأخير (ص-١٩ و§١٢.٢ في تقريره): نصوص فاتت الجولات. اسم واحد للأمر الخامس «إعادة الجملة» مصدرًا كالأوامر الأربعة
// الأخرى، و«ب» ملتصقة باسم اللغة العربي بلا تطويل («بلغة هاواي» لا «بـلغة هاواي»)، ووصف قسم «العرض» يذكر صف الاختصارات،
// والمعدود في رسالة تعيين اللغة الإنجليزية ترجمات من أولها.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { setLocale, t } from '../../../src/i18n/index.js';

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
