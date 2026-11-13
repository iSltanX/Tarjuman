// تدقيق Fable (FA-05، UX-01): «مثل 1.5 أو -0.5، بين -600 و600» كانت تُرسم «0.5-» و«600-» في قائمة التوقيت، ومثلها «+0.5»
// في رسالة النقل بالمحرّر: العلامة بعد حرف عربي تأخذ اتجاه السياق (UBA) ما لم يُعزل المثال LTR. الحارس عام: لا رقم موقّع
// في أي رسالة من الكتالوج إلا داخل عزل LRI…PDI.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DOMAINS, messageFor } from '../../../src/core/errors/index.js';

const LRI = String.fromCodePoint(0x2066);
const PDI = String.fromCodePoint(0x2069);
const ARABIC = /[\u0600-\u06FF]/;
// الرسائل العربية الدالّة وعيّناتها (IM_STRAY_TEXT، ع-١٢ ب؛ وPG_LANG_ASSIGN_SKIPPED بالمثنى، تحقق مستقل §١٠): تُفحص بكل صيغة، ولا دالّة خارج هذه القائمة.
const AR_FUNCTION_SAMPLES = {
  IM_STRAY_TEXT: [{ line: 7 }, { line: 7, heading: true }],
  PG_LANG_ASSIGN_SKIPPED: [{ n: 'ترجمة واحدة', count: 1 }, { n: 'ترجمتان', count: 2 }, { n: '3 ترجمات', count: 3 }],
  // الفكرة ٤ (الإنذار المبكر): تسمّي الصيغة المرفوضة إن عُرفت، وبلا اسم كما كانت.
  EX_UNSUPPORTED_FORMAT: [{}, { format: 'srv3' }, { format: 'vtt' }],
};
/** النص بعد حذف كل ما بين LRI وPDI: ما بقي يُرسم في سياق عربي. */
const outsideIsolates = (s) => s.replace(new RegExp(`${LRI}[^${PDI}]*${PDI}`, 'g'), '');
/** رقم بعلامة + أو - أو − ليس جزءًا من كلمة أو رقم قبله (فـ«U+2212» و«10-20» لا يُعدّان). */
const SIGNED = /(?<![\w\u2066])[+\-\u2212]\d/;

test('FA-05: لا رقم موقّعًا خارج عزل LTR في أي رسالة عربية من الكتالوج', () => {
  const bad = [];
  for (const d of DOMAINS) {
    for (const [code, msg] of Object.entries(d.MESSAGES)) {
      for (const text of typeof msg === 'function' ? AR_FUNCTION_SAMPLES[code].map((p) => msg(p)) : [msg]) {
        if (typeof text === 'string' && ARABIC.test(text) && SIGNED.test(outsideIsolates(text))) bad.push(`${code}: ${text}`);
      }
    }
  }
  assert.deepEqual(bad, []);
});

test('FA-05: أمثلة الإزاحة والنقل معزولة بالناقص الطباعي الذي تعرضه الشارة', () => {
  const offset = messageFor('CT_OFFSET_INVALID');
  for (const ex of ['1.5', '−0.5', '−600', '600']) assert.ok(offset.includes(`${LRI}${ex}${PDI}`), `${ex} في ${offset}`);
  const shift = messageFor('ED_SHIFT_INVALID');
  for (const ex of ['+0.5', '−1.25']) assert.ok(shift.includes(`${LRI}${ex}${PDI}`), `${ex} في ${shift}`);
});
