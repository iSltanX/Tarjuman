// بُناة DOM لنافذة الأيقونة بلا اتصال بالتخزين ولا بالتبويبات (الهوية «بُنّ على ورق»، لوحة Popup): هيكل القراءة، وبطاقة الفيديو
// الحالي بحالاتها، وخطوات «بلا ترجمة عربية»، وملاحظة «ليست صفحة فيديو». textContent وsetAttribute فقط. المنطق والبيانات
// في status.js، والتركيب في main.js.
import { el, statusPill } from '../../ui/components.js';
import { textDirection } from '../../ui/format.js';
import { popupIcon } from './icons.js';

/** نص ملاحظة «ليست صفحة فيديو» كما في اللوحة المعتمدة. */
export const NOT_VIDEO_TEXT = 'افتح فيديو على يوتيوب لتبدأ.';

/** هيكل بارتفاع البطاقة: لا تقفز النافذة حين يصل الرد. @param {Document} [doc] */
export function skeletonCard(doc = document) {
  return el('section', {
    className: 'tj-popup__card',
    attrs: { 'aria-busy': 'true', 'aria-label': 'جارٍ قراءة حالة الفيديو' },
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
export const savedPill = (doc = document) => statusPill({ tone: 'success', text: 'محفوظ', title: 'هذا الفيديو في المحفوظات', doc });

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
export function statusCard(s, tools, capture, doc = document) {
  const card = el('section', { className: 'tj-popup__card', attrs: { 'aria-live': 'polite' }, doc });
  card.append(el('h2', { className: 'tj-popup__title tj-clamp-2 tj-auto', text: s.title, dir: textDirection(s.title), attrs: { title: s.title }, doc }));
  if (s.kind === 'loading') {
    card.append(el('div', { className: 'tj-skeleton tj-popup__skel-line', doc }));
  } else if (s.kind === 'has-subtitle') {
    card.append(el('p', { className: 'tj-popup__line', text: s.line, doc }));
    const pills = [savedPill(doc), iconPill({ text: s.mode, outline: true, doc })];
    if (s.edited) pills.push(iconPill({ text: 'معدّلة', iconName: 'edit', outline: true, doc }));
    if (s.matched === false) pills.push(iconPill({ text: 'تختلف عن الأصل', iconName: 'warning', tone: 'warning', doc }));
    card.append(el('div', { className: 'tj-popup__pills', children: pills, doc }));
  } else {
    card.append(el('p', { className: 'tj-popup__line', text: 'لا ترجمة عربية محفوظة', doc }));
    const text = s.englishKind ? `${s.englishLine} · ${s.englishKind}` : s.englishLine;
    card.append(s.englishReady
      ? resultLine({ tone: 'ok', iconName: 'check', text, className: 'tj-popup__english', doc })
      : el('p', { className: 'tj-popup__result tj-popup__english', text, doc }));
    if (s.saved) card.append(el('div', { className: 'tj-popup__pills', children: [savedPill(doc)], doc }));
  }
  if (capture) card.append(resultLine({ tone: 'warn', iconName: 'warning', text: capture.text, className: 'tj-popup__capture', doc }));
  if (tools) card.append(el('hr', { className: 'tj-rule', doc }), toolsRow(tools, doc));
  return card;
}

/**
 * خطوات الترجمة (منجزة، والحالية، ومنتظرة): المنجزة بعلامة ✓ والحالية برقمها ممتلئًا والمنتظرة برقمها محاطًا؛ وكل حالة
 * بنص لقارئ الشاشة أيضًا فلا يعتمد المعنى على الشكل. الحالية aria-current="step".
 * @param {{ n: number, text: string, state: 'done' | 'now' | 'pending' }[]} steps @param {Document} [doc]
 */
export function guideList(steps, doc = document) {
  const STATE_TEXT = { done: 'تمّت', now: 'الخطوة الحالية', pending: 'لاحقًا' };
  return el('ol', {
    className: 'tj-popup__steps', attrs: { 'aria-label': 'خطوات الترجمة' },
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

/** ملاحظة «ليست صفحة فيديو»: أيقونة الفيديو والنص. @param {Document} [doc] */
export function notVideoNote(doc = document) {
  return el('div', {
    className: 'tj-popup__note', attrs: { role: 'status' },
    children: [popupIcon('video', { doc }), el('span', { text: NOT_VIDEO_TEXT, doc })],
    doc,
  });
}
