// حساب تخطيط بلا متصفح من قيم editor.css وvirtual.js في 7a66f91 (H-1 وCL-X8 وP-8 وCDX-N3). ارتفاعات الرأس والشريط وسطر
// الإزاحة مقيسة من لقطات Claude الحية (E1-editor-860x768*.png) لأنها تتبع التفاف المحتوى؛ والباقي من CSS نصًا.
import { ROOT, log } from './harness.mjs';
import { readFileSync } from 'node:fs';

const css = readFileSync(`${ROOT}/src/pages/editor/editor.css`, 'utf8');
const { ROW, rowHeight } = await import(`${ROOT}/src/pages/editor/virtual.js`);
const pick = (re) => (css.match(re) ?? [null, '?'])[1];
log('من editor.css:', {
  bodyOverflow: pick(/body\.ed-page \{ overflow: (\w+)/),
  under900Rows: pick(/@media \(max-width: 900px\) \{\s*\.ed-body \{[^}]*grid-template-rows: ([^;]+);/),
  edTimeWidth: pick(/\.ed-time \{\s*width: (\d+px)/),
  cols1100: pick(/@media \(max-width: 1100px\) \{\s*\.tj-container\.ed-app \{\s*--ed-cols: ([^;]+);/),
  searchWidth: pick(/\.ed-search__input \{\s*width: (\d+px)/),
});
const row = rowHeight({ type: 'cue', lines: 2 });
log('ارتفاع صف بسطرين (virtual.js):', row, 'px | ROW =', JSON.stringify(ROW));

// H-1: تحت 900px. الرأس+الشريط+سطر الإزاحة = 323px عند عرض 860 (لقطة نظيفة)، وشريط القائمة 33 ورأسها 43، وحشو الجسم 12 والفجوة 16.
// المتسخ: الرأس يلتف (+42 في اللقطة) وشريط «غير محفوظ» 12+52+16 = 80.
for (const [w, h] of [[860, 900], [860, 768], [860, 700], [768, 700], [683, 650]]) {
  const chrome = 323; // مقيس عند 860؛ أضيق من ذلك يلتف أكثر فيزيد
  const side = Math.round(0.3 * h);
  const clean = h - chrome - 12 - side - 16 - 33 - 43;
  const dirty = clean - 80 - 42;
  log(`H-1 ${w}×${h}: اللوحة الجانبية ${side}px أولًا، وارتفاع القائمة ≈ ${clean}px (${(clean / row).toFixed(2)} صف) نظيفًا، و${Math.max(0, dirty)}px (${Math.max(0, dirty / row).toFixed(2)} صف) بعد أول تعديل${w < 860 ? ' (والرأس أطول فعليًا لالتفاف أكثر)' : ''}`);
}

// CL-X8: تحت 1100 عمودا الزمن 112 والحقل 128 والفجوة 10.
log('CL-X8: فيض حقل الزمن عن عموده =', 128 - 112, 'px، يتجاوز الفجوة (10) بـ', 128 - 112 - 10, 'px فوق العمود التالي (حقل النهاية ثم عمود المدة 36px)');

// P-8: عرض حقل النص بحسب عرض النافذة والعمود الإنجليزي ظاهر (> 1100px).
const textareaWidth = (W, en = true) => {
  const side = W <= 1100 ? 240 : W <= 1180 ? 260 : 300;
  const pad = W <= 1100 ? 32 : 48;
  const main = W - pad - side - 16;
  const rowContent = main - 2 - 24;
  if (W <= 1100) return null;
  const fixed = en ? 28 + 52 + 128 + 128 + 40 + 108 + 7 * 10 : 28 + 52 + 128 + 128 + 40 + 108 + 6 * 10;
  const fr = rowContent - fixed;
  return en ? (fr * 1.5) / 2.5 : fr;
};
const PX_PER_CHAR = 6.7; // مقيس من لقطة 1280×720: «كان الأمر رائعًا، أليس كذلك؟» (27 محرفًا) ≈ 180px بخط 16px
for (const W of [1180, 1280, 1366, 1440, 1920]) {
  const t = textareaWidth(W);
  const content = t - 22;
  log(`P-8 عرض ${W}: حقل النص ≈ ${t.toFixed(0)}px (المحتوى ${content.toFixed(0)}px ≈ ${Math.floor(content / PX_PER_CHAR)} محرفًا في السطر المرئي)؛ سطرا 42 محرفًا (حد maxLineChars) ⇒ ${2 * Math.ceil(42 * PX_PER_CHAR / content)} أسطر مرئية في حقل بارتفاع سطرين`);
}

// CDX-N3: عند 360px: صندوق البحث inline-flex لا يلتف = 280 + 4 + زر «الخيارات» (10+10 + نص 13px نحو 46) ، وحشو الشريط 24×2.
const opts = 10 + 10 + 46;
log('CDX-N3: أدنى عرض لصف البحث =', 280 + 4 + opts, 'px + حشو 48 =', 280 + 4 + opts + 48, 'px مقابل 398 مقيسة لدى Codex؛ والجسم overflow:hidden فلا تمرير أفقي للصفحة.');
