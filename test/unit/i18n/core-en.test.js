// التوطين الإنجليزي لطبقة النواة: اكتمال رسائل الأخطاء بالقوالب نفسها وبلا حرف عربي، وعمل messageFor وTjError باللغتين،
// وما تولّده النواة من نصوص (وصف المسار، تقرير المراجعة، أسماء مجموعات النسخة الاحتياطية، فعل الدمج) بلا عربية في الإنجليزية.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DOMAINS, TjError, messageFor } from '../../../src/core/errors/index.js';
import { catalogOf, setLocale } from '../../../src/i18n/index.js';
import { describeTrack } from '../../../src/core/export/index.js';
import { buildReviewReport } from '../../../src/core/export/report.js';
import { studyTimingNote } from '../../../src/core/export/study.js';
import { shortList } from '../../../src/core/align/align.js';

const ARABIC = /[؀-ۿݐ-ݿﭐ-﷿ﹰ-﻿]/;
const slots = (s) => [...String(s).matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(',');
const codes = DOMAINS.flatMap((d) => Object.keys(d.MESSAGES));
const reset = (ctx) => ctx.after(() => setLocale('ar'));

// الرسالة العربية تأخذ معاملات مبنية على المطابقة النحوية في الصفحة (تصريف الفعل والضمير)؛ فقيمتها الإنجليزية دالة تكتفي بالعدد.
// وما يُجمع بالعدد الخام (ع-٢٧) دالة تختار المفرد للعدد 1، وتُفحص صيغتاه في count-forms.test.js.
const PLURAL_BY_COUNT = [
  'IM_HTML_LITERAL', 'IM_CUE_TIME_MORE', 'IM_NOTE_CHATTER_BEFORE', 'IM_NOTE_CHATTER_AFTER', 'IM_NOTE_AMBIGUOUS', 'IM_NOTE_MD_EMPHASIS', 'IM_NOTE_TIME_MARKS',
  'IM_NOTE_TAGS', 'IM_NOTE_CONTROL', 'IM_NOTE_HIDDEN_CHARS', 'IM_NOTE_TRIMMED', 'CMP_ALIGN_WEAK', 'CMP_ALIGN_NUMBER_ONLY', 'CMP_ALIGN_DRIFTING', 'CMP_ALIGN_SHIFTED',
  'CMP_ALIGN_ONLY_A', 'CMP_ALIGN_ONLY_B',
];
const FUNCTION_SAMPLES = {
  BK_RESTORE_CHANGED: { videos: '2 videos' }, ED_SAVE_HAS_ERRORS: { count: '3 timing errors' }, ED_EXPORT_HAS_ERRORS: { count: '3 timing errors' }, IM_STRAY_TEXT: { line: '7' },
  ...Object.fromEntries(PLURAL_BY_COUNT.map((code) => [code, { count: 2, list: '4, 5', first: 'Here is', seconds: '1.2', from: 4, to: 5 }])),
  PG_LANG_ASSIGN_PARTIAL: { n: '2' },
  // المعدود بصيغه والعدد خامًا (تحقق مستقل §١٠): was/were وits/their بالعدد، وتُفحص صيغتاه في r2v-texts.test.js.
  PG_LANG_ASSIGN_SKIPPED: { n: '2 translations', count: 2 },
  // الفكرة ٤ (الإنذار المبكر): تسمّي الصيغة المرفوضة إن عُرفت.
  EX_UNSUPPORTED_FORMAT: { format: 'srv3' },
  // الفكرة ١١ (ح-49): العدد خامًا والمعدود بالجمع بالعدد.
  IM_BILINGUAL: { count: 3, total: 4 },
  IM_NOTE_BILINGUAL_REMOVED: { count: 3 },
};

test('كل رمز خطأ له رسالة إنجليزية بالقوالب نفسها وبلا حرف عربي', () => {
  const ar = catalogOf('ar');
  const en = catalogOf('en');
  assert.ok(codes.length > 250);
  for (const code of codes) {
    const key = `errors.${code}`;
    assert.ok(en.has(key), `ينقص ${code}`);
    const value = en.get(key);
    if (Object.hasOwn(FUNCTION_SAMPLES, code)) {
      assert.equal(typeof value, 'function', code);
      const sample = FUNCTION_SAMPLES[code];
      const out = value(sample);
      assert.ok(!ARABIC.test(out) && out.includes(Object.values(sample)[0]), code);
      // IM_STRAY_TEXT بصيغتيه (ع-١٢ ب): heading تغيّر السبب لا الرمز.
      if (code === 'IM_STRAY_TEXT') assert.ok(!ARABIC.test(value({ ...sample, heading: true })) && value({ ...sample, heading: true }) !== out, code);
      continue;
    }
    const text = value;
    assert.equal(typeof text, 'string', code);
    assert.ok(text.trim().length > 0, code);
    assert.ok(!ARABIC.test(text), `حرف عربي في ${code}: ${text}`);
    assert.equal(slots(text), slots(ar.get(key)), `قوالب ${code}`);
  }
  const extra = [...en.keys()].filter((k) => k.startsWith('errors.') && !codes.includes(k.slice(7)));
  assert.deepEqual(extra, []);
});

test('عدد خام من حارس التحرير يُقرأ جملةً تامة بالإنجليزية', () => {
  const fix = catalogOf('en').get('errors.ED_SAVE_HAS_ERRORS');
  assert.equal(fix({ count: '3' }), 'Fix 3 timing errors first.');
  assert.equal(fix({ count: '1' }), 'Fix 1 timing error first.');
});

test('messageFor وTjError يتبعان لغة الواجهة', (ctx) => {
  reset(ctx);
  assert.match(messageFor('ST_WRITE_FAILED'), /تعذّر الحفظ/);
  assert.equal(new TjError('MD_NEGATIVE_TIME', { params: { list: '3, 4' } }).message.includes('3, 4'), true);
  setLocale('en');
  assert.equal(messageFor('ST_WRITE_FAILED'), 'Couldn’t save. Try again; if it keeps happening, copy the diagnostics report.');
  const err = new TjError('IM_BAD_NUMBER', { params: { line: 7, max: 9999 } });
  assert.equal(err.code, 'IM_BAD_NUMBER');
  assert.ok(err.message.startsWith('Line 7:') && err.message.includes('9999'));
  assert.equal(messageFor('NOT_A_CODE_{x}', { x: 1 }), 'NOT_A_CODE_1');
  setLocale('ar');
  assert.match(new TjError('IM_BAD_NUMBER', { params: { line: 7, max: 9 } }).message, /السطر 7/);
});

test('وصف المسار وتقرير المراجعة والقوائم بالإنجليزية بلا حرف عربي', (ctx) => {
  reset(ctx);
  setLocale('en');
  assert.equal(describeTrack({ lang: 'en', kind: 'manual', ok: true, cueCount: 412 }), 'English – manual, 412 segments');
  assert.equal(describeTrack({ lang: 'en', kind: 'asr', ok: true, cueCount: 1 }), 'English – auto-generated, 1 segment');
  assert.equal(describeTrack({ lang: 'en', kind: 'asr', ok: false, cueCount: 0 }), 'English – auto-generated, not exportable');
  assert.equal(shortList([1, 2, 3]), '1, 2, 3');
  assert.equal(studyTimingNote([1, 2]).includes('1, 2'), true);
  const items = [
    { n: 3, startMs: 1000, endMs: 2500, problems: ['ED_OVERLAP', 'ED_SHORT'], mark: 'todo', text: 'Hello', english: null },
    { n: 4, startMs: 3000, endMs: 4000, problems: [], mark: 'done', text: null, english: null },
  ];
  for (const format of ['txt', 'md']) {
    const { text } = buildReviewReport({ videoId: 'dQw4w9WgXcQ', title: 'My video', items, includeText: true, format });
    assert.ok(!ARABIC.test(text), text);
    assert.ok(text.includes('Review report: My video'));
    assert.ok(text.includes('Items: 2 · To revisit: 1 · Reviewed: 1'));
    assert.ok(text.includes('Issues: Overlaps the next, Very short'));
    assert.ok(text.includes('Mark: To revisit') && text.includes('Issues: None'));
  }
  setLocale('ar');
  assert.match(buildReviewReport({ videoId: 'dQw4w9WgXcQ', title: 'x', items, includeText: false, format: 'txt' }).text, /تقرير مراجعة: x/);
});
