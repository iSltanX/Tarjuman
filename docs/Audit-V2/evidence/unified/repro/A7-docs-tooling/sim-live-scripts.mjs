#!/usr/bin/env node
// محاكاة ساكنة لافتراضات السكربتات الحية القديمة (test/e2e/live/hand.mjs وlib.mjs وv2/hand.mjs) على شيفرة 5b9a584.
// لا يستورد أي ملف من test/e2e/live/** ولا test/live/** (استيرادها يفتح متصفحًا): يعيد بناء منطق المرجع فيها حرفيًا
// على وحدات src النقية، ثم يقارن بما تنتجه الشيفرة الحالية. لا شبكة ولا متصفح ولا كتابة إلا ناتجه على stdout.
//   command node docs/Audit-V2/evidence/unified/repro/A7-docs-tooling/sim-live-scripts.mjs
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../../..');
const rel = (p) => path.join(ROOT, p);
const out = [];
const log = (k, v) => { out.push({ k, v }); console.log(`${k}: ${typeof v === 'string' ? v : JSON.stringify(v)}`); };

const { createExtractor } = await import(rel('src/extract/index.js'));
const { buildExport, instructions } = await import(rel('src/core/export/index.js'));

// ---- 1) specInstructions في test/e2e/live/lib.mjs:208-211 (معاد كتابته حرفيًا) ----
const spec = await readFile(rel('docs/product-spec.md'), 'utf8');
const TEMPLATE = /```text\n([\s\S]*?)\n```/.exec(spec.slice(spec.indexOf('## ملحق أ')))[1];
const specInstructions = (videoId, title) => TEMPLATE
  .replace('{{video_title}}', () => title ?? 'غير متوفر')
  .replace('{{video_url}}', () => `https://www.youtube.com/watch?v=${videoId}`);
const oldHeader = specInstructions('iG9CE55wbtY', null).split('\n')[0];
log('A1 old hand.mjs HEADER (from lib.mjs specInstructions)', oldHeader);
log('A1 old HEADER still has unfilled placeholders', /\{\{\w+\}\}/.test(oldHeader));
const TED_TITLE = 'Do schools kill creativity? | Sir Ken Robinson | TED';
const nowEnAr = instructions({ videoId: 'iG9CE55wbtY', title: TED_TITLE, source: 'en', target: 'ar' });
log('A1 current instructions(en→ar) first line', nowEnAr.split('\n')[0]);
log('A1 current text startsWith old HEADER (ours() in hand.mjs:77)', nowEnAr.startsWith(oldHeader));
log('A1 current text === specInstructions(TED) (check hand-copy-from-player-bar)', nowEnAr === specInstructions('iG9CE55wbtY', TED_TITLE));

// ---- 2) v2/hand.mjs:75 HEADER ثابت، و:156 instructions بلا source/target ----
const v2Header = 'ترجمة ملف ترجمة فيديو (SRT) من الإنجليزية إلى العربية';
log('A2 v2/hand.mjs HEADER', v2Header);
log('A2 current en→ar startsWith v2 HEADER', nowEnAr.startsWith(v2Header));
try {
  const t = instructions({ videoId: 'iG9CE55wbtY', title: TED_TITLE, glossary: null });
  log('A2 instructions() without source/target (v2/hand.mjs:156)', { threw: false, firstLine: t.split('\n')[0] });
} catch (e) {
  log('A2 instructions() without source/target (v2/hand.mjs:156)', { threw: true, code: e.code ?? null, message: String(e.message).slice(0, 160) });
}

// ---- 3) expected() في hand.mjs:45-51 وv2/hand.mjs:50-57 (معاد كتابته حرفيًا) ----
async function oldExpected(id, kind, mode, fixture, durationMs) {
  const body = await readFile(rel(path.join('test/fixtures/json3', fixture)), 'utf8');
  const ex = createExtractor({ currentVideoId: () => id, durationMs: () => durationMs, isLive: () => false });
  const accepted = ex.handleMessage({ source: 'tarjuman', v: 1, kind: 'timedtext', videoId: id, lang: 'en', trackKind: kind, kindParam: kind === 'asr' ? 'asr' : null, capsAsr: true, hasTlang: false, format: 'json3', hasPot: true, transport: 'xhr', status: 200, bodyLength: body.length, body, truncated: false });
  const conv = ex.convert(`en|${kind}`, { mode });
  const built = buildExport({ videoId: id, title: null, track: { key: `en|${kind}`, lang: conv.lang, kind: conv.kind, cues: conv.cues, warnings: conv.warnings }, mode, now: Date.now() });
  return { accepted: accepted ?? null, convOk: conv?.ok ?? null, cues: conv?.cues?.length ?? null, file: built.files[0]?.name ?? null };
}
for (const [id, kind, mode, fx, dur] of [
  ['iG9CE55wbtY', 'manual', 'normal', 'manual-ted-iG9CE55wbtY.json', 1203421],
  ['Y9rkKtK1b44', 'asr', 'long', 'asr-nwc-Y9rkKtK1b44.json', 3600000],
]) {
  try {
    const r = await oldExpected(id, kind, mode, fx, dur);
    const nameRe = new RegExp(`^${id.replace(/-/g, '\\-')}\\.en\\.(manual|asr)\\.${mode}\\.srt$`);
    log(`A3 old expected() ${id} ${kind}/${mode}`, { ...r, matchesOldFileRegex: r.file ? nameRe.test(r.file) : null });
  } catch (e) {
    log(`A3 old expected() ${id} ${kind}/${mode}`, { threw: true, code: e.code ?? null, message: String(e.message).slice(0, 200) });
  }
}

// ---- 4) هل في قائمة المشغّل بند نسخ تعليمات؟ (افتراض hand.mjs:5 وv2/hand.mjs:4-6) ----
const menus = await readFile(rel('src/player/controls/menus.js'), 'utf8');
const session = await readFile(rel('src/player/controls/session.js'), 'utf8');
const text = await readFile(rel('src/player/controls/text.js'), 'utf8');
const copyRe = /نسخ (?:تعليمات|التعليمات)|copyInstructions|clipboard\.writeText/;
log('A4 player menus/session/text mention copy-instructions or clipboard write', { menus: copyRe.test(menus), session: copyRe.test(session), text: copyRe.test(text) });
const stepDownload = /stepDownload:\s*'([^']+)'/.exec(await readFile(rel('src/player/panel/text.js'), 'utf8'))?.[1] ?? null;
log('A4 player panel step text', stepDownload);
