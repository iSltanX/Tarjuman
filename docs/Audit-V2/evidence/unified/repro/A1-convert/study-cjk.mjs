// A1 — التحقق من Gemini F-18: buildStudyText يصل نصوص CJK بمسافات، وSENTENCE_END في study.js أضيق من convert/text.js.
// الاستعمال: command node study-cjk.mjs <جذر الشيفرة>
// لا متصفح ولا شبكة ولا كتابة. كل حالة تطبع «الفعلي» و«المتوقع».
const R = process.argv[2];
if (!R) throw new Error('مرّر جذر الشيفرة وسيطًا أول');
const { buildStudyText } = await import(`${R}/src/core/export/study.js`);
const { endsSentence } = await import(`${R}/src/core/convert/text.js`);
const { VIDEO_ID } = await import(`${R}/test/helpers/fixtures.js`);

const out = (title, actual, expected, note) => {
  console.log(`\n## ${title}`);
  console.log('الفعلي:', JSON.stringify(actual));
  console.log('المتوقع:', JSON.stringify(expected));
  if (note) console.log('ملاحظة:', note);
};
const cues = (texts) => texts.map((text, i) => ({ n: i + 1, startMs: i * 1000, endMs: i * 1000 + 900, text }));
const paras = (s) => s.text.split('\n').filter((l) => !/^\[\d/.test(l) && l !== '' && !l.startsWith('https://') && l !== 'T');

// ١. ترجمة يابانية (لغة الهدف ja): 12 مقطعًا ينتهي كل منها بـ。
{
  const ja = buildStudyText({ videoId: VIDEO_ID, title: 'T', cues: cues(Array.from({ length: 12 }, (_, i) => `文${i + 1}です。`)), format: 'txt', lang: 'ja' });
  const ar = buildStudyText({ videoId: VIDEO_ID, title: 'T', cues: cues(Array.from({ length: 12 }, (_, i) => `جملة ${i + 1}.`)), format: 'txt', lang: 'ar' });
  out('١. فقرات 12 مقطعًا ينتهي كل منها بنهاية جملة', { ja: paras(ja), arControl: paras(ar) },
    'فقرتان من ستة مقاطع في الحالتين، والياباني موصول بلا مسافة («文1です。文2です。…»)');
}

// ٢. كسر سطر داخل مقطع ياباني، ونص ثنائي بأصل ياباني
{
  const one = buildStudyText({ videoId: VIDEO_ID, title: 'T', cues: cues(['今日は\nいい天気です。']), format: 'txt', lang: 'ja' });
  const bi = buildStudyText({
    videoId: VIDEO_ID, title: 'T', cues: cues(['اليوم', 'الطقس جميل']), english: cues(['今日は', 'いい天気です。']), format: 'txt', bilingual: true, lang: 'ar', sourceLang: 'ja',
  });
  out('٢. سطر داخل مقطع، وسطر الأصل الياباني في النص الثنائي', { oneCue: paras(one), bilingualSourceLine: paras(bi)[1] },
    '«今日はいい天気です。» و«今日はいい天気です。» بلا مسافة');
}

// ٣. علامات نهاية الجملة: study.js مقابل convert/text.js
{
  const marks = { '。': '文です。', '！': '本当！', '？': '本当？', 'दंड ।': 'यह ठीक है।', 'أردية ۔': 'یہ ٹھیک ہے۔', 'لاتيني .': 'Done.' };
  const STUDY = /[.!?؟…]["'”’»)\]]*$/u; // نسخة حرفية من study.js:44 للمقارنة
  out('٣. هل تُعدّ نهاية جملة؟', Object.fromEntries(Object.entries(marks).map(([k, t]) => [k, { studyJs: STUDY.test(t), convertTextJs: endsSentence(t) }])),
    'كلاهما true لكل علامة نهاية جملة', '۔ (U+06D4) غائبة عن الاثنين، خلافًا لما يذكره Gemini عن text.js.');
}

// ٤. توصية Gemini (استيراد endsSentence من text.js) تُسقط «…» التي تعدّها study.js نهاية جملة اليوم
{
  const STUDY = /[.!?؟…]["'”’»)\]]*$/u; // study.js:44
  out('٤. علامة الحذف «…»', { studyJs: STUDY.test('ثم قال…'), convertTextJs: endsSentence('ثم قال…') },
    'الإصلاح يحفظ «…» نهاية جملة كما هي اليوم في النص الدراسي', 'استبدال التعبير بـendsSentence كما هو يغيّر فقرات العربية والإنجليزية المنتهية بـ«…».');
}
