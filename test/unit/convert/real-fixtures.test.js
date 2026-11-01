// اختبارات المحوّل والثوابت على عينات json3 حقيقية ملتقطة حيًا في P1 (test/fixtures/json3/index.json).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { convertTrack } from '../../../src/core/convert/index.js';
import { checkInvariants } from '../../../src/core/convert/invariants.js';
import { splitWords } from '../../../src/core/convert/text.js';
import { findSecrets } from '../../../src/core/diagnostics/sanitize.js';
import { parseSrtStrict } from '../../../src/core/srt/parser.js';

const DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../fixtures/json3');
const index = JSON.parse(readFileSync(path.join(DIR, 'index.json'), 'utf8'));
const load = (f) => readFileSync(path.join(DIR, f.file), 'utf8');

test('الفهرس يغطي اليدوي والتلقائي على الأقل', () => {
  const kinds = new Set(index.fixtures.map((f) => f.trackKind));
  assert.ok(kinds.has('manual') && kinds.has('asr'), [...kinds].join(','));
});

for (const f of index.fixtures) {
  test(`عينة حقيقية ${f.file}: تحويل ناجح والثوابت الستة`, () => {
    const body = load(f);
    assert.deepEqual(findSecrets(body), [], 'العينة منقّاة');
    const r = convertTrack({ body, trackKind: f.trackKind, durationMs: f.durationMs });
    assert.equal(r.ok, true, `${r.code}: ${JSON.stringify(r.invariants?.results.filter((x) => !x.ok))}`);
    assert.equal(r.report.inferredKind, f.trackKind);
    assert.ok(r.invariants.results.length === 6 && r.invariants.results.every((x) => x.ok));
    assert.equal(r.cues.length, f.expected.cues);
    assert.equal(r.report.sourceWords, f.expected.words);
    assert.equal(r.report.duplicatesRemoved, f.expected.duplicatesRemoved);
    assert.equal(parseSrtStrict(r.srt).length, r.cues.length);
    assert.ok(r.report.completeness >= 0.85, `اكتمال ${r.report.completeness}`);
  });

  test(`عينة حقيقية ${f.file}: العبث بالمخرجات يُكشف`, () => {
    const r = convertTrack({ body: load(f), trackKind: f.trackKind, durationMs: f.durationMs });
    const words = r.cues.flatMap((c) => splitWords(c.text));
    const mid = Math.floor(r.cues.length / 2);
    const dropWord = r.cues.map((c, i) => (i === mid ? { ...c, text: `${c.text} extra` } : c));
    assert.equal(checkInvariants({ sourceWords: words, cues: dropWord, durationMs: f.durationMs }).results[0].ok, false);
    const overlap = r.cues.map((c, i) => (i === mid ? { ...c, endMs: r.cues[mid + 1].startMs + 1 } : c));
    assert.equal(checkInvariants({ sourceWords: words, cues: overlap, durationMs: f.durationMs }).results[1].ok, false);
  });
}
