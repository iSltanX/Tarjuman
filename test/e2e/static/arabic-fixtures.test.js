// العيّنتان العربيتان الحقيقيتان (test/e2e/fixtures/، بإذن سلطان في P9): ترجمة نموذج خارجي لملفي SRT اللذين صدّرتهما
// الإضافة من عيّنتي P1 الحقيقيتين، باتباع الملحق أ. تمران في استيراد الإضافة ومقارِنها كما يرفعهما المستخدم، فتُقارنان
// ببصمة التصدير نفسه «مطابق للأصل»؛ ولا رابط ولا رمز فيهما. أساس لاختبارات الإصدار الثاني.
//   node scripts/run-tests.mjs test/e2e/static
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createExtractor } from '../../../src/extract/index.js';
import { buildExport } from '../../../src/core/export/index.js';
import { readImport } from '../../../src/core/import/index.js';
import { parseSrtStrict } from '../../../src/core/srt/parser.js';
import { findSecrets } from '../../../src/core/diagnostics/sanitize.js';

const ROOT = new URL('../../../', import.meta.url);
const CASES = [
  { id: 'iG9CE55wbtY', kind: 'manual', mode: 'normal', fixture: 'manual-ted-iG9CE55wbtY.json', durationMs: 1203421, cues: 427, ar: 'iG9CE55wbtY.en.manual.normal.ar.srt' },
  { id: 'Y9rkKtK1b44', kind: 'asr', mode: 'long', fixture: 'asr-nwc-Y9rkKtK1b44.json', durationMs: 3600000, cues: 729, ar: 'Y9rkKtK1b44.en.asr.long.ar.srt' },
];

async function exported(c) {
  const body = await readFile(new URL(`test/fixtures/json3/${c.fixture}`, ROOT), 'utf8');
  const ex = createExtractor({ currentVideoId: () => c.id, durationMs: () => c.durationMs, isLive: () => false });
  ex.handleMessage({ source: 'tarjuman', v: 1, kind: 'timedtext', videoId: c.id, lang: 'en', trackKind: c.kind, kindParam: c.kind === 'asr' ? 'asr' : null, capsAsr: true, hasTlang: false, format: 'json3', hasPot: true, transport: 'xhr', status: 200, bodyLength: body.length, body, truncated: false });
  const conv = ex.convert(`en|${c.kind}`, { mode: c.mode });
  return buildExport({ videoId: c.id, title: null, track: { key: `en|${c.kind}`, lang: 'en', kind: c.kind, cues: conv.cues, warnings: conv.warnings }, mode: c.mode, now: Date.parse('2026-11-02T00:00:00.000Z') });
}

for (const c of CASES) {
  test(`${c.ar}: بنية الأصل حرفيًا، وكل مقطع عربي، ولا رابط ولا رمز`, async () => {
    const text = await readFile(new URL(`test/e2e/fixtures/${c.ar}`, ROOT), 'utf8');
    const ar = parseSrtStrict(text);
    const en = parseSrtStrict((await exported(c)).files[0].text);
    assert.equal(ar.length, c.cues);
    assert.deepEqual(ar.map((x) => [x.n, x.startMs, x.endMs]), en.map((x) => [x.n, x.startMs, x.endMs]));
    assert.deepEqual(ar.filter((x) => !/\p{Script=Arabic}/u.test(x.text)).map((x) => x.n), []);
    assert.deepEqual(findSecrets(text), []);
    assert.equal(text.charCodeAt(0) === 0xfeff, false, 'بلا BOM');
  });

  test(`${c.ar}: الاستيراد كما يرفعه المستخدم يطابق بصمة التصدير نفسه`, async () => {
    const built = await exported(c);
    const file = new File([await readFile(new URL(`test/e2e/fixtures/${c.ar}`, ROOT))], c.ar, { type: 'application/x-subrip' });
    const r = await readImport(file, { fingerprints: [built.fingerprint] });
    assert.equal(r.ok, true, r.error?.message);
    assert.equal(r.cues.length, c.cues);
    assert.equal(r.comparison.matched, true);
    assert.deepEqual([r.comparison.missing, r.comparison.extra, r.comparison.drift, r.comparison.empty, r.comparison.noArabic], [[], [], [], [], []]);
  });
}
