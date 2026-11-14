// تحقق 3.0.0، v6-site (6 و7، وسطر الإصدار): وثيقة مواصفة الموقع docs/site/spec.md تصف ما في الصفحات المعتمدة. كانت تقول إن صورة
// المشاركة فيها المشغّل وإن العناوين بوزن 700 وإن النجاح لـ«متاح» و«متزامنة» وحدهما، وإن تاريخ سطر الإصدار من قسم «ما الجديد»؛
// والصفحات (في مستودع الموقع، باختباراتها هناك) بلا مشغّل في صورة المشاركة، وh1 وh2 بوزن 800، ووسم «الإصدار» بلون النجاح،
// و«صدر في» تاريخ سريان الخصوصية.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const read = (rel) => readFileSync(path.join(ROOT, rel), 'utf8');
/** سطر البند الوحيد الذي يبدأ بـ`start` في الملف. */
function line(rel, start) {
  const found = read(rel).split('\n').filter((l) => l.startsWith(start));
  assert.equal(found.length, 1, `${rel}: ${start}`);
  return found[0];
}

test('v6-site-6: صورة المشاركة في spec §6 بلا مشغّل، والعربية بالتشكيل ثنائي اللغة', () => {
  const s = line('docs/site/spec.md', '- **صورة المشاركة**');
  assert.doesNotMatch(s, /والمشغّل بجانبهما|الشعار الأفقي/, s);
  assert.ok(s.includes('بلا مشغّل'), s);
  assert.ok(s.includes('التشكيل ثنائي اللغة'), s);
  assert.ok(s.includes('التشكيل اللاتيني'), s);
});

test('v6-site-7: العناوين h1 وh2 بوزن 800 في spec §3، والنجاح لوسم «الإصدار» أيضًا في §2', () => {
  const h = line('docs/site/spec.md', '- **العناوين:**');
  assert.doesNotMatch(h, /^- \*\*العناوين:\*\* Cairo بوزن 700،/, h);
  assert.ok(h.includes('Cairo بوزن 800 لعنوان الصفحة وعناوين الأقسام'), h);
  const ok = line('docs/site/spec.md', '- دلالتان فقط:');
  assert.ok(ok.includes('ولوسم «الإصدار» في سطر الإصدار'), ok);
});

test('سطر الإصدار: «صدر في» تاريخ سريان الخصوصية لا تاريخ قسم «ما الجديد»، في spec §5 وجدول أدلة tarjuman.md', () => {
  const s = line('docs/site/spec.md', '- **التثبيت:**');
  assert.ok(s.includes('تاريخ سريان الخصوصية') && s.includes('privacy.mjs --effective'), s);
  assert.ok(s.includes('يُعرض الرقم وحده'), s);
  const row = line('docs/site/tarjuman.md', '| الإصدار |');
  assert.doesNotMatch(row, /ورقم الإصدار وتاريخه من أحدث قسم/, row);
  assert.ok(row.includes('تاريخ سريان الخصوصية'), row);
});
