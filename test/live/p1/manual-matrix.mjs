#!/usr/bin/env node
// مصفوفة P1 في متصفح غير مؤتمت: دورات «افتح رابطًا عاديًا ← انتظر ← صدّر وأغلق» عبر manual.mjs، ثم تحقق
// كل تصدير وجمع النتائج. معاملات يوتيوب الموثّقة فقط: t (موضع البدء)، وcc_load_policy=1، وcc_lang_pref.
//   node test/live/p1/manual-matrix.mjs --browser brave --profile brave-manual --ext <مجلد> [--only positions,long,nocap,tlang]
import { execFileSync } from 'node:child_process';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomPositions } from '../../helpers/positions.mjs';
import { findSecrets, sanitizeDeep } from '../../../src/core/diagnostics/sanitize.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const HERE = path.dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const val = (k, d = null) => (argv.includes(`--${k}`) ? argv[argv.indexOf(`--${k}`) + 1] : d);
const browser = val('browser', 'brave');
const profile = val('profile', `${browser}-manual`);
const ext = val('ext');
const only = val('only') ? val('only').split(',') : ['positions', 'long', 'nocap', 'tlang'];
const SEED = Number(val('seed', 20261101));
const FIXTURES = val('fixtures');

const VIDEOS = {
  manual: { id: 'iG9CE55wbtY', lengthSec: 1203 },
  asr: { id: 'Y9rkKtK1b44', lengthSec: 3000 },
  long: { id: 'gBazR59SZXk', lengthSec: 6668 },
  nocap: { id: 'aqz-KE-bpKQ', lengthSec: 635 },
};
const log = (...a) => console.log(`[${new Date().toISOString().slice(11, 19)}] ${a.join(' ')}`);
const url = (id, params) => `https://www.youtube.com/watch?v=${id}&${params}`;

function cycle(label, link, { wait = 22, srt = false } = {}) {
  const args = [path.join(HERE, 'manual.mjs'), 'cycle', '--browser', browser, '--profile', profile, '--ext', ext, '--label', label, '--wait', String(wait), '--close'];
  if (srt) args.push('--srt');
  try {
    return execFileSync(process.execPath, [...args, link], { encoding: 'utf8' }).trim().split('\n').pop();
  } catch (err) {
    return { error: String(err.stderr || err.message).trim().slice(0, 200) };
  }
}

function verify(file, label) {
  const args = [path.join(HERE, 'verify-export.mjs'), file, '--label', label];
  if (FIXTURES) args.push('--fixtures', FIXTURES);
  execFileSync(process.execPath, args, { encoding: 'utf8' });
  return path.join(ROOT, `docs/evidence/P1/manual/${label}.json`);
}

/** ملخص دورة من ملف أدلتها المنقّى. */
async function summarize(evFile, videoId) {
  const ev = JSON.parse(await readFile(evFile, 'utf8'));
  const tabs = ev.tabs.filter((t) => t.currentVideoId === videoId);
  const accepted = tabs.flatMap((t) => t.accepted.filter((a) => a.videoId === videoId));
  const rejected = tabs.flatMap((t) => t.rejected);
  return {
    webdriver: tabs.map((t) => t.webdriverPage),
    accepted: accepted.map((a) => ({
      lang: a.lang, trackKind: a.trackKind, format: a.format, transport: a.transport, bodyLength: a.bodyLength, bodySha256: a.bodySha256,
      ok: a.ok, invariants: a.invariants ? a.invariants.filter((r) => r.ok).length : 0, cues: a.report.cueCount, words: a.report.sourceWords,
      duplicatesRemoved: a.report.duplicatesRemoved, completeness: a.report.completeness, inferredKind: a.report.inferredKind,
      warnings: a.warnings, nodeReconvertSame: a.nodeReconvertSame, srtFile: a.srtFile || null,
      shown: a.shownChecks.map((c) => ({ timeSec: c.timeSec, verdict: c.verdict, match: c.match })),
    })),
    rejected: rejected.map((r) => ({ code: r.code, videoId: r.videoId === videoId ? 'هذا الفيديو' : 'فيديو آخر', lang: r.lang, trackKind: r.trackKind, hasTlang: r.hasTlang, bodyLength: r.bodyLength })),
    storage: ev.storage || null,
  };
}

const out = { browser, profile, seed: SEED, startedAt: new Date().toISOString(), videos: VIDEOS, cycles: [] };

async function run(name, kind, link, opts = {}) {
  const label = `${browser}-${name}`;
  log(`دورة ${label}`);
  const file = cycle(label, link, opts);
  if (typeof file !== 'string') {
    out.cycles.push({ name, kind, error: file.error });
    log(`  فشل: ${file.error}`);
    return null;
  }
  const ev = verify(file, label);
  const s = await summarize(ev, VIDEOS[kind].id);
  out.cycles.push({ name, kind, videoId: VIDEOS[kind].id, link: link.replace(/^https:\/\/www\.youtube\.com\/watch\?v=/, 'watch?v='), evidence: path.relative(ROOT, ev), ...s });
  const a = s.accepted[s.accepted.length - 1];
  log(`  مقبول ${s.accepted.length} · مرفوض ${s.rejected.map((r) => r.code).join('،') || '—'}${a ? ` · ${a.trackKind} ${a.bodyLength} · ثوابت ${a.invariants}/6 · معروض ${a.shown.filter((x) => x.match).length}/${a.shown.length}` : ''}`);
  return s;
}

for (const kind of only.includes('positions') ? ['manual', 'asr'] : []) {
  const v = VIDEOS[kind];
  const times = randomPositions(v.lengthSec, SEED + (kind === 'asr' ? 1 : 0));
  for (const [i, t] of times.entries()) {
    await run(`${kind}-p${i + 1}`, kind, url(v.id, `t=${Math.floor(t)}s&cc_load_policy=1&cc_lang_pref=en`), { srt: i === 0 });
  }
}
if (only.includes('long')) await run('long', 'long', url(VIDEOS.long.id, 't=1800s&cc_load_policy=1&cc_lang_pref=en'), { wait: 30, srt: true });
if (only.includes('nocap')) await run('nocap', 'nocap', url(VIDEOS.nocap.id, 'cc_load_policy=1&cc_lang_pref=en'), { wait: 20 });
if (only.includes('tlang')) await run('tlang', 'asr', url(VIDEOS.asr.id, 't=600s&cc_load_policy=1&cc_lang_pref=ar'), { wait: 22 });

out.finishedAt = new Date().toISOString();
const text = `${JSON.stringify(sanitizeDeep(out), null, 2)}\n`;
if (findSecrets(text).length) throw new Error('ملخص المصفوفة فيه نمط حساس؛ لم يُكتب');
const rel = `docs/evidence/P1/manual/${browser}-matrix-${out.startedAt.replace(/[:.]/g, '-').slice(0, 19)}.json`;
await mkdir(path.dirname(path.join(ROOT, rel)), { recursive: true });
await writeFile(path.join(ROOT, rel), text);
log(`الملخص: ${rel}`);
