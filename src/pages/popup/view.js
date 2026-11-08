// بُناة DOM لنافذة الأيقونة بلا اتصال بالتخزين ولا بالتبويبات (لوحة النافذة في الهوية، docs/identity.md): هيكل القراءة، وبطاقة الفيديو
// الحالي بحالاتها، وهيكل كتلة «تعليمات الترجمة»، وخطوات «بلا ترجمة»، وملاحظة «ليست صفحة فيديو». textContent وsetAttribute فقط. المنطق والبيانات
// في status.js، والتركيب في main.js. الصنف التاريخي tj-popup__status باقٍ على البطاقة والهيكل والملاحظة: يقرؤه الحزام الحي.
import { t } from '../../i18n/index.js';
import { el, statusPill } from '../../ui/components.js';
import { textDirection } from '../../ui/format.js';
import { popupIcon } from './icons.js';

/** نص ملاحظة «ليست صفحة فيديو» كما في اللوحة المعتمدة، بلغة الواجهة الحالية. */
export const notVideoText = () => t('popup.notVideo');

/** هيكل بارتفاع البطاقة: لا تقفز النافذة حين يصل الرد. @param {Document} [doc] */
export function skeletonCard(doc = document) {
  return el('section', {
    className: 'tj-popup__card tj-popup__status',
    attrs: { 'aria-busy': 'true', 'aria-label': t('popup.card.loading') },
    children: [
      el('div', { className: 'tj-skeleton tj-popup__skel-title', doc }),
      el('div', { className: 'tj-skeleton tj-popup__skel-line', doc }),
      el('div', { className: 'tj-popup__pills', children: [el('span', { className: 'tj-skeleton tj-popup__skel-pill', doc }), el('span', { className: 'tj-skeleton tj-popup__skel-pill tj-popup__skel-pill--wide', doc })], doc }),
      el('hr', { className: 'tj-rule', doc }),
      el('div', { className: 'tj-skeleton tj-popup__skel-tools', doc }),
    ],
    doc,
  });
}

/** مؤشر «محفوظ» بنقطته (معيّن الهوية)، لا رابطًا ولا زرًا. @param {Document} [doc] */
export const savedPill = (doc = document) => statusPill({ tone: 'success', text: t('popup.card.saved'), title: t('popup.card.savedTitle'), doc });

/** شارة بلا نقطة وبأيقونة اختيارية قبل نصها (معدّلة، وتختلف عن الأصل)؛ outline لشارات الوصف المحيطية. */
function iconPill({ text, iconName, tone = 'neutral', outline = false, doc }) {
  const cls = ['tj-pill', 'tj-pill--plain', tone === 'neutral' ? '' : `tj-pill--${tone}`, outline ? 'tj-pill--outline' : ''].filter(Boolean).join(' ');
  return el('span', { className: cls, children: [iconName ? popupIcon(iconName, { doc, className: 'tj-icon tj-icon--sm' }) : null, text], doc });
}

/** سطر نتيجة بأيقونة (✓ ملتقط، أو تحذير): النص مع الأيقونة لا باللون وحده. */
function resultLine({ tone, iconName, text, className = '', doc }) {
  return el('p', { className: `tj-popup__result tj-popup__result--${tone} ${className}`.trim(), children: [popupIcon(iconName, { doc, className: 'tj-icon tj-icon--sm' }), el('span', { text, doc })], doc });
}

/**
 * سطر أدوات المشغّل: معيّن بلون الحالة ونصها، وتحته سبب التعطل إن وُجد.
 * @param {{ tone: 'success' | 'info' | 'danger', text: string, reason: string | null }} tools @param {Document} doc
 */
function toolsRow(tools, doc) {
  return el('div', {
    className: `tj-popup__tools tj-popup__tools--${tools.tone}`,
    children: [
      el('span', { className: 'tj-popup__dot', attrs: { 'aria-hidden': 'true' }, doc }),
      el('span', {
        className: 'tj-popup__tools-text',
        children: [el('span', { text: tools.text, doc }), tools.reason && tools.reason !== tools.text ? el('span', { className: 'tj-popup__reason', text: tools.reason, doc }) : null],
        doc,
      }),
    ],
    doc,
  });
}

/**
 * بطاقة الفيديو الحالي (غير «ليست صفحة فيديو»، فلها ملاحظتها): العنوان، والحالة، والشارات، وسطر الالتقاط، وحالة الأدوات.
 * @param {Exclude<ReturnType<typeof import('./status.js').describeStatus>, { kind: 'not-video' }>} s
 * @param {ReturnType<typeof import('./status.js').toolsStatus>} tools
 * @param {ReturnType<typeof import('./status.js').captureLine>} capture
 * @param {Document} [doc]
 */
export function statusCard(s, tools, capture, doc = document, action = null) {
  const card = el('section', { className: 'tj-popup__card tj-popup__status', attrs: { 'aria-live': 'polite' }, doc });
  card.append(el('h2', { className: 'tj-popup__title tj-clamp-2 tj-auto', text: s.title, dir: textDirection(s.title), attrs: { title: s.title }, doc }));
  if (s.kind === 'loading') {
    card.append(el('div', { className: 'tj-skeleton tj-popup__skel-line', doc }));
  } else if (s.kind === 'has-subtitle') {
    card.append(el('p', { className: 'tj-popup__line', text: s.line, doc }));
    const pills = [savedPill(doc), iconPill({ text: s.mode, outline: true, doc })];
    if (s.edited) pills.push(iconPill({ text: t('popup.card.edited'), iconName: 'edit', outline: true, doc }));
    if (s.matched === false) pills.push(iconPill({ text: t('popup.card.differs'), iconName: 'warning', tone: 'warning', doc }));
    card.append(el('div', { className: 'tj-popup__pills', children: pills, doc }));
  } else {
    card.append(el('p', { className: 'tj-popup__line', text: t('popup.card.noTranslation'), doc }));
    // سطر مسار الأصل بلغته ونوعه وعدده (AA3): «اليابانية ملتقطة · تلقائية · 212 مقطعًا».
    const text = s.englishLine;
    card.append(s.englishReady
      ? resultLine({ tone: 'ok', iconName: 'check', text, className: 'tj-popup__english', doc })
      : el('p', { className: 'tj-popup__result tj-popup__english', text, doc }));
    if (s.saved) card.append(el('div', { className: 'tj-popup__pills', children: [savedPill(doc)], doc }));
  }
  if (capture) card.append(resultLine({ tone: 'warn', iconName: 'warning', text: capture.text, className: 'tj-popup__capture', doc }));
  if (tools) card.append(el('hr', { className: 'tj-rule', doc }), toolsRow(tools, doc));
  // «تحرير الترجمة» زر مؤطّر داخل البطاقة (لوحة 09): الزر الرئيسي الوحيد في النافذة نسخ التعليمات.
  if (action) card.append(el('div', { className: 'tj-popup__actions', children: [action], doc }));
  return card;
}

/**
 * خطوات الترجمة (منجزة، والحالية، ومنتظرة): المنجزة بعلامة ✓ والحالية برقمها ممتلئًا والمنتظرة برقمها محاطًا؛ وكل حالة
 * بنص لقارئ الشاشة أيضًا فلا يعتمد المعنى على الشكل. الحالية aria-current="step".
 * @param {{ n: number, text: string, state: 'done' | 'now' | 'pending' }[]} steps @param {Document} [doc]
 */
export function guideList(steps, doc = document) {
  const STATE_TEXT = { done: t('popup.steps.done'), now: t('popup.steps.now'), pending: t('popup.steps.pending') };
  return el('ol', {
    className: 'tj-popup__steps', attrs: { 'aria-label': t('popup.steps.label') },
    children: steps.map((st) => el('li', {
      className: `tj-popup__step tj-popup__step--${st.state}`,
      attrs: { 'data-state': st.state, ...(st.state === 'now' ? { 'aria-current': 'step' } : {}) },
      children: [
        el('span', { className: 'tj-popup__step-n', attrs: { 'aria-hidden': 'true' }, children: [st.state === 'done' ? popupIcon('check', { doc, className: 'tj-icon tj-icon--sm' }) : String(st.n)], doc }),
        el('span', { className: 'tj-popup__step-text', children: [st.text, el('span', { className: 'tj-sr-only', text: ` — ${STATE_TEXT[st.state]}`, doc })], doc }),
      ],
      doc,
    })),
    doc,
  });
}

/** ملاحظة «ليست صفحة فيديو» أو «أعد تحميل الصفحة»: أيقونة الفيديو والنص. @param {Document} [doc] @param {string} [text] */
export function notVideoNote(doc = document, text = notVideoText()) {
  return el('div', {
    className: 'tj-popup__note tj-popup__status', attrs: { role: 'status' },
    children: [popupIcon('info', { doc }), el('span', { text, doc })],
    doc,
  });
}

/** هيكل كتلة «تعليمات الترجمة» أثناء القراءة (لوحة 09، الحالة 6): الحقلان والمبادلة والزر. @param {Document} [doc] */
export function pairSkeleton(doc = document) {
  return el('div', {
    className: 'tj-popup__pair-skel', attrs: { 'aria-hidden': 'true' },
    children: [
      el('div', { className: 'tj-popup__pair-skel-row', children: [el('div', { className: 'tj-skeleton', doc }), el('div', { className: 'tj-skeleton tj-popup__pair-skel-swap', doc }), el('div', { className: 'tj-skeleton', doc })], doc }),
      el('div', { className: 'tj-skeleton tj-popup__pair-skel-btn', doc }),
    ],
    doc,
  });
}
