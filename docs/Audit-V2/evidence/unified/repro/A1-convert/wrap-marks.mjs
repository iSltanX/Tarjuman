// A1 — التحقق من Gemini F-06: wrapLines والحركات المركّبة (\p{M})، وNFD الياباني، ومسافة mergeLong الزائفة.
// الاستعمال: command node wrap-marks.mjs <جذر الشيفرة>
// لا متصفح ولا شبكة ولا كتابة. كل حالة تطبع «الفعلي» و«المتوقع».
const R = process.argv[2];
if (!R) throw new Error('مرّر جذر الشيفرة وسيطًا أول');
const { convertTrack } = await import(`${R}/src/core/convert/index.js`);
const { wrapLines, cleanCueText, splitWords } = await import(`${R}/src/core/convert/text.js`);
const { mergeLong } = await import(`${R}/src/core/convert/long.js`);

const body = (events) => JSON.stringify({ wireMagic: 'pb3', events });
const manual = (lines, step = 1500, dur = 1400) => body(lines.map((t, i) => ({ tStartMs: 1000 + i * step, dDurationMs: dur, segs: [{ utf8: t }] })));
const asrEvent = (start, dur, segs) => ({ tStartMs: start, dDurationMs: dur, wWinId: 1, segs: segs.map(([t, w], i) => ({ utf8: w, ...(i ? { tOffsetMs: t } : {}), acAsrConf: 0 })) });
const esc = (s) => s.replace(/\p{M}/gu, (m) => `<U+${m.codePointAt(0).toString(16).toUpperCase().padStart(4, '0')}>`).replace(/\n/g, '⏎');
const lineStartsWithMark = (s) => s.split('\n').slice(1).some((l) => /^\p{M}/u.test(l));
const out = (title, actual, expected, note) => {
  console.log(`\n## ${title}`);
  console.log('الفعلي:', JSON.stringify(actual));
  console.log('المتوقع:', JSON.stringify(expected));
  if (note) console.log('ملاحظة:', note);
};

// ---- ١. التايلاندية (NFC): هل يقع الكسر قبل حركة؟ وهل تفشل الثوابت؟ ----
{
  const thai = `${'ก'.repeat(21)}น\u0E48${'ก'.repeat(21)}`; // حالة Gemini
  const w = wrapLines(thai, 42);
  const asr = convertTrack({ body: body([asrEvent(0, 3000, [[0, thai]])]), trackKind: 'asr', durationMs: 5000 });
  out('١-أ. حالة Gemini التايلاندية', { wrapped: esc(w), secondLineStartsWithMark: lineStartsWithMark(w), asrOk: asr.ok, asrCode: asr.code },
    'لا سطر يبدأ بحركة؛ والثوابت ناجحة', 'الثوابت تجتاز لأن الحركات التايلاندية Script=Thai فهي وحدات في المصدر والناتج معًا: عيب عرض/نص لا رفض تصدير.');

  // جمل تايلاندية واقعية (نص كتبه المدقق) تُلفّ عند حدود مختلفة: كم مرة يبدأ السطر الثاني بحركة؟
  const sentences = [
    'วันนี้อากาศดีมากเราจะไปเดินเล\u0E48นที\u0E48สวนสาธารณะใกล้บ้านกันนะครับ',
    'ขอบคุณทุกคนที\u0E48ติดตามช\u0E48องของเรามาโดยตลอดและอย\u0E48าลืมกดติดตามด้วยนะ',
    'ในวิดีโอนี้เราจะมาเรียนรู้วิธีทำอาหารไทยแบบง\u0E48ายๆที\u0E48บ้านของคุณเอง',
    'ประเทศไทยมีสถานที\u0E48ท\u0E48องเที\u0E48ยวที\u0E48สวยงามมากมายทั้งทะเลภูเขาและวัด',
  ];
  let wrappedCount = 0;
  let broken = 0;
  const samples = [];
  for (const s of sentences) {
    for (let len = 43; len <= s.length; len++) {
      const t = s.slice(0, len);
      const x = wrapLines(t, 42);
      if (!x.includes('\n')) continue;
      wrappedCount++;
      if (lineStartsWithMark(x)) {
        broken++;
        if (samples.length < 3) samples.push(esc(x));
      }
    }
  }
  out('١-ب. جمل تايلاندية واقعية بأطوال 43..النهاية', { wrappedCount, secondLineStartsWithMark: broken, samples },
    'صفر: لا يُفصل الحرف عن حركته');

  // في التحويل الفعلي: «مقاطع أطول» ليدوي تايلاندي (يدوي عادي لا يُلف أصلًا)
  const lines = ['วันนี้อากาศดีมาก', 'เราจะไปเดินเล\u0E48นที\u0E48สวน', 'สาธารณะใกล้บ้านกันนะครับ'];
  const nrm = convertTrack({ body: manual(lines, 1200, 1100), trackKind: 'manual', durationMs: 6000 });
  const lng = convertTrack({ body: manual(lines, 1200, 1100), trackKind: 'manual', durationMs: 6000, mode: 'long' });
  out('١-ج. يدوي تايلاندي: عادي ثم «مقاطع أطول»',
    { normal: nrm.cues.map((c) => esc(c.text)), long: lng.cues.map((c) => esc(c.text)), longOk: lng.ok, longLineStartsWithMark: lng.cues.some((c) => lineStartsWithMark(c.text)) },
    'العادي بلا لفّ؛ والطويل ملفوف دون سطر يبدأ بحركة');
}

// ---- ٢. اليابانية NFD: هل تصل؟ وماذا يحدث في كل وضع؟ ----
{
  const nfd = `${'あ'.repeat(21)}て\u3099${'あ'.repeat(21)}`; // حالة Gemini
  out('٢-أ. هل ينظّف cleanCueText النص إلى NFC؟', { cleanedIsNFC: cleanCueText(nfd) === nfd.normalize('NFC'), cleanedKeepsNFD: cleanCueText(nfd) === nfd },
    'لا تطبيع في cleanCueText ولا في parseJson3 (النص يصل كما أرسله يوتيوب)');
  const asr = convertTrack({ body: body([asrEvent(0, 3000, [[0, nfd]])]), trackKind: 'asr', durationMs: 5000 });
  out('٢-ب. ASR عادي بنص NFD يقع الكسر عند الداكوتين', { ok: asr.ok, code: asr.code, failed: asr.invariants?.results.filter((r) => !r.ok).map((r) => [r.key, r.detail]) },
    'ok=true: الثابت يقارن بعد NFC فيجب ألا يرفض التحويل نصًا صحيحًا');
  const nfc = convertTrack({ body: body([asrEvent(0, 3000, [[0, nfd.normalize('NFC')]])]), trackKind: 'asr', durationMs: 5000 });
  out('٢-ج. الضابط: النص نفسه بصيغة NFC', { ok: nfc.ok, code: nfc.code }, 'ok=true');

  const halfA = `${'あ'.repeat(19)}て\u3099`;
  const halfB = `${'あ'.repeat(21)}`;
  const mNormal = convertTrack({ body: manual([halfA, halfB], 1500, 1400), trackKind: 'manual', durationMs: 5000 });
  const mLong2 = convertTrack({ body: manual([`${'あ'.repeat(10)}`, `${'あ'.repeat(11)}て\u3099${'あ'.repeat(21)}`], 1500, 1400), trackKind: 'manual', durationMs: 5000, mode: 'long' });
  out('٢-د. يدوي NFD: العادي (بلا لفّ) و«مقاطع أطول» (لفّ بعد الدمج)',
    { normal: [mNormal.ok, mNormal.code], longMergedBreakAtDakuten: [mLong2.ok, mLong2.code, mLong2.invariants?.results.filter((r) => !r.ok).map((r) => r.key)], longText: mLong2.cues.map((c) => esc(c.text)) },
    'العادي ناجح؛ والطويل ناجح أيضًا');
}

// ---- ٣. mergeLong: مسافة زائفة بين رقم/لاتيني وحرف CJK بعد لفّ ترجمان نفسه ----
{
  // ASR: الحدث الأول 45 محرفًا يُلف بين «2026» و«年»، والثاني بعد 500ms من نهاية الأول فيُضم في «مقاطع أطول».
  const ev1 = asrEvent(0, 3000, [[0, `${'あ'.repeat(20)}2026年${'あ'.repeat(20)}`]]);
  const ev2 = asrEvent(2000, 1500, [[0, 'いいです']]);
  const ev2b = asrEvent(2000, 1500, [[0, 'いいですねいいですね']]);
  const nrm = convertTrack({ body: body([ev1, ev2]), trackKind: 'asr', durationMs: 5000 });
  const lng = convertTrack({ body: body([ev1, ev2]), trackKind: 'asr', durationMs: 5000, mode: 'long' });
  const lngB = convertTrack({ body: body([ev1, ev2b]), trackKind: 'asr', durationMs: 5000, mode: 'long' });
  out('٣-أ. ASR: «2026年» في المصدر بلا مسافة', {
    normal: nrm.cues.map((c) => esc(c.text)),
    long: lng.cues.map((c) => esc(c.text)), longOk: lng.ok,
    longHasSpuriousSpace: lng.cues.some((c) => /2026 年/.test(c.text)),
    longWithLongerSecondCue: lngB.cues.map((c) => esc(c.text)), longBOk: lngB.ok,
    longBHasSpuriousSpace: lngB.cues.some((c) => /2026 年/.test(c.text)),
  }, 'في «مقاطع أطول» يبقى «2026年» متصلًا (أو كسر سطر لا مسافة)', 'الثوابت تجتاز لأن splitWords يعدّ «2026» و«年» وحدتين في الحالتين.');

  // يدوي: سطرا مصدر «…AI» و«技術…» بينهما كسر سطر من صاحب الترجمة.
  const m = mergeLong([{ startMs: 0, endMs: 1000, text: '最新のAI\n技術です' }, { startMs: 1100, endMs: 2000, text: '面白いですね' }]);
  out('٣-ب. يدوي: كسر سطر من المصدر بين «AI» و«技術»', m.cues.map((c) => esc(c.text)),
    'مسافة أو لا شيء — كلاهما مقبول، فالمصدر نفسه فصلهما بفاصل', 'هنا الفاصل من المصدر (كسر سطر)، فتحويله إلى مسافة ليس إدراجًا من عدم.');

  // هل تغير الوحدات؟
  out('٣-ج. وحدات الثوابت', { src: splitWords('あ2026年あ'), out: splitWords('あ2026 年あ') }, 'متطابقة (فالثابت لا يكشف المسافة)');
}
