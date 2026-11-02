// البحث والاستبدال في المحرّر (P14-AC2، R51): المقتطف حول المطابقة، والاستبدال المختار خطوة واحدة بلا تغيير توقيت ولا
// مرجع، والأداء على ملف من 2400 مقطع (البحث والاستبدال والتراجع ضمن ميزانية إطار تفاعلي).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createEditSession, englishReference, searchCues } from '../../../../src/core/edit/index.js';
import { snippet } from '../../../../src/pages/editor/search.js';
import { arabicTwin, longTrack } from '../../../fixtures/v2/index.js';

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

test('على 2400 مقطع: البحث في العربية والإنجليزية، والاستبدال المختار خطوة واحدة، والتراجع، كلها سريعة', () => {
  const en = longTrack(2400);
  const ar = arabicTwin(en);
  const s = createEditSession({ cues: ar });
  const refs = englishReference(ar, en, null);
  const cues = () => Array.from({ length: s.count }, (_, i) => s.cueAt(i));
  let t = performance.now();
  const matches = searchCues(cues(), 'القرية');
  const searchMs = performance.now() - t;
  assert.ok(matches.length > 100, `نتائج ${matches.length}`);
  t = performance.now();
  const enMatches = searchCues(cues(), 'village', { field: 'en', english: refs });
  const enMs = performance.now() - t;
  assert.ok(enMatches.length > 0);
  const before = s.snapshot();
  t = performance.now();
  const only = matches.map((_, k) => k).filter((k) => k % 2 === 0);
  const r = s.replaceMatches(matches, 'البلدة', { only });
  const replaceMs = performance.now() - t;
  assert.equal(r.ok, true);
  assert.equal(s.historySize, 1, 'خطوة واحدة');
  assert.deepEqual(s.snapshot().map((c) => [c.n, c.startMs, c.endMs]), before.map((c) => [c.n, c.startMs, c.endMs]), 'التوقيت والأرقام كما هي');
  assert.equal(searchCues(cues(), 'البلدة').length, only.length);
  t = performance.now();
  s.undo();
  const undoMs = performance.now() - t;
  assert.deepEqual(s.snapshot(), before);
  for (const [name, ms] of [['البحث', searchMs], ['البحث في الإنجليزية', enMs], ['الاستبدال', replaceMs], ['التراجع', undoMs]]) {
    assert.ok(ms < 60, `${name} ${ms.toFixed(1)}ms`);
  }
});
