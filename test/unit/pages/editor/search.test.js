// البحث والاستبدال في المحرّر (P14-AC2، R51): المقتطف حول المطابقة، والاستبدال المختار خطوة واحدة بلا تغيير توقيت ولا
// مرجع، والأداء على ملف من 2400 مقطع (البحث والاستبدال والتراجع خطية بحجم الملف، وبعيدة عن الانهيار).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createEditSession, englishReference, searchCues } from '../../../../src/core/edit/index.js';
import { snippet } from '../../../../src/pages/editor/search.js';
import { arabicTwin, longTrack } from '../../../fixtures/v2/index.js';
import { LINEAR_MAX_EXPONENT, growth } from '../../../helpers/growth.js';

test('المقتطف: ما قبل المطابقة وما بعدها بحد، وفواصل الأسطر مسافة', () => {
  const text = 'السطر الأول فيه كلمة\nوالثاني فيه الكلمة المطلوبة هنا ثم كلام كثير بعدها';
  const at = text.indexOf('المطلوبة');
  const s = snippet(text, at, at + 'المطلوبة'.length, 10);
  assert.equal(s.hit, 'المطلوبة');
  assert.ok(s.before.startsWith('…'));
  assert.ok(s.after.endsWith('…'));
  assert.ok(!s.before.includes('\n'));
  assert.deepEqual(snippet('قصير', 0, 4), { before: '', hit: 'قصير', after: '' });
});

/** ملف بحجم n: العربية وتوأمها الإنجليزي وجلسة تحرير ومرجعها. */
function fileOf(n) {
  const en = longTrack(n);
  const ar = arabicTwin(en);
  const s = createEditSession({ cues: ar });
  const cues = () => Array.from({ length: s.count }, (_, i) => s.cueAt(i));
  return { s, cues, refs: englishReference(ar, en, null) };
}

test('على 2400 مقطع: البحث في العربية والإنجليزية، والاستبدال المختار خطوة واحدة، والتراجع، كلها سريعة', () => {
  const { s, cues, refs } = fileOf(2400);
  const matches = searchCues(cues(), 'القرية');
  assert.ok(matches.length > 100, `نتائج ${matches.length}`);
  assert.ok(searchCues(cues(), 'village', { field: 'en', english: refs }).length > 0);
  const before = s.snapshot();
  const only = matches.map((_, k) => k).filter((k) => k % 2 === 0);
  const r = s.replaceMatches(matches, 'البلدة', { only });
  assert.equal(r.ok, true);
  assert.equal(s.historySize, 1, 'خطوة واحدة');
  assert.deepEqual(s.snapshot().map((c) => [c.n, c.startMs, c.endMs]), before.map((c) => [c.n, c.startMs, c.endMs]), 'التوقيت والأرقام كما هي');
  assert.equal(searchCues(cues(), 'البلدة').length, only.length);
  s.undo();
  assert.deepEqual(s.snapshot(), before);
  // بالنمو لا بزمن مطلق (تحقق الجولة الثانية §١١): كانت كل عملية دون 60ms بزمن الساعة فسقط البحث بـ65 و88ms تحت الحمل. والآن الأس
  // المقدّر بزمن المعالج بين 120 و2400 مقطع لكل عملية (test/helpers/growth.js)، والحد المطلق سخي (150ms) يكشف الانهيار وحده.
  const ops = {
    'البحث': (f) => () => searchCues(f.cues(), 'القرية'),
    'البحث في الإنجليزية': (f) => () => searchCues(f.cues(), 'village', { field: 'en', english: f.refs }),
    'الاستبدال': (f) => {
      const m = searchCues(f.cues(), 'القرية');
      return () => f.s.replaceMatches(m, 'البلدة', { only: m.map((_, k) => k).filter((k) => k % 2 === 0) });
    },
    'التراجع': (f) => {
      f.s.replaceMatches(searchCues(f.cues(), 'القرية'), 'البلدة');
      return () => f.s.undo();
    },
  };
  for (const [name, op] of Object.entries(ops)) {
    const g = growth({ small: 120, large: 2400, prepare: (n) => op(fileOf(n)) });
    assert.ok(g.exponent < LINEAR_MAX_EXPONENT, `${name}: ${g.note}`);
    assert.ok(g.large < 150, `${name}: ${g.note}`);
  }
});
