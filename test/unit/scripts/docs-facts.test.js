// ح2 (2026-11-10): مصدر واحد للمقاطع المكررة. تغيير رابط متجر في docs/facts.json يغيّره في كل المواضع المولَّدة بأمر واحد، والفحص
// يفشل إن عُدّل موضع بيد أو خالف نصٌّ غير مولَّد (docs/site وstore) الحقائق، أو اختلفت بنية النسختين.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { ROOT, applyBlocks, driftedBlocks, headingLevels, matchProblems, runFacts, structureProblems } from '../../../scripts/docs/facts.mjs';

const facts = JSON.parse(readFileSync(path.join(ROOT, 'docs/facts.json'), 'utf8'));

/** نسخة مؤقتة بما يقرؤه الفحص وحده. */
function copyRepo() {
  const dir = mkdtempSync(path.join(tmpdir(), 'tj-facts-'));
  for (const p of ['README.md', 'README.en.md', 'docs/user-guide.md', 'docs/facts.json', 'docs/site', 'store/listing.ar.md', 'store/listing.en.md', 'store/README.md', 'store/submission.md', 'store/reviewers.en.md', 'CHANGELOG.md', 'docs/product-spec.md', 'src/manifest.json', 'scripts/targets.mjs']) {
    cpSync(path.join(ROOT, p), path.join(dir, p), { recursive: true });
  }
  return dir;
}

test('المستودع نفسه ناجح: المقاطع المولَّدة مطابقة، ونصوص الموقع والمتاجر توافق الحقائق، والبنية متقابلة', () => {
  assert.deepEqual(runFacts().problems, []);
});

test('القبول: تغيير رابط Chrome في الحقائق يغيّره في المواضع المولَّدة كلها بأمر واحد، ثم يفشل الفحص على نصوص الموقع والمتاجر غير المولَّدة', () => {
  const dir = copyRepo();
  try {
    const f = JSON.parse(readFileSync(path.join(dir, 'docs/facts.json'), 'utf8'));
    const NEW = 'https://chromewebstore.google.com/detail/zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz';
    f.stores.chrome = NEW;
    writeFileSync(path.join(dir, 'docs/facts.json'), JSON.stringify(f));
    const { written, problems } = runFacts({ root: dir, write: true });
    assert.deepEqual(written.sort(), ['README.en.md', 'README.md', 'docs/user-guide.md']);
    for (const file of written) {
      const text = readFileSync(path.join(dir, file), 'utf8');
      assert.ok(text.includes(NEW), file);
      assert.ok(!text.includes(facts.stores.chrome), `لا يبقى الرابط القديم في ${file}`);
    }
    assert.ok(problems.some((p) => p.startsWith('docs/site/help.md:') && p.includes('رابط chrome')), 'نص الموقع يخالف الحقائق الجديدة فيُقال');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('تعديل موضع مولَّد بيد يُفشل الفحص ويسمّي المقطع', () => {
  const dir = copyRepo();
  try {
    const file = path.join(dir, 'README.md');
    writeFileSync(file, readFileSync(file, 'utf8').replace('(130 فأحدث)', '(120 فأحدث)'));
    const { problems } = runFacts({ root: dir });
    assert.ok(problems.some((p) => p.startsWith('README.md: مقاطع مولَّدة عُدّلت بيد') && p.includes('install')), problems.join('\n'));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('applyBlocks وdriftedBlocks: القالب يُولَّد بالمتغيرات، والمخالف يُسمّى', () => {
  const text = '# x\n<!-- tj:facts install-stores -->\nقديم\n<!-- /tj:facts install-stores -->\nبعده\n';
  assert.deepEqual(driftedBlocks(text, facts, 'ar'), ['install-stores']);
  const out = applyBlocks(text, facts, 'ar');
  assert.ok(out.includes(facts.stores.chrome) && out.includes(facts.stores.edge));
  assert.deepEqual(driftedBlocks(out, facts, 'ar'), []);
  assert.ok(out.endsWith('<!-- /tj:facts install-stores -->\nبعده\n'));
});

test('المطابقة بلا علامات: رابط ترجمان المخالف والحد الأدنى المخالف وبريد آخر تُقال، وروابط منتجات أخرى لا', () => {
  const ok = `| Chrome (130 فأحدث) | [Chrome Web Store](${facts.stores.chrome}) |\n| Firefox (144 or later) | — |`;
  assert.deepEqual(matchProblems([{ file: 'a.md', text: ok }], facts), []);
  const bad = '| Chrome (128 فأحدث) | [Chrome Web Store](https://chromewebstore.google.com/detail/abc) |\nراسلنا x@gmail.com\n- [Transcript for YouTube™](https://chromewebstore.google.com/detail/other)';
  const probs = matchProblems([{ file: 'b.md', text: bad }], facts);
  assert.equal(probs.length, 3, probs.join('\n'));
  assert.ok(probs.some((p) => p.includes('حد أدنى 128')));
  assert.ok(probs.some((p) => p.includes('رابط chrome')));
  assert.ok(probs.some((p) => p.includes('بريد')));
});

test('البنية: «جدول الأدلة» العربي لا يُحسب، و«prefix» للإدراج الإنجليزي، واختلاف الترتيب يُقال', () => {
  assert.deepEqual(headingLevels('# a\n## b\n```\n# لا\n```\n## جدول الأدلة (للمراجعة)\n### c', { dropEvidence: true }), [1, 2]);
  assert.deepEqual(structureProblems([{ ar: 'a', en: 'b', mode: 'exact', arText: '# a\n## b\n## جدول الأدلة', enText: '# a\n## b' }]), []);
  assert.deepEqual(structureProblems([{ ar: 'a', en: 'b', mode: 'prefix', arText: '# a\n## b\n## c', enText: '# a\n## b' }]), []);
  assert.equal(structureProblems([{ ar: 'a', en: 'b', mode: 'exact', arText: '# a\n## b\n### c', enText: '# a\n### c\n## b' }]).length, 1);
});
