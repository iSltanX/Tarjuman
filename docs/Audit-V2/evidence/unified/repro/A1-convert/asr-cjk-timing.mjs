// A1 — التحقق من Codex 1 (SUB-01) وGemini F-04: توقيت ASR للكتابة المتصلة، والشطر داخل الحدث، وكشف التدحرج.
// الاستعمال: command node asr-cjk-timing.mjs <جذر الشيفرة>
// لا متصفح ولا شبكة ولا كتابة. كل حالة تطبع «الفعلي» و«المتوقع».
import { readFileSync } from 'node:fs';

const R = process.argv[2];
if (!R) throw new Error('مرّر جذر الشيفرة وسيطًا أول');
const { convertTrack } = await import(`${R}/src/core/convert/index.js`);
const { eventWords, detectRollingOverlap } = await import(`${R}/src/core/convert/asr.js`);
const { parseJson3 } = await import(`${R}/src/core/convert/json3.js`);

const body = (events) => JSON.stringify({ wireMagic: 'pb3', events });
/** حدث ASR بقطع [إزاحة، نص]؛ القطعة الأولى بلا tOffsetMs كما في يوتيوب. */
const asrEvent = (start, dur, segs) => ({
  tStartMs: start, dDurationMs: dur, wWinId: 1,
  segs: segs.map(([t, w], i) => ({ utf8: w, ...(i ? { tOffsetMs: t } : {}), acAsrConf: 0 })),
});
const out = (title, actual, expected, note) => {
  console.log(`\n## ${title}`);
  console.log('الفعلي:', JSON.stringify(actual));
  console.log('المتوقع:', JSON.stringify(expected));
  if (note) console.log('ملاحظة:', note);
};
const cueView = (r) => r.cues.map((c) => ({ startMs: c.startMs, endMs: c.endMs, text: c.text }));

// ---- ١. حالة Codex: أربع قطع يابانية متصلة بأزمنة 1000/2800/4600/6400 ----
{
  const segs = [[0, '今日'], [1800, 'は'], [3600, 'いい'], [5400, '天気']];
  const ja = convertTrack({ body: body([asrEvent(1000, 6000, segs)]), trackKind: 'asr', durationMs: 7000 });
  // الضابط: القطع نفسها بأزمنتها، لكن بنص لاتيني مفصول بمسافة بادئة كما يرسل يوتيوب الإنجليزية.
  const latin = convertTrack({ body: body([asrEvent(1000, 6000, segs.map(([t], i) => [t, i ? ` w${i}` : 'w0']))]), trackKind: 'asr', durationMs: 7000 });
  const ew = eventWords(parseJson3(body([asrEvent(1000, 6000, segs)])).events[0]).words.map((w) => ({ t: w.t, text: w.text }));
  out('١-أ. كلمات الحدث الياباني من eventWords', ew, 'أربع وحدات بأزمنة 1000 و2800 و4600 و6400 (أو ما يكافئها)');
  out('١-ب. المقطع الياباني الناتج', { ok: ja.ok, cues: cueView(ja), invariantsOk: ja.invariants?.ok }, 'نهاية آخر مقطع ≥ 6400 (بدء آخر قطعة)، وبالخوارزمية نفسها على القطع: min(6400+1500, 7000) = 7000');
  out('١-ج. الضابط اللاتيني بالأزمنة نفسها', { ok: latin.ok, cues: cueView(latin) }, 'النهاية من زمن آخر كلمة (7000)');
}

// ---- ٢. حالة Gemini: 15 قطعة، 。 في الوسط، آخر قطعة عند 4900 ----
{
  const words = ['きょう', 'は', 'とても', 'いい', 'てんき', 'です', 'ね', '。', 'あした', 'も', 'はれる', 'と', 'いい', 'です', 'ね'];
  const segs = words.map((w, k) => [k * 350, w]);
  const ja = convertTrack({ body: body([asrEvent(0, 6000, segs)]), trackKind: 'asr', durationMs: 10000 });
  const latin = convertTrack({ body: body([asrEvent(0, 6000, segs.map(([t, w], k) => [t, k ? ` ${w === '。' ? '.' : `w${k}`}` : 'w0']))]), trackKind: 'asr', durationMs: 10000 });
  out('٢-أ. ياباني بنقطة 。 داخل الحدث', { cues: cueView(ja), converterWords: ja.report.converter.words, sourceWords: ja.report.sourceWords },
    'مقطعان (الشطر بعد 。 عند 2800)، وآخر نهاية min(4900+1500, 6000) = 6000');
  out('٢-ب. الضابط اللاتيني بنقطة . في الموضع نفسه', { cues: cueView(latin) }, 'مقطعان، وآخر نهاية 6000');
}

// ---- ٣. فجوة صوتية داخل الحدث (3000ms > gapMs=700) ----
{
  const ja = convertTrack({ body: body([asrEvent(0, 6000, [[0, '今日は'], [200, 'いい'], [3200, '天気'], [3400, 'です']])]), trackKind: 'asr', durationMs: 7000 });
  const latin = convertTrack({ body: body([asrEvent(0, 6000, [[0, 'today'], [200, ' is'], [3200, ' nice'], [3400, ' weather']])]), trackKind: 'asr', durationMs: 7000 });
  out('٣. فجوة 3000ms داخل الحدث', { ja: cueView(ja), latin: cueView(latin) }, 'مقطعان في الحالتين، يبدأ الثاني عند 3200');
}

// ---- ٤. شطر بين الأحداث ما زال يعمل (الحدث كله «كلمة» تنتهي بـ。) ----
{
  const ja = convertTrack({
    body: body([asrEvent(0, 1500, [[0, '今日は'], [300, '晴れ。']]), asrEvent(1600, 1500, [[0, '明日も'], [300, '晴れ']])]),
    trackKind: 'asr', durationMs: 4000,
  });
  out('٤. حدثان متقاربان (فجوة 100ms) أولهما ينتهي بـ。', { cues: cueView(ja) }, 'مقطعان: الشطر بين الأحداث يعمل لأن آخر «كلمة» في الأول تنتهي بـ。');
}

// ---- ٥. كشف التدحرج: (أ) بالزمن، (ب) بالنمط بلا توقيت كلمات ----
{
  const enTime = [
    asrEvent(0, 5000, [[0, 'one'], [1000, ' two'], [2000, ' three'], [3000, ' four']]),
    asrEvent(1000, 5000, [[0, 'two'], [1000, ' three'], [2000, ' four'], [3000, ' five']]),
  ];
  const jaTime = [
    asrEvent(0, 5000, [[0, '一'], [1000, '二'], [2000, '三'], [3000, '四']]),
    asrEvent(1000, 5000, [[0, '二'], [1000, '三'], [2000, '四'], [3000, '五']]),
  ];
  const e = convertTrack({ body: body(enTime), trackKind: 'asr', durationMs: 8000 });
  const j = convertTrack({ body: body(jaTime), trackKind: 'asr', durationMs: 8000 });
  out('٥-أ. تدحرج بالزمن (الحدث الثاني يعيد ذيل الأول بأزمنته)',
    { latin: [e.ok, e.code], cjk: [j.ok, j.code], cjkText: j.cues.map((c) => c.text) },
    'الحالتان EX_UNSUPPORTED_FORMAT (رفض الصيغة المتدحرجة)');

  const untimed = (start, dur, text) => ({ tStartMs: start, dDurationMs: dur, segs: [{ utf8: text, tOffsetMs: 0, acAsrConf: 1 }] });
  const enLines = ['the quick brown fox', 'jumps over the lazy', 'dog and then it', 'runs far away now'];
  const jaLines = ['今日はとてもいい天気', '散歩に行きましょう', '公園で休みます', 'それから帰ります'];
  const roll = (lines) => lines.map((l, i) => untimed(i * 2000, 4000, i ? `${lines[i - 1]}\n${l}` : l));
  const e2 = convertTrack({ body: body(roll(enLines)), trackKind: 'asr', durationMs: 20000 });
  const j2 = convertTrack({ body: body(roll(jaLines)), trackKind: 'asr', durationMs: 20000 });
  out('٥-ب. تدحرج بالنمط (كل حدث يعيد سطر سابقه كاملًا، #1318)',
    { latin: [e2.ok, e2.code], cjk: [j2.ok, j2.code, j2.invariants?.ok], cjkText: j2.cues.map((c) => c.text.replace(/\n/g, '⏎')), detectCjk: detectRollingOverlap(parseJson3(body(roll(jaLines))).events, 3) },
    'الحالتان EX_UNSUPPORTED_FORMAT؛ وإلا فالنص العربي المترجم سيحمل كل سطر مرتين');
}

// ---- ٦. محاكاة واقعية: أزمنة العيّنة الحقيقية (ASR إنجليزي من P1) بنص متصل بلا مسافات ----
{
  const fx = JSON.parse(readFileSync(`${R}/test/fixtures/json3/asr-nwc-Y9rkKtK1b44.json`, 'utf8'));
  const DUR = 3000000;
  const kana = 'あいうえおかきくけこさしすせそたちつてと';
  let n = 0;
  const cjk = structuredClone(fx);
  for (const e of cjk.events) {
    if (!Array.isArray(e.segs)) continue;
    for (const s of e.segs) {
      if (typeof s.utf8 !== 'string' || s.utf8.trim() === '') continue;
      const len = Math.min(4, Math.max(1, s.utf8.trim().length >> 1));
      s.utf8 = Array.from({ length: len }, () => kana[n++ % kana.length]).join('');
    }
  }
  // أزمنة القطع المطلقة (محصورة في نافذة حدثها كما يفعل eventWords).
  const segTimes = [];
  for (const e of fx.events) {
    if (!Array.isArray(e.segs) || !e.segs.some((s) => (s.utf8 ?? '').trim())) continue;
    const hi = Number.isFinite(e.dDurationMs) ? e.tStartMs + e.dDurationMs : Infinity;
    for (const s of e.segs) if ((s.utf8 ?? '').trim()) segTimes.push(Math.min(Math.max(e.tStartMs + (s.tOffsetMs ?? 0), e.tStartMs), hi));
  }
  const measure = (r) => {
    const cues = r.cues;
    let i = 0;
    let uncovered = 0;
    for (const t of [...segTimes].sort((a, b) => a - b)) {
      while (i + 1 < cues.length && cues[i + 1].startMs <= t) i++;
      const c = cues[i];
      if (!(c && c.startMs <= t && t < c.endMs)) uncovered++;
    }
    const shown = cues.reduce((s, c) => s + (c.endMs - c.startMs), 0);
    const durs = cues.map((c) => c.endMs - c.startMs).sort((a, b) => a - b);
    return {
      ok: r.ok, cues: cues.length, words: segTimes.length,
      wordsSpokenWithNoCueShown: uncovered, ratio: Math.round((uncovered / segTimes.length) * 1000) / 1000,
      medianCueMs: durs[durs.length >> 1], totalShownMs: shown,
    };
  };
  const en = convertTrack({ body: JSON.stringify(fx), trackKind: 'asr', durationMs: DUR });
  const ja = convertTrack({ body: JSON.stringify(cjk), trackKind: 'asr', durationMs: DUR });
  out('٦. أزمنة حقيقية (Y9rkKtK1b44) بنص متصل اصطناعي — نسبة الكلمات المنطوقة ولا مقطع معروض',
    { englishBaseline: measure(en), sameTimingsNoSpaces: measure(ja) },
    'نسبة قريبة من الضابط الإنجليزي؛ والفرق كله من إسقاط أزمنة القطع',
    'النص الياباني اصطناعي (لا عيّنة حقيقية لغير الإنجليزية في المستودع)، والأزمنة وبنية الأحداث حقيقية من P1.');
}
