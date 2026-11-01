// قسم «حول» (R42، P7-AC10، figma-design-brief §١٠): الإصدار، و«كل شيء محلي»، ودليل الاستخدام، و«ترجمان — تطوير سلطان»
// مع رابطي bysltan.com والمستودع (بشارة «خاص حاليًا» ما دام خاصًا)، ونسب خطوط الترجمة المضمّنة مع «عرض التراخيص»
// من ملفات الرخص المحلية. الروابط تُفتح بالضغط وحده في تبويب جديد (noopener)؛ لا طلب شبكة قبل الضغط ولا بعده من الصفحة.
import { el, ltr, statusPill } from '../../ui/components.js';
import { SUBTITLE_FONT_LIST } from '../../ui/subtitle-fonts.js';
import { pageIcon } from '../library/icons.js';

/** الرابطان الخارجيان الوحيدان في الإضافة (يسمح بهما الفحص الثابت في هذا الملف وحده). */
export const LINKS = Object.freeze({ site: 'https://bysltan.com', repo: 'https://github.com/iSltanX/Tarjuman' });
/** «خاص حاليًا» ما دام المستودع خاصًا؛ أي تغيير قبل النشر بقرار سلطان. */
export const REPO_IS_PRIVATE = true;

export const GUIDE_STEPS = Object.freeze([
  'افتح فيديو على يوتيوب وفعّل الترجمة (CC) واختر English.',
  'من أزرار ترجمان في شريط تحكم المشغّل اختر «تحميل الترجمة الإنجليزية (SRT)»، ثم «نسخ تعليمات الترجمة».',
  'أرسل الملف مع التعليمات إلى أي نموذج ذكاء اصطناعي تختاره، واحفظ ناتجه ملف SRT.',
  'ارفعه بزر «رفع الترجمة العربية (SRT)» فتظهر الترجمة فوق الفيديو؛ وعدّل توقيتها بأزرار ± أو من المحرّر.',
  'تجد كل ما حفظته في «المحفوظات» من أيقونة الإضافة، وتصدّره أو تستبدله أو تحذفه من هناك.',
]);

/** @param {Document} doc @param {{ href: string, text: string }} o */
function externalLink(doc, { href, text }) {
  return el('a', {
    className: 'st-link',
    attrs: { href, target: '_blank', rel: 'noopener noreferrer' },
    children: [el('span', { text, doc }), pageIcon('external', { doc })],
    doc,
  });
}

/** «المراعي، ونوتو سانس العربي، وتجوّل، ومركزي» */
const arabicList = (names) => names.map((n, i) => (i ? `و${n}` : n)).join('، ');

/**
 * @param {{ version: string, doc?: Document, fonts?: typeof SUBTITLE_FONT_LIST, repoPrivate?: boolean }} o
 */
export function aboutSection({ version, doc = document, fonts = SUBTITLE_FONT_LIST, repoPrivate = REPO_IS_PRIVATE }) {
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
        children: fonts.map((f) => el('li', {
          // ملف الرخصة داخل الإضافة نفسها: رابط نسبي من pages/settings/ بلا شبكة.
          children: [el('a', { className: 'st-link', attrs: { href: `../../${f.license}`, target: '_blank', rel: 'noopener noreferrer' }, children: [el('span', { text: `${f.nameAr} · ${f.nameLatin} — SIL OFL 1.1`, doc }), pageIcon('external', { doc })], doc })],
          doc,
        })),
        doc,
      }),
    ],
    doc,
  });
  return el('section', {
    className: 'tj-card st-card st-about',
    attrs: { 'aria-labelledby': 'st-about-title' },
    children: [
      el('h2', { className: 'tj-h3', text: 'حول', attrs: { id: 'st-about-title' }, doc }),
      el('div', { className: 'st-about__row', children: [el('span', { className: 'tj-label', text: 'الإصدار', doc }), ltr(version, { doc })], doc }),
      el('p', { className: 'tj-body-sm', text: 'كل شيء محلي على جهازك، لا حسابات ولا خادم ولا مفتاح API.', doc }),
      guide,
      el('hr', { className: 'st-rule', doc }),
      el('p', { className: 'tj-label', text: 'ترجمان — تطوير سلطان', doc }),
      el('div', {
        className: 'st-about__links',
        children: [
          externalLink(doc, { href: LINKS.site, text: 'bysltan.com' }),
          el('span', { className: 'st-about__repo', children: [externalLink(doc, { href: LINKS.repo, text: 'المستودع على GitHub' }), repoPrivate ? statusPill({ tone: 'neutral', text: 'خاص حاليًا', doc }) : null], doc }),
        ],
        doc,
      }),
      el('p', { className: 'tj-caption', text: `خطوط الترجمة المضمّنة لأصحابها، برخصة SIL Open Font License 1.1: ${arabicList(fonts.map((f) => f.nameAr))}.`, doc }),
      licenses,
    ],
    doc,
  });
}
