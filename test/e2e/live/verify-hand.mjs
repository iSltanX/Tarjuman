#!/usr/bin/env node
// التحقق من ملفات الجلسة اليدوية كما نزّلها سلطان فعلًا: ملف كامل أو أجزاء احتياطية كاملة بترقيم مستمر، بالوضع العادي
// أو «مقاطع أطول»، تُقارن بمراجعها: عيّنتا P1 بشيفرة التحويل نفسها (TED وميدواي)، وملف P1 للطويل (والطويل بدمج الوضع
// الطويل نفسه mergeLong)، والبث المسجّل بلا مرجع (ملف سليم بلا رابط ولا رمز). والحافظة إن كان فيها نص تعليمات الترجمة:
// يُطابق بـinstructions() بعنوانه، وبفقرة أجزاء تساوي مدى الأجزاء المنزَّلة إن وُجدت. يحدّث حالة الدورة للمحفوظات والرفع.
//   node test/e2e/live/verify-hand.mjs --browser chrome
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { createExtractor } from '../../../src/extract/index.js';
import { buildExport } from '../../../src/core/export/index.js';
import { instructions } from '../../../src/core/export/instructions.js';
import { mergeLong } from '../../../src/core/convert/long.js';
import { parseSrtStrict } from '../../../src/core/srt/parser.js';
import { writeSrt } from '../../../src/core/srt/writer.js';
import { findSecrets } from '../../../src/core/diagnostics/sanitize.js';
import { BROWSERS, Evidence, ROOT, WORK, loadState, parsePart, readClipboard, saveState, sha16 } from './lib.mjs';

const argv = process.argv.slice(2);
const val = (k, d = null) => (argv.includes(`--${k}`) ? argv[argv.indexOf(`--${k}`) + 1] : d);
const browser = val('browser', 'brave');
const DL = path.join(WORK, browser, 'hand-downloads');
const NAME = /^(?<id>[A-Za-z0-9_-]{11})\.en\.(?<kind>manual|asr)\.(?<mode>normal|long)(?:\.part(?<i>\d+)of(?<t>\d+))?(?<dup> \(\d+\))?\.srt$/;
const REFS = {
  iG9CE55wbtY: { slot: 'manual', fixture: 'manual-ted-iG9CE55wbtY.json', kind: 'manual', durationMs: 1203421 },
  Y9rkKtK1b44: { slot: 'asr', fixture: 'asr-nwc-Y9rkKtK1b44.json', kind: 'asr', durationMs: 3600000 },
  gBazR59SZXk: { slot: 'long', srt: 'docs/evidence/P1/srt/gBazR59SZXk.en.manual.srt', kind: 'manual' },
};
const key = (c) => `${c.n}|${c.startMs}|${c.endMs}|${c.text}`;

/**
 * المقاطع المتوقعة ونص الملف الكامل لفيديو ووضع، أو null إن لم يكن له مرجع. وفيديو بلا مرجع نُزّل ملفه العادي كاملًا
 * في الجلسة نفسها: أجزاء «مقاطع أطول» تُقارن بالدمج الطويل لذلك الملف (اتساق الوضعين من الالتقاط نفسه).
 */
async function expected(id, mode, kind = 'manual') {
  const ref = REFS[id];
  if (!ref) {
    if (mode !== 'long') return null;
    const normal = await readFile(path.join(DL, `${id}.en.${kind}.normal.srt`), 'utf8').catch(() => null);
    if (!normal) return null;
    const merged = mergeLong(parseSrtStrict(normal).map(({ startMs, endMs, text }) => ({ startMs, endMs, text }))).cues.map((c, i) => ({ n: i + 1, ...c }));
    const text = writeSrt(merged);
    return { text, cues: parseSrtStrict(text), fromSession: true };
  }
  if (ref.fixture) {
    const body = await readFile(path.join(ROOT, 'test/fixtures/json3', ref.fixture), 'utf8');
    const ex = createExtractor({ currentVideoId: () => id, durationMs: () => ref.durationMs, isLive: () => false });
    ex.handleMessage({ source: 'tarjuman', v: 1, kind: 'timedtext', videoId: id, lang: 'en', trackKind: ref.kind, kindParam: ref.kind === 'asr' ? 'asr' : null, capsAsr: true, hasTlang: false, format: 'json3', hasPot: true, transport: 'xhr', status: 200, bodyLength: body.length, body, truncated: false });
    const conv = ex.convert(`en|${ref.kind}`, { mode });
    const text = buildExport({ videoId: id, title: null, track: { key: `en|${ref.kind}`, lang: 'en', kind: ref.kind, cues: conv.cues, warnings: conv.warnings }, mode, now: 0 }).files[0].text;
    return { text, cues: parseSrtStrict(text) };
  }
  const normal = await readFile(path.join(ROOT, ref.srt), 'utf8');
  if (mode === 'normal') return { text: normal, cues: parseSrtStrict(normal) };
  const merged = mergeLong(parseSrtStrict(normal).map(({ startMs, endMs, text }) => ({ startMs, endMs, text }))).cues.map((c, i) => ({ n: i + 1, ...c }));
  const text = writeSrt(merged);
  return { text, cues: parseSrtStrict(text) };
}

const state = await loadState(browser);
const ev = new Evidence(path.join(ROOT, 'docs/evidence/P9', browser), 'hand-files', { step: 'hand-files', browser: BROWSERS[browser].name, session: 'ما نزّله سلطان في النافذة العادية بلا تحكم، كما هو' });
const groups = new Map();
for (const n of (await readdir(DL)).filter((x) => !x.endsWith('.crdownload')).sort()) {
  const m = NAME.exec(n);
  if (!m) continue;
  const g = `${m.groups.id}|${m.groups.kind}|${m.groups.mode}`;
  if (!groups.has(g)) groups.set(g, { id: m.groups.id, kind: m.groups.kind, mode: m.groups.mode, full: null, parts: new Map(), total: null, dups: [] });
  const e = groups.get(g);
  if (m.groups.dup) e.dups.push(n);
  else if (m.groups.i) {
    e.parts.set(Number(m.groups.i), n);
    e.total = Number(m.groups.t);
  } else e.full = n;
}

const partsOf = {};
for (const g of groups.values()) {
  const exp = await expected(g.id, g.mode, g.kind);
  const slot = REFS[g.id]?.slot ?? 'live';
  const label = `${slot}-${g.mode}`;
  for (const d of g.dups) {
    const orig = d.replace(/ \(\d+\)\.srt$/, '.srt');
    const same = (await readFile(path.join(DL, d), 'utf8')) === (await readFile(path.join(DL, orig), 'utf8').catch(() => null));
    ev.note(`${d}: تنزيل مكرر للجزء نفسه، ${same ? 'مطابق للأول بايتًا' : 'يختلف عن الأول'}.`);
  }
  if (g.full) {
    const text = await readFile(path.join(DL, g.full), 'utf8');
    const cues = parseSrtStrict(text);
    const detail = { name: g.full, bytes: Buffer.byteLength(text), sha: sha16(text), cues: cues.length };
    if (exp && !exp.fromSession) ev.check(`hand-${label}-full-matches-reference`, text === exp.text, { ...detail, expected: { bytes: Buffer.byteLength(exp.text), sha: sha16(exp.text) } });
    else ev.check(`hand-${label}-full-valid-srt`, cues.length > 0 && findSecrets(text, ['url']).length === 0, detail);
    if (exp && text === exp.text && (g.id === 'iG9CE55wbtY' || g.id === 'Y9rkKtK1b44')) state.videos[g.id] = { ...(state.videos[g.id] ?? {}), slot, srtName: g.full, srtSha: sha16(text), cues: cues.length, fromParts: false };
  }
  if (g.parts.size) {
    const complete = g.total && g.parts.size === g.total;
    const parsed = [];
    for (let i = 1; i <= (g.total ?? 0); i++) if (g.parts.has(i)) parsed.push(parsePart(await readFile(path.join(DL, g.parts.get(i)), 'utf8')));
    const flat = parsed.flat();
    const continuous = flat.every((c, i) => c.n === i + 1);
    const ranges = parsed.map((p, i) => ({ index: i + 1, from: p[0]?.n, to: p.at(-1)?.n }));
    partsOf[`${g.id}|${g.mode}`] = ranges;
    const same = exp ? flat.length === exp.cues.length && flat.every((c, i) => key(c) === key(exp.cues[i])) : null;
    const detail = { parts: g.parts.size, total: g.total, cues: flat.length, continuous, ranges: ranges.map((r) => `${r.from}–${r.to}`), expectedCues: exp?.cues.length ?? null, reference: exp ? (exp.fromSession ? 'الدمج الطويل للملف العادي من الجلسة نفسها' : 'المرجع الثابت') : null };
    ev.check(`hand-${label}-split-parts-${exp ? 'match-reference' : 'valid'}`, complete && continuous && (exp ? same : flat.length > 0), detail);
    if (complete && same && !g.full && (g.id === 'iG9CE55wbtY' || g.id === 'Y9rkKtK1b44') && !state.videos[g.id]?.srtName) {
      // الأجزاء بمقاطع الملف الكامل نفسها: الترجمة الخارجية للملف الكامل تخصها، والبصمة المحفوظة بأجزائها.
      state.videos[g.id] = { ...(state.videos[g.id] ?? {}), slot, srtName: exp.text ? `${g.id}.en.${g.kind}.${g.mode}.srt` : null, srtSha: sha16(exp.text), cues: flat.length, fromParts: true };
    }
  }
}

// الحافظة: آخر نص تعليمات نُسخ من الشريط في هذه الجلسة (إن بقي فيها).
const clip = readClipboard();
const header = instructions({ videoId: 'iG9CE55wbtY', title: null }).split('\n')[0];
if (clip.startsWith(header)) {
  const id = /watch\?v=([A-Za-z0-9_-]{11})/.exec(clip)?.[1] ?? null;
  const title = /^- العنوان: (.*)$/m.exec(clip)?.[1] ?? null;
  const hasParts = /الملف مقسّم إلى أجزاء/.test(clip);
  const mode = ['long', 'normal'].find((md) => partsOf[`${id}|${md}`]);
  const parts = hasParts && mode ? partsOf[`${id}|${mode}`] : null;
  const exp = id ? instructions({ videoId: id, title: title === 'غير متوفر' ? null : title, parts }) : null;
  ev.check(`hand-copy-${REFS[id]?.slot ?? 'other'}${hasParts ? '-with-parts-paragraph' : ''}-is-appendix-a`, !!exp && clip === exp,
    { len: clip.length, sha: sha16(clip), videoSlot: REFS[id]?.slot ?? null, partsParagraph: hasParts, partsFromDownloads: parts?.length ?? null });
} else {
  ev.note('لا نص تعليمات في الحافظة الآن (نُسخ غيره بعده)؛ يُعتمد ما رصده المراقب.');
}

await saveState(browser, state);
await ev.write();
process.exit(ev.failed.length ? 1 : 0);
