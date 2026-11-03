// قسم «حول» (R42، P7-AC10، وجولة الصقل): الإصدار، و«كل شيء محلي»، ودليل الاستخدام، و«ترجمان — تطوير سلطان» مع رابطي
// bysltan.com والمستودع، ونسب الخطوط المضمّنة (الترجمة وعناوين الواجهة) مع «عرض التراخيص» من ملفات الرخص المحلية. الروابط
// تُفتح بالضغط وحده في تبويب جديد (noopener)؛ لا طلب شبكة قبل الضغط ولا بعده من الصفحة.
import { el, icon, ltr } from '../../ui/components.js';
import { SUBTITLE_FONT_LIST } from '../../ui/subtitle-fonts.js';
import { UI_FONT_LIST } from '../../ui/ui-fonts.js';

/** الرابطان الخارجيان الوحيدان في الإضافة (يسمح بهما الفحص الثابت في هذا الملف وحده). */
export const LINKS = Object.freeze({ site: 'https://bysltan.com', repo: 'https://github.com/iSltanX/Tarjuman' });
/** خط عناوين الواجهة المضمّن (المراعي ملفه نفسه في خطوط الترجمة فلا يتكرر). */
const UI_HEAD_FONT = Object.freeze({ nameAr: 'القاهرة', nameLatin: 'Cairo', license: UI_FONT_LIST[0].license });

/**
 * سطر الخصوصية كما هو صحيح: البيانات كلها على الجهاز، والاستثناء الوحيد صور الفيديو في المحفوظات (i.ytimg.com بمعرّف الفيديو)
 * ما دام مفتاحها «صور الفيديو في المحفوظات» مفعّلًا (prefs.ui.thumbnails، افتراضيًا مفعّل بقرار سلطان). لا يُقال «كل شيء محلي» مطلقًا.
 */
export const PRIVACY_LINE = 'بياناتك كلها على جهازك؛ لا حسابات ولا خادم ولا مفتاح API. وصور الفيديو في المحفوظات تُطلب من خوادم يوتيوب ما دام مفتاحها مفعّلًا.';

export const GUIDE_STEPS = Object.freeze([
  'افتح فيديو على يوتيوب وفعّل الترجمة (CC) واختر English.',
  'من أزرار ترجمان في شريط تحكم المشغّل افتح «تحميل الأصل (SRT)»، ثم «تنزيل الملف» و«نسخ التعليمات» كلٌّ بزره.',
  'أرسل الملف مع التعليمات إلى أي نموذج ذكاء اصطناعي تختاره، واحفظ ناتجه ملف SRT.',
  'ارفعه بزر «رفع الترجمة العربية (SRT)» فتظهر الترجمة فوق الفيديو؛ وعدّل توقيتها بأزرار ± أو من المحرّر.',
  'تجد كل ما حفظته في «المحفوظات» من أيقونة الإضافة، وتصدّره أو تستبدله أو تحذفه من هناك.',
]);

/** @param {Document} doc @param {{ href: string, text: string }} o */
function externalLink(doc, { href, text }) {
  return el('a', {
    className: 'st-link',
    attrs: { href, target: '_blank', rel: 'noopener noreferrer' },
    children: [el('span', { text, doc }), icon('external', { doc })],
    doc,
  });
}

/** «المراعي، ونوتو سانس العربي، وتجوّل، ومركزي» */
const arabicList = (names) => names.map((n, i) => (i ? `و${n}` : n)).join('، ');

/**
 * @param {{
 *   version: string, doc?: Document, fonts?: typeof SUBTITLE_FONT_LIST,
 *   section?: (...children: HTMLElement[]) => HTMLElement
 * }} o
 */
export function aboutSection({ version, doc = document, fonts = SUBTITLE_FONT_LIST, section }) {
  const guide = el('details', {
    className: 'st-details',
    children: [
      el('summary', { className: 'st-details__summary', text: 'دليل الاستخدام', doc }),
      el('ol', { className: 'st-guide', children: GUIDE_STEPS.map((s) => el('li', { text: s, doc })), doc }),
    ],
    doc,
  });
  const licenses = el('details', {
    className: 'st-details',
    children: [
      el('summary', { className: 'st-details__summary', text: 'عرض التراخيص', doc }),
      el('ul', {
        className: 'st-licenses',
        attrs: { role: 'list' },
        children: [...fonts, UI_HEAD_FONT].map((f) => el('li', {
          // ملف الرخصة داخل الإضافة نفسها: رابط نسبي من pages/settings/ بلا شبكة.
          children: [el('a', { className: 'st-link', attrs: { href: `../../${f.license}`, target: '_blank', rel: 'noopener noreferrer' }, children: [el('span', { text: `${f.nameAr} · ${f.nameLatin} — SIL OFL 1.1`, doc }), icon('external', { doc })], doc })],
          doc,
        })),
        doc,
      }),
    ],
    doc,
  });
  const body = [
    el('div', { className: 'st-about__row', children: [el('span', { className: 'tj-label', text: 'الإصدار', doc }), ltr(version, { doc })], doc }),
    el('p', { className: 'tj-body-sm', text: PRIVACY_LINE, doc }),
    guide,
    el('hr', { className: 'tj-rule', doc }),
    el('p', { className: 'tj-label', text: 'ترجمان — تطوير سلطان', doc }),
    el('div', {
      className: 'st-about__links',
      children: [
        externalLink(doc, { href: LINKS.site, text: 'bysltan.com' }),
        externalLink(doc, { href: LINKS.repo, text: 'المستودع على GitHub' }),
      ],
      doc,
    }),
    el('p', { className: 'tj-caption', text: `خطوط الترجمة المضمّنة لأصحابها، برخصة SIL Open Font License 1.1: ${arabicList(fonts.map((f) => f.nameAr))}. وعناوين الواجهة بخط ${UI_HEAD_FONT.nameAr} (${UI_HEAD_FONT.nameLatin}) بالرخصة نفسها.`, doc }),
    licenses,
  ];
  if (section) return section(el('div', { className: 'st-about', children: body, doc }));
  return el('section', {
    className: 'st-section st-about',
    attrs: { 'aria-labelledby': 'st-about-title' },
    children: [el('h2', { className: 'tj-h2', text: 'حول', attrs: { id: 'st-about-title' }, doc }), ...body],
    doc,
  });
}
