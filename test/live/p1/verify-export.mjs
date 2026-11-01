#!/usr/bin/env node
// يتحقق من ملف «تصدير النتائج» القادم من جلسة يدوية غير مؤتمتة، ويكتب أدلته المنقّاة:
//   node test/live/p1/verify-export.mjs <ملف.json> --label <اسم> [--fixtures <مجلد مؤقت>]
// يفحص: الأسرار، وwebdriver، والالتقاط المقبول وطول جسمه، والثوابت الستة، وإعادة التحويل في Node
// مطابقة لما حوّلته الإضافة، والنص الذي عرضته يوتيوب على الشاشة مقابل SRT.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { findSecrets, sanitizeDeep } from '../../../src/core/diagnostics/sanitize.js';
import { convertTrack } from '../../../src/core/convert/index.js';
import { parseSrtStrict } from '../../../src/core/srt/parser.js';
import { judgePosition } from './positions.mjs';
import { sha256 } from '../harness/netlog.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const argv = process.argv.slice(2);
const file = argv[0];
const val = (k) => (argv.includes(`--${k}`) ? argv[argv.indexOf(`--${k}`) + 1] : null);
const label = val('label') || 'manual';
const fixturesDir = val('fixtures');

const raw = await readFile(file, 'utf8');
const secrets = findSecrets(raw);
const data = JSON.parse(raw);
const out = {
  label, exportedAt: data.exportedAt, browser: data.browser, secretsInExport: secrets.length, tabs: [],
};

for (const tab of data.tabs) {
  const s = tab.snap;
  const t = { currentVideoId: s.currentVideoId, durationMs: s.durationMs, navigations: s.navigations, webdriverPage: s.webdriver, accepted: [], rejected: s.rejected.map((r) => ({ code: r.code, detail: r.detail, videoId: r.videoId, currentVideoId: r.currentVideoId, lang: r.lang, trackKind: r.trackKind, hasTlang: r.hasTlang, format: r.format, status: r.status, bodyLength: r.bodyLength })) };
  for (const a of s.accepted) {
    const node = convertTrack({ body: a.body || '', trackKind: a.trackKind, durationMs: s.durationMs });
    const cues = a.srt ? parseSrtStrict(a.srt) : [];
    const shown = s.log.filter((e) => e.type === 'shown' && e.videoId === a.videoId && !e.ad);
    const shownChecks = shown.map((e) => ({ ...judgePosition(cues, a.trackKind, e.timeSec, e.text), timeSec: e.timeSec }));
    const entry = {
      videoId: a.videoId, acceptedFor: a.acceptedFor, lang: a.lang, trackKind: a.trackKind, format: a.format, transport: a.transport,
      bodyLength: a.bodyLength, bodySha256: a.body ? sha256(a.body) : null, meta: a.meta, ok: a.ok, code: a.code,
      invariants: a.invariants && a.invariants.map((r) => ({ id: r.id, key: r.key, ok: r.ok, detail: r.detail })),
      warnings: a.warnings.map((w) => w.code), report: a.report,
      nodeReconvertSame: node.srt === a.srt, nodeOk: node.ok,
      shownChecks, shownMatched: shownChecks.filter((c) => c.match).length,
    };
    if (a.srt) {
      const rel = `docs/evidence/P1/srt/${label}-${a.videoId}.${a.trackKind}.srt`;
      if (findSecrets(a.srt).length === 0) {
        await mkdir(path.dirname(path.join(ROOT, rel)), { recursive: true });
        await writeFile(path.join(ROOT, rel), a.srt);
        entry.srtFile = rel;
      }
    }
    if (fixturesDir && a.body) {
      await mkdir(fixturesDir, { recursive: true });
      await writeFile(path.join(fixturesDir, `${label}-${a.videoId}.${a.trackKind}.json`), a.body);
    }
    t.accepted.push(entry);
  }
  t.log = s.log.map((e) => ({ ...e }));
  out.tabs.push(t);
}

const text = `${JSON.stringify(sanitizeDeep(out), null, 2)}\n`;
if (findSecrets(text).length) throw new Error('الأدلة الناتجة فيها نمط حساس؛ لم تُكتب');
const rel = `docs/evidence/P1/manual/${label}.json`;
await mkdir(path.dirname(path.join(ROOT, rel)), { recursive: true });
await writeFile(path.join(ROOT, rel), text);

console.log(`الأدلة: ${rel} · أسرار في الملف الأصلي: ${secrets.length}`);
for (const t of out.tabs) {
  console.log(`تبويب: الفيديو ${t.currentVideoId} · webdriver ${t.webdriverPage} · مقبول ${t.accepted.length} · مرفوض ${t.rejected.length} (${[...new Set(t.rejected.map((r) => r.code))].join('، ')})`);
  for (const a of t.accepted) {
    console.log(`  ${a.videoId} ${a.trackKind} ${a.format}/${a.transport} · ${a.bodyLength} محرف · ثوابت ${a.invariants ? a.invariants.filter((r) => r.ok).length : 0}/6 · مقاطع ${a.report.cueCount} · كلمات ${a.report.sourceWords} · مكرر ${a.report.duplicatesRemoved} · اكتمال ${a.report.completeness} · إعادة التحويل في Node مطابقة ${a.nodeReconvertSame} · المعروض ${a.shownMatched}/${a.shownChecks.length}`);
    for (const c of a.shownChecks) console.log(`    ${c.timeSec}s ${c.verdict}: «${(c.displayed || '').slice(0, 70)}»`);
  }
}
