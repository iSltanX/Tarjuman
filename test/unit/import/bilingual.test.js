// حارس الملف الثنائي عند الاستيراد (الفكرة ١١، ح-49): ملف صدّره ترجمان «مع الأصل» ثم رُفع ترجمةً يُكتشف بمسار الأصل المحفوظ
// (تحذير IM_BILINGUAL لا رفض)، ولا يُزال شيء قبل نقرة المستخدم، والإزالة بنقرة تحذف آخر سطر حيث طابق الأصل بملاحظة وتعيد المقارنة؛
// ولا إنذار كاذب في ترجمة عادية فيها اسم لاتيني، ولا حارس بلا أصل محفوظ. ومثله في ملف الاستكمال (readPatch).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildSubtitleExport } from '../../../src/core/export/index.js';
import { bilingualCheck, readImport, readPatch, withoutLastLines, withoutOriginalLines } from '../../../src/core/import/index.js';
import { messageFor } from '../../../src/core/errors/index.js';
import { formatSrtTime } from '../../../src/core/srt/time.js';
import { englishTrack, fingerprint } from '../../helpers/fixtures.js';
import { fileOf } from '../../fixtures/srt/index.js';

const VIDEO = 'iG9CE55wbtY';
const cue = (n, startMs, endMs, text) => ({ n, startMs, endMs, text });
const EN = Array.from({ length: 8 }, (_, i) => cue(i + 1, 1000 + i * 3000, 3500 + i * 3000, `Line ${i + 1} & more`));
const AR = EN.map((c) => ({ ...c, text: `السطر ${c.n}` }));
const TRACK = englishTrack({ cues: EN });
const FP = fingerprint({ videoId: VIDEO, track: TRACK });
const dual = (o = {}) => buildSubtitleExport({ videoId: VIDEO, cues: AR, lang: 'ar', format: 'srt', bilingual: true, original: EN, sourceLang: 'en', ...o });
const read = (text, name, originals = [TRACK]) => readImport(fileOf(text, name), { fingerprints: [FP], originals });
const srtOf = (cues) => cues.map((c, i) => `${i + 1}\n${formatSrtTime(c.startMs)} --> ${formatSrtTime(c.endMs)}\n${c.text}\n`).join('\n');

test('يُكتشف: ملف ترجمان «مع الأصل» يُرفع ترجمةً ← bilingual بعدده (IM_BILINGUAL)، ولا يُزال شيء ولا يُرفض الملف', async () => {
  const file = dual();
  const r = await read(file.text, file.name);
  assert.equal(r.ok, true, 'لا رفض');
  assert.deepEqual({ code: r.bilingual.code, count: r.bilingual.count, total: r.bilingual.total, lang: r.bilingual.lang }, { code: 'IM_BILINGUAL', count: 8, total: 8, lang: 'en' });
  assert.equal(r.cues[0].text, 'السطر 1\nLine 1 & more', 'لا يُزال شيء قبل نقرة المستخدم');
  assert.deepEqual(r.warnings, [], 'ليس في التحذيرات العامة: تعرضه المراجعة بزرّه');
  assert.equal(messageFor('IM_BILINGUAL', r.bilingual), 'يبدو الملف مصدَّرًا مع الأصل: آخر سطر في 8 مقاطع (من 8) هو نص الأصل نفسه. إن حُفظ هكذا صار الأصل جزءًا من نص الترجمة.');
});

test('الإزالة بنقرة: آخر سطر يُحذف حيث طابق الأصل وحده، بملاحظة IM_NOTE_BILINGUAL_REMOVED، والمقارنة من جديد، وbilingual يزول', async () => {
  // مقطع في فجوة بلا أصل يبقى كما هو (سطره الأخير ترجمة).
  const cues = [...AR.slice(0, 7), cue(8, 30000, 31000, 'في الفجوة\nسطر ثانٍ')];
  const file = buildSubtitleExport({ videoId: VIDEO, cues, lang: 'ar', format: 'srt', bilingual: true, original: EN, sourceLang: 'en' });
  const r = await read(file.text, file.name);
  assert.equal(r.bilingual.count, 7);
  assert.deepEqual(r.bilingual.indexes, [0, 1, 2, 3, 4, 5, 6]);
  const s = withoutOriginalLines(r, { fingerprints: [FP] });
  assert.deepEqual(s.cues.map((c) => c.text), [...AR.slice(0, 7).map((c) => c.text), 'في الفجوة\nسطر ثانٍ']);
  assert.equal(s.bilingual, null);
  assert.equal(s.stripped, 7);
  assert.equal(s.notes.at(-1), 'أُزيل بطلبك سطر الأصل (آخر سطر) من 7 مقاطع.');
  assert.ok(s.comparison.notes.includes(s.notes.at(-1)), 'وفي ملاحظات المقارنة المحفوظة');
  assert.equal(s.comparison.fingerprintId, FP.id, 'بالمرجع نفسه');
  assert.equal(r.cues[0].text, 'السطر 1\nLine 1 & more', 'لا تغيير للنتيجة الأولى');
  assert.equal(withoutOriginalLines(s, { fingerprints: [FP] }), s, 'ما ليس ثنائيًا يعود كما هو');
});

test('لا إنذار كاذب: ترجمة عادية فيها اسم لاتيني في آخر سطر مقاطع قليلة (ولو طابق مقطع أصل بعينه)، ومقطع غير مترجم بسطر واحد', async () => {
  const original = [...EN.slice(0, 6), cue(7, 19000, 21500, 'Google'), cue(8, 22000, 24500, 'Google')];
  const track = englishTrack({ cues: original });
  const ar = AR.map((c, i) => ({ ...c, text: i >= 5 ? `${c.text}\nGoogle` : c.text }));
  ar[0] = { ...ar[0], text: 'Line 1 & more' };
  const r = await read(srtOf(ar), 'talk.ar.srt', [track]);
  assert.equal(r.ok, true);
  assert.equal(r.bilingual, null, '3 من 8 لا أكثرها، والسطر الواحد غير المترجم لا يُعدّ');
  assert.equal(bilingualCheck(ar, [track]), null);
  // ونصفها بالضبط لا يكفي: «أكثر المقاطع» فوق النصف.
  const half = AR.map((c, i) => ({ ...c, text: i < 4 ? `${c.text}\n${EN[i].text}` : c.text }));
  assert.equal(bilingualCheck(half, [TRACK]), null);
  assert.equal(bilingualCheck(half.map((c, i) => (i === 4 ? { ...c, text: `${c.text}\n${EN[4].text}` } : c)), [TRACK]).count, 5);
});

test('لا حارس بلا أصل محفوظ: الملف الثنائي نفسه يُقرأ بلا bilingual (قيد معروف)', async () => {
  const file = dual();
  assert.equal((await read(file.text, file.name, [])).bilingual, null);
  assert.equal((await readImport(fileOf(file.text, file.name), { fingerprints: [FP] })).bilingual, null, 'بلا originals أصلًا');
  assert.equal(bilingualCheck(AR, [englishTrack({ cues: [] })]), null);
});

test('يُكتشف ما صُدِّر بتوقيت المشاهدة (إزاحة +1.5 ث) وما صُدِّر WebVTT ثم لُصق نصًا، وتُوازن مسارات الأصل فيُؤخذ أكثرها مطابقة', async () => {
  const shifted = dual({ offsetMs: 1500, timing: 'shown' });
  const r = await read(shifted.text, 'x.srt');
  assert.equal(r.bilingual?.count, 8, 'نص مقطع أصل بعينه ولو انزاح الزمن');
  const vtt = dual({ format: 'vtt' });
  assert.ok(vtt.text.includes('Line 1 &amp; more'));
  const v = await read(vtt.text, 'لصق.txt');
  assert.equal(v.ok, true);
  assert.equal(v.bilingual?.count, 8, 'الكيانات تُفكّ للمقارنة وحدها');
  assert.equal(v.cues[0].text, 'السطر 1\nLine 1 &amp; more', 'ولا يتغير النص المقروء');
  const other = englishTrack({ lang: 'fr', kind: 'manual', cues: EN.map((c) => ({ ...c, text: `Ligne ${c.n}` })) });
  assert.equal(bilingualCheck(r.cues, [other, TRACK]).lang, 'en');
});

test('الدمج: مقطع ترجمة غطّى مقطعين يُعرف بالأصل المحاذي المضموم، والإزالة تُبقي سطري الترجمة', () => {
  const ar = [cue(1, 1000, 6500, 'الأول\nوالثاني'), ...AR.slice(2)];
  const file = buildSubtitleExport({ videoId: VIDEO, cues: ar, lang: 'ar', format: 'srt', bilingual: true, original: EN, sourceLang: 'en' });
  assert.ok(file.text.includes('الأول\nوالثاني\nLine 1 & more Line 2 & more'));
  const back = ar.map((c, i) => ({ ...c, text: `${c.text}\n${i === 0 ? 'Line 1 & more Line 2 & more' : EN[i + 1].text}` }));
  const bi = bilingualCheck(back, [TRACK]);
  assert.equal(bi.count, 7);
  assert.equal(withoutLastLines(back, bi.indexes)[0].text, 'الأول\nوالثاني');
});

test('ملف الاستكمال (المحرّر): الثنائي يُكتشف ومعه خطته بلا سطر الأصل بملاحظتها، والخطة الأولى كما قُرئت', async () => {
  const patch = srtOf(EN.slice(0, 3).map((c) => ({ ...c, text: `مستكمل ${c.n}\n${c.text}` })));
  const current = AR.map((c) => (c.n <= 3 ? { ...c, text: '' } : c));
  const r = await readPatch(fileOf(patch, 'patch.srt'), { fingerprint: FP, cues: current, originals: [TRACK] });
  assert.equal(r.ok, true);
  assert.deepEqual([r.bilingual.count, r.bilingual.total], [3, 3]);
  assert.equal(r.plan.items[0].after.text, 'مستكمل 1\nLine 1 & more', 'لا يُزال شيء قبل النقرة');
  assert.deepEqual(r.bilingual.plan.items.map((x) => x.after.text), ['مستكمل 1', 'مستكمل 2', 'مستكمل 3']);
  assert.equal(r.bilingual.plan.notes.at(-1), 'أُزيل بطلبك سطر الأصل (آخر سطر) من 3 مقاطع.');
  const plain = await readPatch(fileOf(patch, 'patch.srt'), { fingerprint: FP, cues: current });
  assert.equal(plain.bilingual, null, 'بلا أصل لا حارس');
});
