// خطوط الترجمة («تهيئة W4»): البيانات تطابق نموذج الإعدادات، وكل ملف مذكور موجود WOFF2 فعلًا برخصته، والبيان
// يكشف ملفات WOFF2 وحدها، والسلسلة: المختار ثم المراعي المضمّن ثم خطوط النظام.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SUBTITLE_FONTS } from '../../../src/core/model/settings.js';
import { SUBTITLE_FONT_DIR, SUBTITLE_FONT_LIST, SYSTEM_ARABIC_FALLBACK, subtitleFont, subtitleFontStack } from '../../../src/ui/subtitle-fonts.js';

const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../src');
const manifest = JSON.parse(readFileSync(path.join(SRC, 'manifest.json'), 'utf8'));

test('معرّفات الخطوط هي SUBTITLE_FONTS بترتيبها، والمراعي أولًا، والعائلات فريدة', () => {
  assert.deepEqual(SUBTITLE_FONT_LIST.map((f) => f.id), [...SUBTITLE_FONTS]);
  assert.equal(SUBTITLE_FONT_LIST[0].id, 'almarai');
  assert.equal(new Set(SUBTITLE_FONT_LIST.map((f) => f.family)).size, 4);
  for (const f of SUBTITLE_FONT_LIST) {
    assert.match(f.family, /^Tarjuman Subtitle /);
    assert.ok(/\p{Script=Arabic}/u.test(f.nameAr) && f.nameLatin && f.note, f.id);
    assert.ok(Object.isFrozen(f) && Object.isFrozen(f.files), f.id);
  }
});

test('كل ملف مذكور موجود: WOFF2 بوزنيه، ورخصة SIL OFL لكل عائلة', () => {
  for (const f of SUBTITLE_FONT_LIST) {
    for (const w of [400, 700]) {
      const file = f.files[w];
      assert.ok(file.startsWith(`${SUBTITLE_FONT_DIR}/`) && file.endsWith(`-${w}.woff2`), file);
      const bytes = readFileSync(path.join(SRC, file));
      assert.equal(bytes.subarray(0, 4).toString('latin1'), 'wOF2', file);
      assert.ok(bytes.length > 10_000 && bytes.length < 400_000, `${file}: ${bytes.length}`);
    }
    assert.match(readFileSync(path.join(SRC, f.license), 'utf8'), /SIL OPEN FONT LICENSE Version 1\.1/, f.license);
  }
});

test('البيان يكشف ملفات WOFF2 للخطوط وحدها، ليوتيوب وحده، بعنوان متغير', () => {
  assert.deepEqual(manifest.web_accessible_resources, [
    { resources: [`${SUBTITLE_FONT_DIR}/*.woff2`], matches: ['https://www.youtube.com/*'], use_dynamic_url: true },
  ]);
  // الإصدار الثاني (P10-AC8): downloads معتمد لمكان الحفظ وحده بقرار سلطان 2026-11-02؛ ولا إذن غيره.
  assert.deepEqual(manifest.permissions, ['storage', 'unlimitedStorage', 'downloads'], 'الأذونات المعتمدة وحدها');
});

test('سلسلة الخط: المختار، ثم المراعي المضمّن، ثم خطوط النظام العربية؛ والمعرّف المجهول يعود إلى المراعي', () => {
  const sys = SYSTEM_ARABIC_FALLBACK.map((n) => (n === 'sans-serif' ? n : `"${n}"`)).join(', ');
  assert.equal(subtitleFontStack('markazi'), `"Tarjuman Subtitle Markazi Text", "Tarjuman Subtitle Almarai", ${sys}`);
  assert.equal(subtitleFontStack('almarai'), `"Tarjuman Subtitle Almarai", ${sys}`);
  assert.equal(subtitleFont('comic').id, 'almarai');
  assert.equal(subtitleFont('constructor').id, 'almarai');
  assert.equal(SYSTEM_ARABIC_FALLBACK.at(-1), 'sans-serif');
});
