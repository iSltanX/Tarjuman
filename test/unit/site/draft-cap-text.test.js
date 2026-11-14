// تحقق 2.3.0، ص-٧: سقف المسودات خمسة فيديوهات لا خمس مسودات. DRAFT_LIMITS.drafts يحصي مفاتيح draft:<id> (لكل فيديو مفتاح بثلاث
// خانات)، وcapDrafts في writer.js يحذف مسودات أقدم فيديو كلها حين ينشئ فيديو سادس مسودة، فقد تبقى خمس عشرة مسودة (يثبّته
// test/unit/store/single-writer.test.js: «خانة ثانية لفيديو له مسودة لا تطرد شيئًا»). وكان نص الخصوصية باللغتين ودليل المستخدم
// يقولان «لا تبقى أكثر من خمس مسودات» و"no more than five drafts".
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DRAFT_LIMITS } from '../../../src/core/model/draft.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const read = (rel) => readFileSync(path.join(ROOT, rel), 'utf8');
const AR = 'وتُحفظ المسودات لخمسة فيديوهات على الأكثر، فإن جاء سادس حُذفت مسودات أقدمها.';
const EN = 'Drafts are kept for at most five videos; a sixth removes the oldest video’s drafts.';
/** بند المسودة في كل نص: الملف، وبداية سطره، والجملة الصحيحة. */
const TEXTS = [
  ['docs/site/privacy.md', '- **مسودة تعديلات لم تحفظها:**', AR],
  ['PRIVACY.md', '- **مسودة تعديلات لم تحفظها:**', AR],
  ['docs/site/privacy.en.md', '- **A draft of edits you haven’t saved:**', EN],
  ['docs/user-guide.md', '- **مسودة ما لم تحفظه:**', AR],
];

test('ص-٧: نص الخصوصية باللغتين ودليل المستخدم يقولان السقف بعدد الفيديوهات كما تفعله الشيفرة، لا بعدد المسودات', () => {
  assert.equal(DRAFT_LIMITS.drafts, 5, 'النصوص تقول «خمسة فيديوهات»: غيّرها مع السقف');
  for (const [rel, start, sentence] of TEXTS) {
    const lines = read(rel).split('\n').filter((l) => l.startsWith(start));
    assert.equal(lines.length, 1, `${rel}: بند المسودة`);
    assert.ok(lines[0].includes(sentence), `${rel}: ${sentence}`);
    assert.doesNotMatch(lines[0], /خمس مسودات|أكثر من خمس[،.]|five drafts|no more than five/, rel);
  }
  // وصف الأدلة في privacy.md بالسقف نفسه، ومعه اختبار السقف.
  const row = read('docs/site/privacy.md').split('\n').find((l) => l.startsWith('| ما يُحفظ | مسودة ما لم يُحفظ'));
  assert.ok(row.includes('ولخمسة فيديوهات على الأكثر') && !row.includes('وخمس على الأكثر'), row);
  assert.ok(row.includes('`test/unit/store/single-writer.test.js` (السقف'), row);
});
