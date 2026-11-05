// تدقيق 7a66f91، المرحلة C5: التصدير وSRT. U78 (سطر نص يُقرأ رأسَ مقطع)، وU35 في الذهاب والإياب، وU79 (ملف الاستكمال لا يرمي)،
// وU80 (تعريف واحد للفراغ في التصدير العربي ولوحة المشكلات)، وU99 (محارف التحكم وما يتغير عند إعادة القراءة)، وU98 (لا رمي)،
// وU30 (النص الدراسي بمرجع زمني واحد)، وU31 (الأجزاء ≤ حد الرفع). كل اختبار سلوكي هنا فشل على الشيفرة السابقة للسبب
// المقصود، إلا ما وُسم «حارس». وقراءة ffmpeg المستقلة تُتخطى إن لم يكن ffmpeg مثبتًا.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  buildArabicExport, buildExport, buildPatchPackage, buildStudyText, studyTiming, textHash,
} from '../../../src/core/export/index.js';
import { findIssues } from '../../../src/core/edit/issues.js';
import { planArabicExport } from '../../../src/core/edit/export.js';
import { readImport } from '../../../src/core/import/index.js';
import { parseSrtLenient } from '../../../src/core/srt/lenient.js';
import { TjError, messageFor } from '../../../src/core/errors/index.js';
import { exportStudy } from '../../../src/pages/library/actions.js';
import { fileOf } from '../../fixtures/srt/index.js';
import { NOW, englishTrack, makeCues, realTrack, videoRecord } from '../../helpers/fixtures.js';

const VIDEO = 'iG9CE55wbtY';
const cue = (n, text, startMs = n * 3000, endMs = startMs + 2000) => ({ n, startMs, endMs, text });
const tjCode = (fn) => {
  try {
    fn();
  } catch (e) {
    assert.ok(e instanceof TjError, `خطأ غير متوقع: ${e?.stack ?? e}`);
    return e;
  }
  return assert.fail('كان يجب أن يُرفض');
};
const arabicExport = (cues) => buildArabicExport({ videoId: VIDEO, cues });
const reimport = async (text) => readImport(fileOf(text, `${VIDEO}.ar.srt`));
const ZWSP = String.fromCodePoint(0x200b);
const RLM = String.fromCodePoint(0x200f);
const WJ = String.fromCodePoint(0x2060);
const RLO = String.fromCodePoint(0x202e);
const PDF = String.fromCodePoint(0x202c);
const hasFfmpeg = spawnSync('ffmpeg', ['-version'], { stdio: 'ignore' }).status === 0;

/** عدد المقاطع كما يقرؤها ffmpeg (ترجمة SRT إلى SRT): سطور الزمن في ناتجه، لا قراءة ترجمان له. */
function ffmpegCount(text) {
  const dir = mkdtempSync(path.join(tmpdir(), 'tj-c5-'));
  try {
    writeFileSync(path.join(dir, 'in.srt'), text);
    execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', path.join(dir, 'in.srt'), '-f', 'srt', path.join(dir, 'out.srt')]);
    return (readFileSync(path.join(dir, 'out.srt'), 'utf8').match(/^\d{2}:\d{2}:\d{2},\d{3} --> \d{2}:\d{2}:\d{2},\d{3}\r?$/gm) ?? []).length;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// ---- U78: سطر نص يُقرأ رأسَ مقطع أو حدًّا له يمنع التصدير برقم مقطعه ----

test('U78: رقم ثم سطر زمن، وسطر زمن كامل، وسياج وعنوان في نص مقطع عربي: EX_TEXT_BREAKS_SRT برقم المقطع', () => {
  for (const body of ['أ\n12\n00:00:05,000 --> 00:00:06,000', 'أ\n00:00:05,000 --> 00:00:06,000', 'أ\n```', 'أ\n## عنوان', 'أ\n5\n1 --> 2']) {
    const e = tjCode(() => arabicExport([cue(1, 'تمهيد'), cue(2, body)]));
    assert.equal(e.code, 'EX_TEXT_BREAKS_SRT', body);
    assert.equal(e.params.list, '2', body);
  }
});

test('U78: لوحة المشكلات تعلنه قبل التصدير (ED_TEXT_BREAKS_SRT يمنع التصدير لا الحفظ)، وplanArabicExport يسمّي المقطع', () => {
  const cues = [cue(1, 'تمهيد'), cue(2, 'أ\n12\n00:00:05,000 --> 00:00:06,000'), cue(3, 'خاتمة')];
  const r = findIssues(cues);
  const issue = r.list.find((i) => i.code === 'ED_TEXT_BREAKS_SRT');
  assert.ok(issue, JSON.stringify(r.list.map((i) => i.code)));
  assert.deepEqual([issue.n, issue.tone, issue.blocksSave, issue.blocksExport, issue.field], [2, 'warning', false, true, 'text']);
  assert.deepEqual(planArabicExport({ videoId: VIDEO, cues, offsetMs: 0 }), { ok: false, code: 'ED_EXPORT_BLOCKED', list: [2] });
});

test('U78: الإنجليزي من json3 بسطر «12» ثم سطر زمن لا يُصدَّر ملفًا يُقرأ 428 مقطعًا: EX_TRACK_BREAKS_SRT', () => {
  const cues = realTrack('manual').cues.map((c, i) => (i === 9 ? { ...c, text: `${c.text}\n12\n00:00:01,000 --> 00:00:02,000` } : c));
  const e = tjCode(() => buildExport({ videoId: VIDEO, track: englishTrack({ cues }), mode: 'normal', now: NOW }));
  assert.equal(e.code, 'EX_TRACK_BREAKS_SRT');
  assert.equal(e.params.list, '10');
});

test('U35 وU78: «1 --> 2» و«10:30 --> 11:00» في نص مقطع تُصدَّر وتُستورد بالعدد والنص نفسيهما (عربيًا وإنجليزيًا)', async () => {
  const cues = [cue(1, 'تمهيد'), cue(2, 'السهم\n1 --> 2'), cue(3, 'الموعد\n10:30 --> 11:00'), cue(4, '١ --> ٢')];
  const file = arabicExport(cues);
  const back = await reimport(file.text);
  assert.equal(back.ok, true, JSON.stringify(back.error));
  assert.deepEqual(back.cues.map((c) => c.text), cues.map((c) => c.text));
  const en = realTrack('manual').cues.map((c, i) => (i === 3 ? { ...c, text: '1 --> 2 is the arrow' } : c));
  const built = buildExport({ videoId: VIDEO, track: englishTrack({ cues: en }), mode: 'normal', now: NOW });
  const enBack = await readImport(fileOf(built.files[0].text, 'x.en.srt'));
  assert.equal(enBack.ok, true, JSON.stringify(enBack.error));
  assert.equal(enBack.cues.length, en.length);
  assert.equal(enBack.cues[3].text, '1 --> 2 is the arrow');
});

test('U78 (ffmpeg): ما يصدّره ترجمان يقرؤه ffmpeg بالعدد نفسه، ومنه أسطر النص الشبيهة بالزمن', { skip: !hasFfmpeg && 'ffmpeg غير مثبت' }, () => {
  const cues = [cue(1, 'تمهيد'), cue(2, 'السهم\n1 --> 2'), cue(3, 'الموعد\n10:30 --> 11:00'), cue(4, 'خاتمة')];
  assert.equal(ffmpegCount(arabicExport(cues).text), cues.length);
  const en = buildExport({ videoId: VIDEO, track: englishTrack({ cues: realTrack('manual').cues }), mode: 'normal', now: NOW });
  assert.equal(ffmpegCount(en.files[0].text), 427, 'TED كما هو');
});

// ---- U80: تعريف واحد للفراغ في التصدير العربي ولوحة المشكلات، والإنجليزي كما هو ----

test('U80: مقطع عربي نصه محارف خفية وحدها (U+200B وU+200F وU+2060): ED_TEXT_EMPTY وEX_EMPTY_TEXT', () => {
  for (const text of [ZWSP, RLM, `${RLM}${WJ}`, WJ, ` ${ZWSP} `]) {
    const cues = [cue(1, 'تمهيد'), cue(2, text)];
    const issues = findIssues(cues).list.filter((i) => i.n === 2).map((i) => i.code);
    assert.deepEqual(issues, ['ED_TEXT_EMPTY'], JSON.stringify(text));
    assert.deepEqual(planArabicExport({ videoId: VIDEO, cues, offsetMs: 0 }), { ok: false, code: 'ED_EXPORT_BLOCKED', list: [2] });
    assert.equal(tjCode(() => arabicExport(cues)).code, 'EX_EMPTY_TEXT', JSON.stringify(text));
  }
});

test('U80 حارس: الإنجليزي بمقطع U+200B وحده يُصدَّر كما كان، ونص مرئي فيه ZWSP يُصدَّر عربيًا', () => {
  const en = makeCues(3, { text: (i) => (i === 2 ? ZWSP : `line ${i}`) });
  assert.equal(buildExport({ videoId: VIDEO, track: englishTrack({ cues: en }), mode: 'normal', now: NOW }).files.length, 1);
  assert.match(arabicExport([cue(1, `كلمة${ZWSP}أخرى`)]).text, /كلمة/);
});

// ---- U99: محارف التحكم تُجرَّد عند الكتابة، وما يتغير عند إعادة القراءة يُقال ----

test('U99: U+202E في نص المحرّر لا يُكتب في الملف، وملاحظة تذكر المقطع، وإعادة الاستيراد بلا ملاحظة تحكم', async () => {
  const file = arabicExport([cue(1, 'تمهيد'), cue(2, `a${RLO}bc${PDF} نص`)]);
  assert.equal(file.text.includes(RLO), false);
  assert.equal(file.text.includes(PDF), false);
  assert.deepEqual(file.notes, [messageFor('EX_NOTE_CONTROL_STRIPPED', { list: '2' })]);
  const back = await reimport(file.text);
  assert.equal(back.cues[1].text, 'abc نص');
  assert.deepEqual(back.notes, []);
});

test('U99: وسم تنسيق يُجرَّد عند إعادة الاستيراد: ملاحظة قبل التنزيل، ومسافات الأطراف تُقص بلا ملاحظة', async () => {
  const file = arabicExport([cue(1, '<i>مائل</i>'), cue(2, 'نص  '), cue(3, '  سطر\nثانٍ ')]);
  assert.deepEqual(file.notes, [messageFor('EX_NOTE_REREAD_CHANGES', { list: '1' })]);
  const back = await reimport(file.text);
  assert.deepEqual(back.cues.map((c) => c.text), ['مائل', 'نص', 'سطر\nثانٍ']);
  const plan = planArabicExport({ videoId: VIDEO, cues: [cue(1, '<i>مائل</i>')], offsetMs: 0 });
  assert.deepEqual(plan.notes, [messageFor('EX_NOTE_REREAD_CHANGES', { list: '1' })]);
  assert.deepEqual(planArabicExport({ videoId: VIDEO, cues: [cue(1, 'نظيف')], offsetMs: 0 }).notes, [], 'حارس: لا ملاحظة لنص نظيف');
});

// ---- U98: planArabicExport لا يرمي ----

test('U98: إزاحة غير صالحة (undefined وNaN و0.5) لا ترمي RangeError: { ok:false } برمز', () => {
  for (const offsetMs of [undefined, Number.NaN, 0.5, '100']) {
    const r = planArabicExport({ videoId: VIDEO, cues: [cue(1, 'نص')], offsetMs, choice: 'shown' });
    assert.deepEqual(r, { ok: false, code: 'MD_INVALID' }, String(offsetMs));
  }
});

// ---- U79: ملف الاستكمال لا يرمي، وبرمز يذكر المقطع ----

function patchSpec(enCues, numbers) {
  const track = englishTrack({ cues: enCues });
  const fingerprint = {
    id: 'fp_test000001', videoId: VIDEO, trackKey: track.key, mode: 'normal', count: enCues.length,
    cues: enCues.map((c, i) => ({ n: i + 1, startMs: c.startMs, endMs: c.endMs })),
    textHash: textHash(enCues.map((c, i) => ({ ...c, n: i + 1 }))), fileName: null, createdAt: NOW, parts: null,
  };
  return { videoId: VIDEO, fingerprint, englishTracks: [track], numbers };
}

test('U79: نص إنجليزي مختار فيه سطر زمن كامل أو رقم ثم زمن: { ok:false, code: EX_PATCH_SOURCE_UNWRITABLE } بالرقم، بلا رمي', () => {
  for (const extra of ['he said\n00:00:01,000 --> 00:00:02,000', 'line one\n12\n00:00:01,000 --> 00:00:02,000']) {
    const en = makeCues(12, { text: (i) => (i === 10 ? extra : `line ${i}`) });
    const r = buildPatchPackage(patchSpec(en, [3, 10, 11]));
    assert.deepEqual(r, { ok: false, code: 'EX_PATCH_SOURCE_UNWRITABLE', params: { list: '10' } }, extra);
    assert.match(messageFor(r.code, r.params), /10/);
  }
  const fine = buildPatchPackage(patchSpec(makeCues(12, { text: (i) => (i === 10 ? '1 --> 2 is the arrow' : `line ${i}`) }), [10]));
  assert.equal(fine.ok, true, 'U35: «1 --> 2» يُكتب ويُقرأ');
  assert.equal(parseSrtLenient(fine.file.text).cues[0].text, '1 --> 2 is the arrow');
});

// ---- U30: النص الدراسي بمرجع زمني واحد ----

/** فقرات الإنجليزي في النص الدراسي ثنائي اللغة بصيغة Markdown: سطور «> …» بترتيبها. */
const englishLines = (text) => text.split('\n').filter((l) => l.startsWith('> '));

test('U30: على أزمنة TED الحقيقية، الإنجليزي في فقراته نفسها عند الإزاحة ±1 و±2 ث كما عند الصفر', () => {
  const en = realTrack('manual').cues;
  const ar = en.map((c) => ({ ...c, text: `ترجمة ${c.n}.` }));
  const at = (offset) => {
    const t = studyTiming(ar, offset, en);
    return englishLines(buildStudyText({ videoId: VIDEO, cues: t.cues, english: t.english, format: 'md', bilingual: true }).text);
  };
  const zero = at(0);
  assert.ok(zero.length > 40);
  for (const offset of [1000, -1000, 2000, -2000, 5000]) assert.deepEqual(at(offset), zero, `الإزاحة ${offset}`);
});

test('U30: المحفوظات تزيح الإنجليزي مع العربي (exportStudy)', async () => {
  const record = videoRecord({ offset: 3000, cues: makeCues(40, { text: (i) => `ترجمة ${i}.`, gapMs: 300 }) });
  const store = { getVideo: async () => record };
  let saved = null;
  await exportStudy({ store, videoId: record.videoId, format: 'md', bilingual: true, save: async (f) => { saved = f; return { ok: true }; } });
  const zero = englishLines(buildStudyText({ videoId: record.videoId, cues: record.arabic.original, english: record.english[0].cues, format: 'md', bilingual: true }).text);
  assert.deepEqual(englishLines(saved.text), zero);
});

// ---- U31: الأجزاء ≤ حد الرفع ----

const enTrack = (count) => englishTrack({ cues: makeCues(count, { durMs: 900, gapMs: 100, text: (i) => `line ${i}.` }) });
const split = (count, size) => buildExport({ videoId: VIDEO, track: enTrack(count), mode: 'normal', split: { size, by: 'content' }, now: NOW });

test('U31: 2501 مقطعًا بحجم 50، و10001 بالحجم الافتراضي 200: الأجزاء ≤ 50 بتنبيه، وكلها تُرفع معًا', async () => {
  for (const [count, size] of [[2501, 50], [10001, 200]]) {
    const built = split(count, size);
    assert.ok(built.files.length <= 50, `${count}/${size}: ${built.files.length}`);
    assert.ok(built.warnings.includes('EX_SPLIT_SIZE_RAISED'), built.warnings.join());
    const arabic = built.files.map((f) => fileOf(f.text.replaceAll('line', 'سطر'), f.name.replace('.srt', '.ar.srt')));
    const r = await readImport(arabic);
    assert.equal(r.ok, true, JSON.stringify(r.error));
    assert.equal(r.cues.length, count);
  }
});

test('U31 حارس: 2500 بحجم 50 خمسون جزءًا بلا تنبيه، وما يكفيه الحجم كما هو', () => {
  const built = split(2500, 50);
  assert.equal(built.files.length, 50);
  assert.equal(built.warnings.includes('EX_SPLIT_SIZE_RAISED'), false);
  assert.equal(split(401, 200).files.length, 3);
});

// ---- ملاحظتا المراجعة المستقلة: الإنجليزي على ما يغيّر العدد وحده، والسهم في نص رقمي ----

test('مراجعة حارس: مسار إنجليزي فيه «# of people» وسياج ``` يُصدَّر كما كان (قارئه النموذج وffmpeg)، ويقرؤه ffmpeg بعدده', () => {
  const en = makeCues(4, { text: (i) => (i === 2 ? '# of people\nhere' : i === 3 ? '```' : `line ${i}`) });
  const built = buildExport({ videoId: VIDEO, track: englishTrack({ cues: en }), mode: 'normal', now: NOW });
  assert.equal(built.files[0].text.includes('# of people'), true);
  if (hasFfmpeg) assert.equal(ffmpegCount(built.files[0].text), 4);
});

test('مراجعة حارس: نص عربي «2020» ثم «10 -> 20» يُصدَّر ويُستورد كما هو', async () => {
  const file = arabicExport([cue(1, 'السنة\n2020\n10 -> 20'), cue(2, 'ب')]);
  const back = await reimport(file.text);
  assert.equal(back.ok, true, JSON.stringify(back.error));
  assert.equal(back.cues[0].text, 'السنة\n2020\n10 -> 20');
});
