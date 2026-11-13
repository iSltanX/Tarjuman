// قسم «حول» (R42، P7-AC10، وجولة الصقل، والهوية الرابعة لوحة 15): صفوف بتسميتها كبقية الإعدادات. «الإصدار» برمز الشعار والاسم
// والرقم والمتصفحات وسطر الخصوصية الصادق؛ و«الحقوق» بطاقة: التصميم والتطوير لسلطان، والموقع bysltan.com، والمستودع على GitHub
// (عام منذ 2026-11-07، فعاد رابطه بطلب سلطان بعد أن استُبدل في T4 حين كان خاصًّا)، وسطر الحقوق كما في LICENSE؛ و«الدعم» برابط صفحة
// الدعم والخصوصية و«الإبلاغ عن مشكلة» (جولة النشر T2.1، report.js)؛ و«الدليل»؛ و«التراخيص» بنسب الخطوط المضمّنة والأيقونات مع
// «عرض التراخيص» من ملفات الرخص المحلية وملف إشعارات الأطراف الثالثة (T4). الروابط تُفتح بالضغط وحده في تبويب جديد (noopener)؛
// ولا طلب شبكة من هذا الملف.
import { t, texts } from '../../i18n/index.js';
import { el, icon } from '../../ui/components.js';
import { logoMark } from '../../ui/logo.js';
import { SUBTITLE_FONT_LIST } from '../../ui/subtitle-fonts.js';
import { UI_FONT_LIST } from '../../ui/ui-fonts.js';

/**
 * الروابط الخارجية الثلاثة الوحيدة في الإضافة (يسمح بها الفحص الثابت والتدقيق في هذا الملف وحده): الموقع، والمستودع (عام، وتحقق
 * سلطان من عمله للعموم في 2026-11-07)، وصفحة الدعم وفيها الخصوصية والمساعدة والإبلاغ وبريد الدعم.
 */
export const LINKS = Object.freeze({ site: 'https://bysltan.com', repo: 'https://github.com/iSltanX/Tarjuman', support: 'https://bysltan.com/tarjuman/support' });
/** الحقوق كما في LICENSE (لا تغيّر ترخيصًا): المصمم والمطوّر، وسطر حقوق النشر. */
export const CREDITS = texts('settings.credits');
/** المتصفحات التي تعمل عليها الإضافة (product-spec §١). */
export const BROWSERS_LINE = 'Chrome · Edge · Brave · Firefox';
/** خط عناوين الواجهة المضمّن (المراعي ملفه نفسه في خطوط الترجمة فلا يتكرر). اسمه بلغة الواجهة عند القراءة. */
const UI_HEAD_FONT = Object.freeze({ get nameAr() { return t('settings.about.headFont'); }, nameLatin: 'Cairo', license: UI_FONT_LIST[0].license });
/**
 * أيقونات الواجهة مرسومة لهوية ترجمان (الهوية الرابعة)، وترخيص Lucide (ISC، ومنه Feather، MIT) باقٍ للإسناد لأن الإصدارات حتى
 * 1.1.0 استعملت أيقوناته: نصّاهما في THIRD_PARTY_NOTICES.txt بجذر الحزمة (جولة النشر T4، scripts/release/notices.mjs)، ويفتحه
 * «عرض التراخيص» بلا شبكة.
 */
export const NOTICES_FILE = 'THIRD_PARTY_NOTICES.txt';

/**
 * سطر الخصوصية كما هو صحيح: المعالجة والحفظ في المتصفح، ولا يتصل ترجمان بالإنترنت إلا لصور الفيديو في المحفوظات
 * (i.ytimg.com بمعرّف الفيديو) ما دام مفتاحها «صور الفيديو في المحفوظات» مفعّلًا (prefs.ui.thumbnails، مطفأ في التثبيت الجديد
 * منذ 2.2.0، و2). ولا خادم لترجمان: البلاغ يُنسخ نصًّا ويرسله المستخدم من بريده (منذ 2.2.0، ق3). لا يُقال «كل شيء محلي» مطلقًا.
 */
export const privacyLine = () => t('settings.about.privacy');

/** خطوات الدليل بلغة الواجهة الحالية. */
export const guideSteps = () => [1, 2, 3, 4, 5].map((n) => t(`settings.about.guideStep${n}`));

/** رابط خارجي بتبويب جديد. ltr للعناوين اللاتينية (اسم النطاق أو المسار) معزولةً داخل الجملة العربية. */
function externalLink(doc, { href, text, className = 'st-link', latin = false }) {
  return el('a', {
    className,
    attrs: { href, target: '_blank', rel: 'noopener noreferrer', title: t('settings.about.newTab') },
    children: [latin ? el('bdi', { text, dir: 'ltr', doc }) : el('span', { text, doc }), icon('external', { doc, className: 'tj-icon tj-icon--xs' })],
    doc,
  });
}

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
      el('summary', { className: 'st-details__summary', text: t('settings.about.guideSummary'), doc }),
      el('ol', { className: 'st-guide', children: guideSteps().map((s) => el('li', { text: s, doc })), doc }),
    ],
    doc,
  });
  const licenses = el('details', {
    className: 'st-details',
    children: [
      el('summary', { className: 'st-details__summary', text: t('settings.about.licensesSummary'), doc }),
      el('ul', {
        className: 'st-licenses',
        attrs: { role: 'list' },
        children: [
          ...[...fonts, UI_HEAD_FONT].map((f) => ({ href: f.license, text: t('settings.about.licenseLine', { nameAr: f.nameAr, nameLatin: f.nameLatin }) })),
          { href: NOTICES_FILE, text: t('settings.about.noticesLine') },
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
  /** صف كبقية الإعدادات: التسمية في البداية والمحتوى بعدها. */
  const row = (label, ...children) => el('div', {
    className: 'st-row st-about__row',
    children: [
      el('div', { className: 'st-row__label', children: [el('span', { className: 'tj-label', text: label, doc })], doc }),
      el('div', { className: 'st-row__control', children, doc }),
    ],
    doc,
  });
  const note = (text) => el('p', { className: 'tj-caption st-note', text, doc });
  const credit = (key, value) => el('div', {
    className: 'st-credits__row',
    children: [el('dt', { className: 'st-credits__k', text: key, doc }), el('dd', { className: 'st-credits__v', children: [value], doc })],
    doc,
  });
  const brand = el('div', {
    className: 'st-about__brand',
    children: [
      logoMark({ width: 28, doc }),
      el('span', { className: 'st-about__name', text: t('common.productName'), doc }),
      el('bdi', { className: 'tj-ltr tj-mono st-about__version', text: `v${version}`, dir: 'ltr', doc }),
      el('span', { className: 'tj-pill tj-pill--plain st-about__browsers', text: BROWSERS_LINE, dir: 'ltr', doc }),
    ],
    doc,
  });
  const credits = el('dl', {
    className: 'st-credits',
    children: [
      credit(t('settings.about.design'), el('span', { className: 'st-credits__name', text: CREDITS.author, doc })),
      credit(t('settings.about.website'), externalLink(doc, { href: LINKS.site, text: 'bysltan.com', className: 'st-credits__link', latin: true })),
      credit(t('settings.about.repository'), externalLink(doc, { href: LINKS.repo, text: 'github.com/iSltanX/Tarjuman', className: 'st-credits__link', latin: true })),
    ],
    doc,
  });
  const rows = [
    row(t('settings.about.version'), brand, note(privacyLine())),
    row(t('settings.about.credits'), credits, note(CREDITS.copyright)),
    row(t('settings.about.support'), externalLink(doc, { href: LINKS.support, text: t('settings.about.supportLink') }), report),
    row(t('settings.about.guide'), guide),
    row(t('settings.about.licenses'), note(t('settings.about.licensesNote', {
      fonts: fonts.map((f) => f.nameAr), head: UI_HEAD_FONT.nameAr, headLatin: UI_HEAD_FONT.nameLatin,
    })), licenses),
  ];
  if (section) return section(...rows);
  return el('section', {
    className: 'st-section st-about',
    attrs: { 'aria-labelledby': 'st-about-title' },
    children: [el('h2', { className: 'tj-h2', text: t('settings.sections.about.title'), attrs: { id: 'st-about-title' }, doc }), ...rows],
    doc,
  });
}
