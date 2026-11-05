// PLY-04: تقسيم بحجم 50 (أدنى قيمة يقبلها حقل الشريط والإعدادات) لـ2501 مقطعًا ينتج 51 ملفًا، والرفع يرفض أكثر من 50.
import { imp, log } from './common.mjs';
const { buildExport } = await imp('src/core/export/index.js');
const { readImport, MAX_FILES } = await imp('src/core/import/index.js');
const { isValidSetting } = await imp('src/core/model/settings.js').catch(() => ({}));
const { makeCues, NOW } = await imp('test/helpers/fixtures.js');

for (const [count, size] of [[2501, 50], [2500, 50], [5000, 100], [50000, 2000], [10001, 200]]) {
  const track = { lang: 'en', kind: 'manual', key: 'en|manual', cues: makeCues(count, { text: (i) => `Sentence ${i}.` }) };
  const built = buildExport({ videoId: 'AAAAAAAAAAA', track, mode: 'normal', split: { size, by: 'content' }, now: Date.parse(NOW) });
  const files = built.files.map((f) => new File([f.text.replace(/Sentence (\d+)\./g, 'جملة $1.')], f.name.replace('.en.', '.ar.')));
  const r = await readImport(files, { fingerprints: [built.fingerprint] });
  log(`${count} مقطعًا بحجم ${size}: ${built.files.length} ملفًا | readImport: ${r.ok ? `ok (${r.cues.length} مقطعًا)` : r.error.code} | MAX_FILES=${MAX_FILES}`);
}
// أكبر عدد مقاطع لا يتجاوز 50 جزءًا بالحجم الأدنى 50، والحد الأعلى للمقاطع
const { LIMITS } = await imp('src/core/model/validate.js');
log('أقصى مقاطع بأجزاء ≤ 50 عند الحجم 50:', 50 * 50, '| maxCues =', LIMITS.maxCues, '| الحجم الأدنى المطلوب لـmaxCues كي تبقى ≤ 50 جزءًا:', Math.ceil(LIMITS.maxCues / 50));
