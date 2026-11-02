// النص الدراسي وتقرير المراجعة (P11-AC5، R58): لا يغيّران حرفًا من الترجمة (المسافات وحدها)، وروابط التوقيت صحيحة، والنص
// الحرفي في Markdown لا يُفسَّر (وسم أو رابط أو تأكيد)، والثنائي يضم كل الإنجليزي مرة واحدة بترتيبه.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TjError } from '../../../src/core/errors/index.js';
import { buildReviewReport, buildStudyText } from '../../../src/core/export/index.js';
import { mdUnescape } from '../../../src/core/export/doc.js';
import { parseSrtLenient } from '../../../src/core/srt/lenient.js';
import { realTrack } from '../../helpers/fixtures.js';
import { REAL_ARABIC, realArabic } from '../../fixtures/v2/index.js';

const VIDEO = 'iG9CE55wbtY';
const AR = parseSrtLenient(realArabic(REAL_ARABIC.manual)).cues;
const EN = realTrack('manual').cues;
const squash = (s) => s.replace(/\s+/g, ' ').trim();
const LINK_MD = /^\[(\d{2}):(\d{2}):(\d{2})\]\(https:\/\/www\.youtube\.com\/watch\?v=iG9CE55wbtY&t=(\d+)s\) /;
const LINK_TXT = /^\[(\d{2}):(\d{2}):(\d{2})\] https:\/\/www\.youtube\.com\/watch\?v=iG9CE55wbtY&t=(\d+)s$/;

test('النص الدراسي (Markdown): فقرات بروابط صحيحة، ونص الترجمة كما هو حرفًا بحرف بعد فك التهريب', () => {
  const { name, text } = buildStudyText({ videoId: VIDEO, title: 'Do schools kill creativity?', cues: AR, format: 'md', bilingual: false });
  assert.equal(name, 'iG9CE55wbtY.ar.study.md');
  const lines = text.split('\n');
  assert.equal(lines[0], '# Do schools kill creativity?');
  assert.equal(lines[2], '[مشاهدة على يوتيوب](https://www.youtube.com/watch?v=iG9CE55wbtY)');
  const paras = lines.filter((l) => LINK_MD.test(l));
  assert.ok(paras.length > 30 && paras.length < 200, String(paras.length));
  const starts = new Set(AR.map((c) => Math.floor(c.startMs / 1000)));
  for (const p of paras) {
    const [, h, m, s, t] = LINK_MD.exec(p);
    assert.equal(Number(h) * 3600 + Number(m) * 60 + Number(s), Number(t), 'الزمن المعروض هو زمن الرابط');
    assert.ok(starts.has(Number(t)), 'الرابط عند بداية مقطع');
  }
  const body = paras.map((p) => mdUnescape(p.replace(LINK_MD, ''))).join(' ');
  assert.equal(squash(body), squash(AR.map((c) => c.text).join(' ')));
});

test('النص الدراسي (TXT) ثنائي اللغة: كل نص عربي وكل نص إنجليزي مرة واحدة بترتيبه، بلا تهريب', () => {
  const { name, text } = buildStudyText({ videoId: VIDEO, title: null, cues: AR, english: EN, format: 'txt', bilingual: true });
  assert.equal(name, 'iG9CE55wbtY.ar-en.study.txt');
  const lines = text.split('\n');
  assert.deepEqual(lines.slice(0, 2), ['غير متوفر', 'https://www.youtube.com/watch?v=iG9CE55wbtY']);
  const blocks = text.split('\n\n').slice(1).filter(Boolean).map((b) => b.split('\n'));
  for (const b of blocks) assert.match(b[0], LINK_TXT);
  assert.equal(squash(blocks.map((b) => b[1]).join(' ')), squash(AR.map((c) => c.text).join(' ')));
  assert.equal(squash(blocks.map((b) => b[2] ?? '').join(' ')), squash(EN.map((c) => c.text).join(' ')));
  assert.throws(() => buildStudyText({ videoId: VIDEO, cues: AR, format: 'txt', bilingual: true }), (e) => e instanceof TjError && e.code === 'EX_STUDY_NO_ENGLISH');
});

test('نص مُعادٍ في الترجمة: يبقى حرفيًا في Markdown ولا يصير وسمًا أو رابطًا أو تأكيدًا', () => {
  const cues = [
    { n: 1, startMs: 1000, endMs: 2000, text: '<script>alert(1)</script>' },
    { n: 2, startMs: 2100, endMs: 3000, text: '[اضغط](javascript:alert(1)) **غامق** _مائل_ `شيفرة` &lt; # عنوان' },
  ];
  const { text } = buildStudyText({ videoId: VIDEO, cues, format: 'md', bilingual: false });
  const line = text.split('\n').find((l) => LINK_MD.test(l)).replace(LINK_MD, '');
  assert.equal(line, '\\<script\\>alert(1)\\</script\\> \\[اضغط\\](javascript:alert(1)) \\*\\*غامق\\*\\* \\_مائل\\_ \\`شيفرة\\` \\&lt; \\# عنوان');
  assert.equal(mdUnescape(line), `${cues[0].text} ${cues[1].text}`);
});

test('مراجعة: الروابط التلقائية وعلامة القائمة في أول سطر الاقتباس وفواصل الأسطر غير \\n لا تُفسَّر، والنص يعود كما هو بفك التهريب', () => {
  const cr = String.fromCharCode(13);
  const cues = [{ n: 1, startMs: 1000, endMs: 2000, text: `زوروا www.evil.example وhttp://e.example${cr}- عنصر` }];
  const english = [{ n: 1, startMs: 1000, endMs: 2000, text: '- Hello' }, { n: 2, startMs: 1500, endMs: 1900, text: '1. world' }];
  const { text } = buildStudyText({ videoId: VIDEO, title: 'Talk www.x.example', cues, english, format: 'md', bilingual: true });
  const lines = text.split('\n');
  assert.equal(lines[0], '# Talk www\\.x.example');
  const ar = lines.find((l) => LINK_MD.test(l)).replace(LINK_MD, '');
  assert.equal(ar, 'زوروا www\\.evil.example وhttp\\://e.example \\- عنصر'.replace(' \\- ', ' - '));
  assert.equal(/www\.|https?:/.test(ar), false, 'لا رابط تلقائي');
  assert.equal(mdUnescape(ar), `زوروا www.evil.example وhttp://e.example - عنصر`);
  const quote = lines.find((l) => l.startsWith('> '));
  assert.equal(quote, '> \\- Hello 1. world');
  assert.equal(mdUnescape(quote.slice(2)), '- Hello 1. world');
});

test('تقرير المراجعة: البنود بترتيبها وروابطها وأسماء مشكلاتها وعلاماتها، والمقتطفات باختيار المستخدم حرفيًا', () => {
  const items = [
    { n: 12, startMs: 83_400, endMs: 85_000, problems: ['ED_OVERLAP', 'ED_READING_FAST'], mark: 'todo', text: 'سطر أول\nسطر *ثانٍ*', english: 'first line' },
    { n: 40, startMs: 3_725_000, endMs: 3_727_500, problems: [], mark: 'done', text: null, english: null },
    { n: 41, startMs: 3_728_000, endMs: 3_729_000, problems: ['XX_UNKNOWN', 'ED_GAP'], mark: null, text: 'نص', english: null },
  ];
  const md = buildReviewReport({ videoId: VIDEO, title: 'محاضرة', items, includeText: true, format: 'md' });
  assert.equal(md.name, 'iG9CE55wbtY.ar.review.md');
  const lines = md.text.split('\n');
  assert.equal(lines[0], '# تقرير مراجعة: محاضرة');
  assert.ok(lines.includes('البنود: 3 · أعود إليه: 1 · راجعته: 1'));
  assert.ok(lines.includes('## المقطع 12 · [00:01:23 → 00:01:25](https://www.youtube.com/watch?v=iG9CE55wbtY&t=83s)'));
  assert.ok(lines.includes('## المقطع 40 · [01:02:05 → 01:02:07](https://www.youtube.com/watch?v=iG9CE55wbtY&t=3725s)'));
  assert.ok(lines.includes('- المشكلات: تداخل مع التالي، قراءة سريعة'));
  assert.ok(lines.includes('- المشكلات: XX\\_UNKNOWN، فجوة كبيرة بعده'));
  assert.ok(lines.includes('- العلامة: أعود إليه') && lines.includes('- العلامة: راجعته'));
  assert.ok(lines.includes('- النص: سطر أول سطر \\*ثانٍ\\*'));
  assert.ok(lines.includes('- الإنجليزي: first line'));
  assert.ok(md.text.indexOf('المقطع 12') < md.text.indexOf('المقطع 40') && md.text.indexOf('المقطع 40') < md.text.indexOf('المقطع 41'));

  const txt = buildReviewReport({ videoId: VIDEO, title: 'محاضرة', items, includeText: false, format: 'txt' });
  assert.equal(txt.name, 'iG9CE55wbtY.ar.review.txt');
  assert.ok(txt.text.includes('المقطع 12 · 00:01:23 → 00:01:25 · https://www.youtube.com/watch?v=iG9CE55wbtY&t=83s'));
  assert.equal(/- النص:|- الإنجليزي:/.test(txt.text), false, 'بلا مقتطفات دون اختيارها');
  assert.ok(txt.text.includes('- المشكلات: لا شيء'));
});

test('مدخلات غير صالحة: صيغة مجهولة، ومعرّف غير صالح، وبند ناقص', () => {
  assert.throws(() => buildStudyText({ videoId: VIDEO, cues: AR, format: 'pdf', bilingual: false }), (e) => e.code === 'MD_INVALID');
  assert.throws(() => buildStudyText({ videoId: 'x', cues: AR, format: 'md', bilingual: false }), (e) => e.code === 'TJ_BAD_VIDEO_ID');
  assert.throws(() => buildStudyText({ videoId: VIDEO, cues: [], format: 'md', bilingual: false }), (e) => e.code === 'ST_NO_RECORD');
  assert.throws(() => buildReviewReport({ videoId: VIDEO, items: [{ n: 1 }], includeText: false, format: 'md' }), (e) => e.code === 'MD_INVALID');
});
