// بطارية المحوّل: TJ-AUD-009، TJ-AUD-010a/b (وE-10)، TJ-AUD-011/H-3، P-3، P-4، M-9.
import { readFileSync } from 'node:fs';
import { TJ_ROOT as T } from '../../../verify/_root.mjs';
const { convertTrack } = await import(`${T}/src/core/convert/index.js`);
const { buildExport } = await import(`${T}/src/core/export/index.js`);
const fails = (r) => r.invariants?.results.filter((x) => !x.ok).map((x) => `${x.id}:${x.key}:${x.detail}`) ?? [];
const brief = (r) => ({ ok: r.ok, code: r.code, cues: r.cues.length, fail: fails(r), detail: r.report.errorDetail, warnings: r.warnings });
const ev = (t, d, s) => ({ tStartMs: t, ...(d === undefined ? {} : { dDurationMs: d }), segs: [{ utf8: s }] });
const conv = (events, trackKind = 'manual', durationMs = null, extra = {}) => convertTrack({ body: JSON.stringify({ events }), trackKind, durationMs, ...extra });

console.log('== TJ-AUD-009 (manual short cue)');
for (const [label, events] of [
  ['Gemini: 80ms ثم فجوة 25s', [ev(1000, 80, 'Yes.'), ev(26000, 2000, 'Welcome back.')]],
  ['dDurationMs:0 ثم فجوة 25s', [ev(1000, 0, 'Yes.'), ev(26000, 2000, 'Welcome back.')]],
  ['dDurationMs غائب ثم فجوة 25s', [ev(1000, undefined, 'Yes.'), ev(26000, 2000, 'Welcome back.')]],
  ['تداخل حقيقي: بداية واحدة', [ev(1000, 2000, 'A'), ev(1000, 2000, 'B')]],
  ['تداخل يُقص إلى 50ms', [ev(1000, 2000, 'A'), ev(1050, 2000, 'B')]],
  ['قصير 80ms آخر الملف', [ev(1000, 2000, 'A'), ev(5000, 80, 'B')]],
]) {
  const r = conv(events);
  console.log(' ', label, JSON.stringify(brief(r)), JSON.stringify(r.cues.map((c) => [c.startMs, c.endMs, c.text])), JSON.stringify(r.report.converter));
}

console.log('== TJ-AUD-010a (tOffsetMs سالب)');
const asrEv = (t, d, words) => ({ tStartMs: t, dDurationMs: d, wWinId: 1, segs: words.map(([w, off], k) => ({ utf8: k ? ` ${w}` : w, ...(off === undefined ? {} : { tOffsetMs: off }), acAsrConf: 0 })) });
for (const [label, events] of [
  ['أول حدث 0 وكلمة -15', [asrEv(0, 3000, [['hello', -15], ['world', 400]]), asrEv(3000, 3000, [['next'], ['one', 300]])]],
  ['أول حدث 10 وكلمة -15', [asrEv(10, 3000, [['hello', -15], ['world', 400]]), asrEv(3000, 3000, [['next'], ['one', 300]])]],
  ['حدث 5000 وكلمة -15 (غير الأول)', [asrEv(1000, 3000, [['a'], ['b', 300]]), asrEv(5000, 3000, [['hello', -15], ['world', 400]])]],
  ['أول seg بلا tOffsetMs والثاني -15', [asrEv(0, 3000, [['hello'], ['world', -15]]), asrEv(3000, 3000, [['next']])]],
]) console.log(' ', label, JSON.stringify(brief(conv(events, 'asr', 60000))));
// يدوي بـ tOffsetMs سالب؟ اليدوي لا يستعمل offsets
console.log('  يدوي بـ tOffsetMs:-15 لا أثر:', JSON.stringify(brief(conv([{ tStartMs: 0, dDurationMs: 1000, segs: [{ utf8: 'x', tOffsetMs: -15 }] }], 'manual', 60000))));

console.log('== TJ-AUD-010b / E-10 (أزمنة كسرية)');
for (const [label, events, kind] of [
  ['يدوي tStartMs كسري', [ev(1000.5, 2000, 'one'), ev(4000, 2000, 'two')], 'manual'],
  ['يدوي dDurationMs كسري', [ev(1000, 1999.7, 'one'), ev(4000, 2000, 'two')], 'manual'],
  ['ASR tOffsetMs كسري', [asrEv(1000, 3000, [['a'], ['b', 300.4]]), asrEv(5000, 3000, [['c']])], 'asr'],
  ['يدوي tStartMs = 1000.0 (عدد صحيح بصيغة كسرية في JSON)', [ev(1000.0, 2000, 'one')], 'manual'],
]) console.log(' ', label, JSON.stringify(brief(conv(events, kind, 60000))));

console.log('== TJ-AUD-011 / H-3 (الكاشف المتدحرج)');
const fx = JSON.parse(readFileSync(`${T}/test/fixtures/json3/asr-nwc-Y9rkKtK1b44.json`, 'utf8'));
const base = convertTrack({ body: JSON.stringify(fx), trackKind: 'asr', durationMs: 3000000 });
console.log('  العيّنة الحقيقية كما هي:', JSON.stringify(brief(base)));
const textIdx = fx.events.map((e, i) => (Array.isArray(e.segs) && e.segs.map((s) => s.utf8 || '').join('').trim() ? i : -1)).filter((i) => i >= 0);
const mut = structuredClone(fx);
const [a, b] = [mut.events[textIdx[10]], mut.events[textIdx[11]]];
console.log('  الحدثان 10 و11 متداخلان:', b.tStartMs < a.tStartMs + a.dDurationMs, { aStart: a.tStartMs, aDur: a.dDurationMs, bStart: b.tStartMs });
// نستبدل آخر ثلاث كلمات في a وأول ثلاث في b بالكلمات نفسها، مع إبقاء أزمنة b بعد أزمنة a (تكرار حقيقي متتابع زمنيًا)
const wordsOf = (e) => e.segs.map((s) => s.utf8 ?? '').join('').trim().split(/\s+/);
console.log('  نص a الأصلي:', wordsOf(a).join(' '), '| نص b الأصلي:', wordsOf(b).join(' '));
a.segs = [{ utf8: 'we', acAsrConf: 0 }, { utf8: ' said', tOffsetMs: 300, acAsrConf: 0 }, { utf8: ' thank', tOffsetMs: 600, acAsrConf: 0 }, { utf8: ' you', tOffsetMs: 900, acAsrConf: 0 }, { utf8: ' very', tOffsetMs: 1200, acAsrConf: 0 }];
b.segs = [{ utf8: 'thank', acAsrConf: 0 }, { utf8: ' you', tOffsetMs: 300, acAsrConf: 0 }, { utf8: ' very', tOffsetMs: 600, acAsrConf: 0 }, { utf8: ' much', tOffsetMs: 900, acAsrConf: 0 }];
const aWordTimes = a.segs.map((s) => a.tStartMs + (s.tOffsetMs ?? 0));
const bWordTimes = b.segs.map((s) => b.tStartMs + (s.tOffsetMs ?? 0));
console.log('  أزمنة كلمات a:', aWordTimes.join(','), '| أزمنة b:', bWordTimes.join(','), '(كلمات b بعد كلمات a زمنيًا: تكرار حقيقي لا تدحرج)');
const r11 = convertTrack({ body: JSON.stringify(mut), trackKind: 'asr', durationMs: 3000000 });
console.log('  بعد تكرار 3 كلمات:', JSON.stringify(brief(r11)));
// تكرار كلمتين فقط: لا رفض
const mut2 = structuredClone(fx);
const [a2, b2] = [mut2.events[textIdx[10]], mut2.events[textIdx[11]]];
a2.segs = [{ utf8: 'we', acAsrConf: 0 }, { utf8: ' said', tOffsetMs: 300, acAsrConf: 0 }, { utf8: ' thank', tOffsetMs: 600, acAsrConf: 0 }, { utf8: ' you', tOffsetMs: 900, acAsrConf: 0 }];
b2.segs = [{ utf8: 'thank', acAsrConf: 0 }, { utf8: ' you', tOffsetMs: 300, acAsrConf: 0 }, { utf8: ' all', tOffsetMs: 600, acAsrConf: 0 }];
console.log('  تكرار كلمتين:', JSON.stringify(brief(convertTrack({ body: JSON.stringify(mut2), trackKind: 'asr', durationMs: 3000000 }))));
// أحداث غير متداخلة زمنيًا مع التكرار: لا رفض
const nonOverlap = [asrEv(1000, 1500, [['we'], ['said', 300], ['thank', 600], ['you', 900], ['very', 1200]]), asrEv(3000, 1500, [['thank'], ['you', 300], ['very', 600], ['much', 900]])];
console.log('  تكرار 3 كلمات بلا تداخل زمني:', JSON.stringify(brief(conv(nonOverlap, 'asr', 60000))));
// صيغة متدحرجة حقيقية (asbplayer #1318): b يكرر ذيل a بالأزمنة نفسها
const rolling = [asrEv(1000, 4000, [['the'], ['quick', 300], ['brown', 600], ['fox', 900]]), asrEv(2000, 4000, [['quick'], ['brown', 0], ['fox', 0], ['jumps', 900]])];
console.log('  متدحرجة حقيقية:', JSON.stringify(brief(conv(rolling, 'asr', 60000))));
// المسار اليدوي لا يمر بالكاشف
console.log('  المسار اليدوي لا يستعمل الكاشف:', JSON.stringify(brief(conv([ev(1000, 3000, 'we said thank you very'), ev(2000, 3000, 'thank you very much')], 'manual', 60000))));

console.log('== P-3 (آخر نهاية > المدة + 2s)');
console.log('  يدوي آخر نهاية 104000 ومدة 100000:', JSON.stringify(brief(conv([ev(1000, 2000, 'a'), ev(100000, 4000, 'b')], 'manual', 100000))));
console.log('  يدوي آخر نهاية 102000 ومدة 100000:', JSON.stringify(brief(conv([ev(1000, 2000, 'a'), ev(100000, 2000, 'b')], 'manual', 100000))));
console.log('  العيّنتان الحقيقيتان: آخر نهاية/المدة', JSON.stringify({ ted: [1165213, 1203421], asr: [base.report.lastEndMs, 3000000] }));
console.log('  المدة غير معروفة (null): لا فحص', JSON.stringify(brief(conv([ev(1000, 2000, 'a'), ev(100000, 4000, 'b')], 'manual', null))));

console.log('== P-4 (زمن كلمة شاذ)');
const mut4 = structuredClone(fx);
const offIdx = mut4.events.map((e, i) => (Array.isArray(e.segs) && e.segs.some((s) => s.tOffsetMs) ? i : -1)).filter((i) => i >= 0);
const e4 = mut4.events[offIdx[100]];
e4.segs[e4.segs.length - 1].tOffsetMs = 2_000_000;
const r4 = convertTrack({ body: JSON.stringify(mut4), trackKind: 'asr', durationMs: 3000000 });
const longest = r4.cues.reduce((m, c) => Math.max(m, c.text.length), 0);
console.log('  ', JSON.stringify({ ...brief(r4), clamped: r4.report.converter.clampedWordTimes, longestCueChars: longest, baseCues: base.cues.length }));
try { buildExport({ videoId: 'Y9rkKtK1b44', track: { key: 'en|asr', lang: 'en', kind: 'asr', cues: r4.cues }, mode: 'normal', now: 0 }); console.log('   التصدير نجح'); }
catch (e) { console.log('   التصدير رُفض:', e.code, JSON.stringify(e.detail)); }
// قيمة أصغر: كلمة متأخرة 60 ثانية داخل حدثها
const mut5 = structuredClone(fx);
const e5 = mut5.events[offIdx[100]];
e5.segs[e5.segs.length - 1].tOffsetMs = 60_000;
const r5 = convertTrack({ body: JSON.stringify(mut5), trackKind: 'asr', durationMs: 3000000 });
console.log('   شذوذ 60s:', JSON.stringify({ ...brief(r5), clamped: r5.report.converter.clampedWordTimes, longestCueChars: r5.cues.reduce((m, c) => Math.max(m, c.text.length), 0) }));

console.log('== M-9 (نسبة الاكتمال)');
const m9 = [ev(1000, 2000, 'hello world'), ev(70000, 2000, 'bye')];
console.log('  convertTrack لا يقبل عتبة؛ الناتج بالمدة 100000:', JSON.stringify(brief(conv(m9, 'manual', 100000))), 'completeness=', conv(m9, 'manual', 100000).report.completeness);
