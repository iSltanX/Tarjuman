// TJ-02 (DeepSeek UI-004): المحرّر عند التكبير وفي النوافذ القصيرة. حساب بلا متصفح من editor.css وvirtual.js في 7a66f91،
// مع نقطتي قياس حيتين من DeepSeek (18-editor-zoom.json): أعلى القائمة 378px عند عرض 960 و1280، و510px عند 683.
import { ROOT, log } from './harness.mjs';
import { readFileSync } from 'node:fs';

const css = readFileSync(`${ROOT}/src/pages/editor/editor.css`, 'utf8');
const { rowHeight } = await import(`${ROOT}/src/pages/editor/virtual.js`);
const pick = (re) => (css.match(re) ?? [null, '؟'])[1];
log('من editor.css:', {
  htmlBody: pick(/(html, body\.ed-page \{ height: [^;]+;)/),
  bodyOverflow: pick(/body\.ed-page \{ overflow: (\w+)/),
  appHeight: pick(/max-width: none; margin: 0; padding: 0; gap: 0; (height: [^;]+);/),
  appRows: pick(/display: grid; (grid-template-rows: auto auto auto auto minmax\(0, 1fr\) auto);/),
  under900: pick(/@media \(max-width: 900px\) \{\s*\.ed-body \{[^}]*(grid-template-rows: [^;]+);/),
  maxHeightMedia: /@media[^{]*max-height/.test(css) ? 'موجود' : 'لا يوجد أي @media (max-height…)',
  unsavedMargin: pick(/\.ed-unsaved \{\s*[^}]*?(margin: [^;]+;)/),
  unsavedPadding: pick(/\.ed-unsaved \{\s*[^}]*?(padding: [^;]+;)/),
});
const ROW = rowHeight({ type: 'cue', lines: 2 });
// شريط «غير محفوظ» (يظهر مع أول تعديل): هامش 12+16، وحشو 10+10، وأزرار sm بارتفاع 32 ⇒ 80px.
const UNSAVED = 12 + 16 + 10 + 10 + 32;
log('ارتفاع الصف بسطرين =', ROW, 'px | شريط «غير محفوظ» ≈', UNSAVED, 'px');

// أعلى القائمة (الرأس + الشريط + سطر الإزاحة + حشو الجسم + شريط القائمة ورأسها، واللوحة الجانبية تحت 900):
// مقيس حيًا لدى DeepSeek: 378 عند 960 و1280 (لا التفاف إضافي بينهما)، و510 عند 683 (التفاف + اللوحة الجانبية 30vh فوق القائمة).
const listTop = (w) => (w <= 900 ? null : 378);
// الارتفاع الداخلي للنافذة: الشاشة ناقص نحو 128px (شريط المهام وواجهة المتصفح)، كما افترض DeepSeek (768→640، 1080→950).
const cases = [
  ['1366×768 بتكبير 100%', 1366, 640],
  ['1366×768 بتكبير 125%', 1093, 512],
  ['1366×768 بتكبير 150%', 911, 427],
  ['1366×768 بتكبير 200% (حي لدى DeepSeek)', 683, 320],
  ['1280×720 بتكبير 100%', 1280, 592],
  ['1920×1080 بتكبير 150%', 1280, 635],
  ['1920×1080 بتكبير 200% (حي لدى DeepSeek)', 960, 475],
  ['1280×1024 بتكبير 400% (معيار 1.4.10)', 320, 224],
];
for (const [label, w, h] of cases) {
  if (w <= 900) {
    const top = w === 683 ? 510 : null;
    log(`${label} ⇒ ${w}×${h} CSS: تحت 900، اللوحة الجانبية ${Math.round(0.3 * h)}px فوق القائمة${top ? `، وأعلى القائمة ${top} (حي) > ${h}` : ''} ⇒ القائمة 0px (0 صف)، والصفحة لا تُمرَّر (overflow:hidden)`);
    continue;
  }
  const clean = Math.max(0, h - listTop(w) - 1);
  const dirty = Math.max(0, clean - UNSAVED);
  log(`${label} ⇒ ${w}×${h} CSS: القائمة ≈ ${clean}px (${(clean / ROW).toFixed(2)} صف) نظيفًا، و≈ ${dirty}px (${(dirty / ROW).toFixed(2)} صف) بعد أول تعديل`);
}
log('ملاحظة: عند 960×475 قاس DeepSeek listHeight=96 (الحساب 96)، و«rowsVisible: 2» يعدّ الصف المقصوص جزئيًا: صف كامل وشريحة 14px.');
