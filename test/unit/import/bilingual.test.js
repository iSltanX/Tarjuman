// حارس الملف الثنائي عند الاستيراد (الفكرة ١١، ح-49): ملف صدّره ترجمان «مع الأصل» ثم رُفع ترجمةً يُكتشف بمسار الأصل المحفوظ
// (تحذير IM_BILINGUAL لا رفض)، ولا يُزال شيء قبل نقرة المستخدم، والإزالة بنقرة تحذف آخر سطر حيث طابق الأصل بملاحظة وتعيد المقارنة؛
// ولا إنذار كاذب في ترجمة عادية فيها اسم لاتيني، ولا حارس بلا أصل محفوظ. ومثله في ملف الاستكمال (readPatch).
// تحقق 2.3.0 (ص-١ وص-٢٣، بقرار سلطان): الترجمة المدموجة الحقيقية (ميدواي «مقاطع أطول») مصدَّرة بتوقيت المشاهدة تُكتشف كلها والإزالة
// تطابق «الترجمة وحدها» بايتًا، والملف بلغة الأصل وحدها مقطعين سطرًا تحت سطر لا يُحكم ثنائيًا، والثنائي المعكوس يُكتشف بموضعه.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { flatText } from '../../../src/core/align/original.js';
import { convertTrack } from '../../../src/core/convert/index.js';
import { buildSubtitleExport } from '../../../src/core/export/index.js';
import { bilingualCheck, readImport, readPatch, withoutLastLines, withoutMatchedLines, withoutOriginalLines } from '../../../src/core/import/index.js';
import { messageFor } from '../../../src/core/errors/index.js';
import { parseSrtStrict } from '../../../src/core/srt/parser.js';
import { formatSrtTime } from '../../../src/core/srt/time.js';
import { englishTrack, fingerprint } from '../../helpers/fixtures.js';
import { fileOf } from '../../fixtures/srt/index.js';
import { REAL_ARABIC, realArabic } from '../../fixtures/v2/index.js';

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
  assert.equal(r.bilingual?.count, 8, 'بتقدير فرق الزمن بين الملف والأصل المحفوظ');
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

test('لغة الملف بعد الإزالة: اسم ترجمان ID.ar.dual-en.srt لا تجتاز لغته فحص الكتابة على النص الثنائي (عربي ولاتيني)، فتُقرأ من الاسم على النص بعد الإزالة (الجولة الحية)', async () => {
  // نص الأصل أطول من الترجمة، كما في الملفات الحقيقية، فتغلب الحروف اللاتينية على النص الثنائي.
  const long = EN.map((c) => ({ ...c, text: `${c.text} and a much longer original sentence here` }));
  const track = englishTrack({ cues: long });
  const fp = fingerprint({ videoId: VIDEO, track });
  const file = buildSubtitleExport({ videoId: VIDEO, cues: AR, lang: 'ar', format: 'srt', bilingual: true, original: long, sourceLang: 'en' });
  assert.equal(file.name, `${VIDEO}.ar.dual-en.srt`);
  const r = await readImport(fileOf(file.text, file.name), { fingerprints: [fp], originals: [track] });
  assert.equal(r.lang, null, 'قبل الإزالة: النص الثنائي لا يوافق العربية');
  const s = withoutOriginalLines(r, { fingerprints: [fp] });
  assert.equal(s.lang, 'ar', 'بعد الإزالة: من الاسم على نص الترجمة وحده');
  const chosen = withoutOriginalLines({ ...r, lang: 'fa' }, { fingerprints: [fp] });
  assert.equal(chosen.lang, 'fa', 'لغة قائمة لا تُستبدل');
});

// تحقق 2.3.0 (ص-١): مسار الأصل كما يحفظه ترجمان (recordExport: التحويل العادي دائمًا، 1066 مقطعًا لعيّنة ميدواي)، وترجمتا النموذج
// الحقيقيتان: «مقاطع أطول» (729، وفي 300 منها يتداخل المقطع مع أكثر من مقطع أصل) و«عادي» (1056، وفي 89 منها كذلك).
const MIDWAY = 'Y9rkKtK1b44';
const midwayTrack = englishTrack({
  kind: 'asr',
  cues: convertTrack({ body: readFileSync(new URL('../../fixtures/json3/asr-nwc-Y9rkKtK1b44.json', import.meta.url), 'utf8'), trackKind: 'asr', mode: 'normal' }).cues,
});
const parsed = (text) => parseSrtStrict(text).map((c, i) => ({ n: i + 1, startMs: c.startMs, endMs: c.endMs, text: c.text }));
const overlapping = (c, original) => original.filter((o) => o.startMs < c.endMs && o.endMs > c.startMs).length;
/** أول موضع يختلف فيه نصّا ملفين (للرسالة وحدها، فلا يُطبع ملف كامل). */
const firstDiff = (a, b) => {
  let i = 0;
  while (i < a.length && a[i] === b[i]) i++;
  return i === a.length && i === b.length ? null : JSON.stringify(a.slice(Math.max(0, i - 60), i + 60));
};

for (const [label, name, total, merged] of [['«مقاطع أطول»', REAL_ARABIC.asrLong, 729, 300], ['«عادي»', 'Y9rkKtK1b44.en.asr.normal.ar.srt', 1056, 89]]) {
  test(`ص-١: ترجمة ميدواي ${label} الحقيقية مصدَّرة «مع الأصل» بتوقيت المشاهدة تُكتشف كلها (${total} من ${total})، والإزالة تطابق «الترجمة وحدها» بايتًا`, async () => {
    const ar = parsed(realArabic(name));
    const fp = fingerprint({ videoId: MIDWAY, track: midwayTrack });
    assert.equal(ar.length, total);
    assert.equal(ar.filter((c) => overlapping(c, midwayTrack.cues) >= 2).length, merged, 'ترجمة مدموجة: سطر أصل كثير من مقاطعها يضم مقطعين أو أكثر');
    for (const [offsetMs, format] of [[1500, 'srt'], [1500, 'vtt'], [-700, 'srt'], [0, 'srt']]) {
      const tag = `${format} بإزاحة ${offsetMs}`;
      const dual = buildSubtitleExport({ videoId: MIDWAY, cues: ar, offsetMs, timing: 'shown', lang: 'ar', format, bilingual: true, original: midwayTrack.cues, sourceLang: 'en' });
      const alone = buildSubtitleExport({ videoId: MIDWAY, cues: ar, offsetMs, timing: 'shown', lang: 'ar', format: 'srt' });
      const r = await readImport(fileOf(dual.text, dual.name), { fingerprints: [fp], originals: [midwayTrack] });
      assert.equal(r.ok, true, tag);
      assert.equal(`${r.bilingual?.count}/${r.bilingual?.total} ${r.bilingual?.line}`, `${total}/${total} last`, tag);
      const s = withoutOriginalLines(r, { fingerprints: [fp] });
      assert.equal(s.notes.at(-1), `أُزيل بطلبك سطر الأصل (آخر سطر) من ${total} مقطعًا.`, tag);
      const again = buildSubtitleExport({ videoId: MIDWAY, cues: s.cues, lang: 'ar', format: 'srt' });
      assert.equal(firstDiff(again.text, alone.text), null, `${tag}: بعد الإزالة يطابق ملف «الترجمة وحدها» بايتًا`);
    }
  });
}

test('ص-٢٣: ملف بلغة الأصل وحدها كل مقطع فيه مقطعا أصل سطرًا تحت سطر لا يُحكم ثنائيًا (كان 213 من 213)، ولو انزاح زمنه', async () => {
  const en = parsed(readFileSync(new URL('../../fixtures/export/iG9CE55wbtY.en.manual.srt', import.meta.url), 'utf8'));
  const track = englishTrack({ cues: en });
  const pairs = (list) => {
    const out = [];
    for (let i = 0; i + 1 < list.length; i += 2) out.push(cue(out.length + 1, list[i].startMs, list[i + 1].endMs, `${flatText(list[i].text)}\n${flatText(list[i + 1].text)}`));
    return out;
  };
  const merged = pairs(en);
  assert.equal(merged.length, 213);
  assert.equal(merged[0].text, 'Good morning. How are you?\n(Audience) Good.');
  assert.equal(bilingualCheck(merged, [track]), null, 'آخر سطر مقطعُ أصل، والمقطع يغطي غيره معه');
  assert.equal(bilingualCheck(merged.map((c) => ({ ...c, startMs: c.startMs + 1500, endMs: c.endMs + 1500 })), [track]), null, 'ولو انزاح');
  const r = await readImport(fileOf(srtOf(merged), 'talk.en.srt'), { fingerprints: [fingerprint({ videoId: VIDEO, track })], originals: [track] });
  assert.equal(r.ok, true);
  assert.equal(r.bilingual, null, 'فلا زر يحذف كلامًا مشروعًا');
  // ومثله بأزمنة منتظمة (المقاطع الثمانية): لا فرق زمن يجعل سطر أصل واحد محاذيًا لمقطع يغطي اثنين.
  assert.equal(bilingualCheck(pairs(EN), [TRACK]), null);
});

test('ص-٢٣: الثنائي المعكوس (سطر الأصل أول المقطع والترجمة تحته) يُكتشف بموضعه ولو انزاح، والإزالة تحذف أول سطر وتقول ذلك', async () => {
  const reversed = AR.map((c, i) => ({ ...c, startMs: c.startMs + 1500, endMs: c.endMs + 1500, text: `${EN[i].text}\n${c.text}\nسطر ثانٍ` }));
  const r = await read(srtOf(reversed), 'x.srt');
  assert.deepEqual([r.bilingual?.count, r.bilingual?.total, r.bilingual?.line], [8, 8, 'first']);
  assert.equal(messageFor('IM_BILINGUAL', r.bilingual), 'يبدو الملف مصدَّرًا مع الأصل: أول سطر في 8 مقاطع (من 8) هو نص الأصل نفسه. إن حُفظ هكذا صار الأصل جزءًا من نص الترجمة.');
  const s = withoutOriginalLines(r, { fingerprints: [FP] });
  assert.deepEqual(s.cues.map((c) => c.text), AR.map((c) => `${c.text}\nسطر ثانٍ`), 'تبقى أسطر الترجمة كلها');
  assert.deepEqual([s.stripped, s.strippedLine], [8, 'first']);
  assert.equal(s.notes.at(-1), 'أُزيل بطلبك سطر الأصل (أول سطر) من 8 مقاطع.');
  assert.deepEqual(withoutMatchedLines(reversed, { indexes: [0], line: 'first' }).slice(0, 2).map((c) => c.text), [`السطر 1\nسطر ثانٍ`, reversed[1].text], 'حيث طابق وحده');
  // والترجمة الحقيقية (TED، 427 مقطعًا) معكوسةً.
  const en = parsed(readFileSync(new URL('../../fixtures/export/iG9CE55wbtY.en.manual.srt', import.meta.url), 'utf8'));
  const ar = parsed(realArabic(REAL_ARABIC.manual));
  const lines = buildSubtitleExport({ videoId: VIDEO, cues: ar, lang: 'ar', format: 'srt', bilingual: true, original: en, sourceLang: 'en' }).text;
  const flipped = parsed(lines).map((c) => {
    const l = c.text.split('\n');
    return { ...c, text: [l.at(-1), ...l.slice(0, -1)].join('\n') };
  });
  const real = bilingualCheck(flipped, [englishTrack({ cues: en })]);
  assert.deepEqual([real?.count, real?.total, real?.line], [427, 427, 'first']);
  assert.equal(firstDiff(withoutMatchedLines(flipped, real).map((c) => c.text).join('\n\n'), ar.map((c) => c.text).join('\n\n')), null);
  // وملف الاستكمال المعكوس: الخطة بلا أول سطر، وملاحظتها بموضعه.
  const patch = srtOf(EN.slice(0, 3).map((c) => ({ ...c, text: `${c.text}\nمستكمل ${c.n}` })));
  const p = await readPatch(fileOf(patch, 'patch.srt'), { fingerprint: FP, cues: AR.map((c) => (c.n <= 3 ? { ...c, text: '' } : c)), originals: [TRACK] });
  assert.deepEqual([p.bilingual.count, p.bilingual.line], [3, 'first']);
  assert.deepEqual(p.bilingual.plan.items.map((x) => x.after.text), ['مستكمل 1', 'مستكمل 2', 'مستكمل 3']);
  assert.equal(p.bilingual.plan.notes.at(-1), 'أُزيل بطلبك سطر الأصل (أول سطر) من 3 مقاطع.');
});
