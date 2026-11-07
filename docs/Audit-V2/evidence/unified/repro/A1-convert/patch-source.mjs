// A1 — التحقق من Gemini F-08: buildPatchPackage يرفض مقاطع مصدر يقبلها buildExport.
// الاستعمال: command node patch-source.mjs <جذر الشيفرة>
// لا متصفح ولا شبكة ولا كتابة. كل حالة تطبع «الفعلي» و«المتوقع».
import { readFileSync } from 'node:fs';

const R = process.argv[2];
if (!R) throw new Error('مرّر جذر الشيفرة وسيطًا أول');
const { convertTrack } = await import(`${R}/src/core/convert/index.js`);
const { buildExport, buildPatchPackage } = await import(`${R}/src/core/export/index.js`);
const { messageFor } = await import(`${R}/src/core/errors/index.js`);
const { VIDEO_ID, englishTrack } = await import(`${R}/test/helpers/fixtures.js`);

const out = (title, actual, expected, note) => {
  console.log(`\n## ${title}`);
  console.log('الفعلي:', JSON.stringify(actual));
  console.log('المتوقع:', JSON.stringify(expected));
  if (note) console.log('ملاحظة:', note);
};
const vis = (s) => s.replace(/[\u200B-\u200F\u202A-\u202E\u2066-\u2069]/g, (c) => `<U+${c.codePointAt(0).toString(16).toUpperCase()}>`);

// المقاطع كما يكتبها مسار يدوي في json3 (حدث لكل سطر)، ثم تمر بمحوّل ترجمان نفسه: هل تبقى في نص المسار المحفوظ؟
const candidates = [
  ['heading «# of»', '# of people in the room'],
  ['hashtag «#1»', '#1 fan of this show'],
  ['ثلاث شرطات', '---'],
  ['ثلاث نجوم', '***'],
  ['سياج ```', '```'],
  ['سياج ~~~', '~~~'],
  ['وسم <i>', '<i>Hello world</i>'],
  ['وسم <font>', '<font color="#ffff00">Warning</font>'],
  ['RLE/PDF حول نص عربي', '\u202Bمرحبا بكم\u202C'],
  ['RLM وحده (مسموح)', 'مرحبا\u200F بكم'],
];
const events = candidates.map(([, t], i) => ({ tStartMs: 1000 + i * 2000, dDurationMs: 1500, segs: [{ utf8: t }] }));
events.push({ tStartMs: 1000 + candidates.length * 2000, dDurationMs: 1500, segs: [{ utf8: 'Normal line' }] });
const conv = convertTrack({ body: JSON.stringify({ wireMagic: 'pb3', events }), trackKind: 'manual', durationMs: 60000 });
out('١. هل يحفظ تحويل json3 النص كما هو (بلا تجريد وسوم أو محارف اتجاه)؟',
  { ok: conv.ok, texts: conv.cues.map((c) => vis(c.text)) },
  'النصوص كما وردت (لا تنظيف للوسوم ولا لمحارف الاتجاه في parseJson3/cleanCueText)');

const track = { ...englishTrack({ cues: conv.cues.map((c, i) => ({ n: i + 1, startMs: c.startMs, endMs: c.endMs, text: c.text })) }) };
const exp = buildExport({ videoId: VIDEO_ID, title: 'T', track, mode: 'normal', target: 'ar', now: Date.parse('2026-11-08T00:00:00Z') });
out('٢. buildExport للمسار كله', { files: exp.files.length, containsHeading: exp.files[0].text.includes('# of people'), containsTag: exp.files[0].text.includes('<i>Hello') },
  'يُصدَّر (عقد interfaces §١٥١: السياج والعنوان في الإنجليزي نص)');

const rows = candidates.map(([label], i) => {
  const r = buildPatchPackage({ videoId: VIDEO_ID, title: 'T', fingerprint: exp.fingerprint, englishTracks: [track], numbers: [i + 1], target: 'ar' });
  return { n: i + 1, label, ok: r.ok, code: r.ok ? null : r.code };
});
out('٣. buildPatchPackage لكل مقطع وحده', rows, 'ok=true لكل ما قبله buildExport');

const control = buildPatchPackage({ videoId: VIDEO_ID, title: 'T', fingerprint: exp.fingerprint, englishTracks: [track], numbers: [candidates.length + 1], target: 'ar' });
out('٤. الضابط: «Normal line»', { ok: control.ok }, 'ok=true');

out('٥. الرسالة التي يراها المستخدم', {
  EX_PATCH_SOURCE_UNWRITABLE: messageFor('EX_PATCH_SOURCE_UNWRITABLE', { list: '1' }),
  EX_INVARIANT_FAILED: messageFor('EX_INVARIANT_FAILED'),
}, 'رسالة تصف السبب الفعلي (عنوان/سياج، أو وسم/محرف اتجاه)');

// ٦. هل في العيّنات الحقيقية (P1) نص بهذه الأشكال؟
const fx = (f) => JSON.parse(readFileSync(`${R}/test/fixtures/json3/${f}`, 'utf8'));
const scan = (f) => {
  const segs = fx(f).events.flatMap((e) => (Array.isArray(e.segs) ? e.segs.map((s) => s.utf8 ?? '') : []));
  return {
    file: f,
    segs: segs.length,
    tags: segs.filter((t) => /<\/?[A-Za-z][^<>]*>/.test(t)).length,
    headingOrFence: segs.filter((t) => t.split('\n').some((l) => /^#{1,6}\s+\S/.test(l.trim()) || /^(?:`{3,}|~{3,})[\w+-]*$/.test(l.trim()))).length,
    bidiControls: segs.filter((t) => /[\u202A-\u202E\u2066-\u2069]/.test(t)).length,
  };
};
out('٦. العيّنات الحقيقية في المستودع', [scan('manual-ted-iG9CE55wbtY.json'), scan('asr-nwc-Y9rkKtK1b44.json')], 'معلومة: هل يظهر الشكل في استجابة حقيقية');
