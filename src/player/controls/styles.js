// أنماط الأدوات (figma-design-brief §٥ و§٦ و§٣.٢): ورقتان داخل Shadow DOM مغلق، فلا تتسرب أنماط يوتيوب إليهما
// ولا أنماطهما إلى يوتيوب. المجموعة في بداية أدوات الشريط اليمنى LTR، والقوائم والتلميحات والرسائل في طبقة واحدة
// داخل #movie_player محتواها RTL. القيم المتغيرة (المواضع) بمتغيرات CSS عبر CSSOM، لا بنص ولا بسمة style.
import { playerTokensCss } from '../../ui/player-tokens.js';

export const GROUP_ID = 'tarjuman-controls';
export const LAYER_ID = 'tarjuman-controls-layer';
/** فوق شريط يوتيوب وتحت ما يفتحه المتصفح؛ والطبقة لا تلتقط النقرات إلا على قوائمها ورسائلها. */
export const LAYER_Z = 65;
export const PULSE_MS = 120;
export const BAR_FADE_MS = 100;

const FOCUS = 'outline: 2px solid #FFFFFF; outline-offset: -3px; box-shadow: 0 0 0 4px rgb(0 0 0 / 55%);';

export function groupCss() {
  return `${playerTokensCss(':host')}
:host { all: initial; display: inline-flex; flex: none; height: 100%; vertical-align: top; position: relative; }
.group { display: flex; align-items: stretch; height: 100%; direction: ltr; font-family: var(--tj-p-font-body); --w: 48px; --icon: 24px; --badge: 44px; --badge-fs: 13px; --badge-pad: 8px; }
.group[data-size="compact"] { --w: 40px; --icon: 20px; --badge: 38px; --badge-pad: 6px; }
.group[data-size="fullscreen"] { --w: 54px; --icon: 27px; --badge: 50px; --badge-fs: 15px; }
.btn { all: unset; box-sizing: border-box; position: relative; display: inline-flex; align-items: center; justify-content: center; flex: none; width: var(--w); height: 100%; color: var(--tj-p-icon); cursor: pointer; border-radius: 8px; -webkit-tap-highlight-color: transparent; }
.btn:hover { color: var(--tj-p-icon-hover); }
.btn:focus-visible { ${FOCUS} }
.btn[aria-disabled="true"], .btn[data-unavailable] { color: var(--tj-p-icon-disabled); }
.btn[aria-disabled="true"] { cursor: default; }
.icon { width: var(--icon); height: var(--icon); pointer-events: none; display: block; }
.badge { width: auto; min-width: var(--badge); padding: 0 var(--badge-pad); font: 700 var(--badge-fs)/1 var(--tj-p-font-body); font-variant-numeric: tabular-nums; letter-spacing: 0; white-space: nowrap; direction: ltr; unicode-bidi: isolate; }
.badge[data-sign="zero"] { color: rgb(255 255 255 / 70%); }
.badge[data-sign="positive"], .badge[data-sign="negative"] { color: var(--tj-p-accent); }
.badge[aria-disabled="true"] { color: var(--tj-p-icon-disabled); }
.btn[aria-expanded="true"] { background: rgb(255 255 255 / 12%); }
.badge[data-pulse] { animation: tj-pulse ${PULSE_MS}ms ease-out; }
@keyframes tj-pulse { 0% { transform: scale(1); } 50% { transform: scale(1.14); } 100% { transform: scale(1); } }
.dot { position: absolute; top: 22%; right: 16%; width: 7px; height: 7px; border-radius: 50%; box-shadow: 0 0 0 1.5px rgb(0 0 0 / 70%); pointer-events: none; }
.dot[data-tone="ready"], .dot[data-tone="loaded"] { background: var(--tj-p-accent); }
.dot[data-tone="warning"] { background: var(--tj-p-warn); }
.dot[hidden], .spin[hidden] { display: none; }
.spin { position: absolute; top: 18%; right: 12%; width: 9px; height: 9px; border-radius: 50%; border: 2px solid rgb(255 255 255 / 35%); border-top-color: #FFFFFF; animation: tj-spin 700ms linear infinite; pointer-events: none; }
@keyframes tj-spin { to { transform: rotate(360deg); } }
.sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
@media (prefers-reduced-motion: reduce) { .badge[data-pulse] { animation: none; } .spin { animation-duration: 2000ms; } }`;
}

export function layerCss() {
  return `${playerTokensCss(':host')}
:host { all: initial; position: absolute; inset: 0; display: block; z-index: ${LAYER_Z}; pointer-events: none; direction: ltr; }
.layer { position: absolute; inset: 0; pointer-events: none; opacity: 1; transition: opacity ${BAR_FADE_MS}ms linear; font-family: var(--tj-p-font-body); color: var(--tj-p-menu-text); --menu-w: 300px; --fs: 14px; --title-fs: 15px; --tip-fs: 13px; --big-fs: 24px; }
.layer[data-size="fullscreen"] { --menu-w: 340px; --fs: 16px; --title-fs: 17px; --tip-fs: 15px; --big-fs: 28px; }
.layer[data-bar="hidden"] { opacity: 0; }
.layer[data-bar="hidden"] * { pointer-events: none !important; }
.menu, .toast, .tip { -webkit-font-smoothing: antialiased; }

.tip { position: absolute; left: var(--x, 50%); bottom: var(--y, 60px); transform: translateX(-50%); max-width: calc(100% - 16px); box-sizing: border-box; padding: 6px 9px; border-radius: 4px; background: var(--tj-p-tooltip-bg); color: #FFFFFF; font: 700 var(--tip-fs)/1.35 var(--tj-p-font-body); white-space: nowrap; direction: rtl; pointer-events: none; }
.tip[hidden] { display: none; }

.menu { position: absolute; left: var(--x, 8px); bottom: var(--y, 60px); box-sizing: border-box; width: min(var(--menu-w), calc(100% - 16px)); max-height: var(--max-h, 70%); overflow-y: auto; overscroll-behavior: contain; padding: 8px; display: flex; flex-direction: column; gap: 2px; background: var(--tj-p-menu-bg); color: var(--tj-p-menu-text); border-radius: var(--tj-p-menu-radius); box-shadow: 0 20px 60px rgb(0 0 0 / 30%); direction: rtl; text-align: right; font: 400 var(--fs)/1.5 var(--tj-p-font-body); pointer-events: auto; animation: tj-in var(--tj-p-motion-menu) ease-out; scrollbar-width: thin; }
.menu[hidden] { display: none; }
@keyframes tj-in { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: none; } }
.title { margin: 0; padding: 6px 12px 6px; font: 700 var(--title-fs)/1.4 var(--tj-p-font-head); }
.row { box-sizing: border-box; min-height: 40px; display: flex; align-items: center; gap: 10px; padding: 0 12px; }
.status { font-weight: 700; }
.status .ok { color: var(--tj-p-ok); }
.note { padding: 0 12px 4px; font-size: 0.93em; color: var(--tj-p-menu-text-2); }
.alert { margin: 4px 0; padding: 8px 12px; border-radius: 8px; display: flex; gap: 8px; align-items: flex-start; }
.alert[data-tone="info"] { background: rgb(255 255 255 / 8%); }
.alert[data-tone="warn"] { background: rgb(240 196 106 / 14%); }
.alert[data-tone="error"] { background: rgb(255 138 128 / 14%); }
.alert .glyph { flex: none; font-weight: 700; }
.alert[data-tone="info"] .glyph { color: var(--tj-p-menu-text-2); }
.alert[data-tone="warn"] .glyph { color: var(--tj-p-warn); }
.alert[data-tone="error"] .glyph { color: var(--tj-p-error); }
.summary[data-tone="ok"] { color: var(--tj-p-ok); }
.summary[data-tone="warn"] { color: var(--tj-p-warn); }
.summary[data-tone="info"] { color: var(--tj-p-menu-text-2); }
.sep { height: 1px; margin: 4px 0; background: rgb(255 255 255 / 12%); }
.ltr { direction: ltr; unicode-bidi: isolate; }
.mono { font-family: var(--tj-p-font-mono); }
.name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; direction: ltr; unicode-bidi: isolate; min-width: 0; }

button.item { all: unset; box-sizing: border-box; min-height: 40px; display: flex; align-items: center; gap: 10px; padding: 0 12px; border-radius: 8px; cursor: pointer; width: 100%; }
button.item:hover { background: var(--tj-p-menu-hover); }
button.item[aria-disabled="true"] { color: rgb(255 255 255 / 45%); cursor: default; background: none; }
button.item[role="menuitemradio"]::before { content: ""; flex: none; width: 14px; height: 14px; border-radius: 50%; box-shadow: inset 0 0 0 2px rgb(255 255 255 / 60%); }
button.item[aria-checked="true"] { font-weight: 700; }
button.item[aria-checked="true"]::before { box-shadow: inset 0 0 0 2px var(--tj-p-accent), inset 0 0 0 5px rgb(28 28 28), inset 0 0 0 9px var(--tj-p-accent); }
button.item[aria-expanded]::after { content: "‹"; margin-inline-start: auto; transition: transform 140ms; }
button.item[aria-expanded="true"]::after { transform: rotate(-90deg); }
.reason { display: block; font-size: 0.86em; font-weight: 400; color: rgb(255 255 255 / 55%); }
.stack { display: flex; flex-direction: column; min-width: 0; }

.actions { display: flex; flex-direction: column; gap: 6px; padding: 6px 4px 4px; }
.actions.inline { flex-direction: row; }
.actions.inline > * { flex: 1; }
button.primary, button.secondary, button.danger { all: unset; box-sizing: border-box; min-height: 40px; display: flex; align-items: center; justify-content: center; gap: 8px; padding: 0 14px; border-radius: 10px; font-weight: 700; cursor: pointer; text-align: center; }
button.primary { background: var(--tj-p-accent); color: #062322; }
button.primary:hover { filter: brightness(1.08); }
button.secondary { background: rgb(255 255 255 / 12%); color: #FFFFFF; }
button.secondary:hover { background: rgb(255 255 255 / 18%); }
button.danger { background: var(--tj-p-error); color: #2B0D0A; }
button.primary[aria-disabled="true"], button.secondary[aria-disabled="true"] { opacity: 0.45; cursor: default; filter: none; }
button.primary[data-done] { background: var(--tj-p-ok); }
button.link { all: unset; cursor: pointer; color: var(--tj-p-accent); text-decoration: underline; text-underline-offset: 3px; font-size: 0.93em; }

.seg { display: flex; gap: 2px; padding: 2px; margin: 0 8px; border-radius: 10px; background: rgb(255 255 255 / 8%); }
.seg button { all: unset; box-sizing: border-box; flex: 1; min-height: 34px; display: flex; align-items: center; justify-content: center; padding: 0 8px; border-radius: 8px; cursor: pointer; }
.seg button:hover { background: var(--tj-p-menu-hover); }
.seg button[aria-checked="true"] { background: rgb(255 255 255 / 18%); font-weight: 700; }

.big { padding: 4px 12px 0; text-align: center; font: 700 var(--big-fs)/1.3 var(--tj-p-font-head); }
.big[data-sign="positive"], .big[data-sign="negative"] { color: var(--tj-p-accent); }
.meaning { padding: 0 12px 6px; text-align: center; color: var(--tj-p-menu-text-2); }
.field { justify-content: space-between; }
.field label { flex: 1; }
.field .unit { color: var(--tj-p-menu-text-2); }
input.num { all: unset; box-sizing: border-box; width: 88px; height: 32px; padding: 0 8px; border-radius: 6px; direction: ltr; text-align: left; font: 500 var(--fs)/1 var(--tj-p-font-mono); color: #FFFFFF; background: rgb(255 255 255 / 10%); box-shadow: inset 0 0 0 1px rgb(255 255 255 / 30%); cursor: text; }
input.num:focus { box-shadow: inset 0 0 0 2px var(--tj-p-accent); }
input.num[aria-invalid="true"] { box-shadow: inset 0 0 0 2px var(--tj-p-error); }
.field-error { padding: 0 12px 4px; color: var(--tj-p-error); font-size: 0.93em; }
.field-error:empty, .field-error[hidden] { display: none; }
input.check { flex: none; width: 16px; height: 16px; margin: 0; accent-color: var(--tj-p-accent); }
label.item { box-sizing: border-box; min-height: 40px; display: flex; align-items: center; gap: 10px; padding: 0 12px; border-radius: 8px; cursor: pointer; }
label.item:hover { background: var(--tj-p-menu-hover); }

.toasts { position: absolute; left: 50%; bottom: var(--y, 60px); transform: translateX(-50%); width: min(420px, calc(100% - 24px)); display: flex; flex-direction: column; align-items: center; gap: 6px; pointer-events: none; }
.toast { box-sizing: border-box; max-width: 100%; display: flex; align-items: center; gap: 8px; padding: 8px 14px; border-radius: 10px; background: var(--tj-p-menu-bg); color: #FFFFFF; direction: rtl; font: 400 var(--fs)/1.5 var(--tj-p-font-body); box-shadow: 0 8px 24px rgb(0 0 0 / 30%); pointer-events: auto; animation: tj-in var(--tj-p-motion-toast) ease-out; }
.toast .glyph { flex: none; font-weight: 700; }
.toast[data-tone="success"] .glyph { color: var(--tj-p-ok); }
.toast[data-tone="info"] .glyph { color: var(--tj-p-accent); }
.toast[data-tone="warning"] .glyph { color: var(--tj-p-warn); }
.toast[data-tone="error"] .glyph { color: var(--tj-p-error); }
.toast .text { min-width: 0; }
.toast button.x { all: unset; flex: none; cursor: pointer; width: 24px; height: 24px; display: flex; align-items: center; justify-content: center; border-radius: 50%; color: rgb(255 255 255 / 80%); }
.toast button.x:hover { background: var(--tj-p-menu-hover); color: #FFFFFF; }

.menu :focus-visible, .toast :focus-visible { ${FOCUS} }
input.num:focus-visible { outline: none; box-shadow: inset 0 0 0 2px var(--tj-p-accent); }
@media (prefers-reduced-motion: reduce) { .menu, .toast { animation: none; } .layer { transition: none; } }`;
}
