// وحدة اللغات (AA1): التطبيع، والأسماء من Intl، والنص والاتجاه من CLDR، ورمز اللغة من اسم الملف. لا قائمة لغات مكتوبة.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  arabicName, baseLang, describeLang, hasRtlLetter, langDirection, langFromFileName, langScript, langScripts, nativeName, normalizeLang, scriptLetterPattern, textDirection, textFitsLang, knownLanguages, searchLanguages, foldForSearch,
} from '../../../src/core/lang/index.js';

test('التطبيع: الحالة والشرطة بقواعد BCP-47، واللغة كما وردت (iw يبقى iw)، وغير الصالح null', () => {
  assert.equal(normalizeLang('en'), 'en');
  assert.equal(normalizeLang('EN_us'), 'en-US');
  assert.equal(normalizeLang('zh-hant'), 'zh-Hant');
  assert.equal(normalizeLang('iw'), 'iw');
  assert.equal(normalizeLang(' pt-br '), 'pt-BR');
  for (const bad of ['', 'und', 'zxx', 'mul', 'a.en', 'e', '12', 'en--x', 'x'.repeat(40), null, undefined, 3]) assert.equal(normalizeLang(bad), null, String(bad));
  assert.equal(baseLang('en-GB'), 'en');
});

test('النص والاتجاه من بيانات المتصفح: العربية والفارسية والأردية والعبرية والثانا RTL، والبقية LTR، والمجهول null', () => {
  // ug خرجت من القائمة (ن-٥): تُكتب بالسيريلية واللاتينية أيضًا، فاتجاهها من نصها.
  for (const c of ['ar', 'fa', 'ur', 'he', 'iw', 'yi', 'ps', 'dv', 'ckb']) assert.equal(langDirection(c), 'rtl', c);
  for (const c of ['en', 'ja', 'zh-Hant', 'ko', 'ru', 'hi', 'th', 'tr', 'en-orig']) assert.equal(langDirection(c), 'ltr', c);
  assert.equal(langDirection('xx'), null);
  assert.equal(langScript('ja'), 'Jpan');
  assert.equal(langScript('sr'), 'Cyrl');
  assert.equal(langScript('en-orig'), 'Latn', 'Orig ليس نصًا: تُؤخذ اللغة الأساسية');
});

test('اتجاه السطر: بلغته إن عُرفت، وإلا RTL لأي حرف من نص يُكتب من اليمين ولو بدأ بلاتينية', () => {
  assert.equal(textDirection('API هو الواجهة'), 'rtl');
  assert.equal(textDirection('שלום world'), 'rtl', 'العبرية لا العربية وحدها');
  assert.equal(textDirection('hello'), 'ltr');
  assert.equal(textDirection('١٢٣'), 'ltr', 'الأرقام العربية الهندية ليست حروفًا');
  // القرار ١٨ (ت-٣): في لغة تُكتب من اليمين، السطر الخالي من حروفها LTR (CL-002)، وما فيه حرف منها RTL ولو بدأ بلاتينية.
  assert.equal(textDirection('hello', 'ar'), 'ltr');
  assert.equal(textDirection('OK!', 'ar'), 'ltr', 'لا يُقلب ترقيمه «!OK»');
  assert.equal(textDirection('API هو الواجهة', 'ar'), 'rtl');
  assert.equal(textDirection('2026', 'he'), 'ltr');
  assert.equal(textDirection('שלום', 'he'), 'rtl');
  assert.equal(textDirection('مرحبا', 'en'), 'ltr', 'اللغة المعروفة أقوى من الحروف');
  assert.equal(textDirection('مرحبا', 'xx'), 'rtl', 'لغة لا يُعرف نصها: الحروف');
  assert.equal(hasRtlLetter('ب'), true);
  assert.equal(hasRtlLetter('abc ١٢'), false);
});

test('حرف نص اللغة: اليابانية بالكانا والكانجي، والعربية بالحروف لا الأرقام، والمجهول null', () => {
  assert.equal(scriptLetterPattern('ja').test('こんにちは'), true);
  assert.equal(scriptLetterPattern('ja').test('漢字'), true);
  assert.equal(scriptLetterPattern('ja').test('hello'), false);
  assert.equal(scriptLetterPattern('ar').test('٣٤'), false);
  assert.equal(scriptLetterPattern('ar').test('ب'), true);
  assert.equal(scriptLetterPattern('ko').test('한국어'), true);
  assert.equal(scriptLetterPattern('xx'), null);
});

test('الأسماء: بالعربية وبلغتها من Intl، والمجهول null، والوصف بالرمز حين لا اسم', () => {
  assert.equal(arabicName('en'), 'الإنجليزية');
  assert.equal(arabicName('en-GB', { region: false }), 'الإنجليزية');
  assert.equal(arabicName('ja'), 'اليابانية');
  assert.equal(arabicName('en-orig'), 'الإنجليزية', 'لا شظية لاتينية');
  assert.equal(arabicName('xx'), null);
  assert.equal(nativeName('ja'), '日本語');
  assert.equal(nativeName('he'), 'עברית');
  assert.equal(nativeName('xx'), null);
  assert.deepEqual(describeLang('es'), { code: 'es', arabic: 'الإسبانية', name: 'الإسبانية', native: 'español', dir: 'ltr', known: true });
  assert.deepEqual(describeLang('xx'), { code: 'xx', arabic: 'xx', name: 'xx', native: null, dir: null, known: false });
  assert.equal(describeLang('und'), null);
});

test('رمز اللغة من اسم الملف: الصريح قبل .srt أو .vtt وحده، ولا تُقرأ «normal» أو «long» أو «asr» لغةً', () => {
  assert.equal(langFromFileName('talk.ja.srt'), 'ja');
  assert.equal(langFromFileName('talk.pt-BR.srt'), 'pt-BR');
  assert.equal(langFromFileName('AAAAAAAAAAA.en.manual.normal.ar.srt'), 'ar');
  assert.equal(langFromFileName('AAAAAAAAAAA.en.manual.normal.srt'), null);
  assert.equal(langFromFileName('AAAAAAAAAAA.en.asr.long.srt'), null);
  assert.equal(langFromFileName('t.xx.srt'), null, 'رمز لا يعرف المتصفح اسمه');
  assert.equal(langFromFileName('talk.srt'), null);
  assert.equal(langFromFileName(null), null);
  // وWebVTT الذي يصدّره ترجمان يعود بلغته (تحقق 2.3.0، ص-١٤)، ولا امتداد غيرهما.
  assert.equal(langFromFileName('AAAAAAAAAAA.ar.vtt'), 'ar');
  assert.equal(langFromFileName('AAAAAAAAAAA.ar.dual-en.VTT'), 'ar');
  assert.equal(langFromFileName('talk.ja.txt'), null);
});

test('رمز الاسم بنص الملف (ع-٨): يُقبل إن وافق نص الملف نص كتابة لغته، فلا تصير كلمة من الاسم لغةً بنص آخر', () => {
  const cues = (text) => [{ text }, { text }];
  const ar = cues('مرحبًا بكم في هذا الدرس');
  const en = cues('Let it be, whisper words of wisdom');
  const ja = cues('こんにちは、今日は日本語の授業です');
  // is الآيسلندية وbe البيلاروسية وno النرويجية من كلمات الاسم، والملف ترجمة عربية.
  for (const name of ['what.it.is.srt', 'let.it.be.srt', 'say.no.srt']) assert.equal(langFromFileName(name, ar), null, name);
  assert.equal(langFromFileName('let.it.be.srt', en), null, 'be بالكيريلية ونص الملف لاتيني');
  assert.equal(langFromFileName('all.my.srt', en), null, 'my بالميانمارية');
  // الرمز الصريح الموافق نص الملف يبقى.
  assert.equal(langFromFileName('talk.ar.srt', ar), 'ar');
  assert.equal(langFromFileName('talk.ja.srt', ja), 'ja');
  assert.equal(langFromFileName('talk.ja.srt', ar), null);
  // بلا نص (اسم وحده) أو نص بلا حروف: الاسم وحده كما كان.
  assert.equal(langFromFileName('talk.ja.srt'), 'ja');
  assert.equal(langFromFileName('talk.ja.srt', cues('12 34')), 'ja');
  // حد معلن: النص لا يميّز لغتين بالكتابة نفسها (الإنجليزية والآيسلندية لاتينيتان)، واللغة لا تُخمَّن من النص.
  assert.equal(langFromFileName('what.it.is.srt', en), 'is');
  assert.equal(langFromFileName('say.no.srt', en), 'no');
});

test('كل اللغات من المتصفح (AA3): رموز ISO الثنائية التي يعرف اسمها العربي، بلا رمز قديم مكرر، مرتبة بالاسم بلا «ال»', () => {
  const all = knownLanguages();
  assert.ok(all.length > 150, `عدد اللغات ${all.length}`);
  const codes = all.map((l) => l.code);
  assert.ok(codes.includes('en') && codes.includes('ar') && codes.includes('ja') && codes.includes('he') && codes.includes('ur'));
  assert.equal(codes.includes('iw'), false, 'iw رمز قديم للعبرية');
  assert.equal(new Set(codes).size, codes.length);
  assert.ok(all.every((l) => l.arabic && !/[A-Za-z]/.test(l.arabic)));
  assert.equal(all.find((l) => l.code === 'he').dir, 'rtl');
  assert.equal(knownLanguages(), all, 'تُحسب مرة');
  assert.equal(foldForSearch('الإنجليزيّة'), 'انجليزيه');
});

test('البحث عن لغة: بالاسم العربي بلا همزة ولا «ال»، وبالاسم الأصلي، وبالرمز أولًا، والرمز المكتوب بلهجته', () => {
  assert.equal(searchLanguages('انجليزي')[0].code, 'en');
  assert.equal(searchLanguages('en')[0].code, 'en');
  assert.equal(searchLanguages('日本')[0].code, 'ja');
  assert.equal(searchLanguages('اردو')[0].code, 'ur');
  assert.equal(searchLanguages('pt-BR')[0].code, 'pt-BR');
  assert.equal(searchLanguages('zh-Hant')[0].code, 'zh-Hant');
  assert.equal(searchLanguages('deu').filter((l) => l.code === 'deu').length, 0, 'الرمز البديل لا يكرر الألمانية');
  assert.deepEqual(searchLanguages('qqqq'), []);
  assert.equal(searchLanguages('').length, knownLanguages().length);
});

test('AV2 U-005: الوسوم المركبة القديمة لا تُطوى إلى أساسها العام، والرموز المعتادة كما هي', () => {
  assert.notEqual(normalizeLang('zh-hakka'), 'zh');
  assert.equal(normalizeLang('zh-hakka'), 'hak');
  assert.equal(normalizeLang('zh-xiang'), 'hsn');
  assert.equal(normalizeLang('art-lojban'), 'jbo');
  assert.equal(normalizeLang('iw'), 'iw');
  for (const c of ['zh-Hant', 'es-419', 'fil', 'en-GB', 'pt-BR']) assert.equal(normalizeLang(c), c, c);
});

test('تحقق الجولة الثانية (ن-٥): الرمز الصحيح بكتابته البديلة يبقى لغة الملف، وغرض ع-٨ باقٍ', () => {
  const cues = (text) => [{ text }, { text }];
  const keep = [
    ['talk.sr.srt', 'Dobar dan, kako ste?', 'sr'], ['talk.sr.srt', 'Добар дан, како сте?', 'sr'], ['talk.bs.srt', 'Добар дан', 'bs'],
    ['talk.pa.srt', 'ست سری اکال', 'pa'], ['talk.pa.srt', 'ਸਤ ਸ੍ਰੀ ਅਕਾਲ', 'pa'], ['talk.uz.srt', 'Салом дунё', 'uz'], ['talk.uz.srt', 'Salom dunyo', 'uz'],
    ['talk.ku.srt', 'سڵاو، چۆنی؟', 'ku'], ['talk.ku.srt', 'Silav, tu çawa yî?', 'ku'], ['talk.ms.srt', 'سلامت ڤاڬي', 'ms'], ['talk.ms.srt', 'Selamat pagi', 'ms'],
    ['talk.az.srt', 'Салам дүнја', 'az'], ['talk.az.srt', 'سلام دونیا', 'az'], ['talk.kk.srt', 'Sälem älem', 'kk'], ['talk.kk.srt', 'Сәлем әлем', 'kk'],
    ['talk.tk.srt', 'Салам дүнйә', 'tk'], ['talk.mn.srt', 'ᠮᠣᠩᠭᠣᠯ ᠬᠡᠯᠡ', 'mn'], ['talk.sd.srt', 'सिन्धी भाषा', 'sd'], ['talk.ks.srt', 'कॉशुर', 'ks'],
    ['talk.ha.srt', 'سَنُ دَ زُوَا', 'ha'], ['talk.ug.srt', 'Уйғур тили', 'ug'], ['talk.tt.srt', 'Tatar tele', 'tt'],
  ];
  for (const [name, text, code] of keep) assert.equal(langFromFileName(name, cues(text)), code, `${name}: ${text}`);
  // الكتابة الصريحة في الرمز تُحكم بها وحدها.
  assert.equal(langFromFileName('talk.sr-Latn.srt', cues('Добар дан')), null);
  assert.equal(langFromFileName('talk.pa-Arab.srt', cues('ست سری اکال')), 'pa-Arab');
  // غرض ع-٨: كلمة من الاسم لا تصير لغة بنص آخر.
  const ar = cues('مرحبًا بكم في هذا الدرس');
  const en = cues('Let it be, whisper words of wisdom');
  for (const name of ['what.it.is.srt', 'let.it.be.srt', 'say.no.srt', 'go.to.srt']) assert.equal(langFromFileName(name, ar), null, name);
  assert.equal(langFromFileName('let.it.be.srt', en), null, 'be بلا لاتينية');
  assert.equal(langFromFileName('talk.sr.srt', ar), null, 'العربية ليست من كتابات الصربية');
});

test('تحقق الجولة الثانية (ن-٥): لغة كتاباتها من الاتجاهين يحسم نصُّها اتجاهَ السطر، واسمها الأصلي باتجاه كتابتها المرجحة', () => {
  for (const c of ['pa', 'sd', 'ks', 'ku', 'ms', 'uz', 'az', 'kk', 'ha', 'ug']) assert.equal(langDirection(c), null, c);
  for (const c of ['sr', 'bs', 'mn', 'tk', 'pa-Guru', 'sr-Latn']) assert.equal(langDirection(c), 'ltr', c);
  assert.equal(langDirection('pa-Arab'), 'rtl');
  assert.equal(textDirection('ست سری اکال', 'pa'), 'rtl', 'البنجابية بالشاهمكهية');
  assert.equal(textDirection('ਸਤ ਸ੍ਰੀ ਅਕਾਲ', 'pa'), 'ltr');
  assert.equal(textDirection('سڵاو', 'ku'), 'rtl', 'الكردية السورانية');
  assert.equal(textDirection('Silav', 'ku'), 'ltr');
  assert.equal(textDirection('OK!', 'sd'), 'ltr', 'القرار ١٨ كما كان للغة RTL المرجحة');
  assert.equal(textDirection('سنڌي', 'sd'), 'rtl');
  assert.equal(describeLang('pa').dir, 'ltr', 'اسمها الأصلي بالكرمكهية');
  assert.equal(describeLang('sd').dir, 'rtl');
  assert.equal(describeLang('ug').dir, 'rtl');
});

test('تحقق 2.3.0 (ص-١٢، ن-٥): الرمز الذي كتابته البديلة اللاتينية كلمة شائعة في أسماء الملفات لا يُقرأ من اسم ملف لاتيني، وبقية كتاباته كما هي', () => {
  const cues = (text) => [{ text }, { text }];
  const en = cues('This is plain English text');
  // sat كلمة إنجليزية، وvai كلمة إيطالية وبرتغالية: كان what.we.sat.srt سانتاليًا وchi.vai.srt «فاي».
  assert.equal(langFromFileName('what.we.sat.srt', en), null);
  assert.equal(langFromFileName('chi.vai.srt', en), null);
  assert.equal(langFromFileName('chi.vai.srt', cues('Che bello, andiamo')), null);
  // وكتاباتهما الأخرى تُقبل من الاسم، والرمز بكتابة صريحة تُحكم بها.
  assert.equal(langFromFileName('talk.sat.srt', cues('ᱥᱟᱱᱛᱟᱲᱤ ᱯᱟᱹᱨᱥᱤ')), 'sat');
  assert.equal(langFromFileName('talk.sat.srt', cues('संताली भाषा')), 'sat');
  assert.equal(langFromFileName('talk.vai.srt', cues('ꕙꔤ ꕞꕌꔳ')), 'vai');
  assert.equal(langFromFileName('talk.sat-Latn.srt', en), 'sat-Latn');
  // واللاتينية باقية من كتاباتهما لغيره: «إلى» المختارة (textFitsLang) واتجاه السطر وفحص «غير مترجم».
  assert.ok(langScripts('sat').includes('Latn') && langScripts('vai').includes('Latn'));
  assert.equal(textFitsLang(en, 'sat'), true);
  // والصربية باللاتينية (ن-٥) كما هي.
  assert.equal(langFromFileName('talk.sr.srt', cues('Dobar dan, kako ste?')), 'sr');
});

test('تحقق 2.3.0 (ص-١٢، ن-٥): ملف بنص عربي يُقرأ من اسمه بتسعة رموز كتابتها المرجحة غير العربية، كلها لغات تُكتب بالعربية اليوم', () => {
  // الواقع المسجَّل في القيود ونموذج البيانات: az وff وha وkk وku وky وms وpa وuz (الأذرية في إيران، والفولانية والهوسا بالعجمية،
  // والكازاخية والقيرغيزية في الصين، والكردية السورانية، والملايوية بالجاوية، والبنجابية بالشاهمكهية، والأوزبكية في أفغانستان).
  const ar = [{ text: 'هذا نص عربي واضح للاختبار' }, { text: 'وسطر ثانٍ بالعربية أيضًا' }];
  const read = knownLanguages().map((l) => l.code).filter((c) => langScript(c) !== 'Arab' && langFromFileName(`talk.${c}.srt`, ar) === c);
  assert.deepEqual(read.sort(), ['az', 'ff', 'ha', 'kk', 'ku', 'ky', 'ms', 'pa', 'uz']);
});
