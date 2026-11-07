// وحدة اللغات (AA1): التطبيع، والأسماء من Intl، والنص والاتجاه من CLDR، ورمز اللغة من اسم الملف. لا قائمة لغات مكتوبة.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  arabicName, baseLang, describeLang, hasRtlLetter, langDirection, langFromFileName, langScript, nativeName, normalizeLang,
  sameBaseLang, scriptLetterPattern, textDirection,
} from '../../../src/core/lang/index.js';

test('التطبيع: الحالة والشرطة بقواعد BCP-47، واللغة كما وردت (iw يبقى iw)، وغير الصالح null', () => {
  assert.equal(normalizeLang('en'), 'en');
  assert.equal(normalizeLang('EN_us'), 'en-US');
  assert.equal(normalizeLang('zh-hant'), 'zh-Hant');
  assert.equal(normalizeLang('iw'), 'iw');
  assert.equal(normalizeLang(' pt-br '), 'pt-BR');
  for (const bad of ['', 'und', 'zxx', 'mul', 'a.en', 'e', '12', 'en--x', 'x'.repeat(40), null, undefined, 3]) assert.equal(normalizeLang(bad), null, String(bad));
  assert.equal(baseLang('en-GB'), 'en');
  assert.equal(sameBaseLang('en', 'en-GB'), true);
  assert.equal(sameBaseLang('en', 'es'), false);
  assert.equal(sameBaseLang(null, null), false);
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
  assert.equal(textDirection('hello', 'ar'), 'rtl');
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
  assert.deepEqual(describeLang('es'), { code: 'es', arabic: 'الإسبانية', native: 'español', dir: 'ltr', known: true });
  assert.deepEqual(describeLang('xx'), { code: 'xx', arabic: 'xx', native: null, dir: null, known: false });
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
