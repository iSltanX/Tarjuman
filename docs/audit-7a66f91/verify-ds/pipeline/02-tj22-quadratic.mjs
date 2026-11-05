// TJ-22 (SEC-02): زمن detectRollingOverlap وwrapLines وmergeLong مع حجم المدخل، عبر المستخرج الحقيقي (handleMessage متزامن).
import { TED, ASR, mod, out } from './lib.mjs';
const { createExtractor } = await mod('extract/index.js');
const { splitWords } = await mod('core/convert/text.js');
const VID = 'AAAAAAAAAAA';
const msg = (body, trackKind) => ({ source: 'tarjuman', v: 1, kind: 'timedtext', videoId: VID, lang: 'en', trackKind, format: 'json3', status: 200, bodyLength: body.length, body });
const time = (fn) => { const t0 = performance.now(); const r = fn(); return { ms: Math.round(performance.now() - t0), r }; };
const ex = () => createExtractor({ currentVideoId: () => VID, durationMs: () => 600000 });

// ما في العيّنات الحقيقية: أقصى كلمات في حدث نصي واحد.
for (const [label, d] of [['TED يدوي', TED()], ['ASR', ASR()]]) {
  const words = d.events.filter((e) => Array.isArray(e.segs)).map((e) => splitWords(e.segs.map((s) => s?.utf8 ?? '').join('')).length);
  out(`العيّنة ${label}`, { maxWordsPerEvent: Math.max(...words), bodyChars: JSON.stringify(d).length });
}
// أ. حدثان ASR متداخلان، ذيل الأول لا يطابق رأس الثاني (الحلقة تمر بكل k).
for (const n of [2000, 4000, 8000, 16000]) {
  const events = [
    { tStartMs: 0, dDurationMs: 10000, segs: [{ utf8: `${'x '.repeat(n)}y`, tOffsetMs: 0, acAsrConf: 1 }] },
    { tStartMs: 5000, dDurationMs: 10000, segs: [{ utf8: 'x '.repeat(n).trim(), tOffsetMs: 0, acAsrConf: 1 }] },
  ];
  const body = JSON.stringify({ events });
  const e = ex();
  const { ms, r } = time(() => e.handleMessage(msg(body, 'asr')));
  out(`أ. ASR متداخلان، كلمات=${n}`, { bodyChars: body.length, handleMessageMs: ms, r });
}
// ب. حدث ASR واحد بكلمات بزمن واحد: canBreak=false فمجموعة واحدة، ثم wrapLines على النص كله.
for (const n of [4000, 8000, 16000]) {
  const body = JSON.stringify({ events: [{ tStartMs: 0, dDurationMs: 10000, segs: [{ utf8: 'ab '.repeat(n).trim(), tOffsetMs: 0, acAsrConf: 1 }] }] });
  const e = ex();
  const { ms, r } = time(() => e.handleMessage(msg(body, 'asr')));
  out(`ب. ASR مجموعة واحدة، كلمات=${n}`, { bodyChars: body.length, handleMessageMs: ms, r });
}
// ج. يدوي: مقطع ضخم ثم ملاصق؛ العادي سريع، و«مقاطع أطول» (بطلب المستخدم) يمر بـwrapLines على النص المضموم.
for (const n of [5000, 10000, 20000]) {
  const body = JSON.stringify({ events: [{ tStartMs: 0, dDurationMs: 5000, segs: [{ utf8: 'ab '.repeat(n).trim() }] }, { tStartMs: 5000, dDurationMs: 1000, segs: [{ utf8: 'next' }] }] });
  const e = ex();
  const h = time(() => e.handleMessage(msg(body, 'manual')));
  const l = time(() => e.convert('en|manual', { mode: 'long' }));
  out(`ج. يدوي كلمات=${n}`, { bodyChars: body.length, normalMs: h.ms, longMs: l.ms, longOk: l.r.ok });
}
