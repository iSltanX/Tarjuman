// وحدات التصدير الصغيرة: التسمية، وبصمة النص، وتخطيط الأجزاء، ووصف المسار (P3-AC2، AC3، AC5).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { describeTrack, fileName, fnv1a64, languageLabel, planParts, textHash, trackLabel, translationLang } from '../../../src/core/export/index.js';
import { TjError } from '../../../src/core/errors/index.js';

const VID = 'iG9CE55wbtY';

test('fileName: VIDEOID.en.<kind>.<mode>.srt للإنجليزي، وVIDEOID.ar.srt للعربي', () => {
  assert.equal(fileName({ videoId: VID, lang: 'en', kind: 'manual', mode: 'normal' }), 'iG9CE55wbtY.en.manual.normal.srt');
  assert.equal(fileName({ videoId: VID, lang: 'en', kind: 'asr', mode: 'long' }), 'iG9CE55wbtY.en.asr.long.srt');
  assert.equal(fileName({ videoId: VID, lang: 'en-GB', kind: 'asr', mode: 'normal' }), 'iG9CE55wbtY.en-GB.asr.normal.srt');
  assert.equal(fileName({ videoId: VID, lang: 'en_US', kind: 'manual', mode: 'normal' }), 'iG9CE55wbtY.en-US.manual.normal.srt', 'الشرطة السفلية تُوحَّد');
  assert.equal(fileName({ videoId: VID, lang: 'ar' }), 'iG9CE55wbtY.ar.srt');
  assert.equal(fileName({ videoId: VID, lang: 'ar', variant: 'original' }), 'iG9CE55wbtY.ar.original.srt');
});

test('fileName: أجزاء بعرض ثابت للترتيب', () => {
  const part = (index, total) => fileName({ videoId: VID, lang: 'en', kind: 'manual', mode: 'normal', part: { index, total } });
  assert.equal(part(2, 5), 'iG9CE55wbtY.en.manual.normal.part02of05.srt');
  assert.equal(part(12, 120), 'iG9CE55wbtY.en.manual.normal.part012of120.srt');
  const names = [1, 2, 10].map((i) => part(i, 12));
  assert.deepEqual([...names].sort(), names, 'الترتيب الأبجدي هو ترتيب الأجزاء');
});

test('fileName: مدخلات خاطئة ترمي رمزًا لا نصًا حرًا، والاسم لا يحمل ما يخرج عن المجلد', () => {
  const bad = [
    [{ videoId: 'short', lang: 'en', kind: 'asr', mode: 'normal' }, 'TJ_BAD_VIDEO_ID'],
    [{ videoId: '../../etc/pw', lang: 'en', kind: 'asr', mode: 'normal' }, 'TJ_BAD_VIDEO_ID'],
    [{ videoId: VID, lang: 'en/../x', kind: 'asr', mode: 'normal' }, 'MD_INVALID'],
    [{ videoId: VID, lang: 'ja', via: '../x', kind: 'asr', mode: 'normal' }, 'MD_INVALID'],
    [{ videoId: VID, lang: '../x', translation: true }, 'MD_INVALID'],
    [{ videoId: VID, lang: 'en', kind: 'other', mode: 'normal' }, 'MD_INVALID'],
    [{ videoId: VID, lang: 'en', kind: 'asr', mode: 'huge' }, 'MD_INVALID'],
    [{ videoId: VID, lang: 'en', kind: 'asr' }, 'MD_INVALID'],
    [{ videoId: VID, lang: 'ar', variant: 'x' }, 'MD_INVALID'],
    [{ videoId: VID, lang: 'en', kind: 'asr', mode: 'normal', part: { index: 3, total: 2 } }, 'MD_INVALID'],
    [{ videoId: VID, lang: 'en', kind: 'asr', mode: 'normal', part: { index: 1, total: 1 } }, 'MD_INVALID'],
  ];
  for (const [spec, code] of bad) assert.throws(() => fileName(spec), (e) => e instanceof TjError && e.code === code, JSON.stringify(spec));
  assert.match(fileName({ videoId: 'a-_B1234567', lang: 'en', kind: 'asr', mode: 'normal' }), /^[A-Za-z0-9_.-]+$/);
});

test('fileName بأي لغة (AA1): المسار بلغته، والمترجم آليًا بلغة أصله، والترجمة بلغتها أو «translation»', () => {
  assert.equal(fileName({ videoId: VID, lang: 'de', kind: 'asr', mode: 'normal' }), `${VID}.de.asr.normal.srt`);
  assert.equal(fileName({ videoId: VID, lang: 'zh_Hant', kind: 'manual', mode: 'long' }), `${VID}.zh-Hant.manual.long.srt`);
  assert.equal(fileName({ videoId: VID, lang: 'ar', via: 'en', kind: 'asr', mode: 'normal' }), `${VID}.ar.from-en.asr.normal.srt`);
  assert.equal(fileName({ videoId: VID, lang: 'ja', translation: true }), `${VID}.ja.srt`);
  assert.equal(fileName({ videoId: VID, lang: 'fr', translation: true, variant: 'original' }), `${VID}.fr.original.srt`);
  assert.equal(fileName({ videoId: VID, lang: null, translation: true }), `${VID}.translation.srt`);
  assert.equal(fileName({ videoId: VID, lang: 'ar' }), `${VID}.ar.srt`, 'صيغة ما قبل 2.0.0');
  assert.equal(translationLang({ lang: 'ko', fileName: 'x.ja.srt' }), 'ko');
  assert.equal(translationLang({ fileName: 'talk.ja.srt' }), 'ja', 'من رمز صريح في اسم الملف');
  assert.equal(translationLang({ lang: null, fileName: 'talk.srt' }), null);
  // رمز الاسم بنص الترجمة (ع-٨): ترجمة عربية اسمها let.it.be.srt ليست بيلاروسية.
  const arabicText = [{ n: 1, startMs: 0, endMs: 1000, text: 'مرحبًا بكم' }];
  assert.equal(translationLang({ fileName: 'let.it.be.srt', original: arabicText, current: null }), null);
  assert.equal(translationLang({ fileName: 'talk.ar.srt', original: arabicText, current: null }), 'ar');
});

test('fnv1a64: متجهات الاختبار المرجعية', () => {
  assert.equal(fnv1a64(''), 'cbf29ce484222325');
  assert.equal(fnv1a64('a'), 'af63dc4c8601ec8c');
  assert.equal(fnv1a64('foobar'), '85944171f73967e8');
  assert.equal(fnv1a64('ترجمان').length, 16);
});

test('textHash: موسومة، ولا تغيّرها إعادة لفّ الأسطر، وتتغير بتغيّر الكلمات', () => {
  const a = [{ text: 'one two\nthree' }, { text: 'four' }];
  const rewrapped = [{ text: 'one two three' }, { text: 'four' }];
  assert.match(textHash(a), /^fnv1a64:[0-9a-f]{16}$/);
  assert.equal(textHash(a), textHash(rewrapped));
  assert.notEqual(textHash(a), textHash([{ text: 'one two three four' }]), 'حدود المقاطع تدخل في البصمة');
  assert.notEqual(textHash(a), textHash([{ text: 'one two\nthree' }, { text: 'five' }]));
  assert.equal(textHash([{ text: 'é' }]), textHash([{ text: 'é' }]), 'NFC');
});

test('planParts: ترقيم مستمر يغطي 1..count وتوزيع متوازن', () => {
  assert.equal(planParts(200, 200), null);
  assert.equal(planParts(5, 10), null);
  assert.deepEqual(planParts(401, 200), [{ index: 1, from: 1, to: 134 }, { index: 2, from: 135, to: 268 }, { index: 3, from: 269, to: 401 }]);
  assert.deepEqual(planParts(10, 4), [{ index: 1, from: 1, to: 4 }, { index: 2, from: 5, to: 7 }, { index: 3, from: 8, to: 10 }]);
  for (const [count, size] of [[427, 200], [1056, 200], [1056, 50], [51, 50], [2000, 2000], [3, 1], [1000, 7]]) {
    const parts = planParts(count, size);
    if (!parts) {
      assert.ok(count <= size);
      continue;
    }
    assert.equal(parts[0].from, 1);
    assert.equal(parts.at(-1).to, count);
    parts.forEach((p, i) => {
      assert.equal(p.index, i + 1);
      assert.ok(p.to - p.from + 1 <= size, `${count}/${size}: ${JSON.stringify(p)}`);
      assert.ok(p.to - p.from + 1 >= Math.floor(count / parts.length));
      if (i) assert.equal(p.from, parts[i - 1].to + 1, 'دون فجوة ولا تداخل');
    });
  }
  assert.throws(() => planParts(0, 10), RangeError);
  assert.throws(() => planParts(10, 0), RangeError);
  assert.throws(() => planParts(10, 2.5), RangeError);
});

test('describeTrack: «English – يدوي، 412 مقطعًا» وأسماء اللهجات', () => {
  const t = (over) => ({ lang: 'en', kind: 'manual', ok: true, cueCount: 412, ...over });
  assert.equal(describeTrack(t()), 'English – يدوي، 412 مقطعًا');
  assert.equal(describeTrack(t({ kind: 'asr', cueCount: 1056 })), 'English – تلقائي، 1056 مقطعًا');
  assert.equal(describeTrack(t({ lang: 'en-GB', cueCount: 3 })), 'English (GB) – يدوي، 3 مقاطع');
  assert.equal(describeTrack(t({ cueCount: 1 })), 'English – يدوي، مقطع واحد');
  assert.equal(describeTrack(t({ cueCount: 2 })), 'English – يدوي، مقطعان');
  assert.equal(describeTrack(t({ ok: false, cueCount: 0 })), 'English – يدوي، غير صالح للتصدير');
  assert.equal(languageLabel('en_US'), 'English (US)');
  assert.equal(languageLabel('en-Latn-US'), 'English (LATN-US)');
  assert.equal(trackLabel({ lang: 'en', kind: 'asr' }), 'English – تلقائي');
});
