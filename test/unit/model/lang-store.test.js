// إسقاط الحزمة لما يقرؤه 1.1.0 ومرافق اللغة (AA1، model/lang-store.js): الإسقاط يجتاز المدققات المخزَّنة، والمرافق يعيد ما سقط،
// ولغة الترجمة ومرجعها لا يُطبَّقان إلا على الترجمة نفسها في خانتها، والمدقق يرفض المرافق التالف.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LANG_SCHEMA, isEmptyLang, mergeLang, packLang, splitRecord, storedTrack, validateLangValue } from '../../../src/core/model/lang-store.js';
import { bundleFromRecord, syncActive } from '../../../src/core/model/bundle.js';
import { validateVideoRecord } from '../../../src/core/model/video.js';
import { validateArabicTrack, validateSourceTrack } from '../../../src/core/model/tracks.js';
import { validateBundle } from '../../../src/core/model/slots.js';
import { NOW, VIDEO_ID as A, comparison, fingerprint, makeCues } from '../../helpers/fixtures.js';
import { sampleBundle } from '../../helpers/fixtures-v2.js';

const JA = { key: 'ja|manual', lang: 'ja', kind: 'manual', capturedAt: NOW, source: 'capture', cues: makeCues(3, { text: (i) => `行 ${i}` }) };
const MT = { key: 'ar|asr|en', lang: 'ar', kind: 'asr', via: 'en', capturedAt: NOW, source: 'capture', cues: makeCues(3) };
const BASE = { rev: 1, createdAt: NOW, updatedAt: NOW };

function langBundle() {
  const b = sampleBundle();
  const fp = fingerprint({ track: JA, id: 'fp_test000003' });
  b.record.english.push(structuredClone(JA), structuredClone(MT));
  b.record.fingerprints.push(fp);
  Object.assign(b.slots[0].track, { fingerprintId: fp.id, comparison: comparison({ fingerprintId: fp.id }), lang: 'en' });
  b.record.arabic = structuredClone(b.slots[0].track);
  b.slots[1].track.lang = 'fr';
  b.previous.track.lang = null;
  return b;
}

test('المسار في الذاكرة بأي لغة، والمترجم آليًا بـvia ومفتاحه الثلاثي؛ والترجمة بلغتها أو null', () => {
  assert.equal(validateSourceTrack(JA).ok, true);
  assert.equal(validateSourceTrack(MT).ok, true);
  assert.equal(validateSourceTrack({ ...MT, key: 'ar|asr' }).ok, false, 'المفتاح يحمل via');
  assert.equal(validateSourceTrack({ ...JA, via: 'x!' }).ok, false);
  const t = { ...sampleBundle().slots[0].track };
  assert.equal(validateArabicTrack({ ...t, lang: 'ja' }).ok, true);
  assert.equal(validateArabicTrack({ ...t, lang: null }).ok, true);
  assert.equal(validateArabicTrack({ ...t, lang: 'bad lang' }).ok, false);
  assert.equal(validateArabicTrack({ ...t, lang: 'ja' }, 'a', { stored: true }).ok, false, 'المخزَّن بمفاتيحه الثمانية');
});

test('الإسقاط: السجل يجتاز مدقق 1.1.0، والمرجع إلى بصمة بغير الإنجليزية يصير null في السجل ويُحفظ في الوصف', () => {
  const b = langBundle();
  assert.equal(validateBundle(b).ok, true, 'الحزمة في الذاكرة صالحة');
  assert.equal(validateVideoRecord(b.record).ok, false, 'والسجل في الذاكرة لا يقرؤه 1.1.0 كما هو');
  const s = splitRecord(b.record);
  assert.equal(validateVideoRecord(s.record).ok, true);
  assert.deepEqual(s.sources.map((t) => t.key), ['ja|manual', 'ar|asr|en']);
  assert.deepEqual(s.prints.map((f) => f.id), ['fp_test000003']);
  assert.deepEqual(s.activeMeta, { importedAt: NOW, fileName: b.record.arabic.fileName, lang: 'en', ref: { fingerprintId: 'fp_test000003', comparison: b.record.arabic.comparison } });
  const p = packLang(b);
  assert.equal(p.lang.schema, LANG_SCHEMA);
  assert.equal(p.lang.slots[1].lang, 'fr');
  assert.equal(p.lang.slots[1].ref, null);
  assert.equal(p.lang.previous, null, 'سابقة بلا لغة ولا مرجع: لا وصف');
  assert.equal('lang' in p.alts[1], false);
  assert.equal(validateLangValue({ ...p.lang, base: BASE }).ok, true);
});

test('ترجمة بمرجع إلى بصمة إنجليزية تبقى بمرجعها في السجل، وبلا لغة ولا مرجع أجنبي لا وصف لها', () => {
  const t = sampleBundle().slots[1].track;
  const r = storedTrack(t, new Set([t.fingerprintId]));
  assert.equal(r.track.fingerprintId, t.fingerprintId);
  assert.equal(r.meta, null);
});

test('الدمج: يعيد المسارات والبصمات واللغات والمرجع، ولا يطبّق وصفًا على ترجمة استُبدلت', () => {
  const b = langBundle();
  const p = packLang(b);
  const lang = { ...p.lang, base: BASE };
  const back = syncActive({ ...bundleFromRecord(p.record), slots: b.slots.map((s) => ({ ...structuredClone(s), track: s.n === 1 ? null : p.alts[s.n - 1] })), previous: { ...b.previous, track: p.previous } });
  const stale = mergeLang(back, lang);
  syncActive(back);
  assert.equal(stale, false);
  assert.deepEqual(back.record.english.map((t) => t.key), ['en|manual', 'ja|manual', 'ar|asr|en']);
  assert.equal(back.record.arabic.fingerprintId, 'fp_test000003');
  assert.equal(back.record.arabic.lang, 'en');
  assert.equal(back.slots[0].track.lang, 'en');
  assert.equal(back.slots[1].track.lang, 'fr');
  // ترجمة الخانة 2 استبدلها إصدار سابق: لا تأخذ «fr».
  const replaced = structuredClone(back);
  replaced.slots[1].track = { ...replaced.slots[1].track, fileName: 'other.srt' };
  delete replaced.slots[1].track.lang;
  assert.equal(mergeLang(replaced, lang), true, 'وصف لا يطابق: تُعاد الكتابة');
  assert.equal('lang' in replaced.slots[1].track, false);
});

test('ع-١٣: الدمج بهوية الترجمة لا بموضعها: نقلها إصدار سابق بين خانتها والسابقة فتتبعها لغتها ومرجعها', () => {
  const b = langBundle();
  b.previous.track.lang = 'ar';
  const p = packLang(b);
  const lang = { ...p.lang, base: BASE };
  const back = syncActive({ ...bundleFromRecord(p.record), slots: b.slots.map((s) => ({ ...structuredClone(s), track: s.n === 1 ? null : p.alts[s.n - 1] })), previous: { ...b.previous, track: p.previous } });
  // استعادة السابقة في 1.1.0: تبديل الخانة 2 والسابقة.
  const swapped = structuredClone(back);
  [swapped.slots[1].track, swapped.previous.track] = [swapped.previous.track, swapped.slots[1].track];
  assert.equal(mergeLang(swapped, lang), true, 'الوصف في غير موضعه: تُعاد الكتابة');
  assert.equal(swapped.slots[1].track.lang, 'ar');
  assert.equal(swapped.previous.track.lang, 'fr');
  // استبدال النشطة في 1.1.0: صارت السابقة، والجديدة بلا لغة.
  const moved = structuredClone(back);
  moved.previous = { from: 1, savedAt: NOW, track: structuredClone(moved.record.arabic), offsetMs: 500 };
  moved.record.arabic = { ...structuredClone(moved.record.arabic), fileName: 'new.srt', importedAt: '2026-11-02T00:00:00.000Z' };
  syncActive(moved);
  assert.equal(mergeLang(moved, lang), true);
  syncActive(moved);
  assert.equal(moved.previous.track.lang, 'en');
  assert.equal(moved.previous.track.fingerprintId, 'fp_test000003', 'المرجع بغير الإنجليزية معها');
  assert.equal('lang' in moved.record.arabic, false, 'الجديدة غير محددة');
  assert.equal(moved.record.arabic.fingerprintId, null);
  assert.equal(moved.slots[1].track.lang, 'fr');
});

test('المرافق الفارغ والتالف', () => {
  const empty = { schema: 1, videoId: A, base: BASE, sources: [], prints: [], slots: [null, null, null], previous: null };
  assert.equal(isEmptyLang(empty), true);
  assert.equal(validateLangValue(empty).ok, true);
  const bad = (patch, why) => assert.equal(validateLangValue({ ...empty, ...patch }).ok, false, why);
  bad({ schema: 2 }, 'إصدار غير معروف');
  bad({ sources: [{ key: 'en|manual', lang: 'en', kind: 'manual', capturedAt: NOW, source: 'capture', cues: makeCues(1) }] }, 'المسار الإنجليزي الأصلي مكانه السجل');
  bad({ prints: [fingerprint({ track: JA, id: 'fp_test000009' })] }, 'بصمة لمسار غير محفوظ هنا');
  bad({ slots: [{ importedAt: NOW, fileName: 'a.srt', lang: null, ref: null }, null, null] }, 'وصف فارغ يُكتب null');
  bad({ slots: [null, null] }, 'ثلاث خانات');
  bad({ extra: 1 }, 'مفتاح غير معروف');
});
