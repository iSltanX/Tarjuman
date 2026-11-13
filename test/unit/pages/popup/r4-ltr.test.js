// الجولة الرابعة (بند سلطان): «ترجمة بلغة ‹رمز›» في بطاقة النافذة للرمز الذي لا يعرف المتصفح اسمه: الرمز معزول LTR داخل الجملة
// العربية (xx-YY لا تنتقل شرطته ولا يقرأ أوله اتجاهًا للسطر).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { describeStatus } from '../../../../src/pages/popup/status.js';

const LRI = String.fromCodePoint(0x2066);
const PDI = String.fromCodePoint(0x2069);
const reply = (lang) => ({
  v: 1, ok: true, watch: true, videoId: 'iG9CE55wbtY', title: 'عنوان تجريبي', loading: false,
  english: { captured: [], saved: [] }, arabic: { fileName: 'x.srt', cueCount: 3, edited: false, matched: true, lang },
  view: { displayOffsetMs: 0, displayMode: 'ar' }, mounted: { overlay: 'mounted', controls: 'mounted' },
});

test('«ترجمة بلغة ‹رمز›»: الرمز المجهول معزول LTR، والمعروف باسمه بلا عزل', () => {
  for (const code of ['xx-YY', 'qaa']) {
    const line = describeStatus(reply(code)).line;
    assert.ok(line.startsWith(`ترجمة بلغة ${LRI}${code}${PDI} · 3 مقاطع`), line);
  }
  assert.ok(describeStatus(reply('ar')).line.startsWith('ترجمة بالعربية · 3 مقاطع'));
});
