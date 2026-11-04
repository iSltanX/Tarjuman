// قسم «حول» (R42، P7-AC10، وجولة الصقل): الإصدار، و«كل شيء محلي»، ودليل الاستخدام، و«الإبلاغ عن مشكلة» (جولة النشر T2.1،
// report.js)، و«ترجمان — تطوير سلطان» مع رابطي bysltan.com و«الدعم والخصوصية» (قرار T4 بعد نشر صفحة الدعم في T7)، ونسب الخطوط المضمّنة (الترجمة وعناوين الواجهة) وأيقونات
// Lucide مع «عرض التراخيص» من ملفات الرخص المحلية وملف إشعارات الأطراف الثالثة (جولة النشر T4). الروابط تُفتح بالضغط وحده في تبويب جديد (noopener)؛ ولا طلب شبكة من هذا الملف.
import { el, icon, ltr } from '../../ui/components.js';
import { SUBTITLE_FONT_LIST } from '../../ui/subtitle-fonts.js';
import { UI_FONT_LIST } from '../../ui/ui-fonts.js';

/**
 * الرابطان الخارجيان الوحيدان في الإضافة (يسمح بهما الفحص الثابت في هذا الملف وحده). صفحة الدعم بدل المستودع الخاص الذي يعطي
 * 404 للعموم (قرار T4 في جولة النشر، store/README.md §٥)، وفيها الخصوصية والمساعدة والإبلاغ وبريد الدعم.
 */
export const LINKS = Object.freeze({ site: 'https://bysltan.com', support: 'https://bysltan.com/tarjuman/support' });
/** خط عناوين الواجهة المضمّن (المراعي ملفه نفسه في خطوط الترجمة فلا يتكرر). */
const UI_HEAD_FONT = Object.freeze({ nameAr: 'القاهرة', nameLatin: 'Cairo', license: UI_FONT_LIST[0].license });
/**
 * أيقونات الواجهة من Lucide (ISC، وبعضها مشتق من Feather، MIT): ترخيصاهما يشترطان بقاء الإشعار مع كل نسخة، فنصّاهما في
 * THIRD_PARTY_NOTICES.txt بجذر الحزمة (جولة النشر T4، scripts/release/notices.mjs)، ويفتحه «عرض التراخيص» بلا شبكة.
 */
export const NOTICES_FILE = 'THIRD_PARTY_NOTICES.txt';

/**
 * سطر الخصوصية كما هو صحيح: المعالجة والحفظ على الجهاز، ولا يخرج منه شيء إلا صور الفيديو في المحفوظات (i.ytimg.com بمعرّف
 * الفيديو) ما دام مفتاحها «صور الفيديو في المحفوظات» مفعّلًا (prefs.ui.thumbnails، افتراضيًا مفعّل بقرار سلطان)، وبلاغ يرسله
 * المستخدم بنفسه من «الإبلاغ عن مشكلة» (جولة النشر T2.1). لا يُقال «كل شيء محلي» مطلقًا.
 */
export const PRIVACY_LINE = 'بياناتك كلها على جهازك؛ لا حسابات ولا مفتاح API. ولا يخرج منه شيء إلا صور الفيديو في المحفوظات من خوادم يوتيوب ما دام مفتاحها مفعّلًا، وبلاغ ترسله أنت بنفسك من «الإبلاغ عن مشكلة».';

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
 *   section?: (...children: HTMLElement[]) => HTMLElement,
 *   report?: HTMLElement | null,
 * }} o report: زر «الإبلاغ عن مشكلة» ونموذجه (report.js)
 */
export function aboutSection({ version, doc = document, fonts = SUBTITLE_FONT_LIST, section, report = null }) {
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
        children: [
          ...[...fonts, UI_HEAD_FONT].map((f) => ({ href: f.license, text: `${f.nameAr} · ${f.nameLatin} — SIL OFL 1.1` })),
          { href: NOTICES_FILE, text: 'أيقونات الواجهة · Lucide — ISC، ومنها Feather — MIT' },
        ].map(({ href, text }) => el('li', {
          // ملف الرخصة داخل الإضافة نفسها: رابط نسبي من pages/settings/ بلا شبكة.
          children: [el('a', { className: 'st-link', attrs: { href: `../../${href}`, target: '_blank', rel: 'noopener noreferrer' }, children: [el('span', { text, doc }), icon('external', { doc })], doc })],
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
    report,
    el('hr', { className: 'tj-rule', doc }),
    el('p', { className: 'tj-label', text: 'ترجمان — تطوير سلطان', doc }),
    el('div', {
      className: 'st-about__links',
      children: [
        externalLink(doc, { href: LINKS.site, text: 'bysltan.com' }),
        externalLink(doc, { href: LINKS.support, text: 'الدعم والخصوصية' }),
      ],
      doc,
    }),
    el('p', { className: 'tj-caption', text: `خطوط الترجمة المضمّنة لأصحابها، برخصة SIL Open Font License 1.1: ${arabicList(fonts.map((f) => f.nameAr))}. وعناوين الواجهة بخط ${UI_HEAD_FONT.nameAr} (${UI_HEAD_FONT.nameLatin}) بالرخصة نفسها. وأغلب أيقونات الواجهة من Lucide برخصة ISC، وبعضها مشتق من Feather برخصة MIT.`, doc }),
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
