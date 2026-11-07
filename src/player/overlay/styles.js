// أنماط الطبقة (figma-design-brief §٧.١). القيم المتغيرة (الحجم والموضع وعائلة الخط) تدخل متغيرات CSS بـCSSOM
// (style.setProperty) لا بنص ولا بسمة style؛ والقيم الثابتة هنا ورقة أنماط واحدة. الرموز من playerTokensCss.
// السطر العربي بخط الترجمة المختار (--tj-sub-font)، والإنجليزي في الوضع المزدوج بالمراعي المضمّن (--tj-sub-font-en).
import { playerTokensCss } from '../../ui/player-tokens.js';
import { SELECTORS } from '../youtube-dom.js';

export const HOST_ID = 'tarjuman-overlay';
export const FADE_MS = 80;
/** ارتفاع الطبقة فوق شريط التحكم يتحرك بهذه المدة حين يظهر الشريط أو يختفي (§٧.١). */
export const LIFT_MS = 150;

export function overlayCss() {
  return `${playerTokensCss(':host')}
:host { all: initial; position: absolute; inset: 0; display: block; z-index: 58; pointer-events: none; direction: ltr; }
:host([hidden]) { display: none; }
.stage { position: absolute; left: 4%; right: 4%; bottom: var(--tj-offset, 8%); display: flex; flex-direction: column; align-items: center; gap: 2px; pointer-events: none; font-family: var(--tj-sub-font, var(--tj-p-font-body)); font-size: var(--tj-fs, 22px); line-height: 1.5; opacity: 1; transition: opacity var(--tj-p-motion-subtitle) linear, bottom ${LIFT_MS}ms ease; }
:host([data-anchor="top"]) .stage { top: var(--tj-offset, 8%); bottom: auto; }
.stage[data-empty] { opacity: 0; }
.line { box-sizing: border-box; width: fit-content; max-width: 100%; margin: 0; padding: 2px 10px; border-radius: 4px; text-align: center; unicode-bidi: isolate; overflow-wrap: anywhere; color: var(--tj-p-sub-text); pointer-events: none; }
.line[dir="rtl"] { direction: rtl; }
.line[dir="ltr"] { direction: ltr; }
.ar { font-weight: 700; }
.en { font-family: var(--tj-sub-font-en, var(--tj-p-font-body)); font-size: 0.8em; font-weight: 400; color: var(--tj-p-sub-en); }
.stage[data-bg="none"] .line { background: none; text-shadow: 0 0 3px #000, 0 0 6px #000, 0 1px 3px #000, 0 2px 8px rgb(0 0 0 / 90%); }
.stage[data-bg="soft"] .line { background: var(--tj-p-sub-bg-soft); }
.stage[data-bg="solid"] .line { background: var(--tj-p-sub-bg-solid); }
@media (prefers-reduced-motion: reduce) { .stage { transition: none; } }`;
}

/** إخفاء ترجمة يوتيوب الأصلية ما دامت الطبقة نشطة (عقد interfaces §٣): على محدد حاويتها من youtube-dom. */
export const hideNativeCss = () => `${SELECTORS.captionWindow} { display: none !important; }`;
