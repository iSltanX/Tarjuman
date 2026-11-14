// تصدير ملف الترجمة (الفكرة ١١، ح-50): SRT أو WebVTT، بالترجمة وحدها أو مع الأصل في سطر واحد تحت كل مقطع. المحاذاة بـoriginalLookup
// في الزمن المحفوظ (ما تراه في لوحة النص) ثم exportTiming على الترجمة (عقد التوقيت، القاعدة ٩)، والحالات: الدمج والشطر والفجوة،
// والإزاحة والزمن السالب، والتهريب و«-->»، والاسم ID.<lang>.dual-<src>.srt|vtt. وقراءة ffmpeg المستقلة بلا ffmpeg تخطٍّ يُبلّغه
// scripts/run-tests.mjs ويفشل في CI.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { buildArabicExport, buildSubtitleExport, fileName } from '../../../src/core/export/index.js';
import { exportTiming } from '../../../src/core/model/timing.js';
import { langFromFileName } from '../../../src/core/lang/index.js';
import { readImport } from '../../../src/core/import/index.js';
import { parseSrtStrict } from '../../../src/core/srt/parser.js';
import { TjError } from '../../../src/core/errors/index.js';
import { fileOf } from '../../fixtures/srt/index.js';

const VIDEO = 'iG9CE55wbtY';
const cue = (n, startMs, endMs, text) => ({ n, startMs, endMs, text });
const tjCode = (fn) => {
  try {
    fn();
  } catch (e) {
    assert.ok(e instanceof TjError, `خطأ غير متوقع: ${e?.stack ?? e}`);
    return e;
  }
  return assert.fail('كان يجب أن يُرفض');
};
const hasFfmpeg = spawnSync('ffmpeg', ['-version'], { stdio: 'ignore' }).status === 0;
const blocks = (text) => parseSrtStrict(text).map((b) => b.text);
const EN = [cue(1, 1000, 3000, 'One'), cue(2, 3000, 5000, 'Two'), cue(3, 6000, 9000, 'Three\nis split'), cue(4, 12000, 14000, 'Four')];
const build = (o) => buildSubtitleExport({ videoId: VIDEO, lang: 'ar', original: EN, sourceLang: 'en', ...o });

test('الترجمة وحدها SRT: الملف نفسه بايتًا الذي يكتبه buildArabicExport بعد exportTiming، وبالاسم نفسه', () => {
  const ar = [cue(1, 1000, 3000, 'واحد'), cue(2, 3000, 5000, 'اثنان')];
  for (const offsetMs of [0, 500]) {
    const r = build({ cues: ar, offsetMs, timing: 'shown', format: 'srt', bilingual: false });
    const old = buildArabicExport({ videoId: VIDEO, cues: exportTiming(ar, offsetMs, 'shown').cues, lang: 'ar' });
    assert.equal(r.text, old.text);
    assert.equal(r.name, old.name);
    assert.deepEqual(r.notes, old.notes);
    assert.equal(r.timing, offsetMs ? 'shown' : 'saved');
    assert.equal(r.count, 2);
  }
});

test('الترجمة وحدها WebVTT: ID.<lang>.vtt وID.<lang>.original.vtt، والنص مهرّب، وما جُرّد من التحكم ملاحظة', () => {
  const RLO = String.fromCodePoint(0x202e);
  const r = build({ cues: [cue(1, 1000, 2000, `أ & ب <i>`), cue(2, 2000, 3000, `ج${RLO}د`)], format: 'vtt', bilingual: false });
  assert.equal(r.name, `${VIDEO}.ar.vtt`);
  assert.equal(r.text, 'WEBVTT\n\n1\n00:00:01.000 --> 00:00:02.000\nأ &amp; ب &lt;i&gt;\n\n2\n00:00:02.000 --> 00:00:03.000\nجد\n');
  assert.equal(r.notes.length, 1);
  assert.match(r.notes[0], /2/);
  assert.equal(build({ cues: [cue(1, 1000, 2000, 'أ')], format: 'vtt', bilingual: false, variant: 'original' }).name, `${VIDEO}.ar.original.vtt`);
});

test('مع الأصل: سطر واحد تحت كل مقطع بالتداخل الزمني (originalLookup)؛ الدمج يضمّ الأصلين، والشطر يكرر الأصل، والفجوة بلا سطر', () => {
  const ar = [
    cue(1, 1000, 5000, 'واحد واثنان'), // دمجت الترجمة مقطعين
    cue(2, 6000, 7500, 'ثلاثة'), // وشطرت الثالث
    cue(3, 7500, 9000, 'تُشطر'),
    cue(4, 9500, 11000, 'في الفجوة'), // لا أصل في زمنه
    cue(5, 12000, 14000, 'أربعة\nبسطرين'),
  ];
  const r = build({ cues: ar, format: 'srt', bilingual: true });
  assert.deepEqual(blocks(r.text), [
    'واحد واثنان\nOne Two',
    'ثلاثة\nThree is split',
    'تُشطر\nThree is split',
    'في الفجوة',
    'أربعة\nبسطرين\nFour',
  ]);
  assert.equal(r.name, `${VIDEO}.ar.dual-en.srt`);
  const v = build({ cues: ar, format: 'vtt', bilingual: true });
  assert.equal(v.name, `${VIDEO}.ar.dual-en.vtt`);
  assert.ok(v.text.includes('\n00:00:01.000 --> 00:00:05.000\nواحد واثنان\nOne Two\n'));
  assert.ok(v.text.includes('\n00:00:09.500 --> 00:00:11.000\nفي الفجوة\n\n'));
});

test('مع الأصل والإزاحة: المحاذاة في الزمن المحفوظ ثم الإزاحة على الملف كله (عقد التوقيت، القاعدة ٩)، و«المحفوظ» بلا إزاحة', () => {
  const ar = [cue(1, 1000, 3000, 'واحد'), cue(2, 3000, 5000, 'اثنان')];
  // +2 ث: لو حوذي بعد الإزاحة لصار تحت الأول «Two» (3000–5000)؛ والمحاذاة في المحفوظ تبقيه «One».
  const shown = build({ cues: ar, offsetMs: 2000, timing: 'shown', format: 'srt', bilingual: true });
  assert.equal(shown.timing, 'shown');
  assert.deepEqual(parseSrtStrict(shown.text).map(({ startMs, endMs, text }) => [startMs, endMs, text]), [[3000, 5000, 'واحد\nOne'], [5000, 7000, 'اثنان\nTwo']]);
  const saved = build({ cues: ar, offsetMs: 2000, timing: 'saved', format: 'vtt', bilingual: true });
  assert.equal(saved.timing, 'saved');
  assert.ok(saved.text.includes('\n00:00:01.000 --> 00:00:03.000\nواحد\nOne\n'));
});

test('الزمن السالب بالإزاحة يرفض التصدير بأرقام مقاطعه (MD_NEGATIVE_TIME) بالصيغتين، و«المحفوظ» متاح', () => {
  const ar = [cue(1, 1000, 3000, 'واحد'), cue(2, 3000, 5000, 'اثنان'), cue(3, 9000, 9500, 'ثلاثة')];
  for (const format of ['srt', 'vtt']) {
    const e = tjCode(() => build({ cues: ar, offsetMs: -4000, timing: 'shown', format, bilingual: true }));
    assert.equal(e.code, 'MD_NEGATIVE_TIME');
    assert.match(e.message, /1، 2/);
    assert.equal(build({ cues: ar, offsetMs: -4000, timing: 'saved', format, bilingual: true }).count, 3);
  }
});

test('سطر الأصل بقواعد قارئ SRT العام (markdown: false): «# …» والسياج نص، وسطر الزمن يُرفض برقم مقطعه؛ و«-->» فيه يُرفض في WebVTT برمز الأصل (EX_TRACK_BREAKS_VTT)', () => {
  const ar = [cue(1, 1000, 3000, 'واحد'), cue(2, 3000, 5000, 'اثنان')];
  const hash = [cue(1, 1000, 3000, '# of people'), cue(2, 3000, 5000, '```')];
  assert.deepEqual(blocks(build({ cues: ar, original: hash, format: 'srt', bilingual: true }).text), ['واحد\n# of people', 'اثنان\n```']);
  const timeLine = [cue(1, 1000, 3000, 'ok'), cue(2, 3000, 5000, '00:00:01,000 --> 00:00:02,000')];
  const e = tjCode(() => build({ cues: ar, original: timeLine, format: 'srt', bilingual: true }));
  assert.equal(e.code, 'EX_TRACK_BREAKS_SRT');
  assert.match(e.message, /\b2\b/);
  // «-->» في سطر الأصل رمزه غير رمز الترجمة (تحقق 2.3.0، ص-٢٣): الأصل من المسار المحفوظ لا يُعدَّل في المحرّر، فلا «عدّل نصها».
  const arrow = tjCode(() => build({ cues: ar, original: [cue(1, 1000, 3000, 'a --> b')], format: 'vtt', bilingual: true }));
  assert.equal(arrow.code, 'EX_TRACK_BREAKS_VTT');
  assert.match(arrow.message, /\b1\b/);
  assert.match(arrow.message, /^في نص الأصل \(المقاطع 1\)/);
  assert.match(arrow.message, /اختر «الترجمة وحدها»/);
  assert.doesNotMatch(arrow.message, /عدّل نصها/);
  // والسهم في الترجمة نفسها رمزها كما كان (يُعدَّل نصها)، ويُقدَّم على سطر الأصل.
  const own = tjCode(() => build({ cues: [cue(1, 1000, 3000, 'أ --> ب'), cue(2, 3000, 5000, 'اثنان')], original: [cue(1, 1000, 3000, 'a'), cue(2, 3000, 5000, 'b --> c')], format: 'vtt', bilingual: true }));
  assert.equal(own.code, 'EX_TEXT_BREAKS_VTT');
  assert.match(own.message, /عدّل نصها/);
  // و«-->» في سطر الأصل لا يمنع SRT (ليس سطر زمن كاملًا).
  assert.equal(build({ cues: ar, original: [cue(1, 1000, 3000, 'a --> b')], format: 'srt', bilingual: true }).count, 2);
  // والترجمة نفسها بقواعدها: العنوان في نص الترجمة يمنع SRT (يقرؤه الاستيراد حدًّا) ولا يمنع WebVTT.
  assert.equal(tjCode(() => build({ cues: [cue(1, 1000, 3000, '# عنوان')], format: 'srt', bilingual: true })).code, 'EX_TEXT_BREAKS_SRT');
  assert.equal(build({ cues: [cue(1, 1000, 3000, '# عنوان')], format: 'vtt', bilingual: false }).count, 1);
});

test('سطر الأصل منقّى: لا تحكم ولا تجاوز اتجاه، ولا تُحقن محارف العزل (ح-50)، والفارغ بعد التنقية لا سطر له', () => {
  const RLO = String.fromCodePoint(0x202e);
  const RLM = String.fromCodePoint(0x200f);
  const original = [cue(1, 1000, 3000, `Hi${RLO} there\u0007`), cue(2, 3000, 5000, RLM)];
  const r = build({ cues: [cue(1, 1000, 3000, 'مرحبًا'), cue(2, 3000, 5000, 'هناك')], original, format: 'srt', bilingual: true });
  assert.deepEqual(blocks(r.text), ['مرحبًا\nHi there', 'هناك']);
  assert.doesNotMatch(r.text, /[\u2066-\u2069\u202A-\u202E]/u);
});

test('الاسم ID.<lang>.dual-<src>: لا يُقرأ لغةً زائفة (ar-EN) عند الرفع، وبلا لغة «translation»، وبالنسخة المرفوعة', async () => {
  const one = [cue(1, 1000, 3000, 'واحد')];
  assert.equal(build({ cues: one, format: 'srt', bilingual: true, sourceLang: 'en-GB' }).name, `${VIDEO}.ar.dual-en-GB.srt`);
  assert.equal(build({ cues: one, format: 'vtt', bilingual: true, lang: null, sourceLang: 'ja' }).name, `${VIDEO}.translation.dual-ja.vtt`);
  assert.equal(build({ cues: one, format: 'srt', bilingual: true, variant: 'original' }).name, `${VIDEO}.ar.original.dual-en.srt`);
  assert.equal(fileName({ videoId: VIDEO, lang: 'ar', translation: true, format: 'vtt', dualOf: 'en' }), `${VIDEO}.ar.dual-en.vtt`);
  assert.throws(() => fileName({ videoId: VIDEO, lang: 'ar', translation: true, format: 'ass' }), (e) => e.code === 'MD_INVALID');
  assert.throws(() => fileName({ videoId: VIDEO, lang: 'ar', translation: true, dualOf: 'not a lang' }), (e) => e.code === 'MD_INVALID');
  // أسماء ترجمان نفسه تُقرأ لغتُها (لا ar-EN الزائفة ولا «غير محددة» بعد «أزل سطر الأصل»): .dual-<src> و.original قبل الامتداد.
  const name = `${VIDEO}.ar.dual-en.srt`;
  assert.equal(langFromFileName(name), 'ar');
  assert.equal(langFromFileName(`${VIDEO}.ar.dual-en-GB.srt`), 'ar');
  assert.equal(langFromFileName(`${VIDEO}.ar.original.srt`), 'ar');
  assert.equal(langFromFileName(`${VIDEO}.ja.original.dual-en.srt`), 'ja');
  assert.equal(langFromFileName(`${VIDEO}.translation.dual-ja.srt`), null, 'بلا لغة: لا تُقرأ ja لغةَ الترجمة');
  const r = build({ cues: one, format: 'srt', bilingual: true });
  const back = await readImport(fileOf(r.text, name));
  assert.equal(back.ok, true);
  assert.equal(back.lang, 'ar', 'لا ar-EN');
});

test('مع الأصل بلا أصل محفوظ يُرفض (EX_STUDY_NO_ENGLISH)، والصيغة غير المعروفة MD_INVALID، ولا .ass', () => {
  const one = [cue(1, 1000, 3000, 'واحد')];
  assert.equal(tjCode(() => build({ cues: one, format: 'srt', bilingual: true, original: [] })).code, 'EX_STUDY_NO_ENGLISH');
  assert.equal(tjCode(() => build({ cues: one, format: 'srt', bilingual: true, original: null })).code, 'EX_STUDY_NO_ENGLISH');
  assert.equal(tjCode(() => build({ cues: one, format: 'ass', bilingual: false })).code, 'MD_INVALID');
  assert.equal(tjCode(() => build({ cues: [], format: 'srt', bilingual: false })).code, 'ST_NO_RECORD');
  assert.equal(tjCode(() => buildSubtitleExport({ videoId: 'bad', cues: one })).code, 'TJ_BAD_VIDEO_ID');
});

test('قراءة ffmpeg المستقلة: الملف الثنائي بالصيغتين يُقرأ بعدد مقاطعه وسطر الأصل تحت الترجمة', { skip: !hasFfmpeg && 'ffmpeg غير مثبت' }, () => {
  const ar = [cue(1, 1000, 5000, 'واحد واثنان'), cue(2, 6000, 9000, 'ثلاثة'), cue(3, 9500, 11000, 'فجوة')];
  for (const format of ['srt', 'vtt']) {
    const dir = mkdtempSync(path.join(tmpdir(), 'tj-dual-'));
    try {
      writeFileSync(path.join(dir, `in.${format}`), build({ cues: ar, format, bilingual: true }).text);
      execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', path.join(dir, `in.${format}`), '-f', 'srt', path.join(dir, 'out.srt')]);
      const out = readFileSync(path.join(dir, 'out.srt'), 'utf8');
      assert.equal((out.match(/^\d{2}:\d{2}:\d{2},\d{3} --> \d{2}:\d{2}:\d{2},\d{3}\r?$/gm) ?? []).length, 3, format);
      assert.ok(/واحد واثنان\r?\nOne Two/.test(out), `${format}: ${out}`);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }
});
