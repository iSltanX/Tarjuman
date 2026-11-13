// وحدة اللغات (AA1): التطبيع، والأسماء من Intl، والنص والاتجاه من CLDR، ورمز اللغة من اسم الملف. لا قائمة لغات مكتوبة.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  arabicName, baseLang, describeLang, hasRtlLetter, langDirection, langFromFileName, langScript, nativeName, normalizeLang, scriptLetterPattern, textDirection, knownLanguages, searchLanguages, foldForSearch,
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
  for (const c of ['ar', 'fa', 'ur', 'he', 'iw', 'yi', 'ps', 'ug', 'dv', 'ckb']) assert.equal(langDirection(c), 'rtl', c);
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

test('رمز اللغة من اسم الملف: الصريح قبل .srt وحده، ولا تُقرأ «normal» أو «long» أو «asr» لغةً', () => {
  assert.equal(langFromFileName('talk.ja.srt'), 'ja');
  assert.equal(langFromFileName('talk.pt-BR.srt'), 'pt-BR');
  assert.equal(langFromFileName('AAAAAAAAAAA.en.manual.normal.ar.srt'), 'ar');
  assert.equal(langFromFileName('AAAAAAAAAAA.en.manual.normal.srt'), null);
  assert.equal(langFromFileName('AAAAAAAAAAA.en.asr.long.srt'), null);
  assert.equal(langFromFileName('t.xx.srt'), null, 'رمز لا يعرف المتصفح اسمه');
  assert.equal(langFromFileName('talk.srt'), null);
  assert.equal(langFromFileName(null), null);
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
