// التنقية الموحدة (N-05 وF-06): ما يُزال، وما يبقى في الفارسية والأردية والتايلاندية، والمسارات التي تمر بها: الالتقاط والرفع
// والعنوان والتصدير. المحارف الخفية تُبنى بـfromCodePoint فلا يحمل المصدر محرفًا خفيًا حرفيًا.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeCues, sanitizeText } from '../../../src/core/text/sanitize.js';
import { parseSrtLenient } from '../../../src/core/srt/lenient.js';
import { parseJson3 } from '../../../src/core/convert/json3.js';
import { convertTrack } from '../../../src/core/convert/index.js';
import { readImport } from '../../../src/core/import/index.js';
import { buildArabicExport, buildExport, buildPatchPackage, buildStudyText, textHash } from '../../../src/core/export/index.js';
import { videoTitle } from '../../../src/player/youtube-dom.js';
import { messageFor } from '../../../src/core/errors/index.js';
import { getLocale, setLocale } from '../../../src/i18n/index.js';
import { fileOf } from '../../fixtures/srt/index.js';

const cp = (...codes) => String.fromCodePoint(...codes);
const ZWSP = cp(0x200b);
const ZWNJ = cp(0x200c);
const ZWJ = cp(0x200d);
const LRM = cp(0x200e);
const RLM = cp(0x200f);
const BOM = cp(0xfeff);
const VIDEO = 'iG9CE55wbtY';
const T1 = '00:00:01,000 --> 00:00:03,000';
const srt = (text) => `1\n${T1}\n${text}\n`;
const hiddenCount = (n) => messageFor('IM_NOTE_HIDDEN_CHARS', { count: n });

// ---- ما يُزال ----

test('محارف الوسوم U+E0000 إلى U+E007F تُزال كلها، ولا يُمس ما بعد الكتلة', () => {
  const tags = cp(0xe0000, 0xe0001, 0xe0020, 0xe0049, 0xe007f);
  assert.deepEqual(sanitizeText(`visible${tags} text`), { text: 'visible text', removed: 5 });
  const after = cp(0xe0080, 0xe0100);
  assert.deepEqual(sanitizeText(`a${after}`), { text: `a${after}`, removed: 0 }, 'الحد الأعلى U+E007F');
});

test('علم التقسيم الفرعي يصير علمًا أسود (مقبول بالقرار)', () => {
  const scotland = cp(0x1f3f4, 0xe0067, 0xe0062, 0xe0073, 0xe0063, 0xe0074, 0xe007f);
  assert.deepEqual(sanitizeText(scotland), { text: cp(0x1f3f4), removed: 6 });
});

test('تضمين الاتجاه وتجاوزه U+202A إلى U+202E يُزال', () => {
  for (const code of [0x202a, 0x202b, 0x202c, 0x202d, 0x202e]) {
    assert.deepEqual(sanitizeText(`a${cp(code)}b`), { text: 'ab', removed: 1 }, code.toString(16));
  }
  assert.equal(sanitizeText(`a${cp(0x2029 + 0x6)}b`).removed, 0, 'U+202F مسافة ضيقة تبقى');
});

test('عزل الاتجاه U+2066 إلى U+2069 يُزال', () => {
  for (const code of [0x2066, 0x2067, 0x2068, 0x2069]) {
    assert.deepEqual(sanitizeText(`a${cp(code)}b`), { text: 'ab', removed: 1 }, code.toString(16));
  }
  assert.equal(sanitizeText(`a${cp(0x2065)}b`).removed, 0, 'ما قبل الكتلة يبقى');
});

test('U+FEFF داخل النص يُزال وعند طرف السطر، وBOM أول الملف يزيله المحلّل بلا ملاحظة', () => {
  assert.deepEqual(sanitizeText(`ab${BOM}cd`), { text: 'abcd', removed: 1 });
  const inner = parseSrtLenient(srt(`ab${BOM}cd${BOM}`));
  assert.equal(inner.cues[0].text, 'abcd');
  assert.deepEqual(inner.notes, [hiddenCount(2)], 'الطرف يُعدّ محرفًا مزالًا لا مسافة مقصوصة');
  const leading = parseSrtLenient(`${BOM}${srt('نص')}`);
  assert.equal(leading.cues[0].text, 'نص');
  assert.deepEqual(leading.notes, []);
});

test('sanitizeCues يعيد المقطع السليم نفسه ويجمع العدد', () => {
  const ok = { n: 1, startMs: 0, endMs: 1, text: 'ok' };
  const bad = { n: 2, startMs: 1, endMs: 2, text: `b${cp(0x202e)}${cp(0xe0041)}` };
  const r = sanitizeCues([ok, bad]);
  assert.ok(r.cues[0] === ok);
  assert.equal(r.cues[1].text, 'b');
  assert.equal(r.removed, 2);
});

// ---- ما يبقى، بأسطر حقيقية ----

const KEPT = [
  ['ZWNJ في الفارسية', ZWNJ, `نمی${ZWNJ}دانم چه باید کرد`],
  ['ZWNJ في الأردية', ZWNJ, `پی${ZWNJ}ایچ ڈی کی ڈگری`],
  ['ZWJ في الأردية', ZWJ, `۱۴۴۵ ھ${ZWJ} میں لکھا گیا`],
  ['ZWJ في تسلسل إيموجي', ZWJ, `الأسرة ${cp(0x1f468)}${ZWJ}${cp(0x1f469)}${ZWJ}${cp(0x1f467)}`],
  ['LRM في الفارسية مع لاتيني', LRM, `این ویدیو در YouTube${LRM} است`],
  ['RLM في الأردية مع أرقام', RLM, `قیمت ۵۰${RLM} روپے ہے`],
  ['ZWSP في التايلاندية', ZWSP, `ฉันรัก${ZWSP}ภาษาไทย${ZWSP}มาก`],
];

for (const [label, ch, line] of KEPT) {
  test(`يبقى: ${label}`, () => {
    assert.deepEqual(sanitizeText(line), { text: line, removed: 0 });
    assert.ok(line.includes(ch));
    const r = parseSrtLenient(srt(line));
    assert.equal(r.cues[0].text, line);
    assert.deepEqual(r.notes, [], 'لا ملاحظة عند عدم الإزالة');
  });
}

test('ذهاب وإياب: النص الباقي يعبر الرفع ثم التصدير بايتًا بايتًا', () => {
  const lines = KEPT.map(([, , line]) => line);
  const file = lines.map((line, i) => `${i + 1}\n00:00:0${i},000 --> 00:00:0${i},900\n${line}\n`).join('\n');
  const imported = parseSrtLenient(file);
  assert.deepEqual(imported.notes, []);
  assert.deepEqual(imported.cues.map((c) => c.text), lines);
  const exported = buildArabicExport({ videoId: VIDEO, cues: imported.cues });
  assert.deepEqual(exported.notes, []);
  assert.equal(Buffer.compare(Buffer.from(exported.text, 'utf8'), Buffer.from(file, 'utf8')), 0, 'الملف المصدَّر هو الملف المرفوع');
  assert.deepEqual(parseSrtLenient(exported.text).cues.map((c) => c.text), lines);
});

// ---- المسارات ----

test('الالتقاط: تُنقّى القطع بعد فك JSON، ولو وصلت المحارف مهرّبة في الجسم الخام', () => {
  const escaped = '"visible\\udb40\\udc49\\u202e text"';
  const body = `{"events":[{"tStartMs":0,"dDurationMs":1000,"segs":[{"utf8":${escaped}}]}]}`;
  assert.equal(parseJson3(body).events[0].text, 'visible text');
});

test('الالتقاط: حدث كله محارف مخفية حدث فارغ لا مقطع', () => {
  const body = JSON.stringify({ events: [
    { tStartMs: 0, dDurationMs: 1000, segs: [{ utf8: cp(0xe0041, 0xe0042) }] },
    { tStartMs: 2000, dDurationMs: 1000, segs: [{ utf8: 'real' }] },
  ] });
  const r = convertTrack({ body, trackKind: 'manual' });
  assert.equal(r.ok, true);
  assert.deepEqual(r.cues.map((c) => c.text), ['real']);
});

test('الالتقاط: الباقي من ZWNJ وZWSP يعبر التحويل كما هو', () => {
  const line = `نمی${ZWNJ}دانم ฉัน${ZWSP}รัก`;
  const body = JSON.stringify({ events: [{ tStartMs: 0, dDurationMs: 2000, segs: [{ utf8: line }] }] });
  assert.equal(convertTrack({ body, trackKind: 'manual' }).cues[0].text, line);
});

test('العنوان: يُنقّى في مصدره، وتبقى اللاحقة قابلة للإسقاط', () => {
  const title = `(3) A${cp(0x202e)}B${cp(0xe0041)} - YouTube${BOM}`;
  assert.equal(videoTitle({ title }), 'AB');
});

test('ملاحظة واحدة في تقرير الرفع بالعدد، بالعربية والإنجليزية', async () => {
  const text = srt(`a${cp(0x202e)}b${cp(0xe0041)}`) + `\n2\n00:00:04,000 --> 00:00:05,000\nc${cp(0x2066)}d\n`;
  const r = await readImport(fileOf(text, `${VIDEO}.ar.srt`));
  assert.equal(r.ok, true);
  assert.deepEqual(r.cues.map((c) => c.text), ['ab', 'cd']);
  assert.deepEqual(r.notes, [hiddenCount(3)]);
  const before = getLocale();
  try {
    for (const locale of ['ar', 'en']) {
      setLocale(locale);
      assert.match(hiddenCount(3), /3/, locale);
      assert.ok(!hiddenCount(3).includes('{'), `قالب مكتمل في ${locale}`);
    }
  } finally {
    setLocale(before);
  }
});

test('رفع بلا إزالة: لا ملاحظة', async () => {
  const r = await readImport(fileOf(srt('نص نظيف'), `${VIDEO}.ar.srt`));
  assert.deepEqual([r.ok, r.notes], [true, []]);
});

test('سطر صار فارغًا بالتنقية لا يقطع المقطع', () => {
  const r = parseSrtLenient(srt(`أول\n${cp(0x202e)}\nثانٍ`));
  assert.equal(r.cues[0].text, 'أول\nثانٍ');
  assert.deepEqual(r.notes, [hiddenCount(1)]);
});

test('محرف وسم في سطر الرقم أو الزمن لا يكسر قراءة الرأس', () => {
  const r = parseSrtLenient(`1${cp(0xe0041)}\n${T1}${cp(0xe0041)}\nنص\n`);
  assert.deepEqual(r.cues.map((c) => [c.n, c.text]), [[1, 'نص']]);
});

test('التصدير: ما حُفظ قبل 2.1.2 لا يصل إلى ملف النموذج، وبصمة النص تبقى على المحفوظ', () => {
  const hidden = `Hello${cp(0xe0049, 0xe0047)}${cp(0x202e)} world${BOM}`;
  const cues = [{ n: 1, startMs: 0, endMs: 1000, text: hidden }, { n: 2, startMs: 2000, endMs: 3000, text: 'plain' }];
  const track = { key: 'en|manual', lang: 'en', kind: 'manual', via: null, cues };
  const built = buildExport({ videoId: VIDEO, track, mode: 'normal', target: 'ar', now: 1, rand: () => 0.5 });
  assert.ok(built.files[0].text.includes('Hello world\n'));
  assert.ok(!/[\u{E0000}-\u{E007F}‪-‮﻿]/u.test(built.files[0].text));
  assert.equal(built.fingerprint.textHash, textHash(cues), 'الاستكمال يطابق المسار المحفوظ');

  const patch = buildPatchPackage({ videoId: VIDEO, fingerprint: built.fingerprint, englishTracks: [track], numbers: [1], target: 'ar' });
  assert.equal(patch.ok, true, JSON.stringify(patch));
  assert.ok(patch.file.text.includes('Hello world\n'));
  assert.ok(!/[\u{E0000}-\u{E007F}‪-‮﻿]/u.test(patch.file.text));

  const ar = buildArabicExport({ videoId: VIDEO, cues: [{ n: 1, startMs: 0, endMs: 1000, text: `نص${cp(0xe0049)}` }] });
  assert.ok(ar.text.includes('نص\n'));
  assert.ok(!/[\u{E0000}-\u{E007F}]/u.test(ar.text));
  assert.equal(ar.notes.length, 1, 'التصدير العربي يذكر ما جرّده');

  const study = buildStudyText({ videoId: VIDEO, cues: [{ n: 1, startMs: 0, endMs: 1000, text: `نص${cp(0xe0049)}.` }], format: 'txt' });
  assert.ok(!/[\u{E0000}-\u{E007F}]/u.test(study.text));
});
