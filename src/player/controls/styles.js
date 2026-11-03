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
/** نبض ماستي الانشغال: دورة كاملة، والثانية بنصفها. */
export const LOAD_MS = 900;

const FOCUS = 'outline: 2px solid #FFFFFF; outline-offset: -3px; box-shadow: 0 0 0 4px rgb(0 0 0 / 55%);';
/** حلقة تركيز أزرار الشريط: بيضاء داخلية حول الأيقونة (تُرى على الشريط الداكن والفاتح وفوق أي فيديو). */
const BAR_FOCUS = 'outline: 2px solid #FFFFFF; outline-offset: -6px; border-radius: 8px;';

export function groupCss() {
  return `${playerTokensCss(':host')}
:host { all: initial; display: inline-flex; flex: none; height: 100%; vertical-align: top; position: relative; }
.group { display: flex; align-items: stretch; height: 100%; direction: ltr; font-family: var(--tj-p-font-body); --w: 48px; --icon: 22px; --badge: 44px; --badge-fs: 13px; --badge-pad: 8px; }
.group[data-size="compact"] { --w: 40px; --icon: 20px; --badge: 38px; --badge-fs: 12px; --badge-pad: 6px; }
.group[data-size="fullscreen"] { --w: 54px; --icon: 26px; --badge: 50px; --badge-fs: 15px; }
.btn { all: unset; box-sizing: border-box; position: relative; display: inline-flex; align-items: center; justify-content: center; flex: none; width: var(--w); height: 100%; color: var(--tj-p-icon); cursor: pointer; border-radius: 8px; -webkit-tap-highlight-color: transparent; }
.btn:hover { color: var(--tj-p-icon-hover); }
.btn:focus-visible { ${BAR_FOCUS} }
.btn[aria-disabled="true"], .btn[data-unavailable] { color: var(--tj-p-icon-disabled); }
.btn[aria-disabled="true"] { cursor: default; }
.icon { width: var(--icon); height: var(--icon); pointer-events: none; display: block; }
.badge { width: auto; min-width: var(--badge); padding: 0 var(--badge-pad); font: 700 var(--badge-fs)/1 var(--tj-p-font-body); font-variant-numeric: tabular-nums; letter-spacing: 0; white-space: nowrap; direction: ltr; unicode-bidi: isolate; }
.badge[data-sign="zero"] { color: rgb(255 255 255 / 70%); }
.badge[data-sign="positive"], .badge[data-sign="negative"] { color: var(--tj-p-accent); }
.badge[aria-disabled="true"] { color: var(--tj-p-icon-disabled); }
.btn[aria-expanded="true"] { background: rgb(255 255 255 / 12%); }
.btn[aria-expanded="true"] .icon { color: var(--tj-p-accent); }
.badge[data-pulse] { animation: tj-pulse ${PULSE_MS}ms ease-out; }
@keyframes tj-pulse { 0% { transform: scale(1); } 50% { transform: scale(1.14); } 100% { transform: scale(1); } }
.btn[data-busy] .icon { display: none; }
.btn[data-busy] { cursor: progress; }
.load { display: inline-flex; align-items: center; justify-content: center; gap: 5px; width: var(--icon); height: 10px; pointer-events: none; }
.load[hidden] { display: none; }
.load i { display: block; width: 7px; height: 7px; border-radius: 1px; background: currentColor; transform: rotate(45deg); opacity: 0.25; animation: tj-load ${LOAD_MS}ms ease infinite; }
.load i + i { animation-delay: ${LOAD_MS / 2}ms; }
@keyframes tj-load { 0%, 100% { opacity: 0.25; } 50% { opacity: 1; } }
.sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
@media (prefers-reduced-motion: reduce) { .badge[data-pulse] { animation: none; } .load i { animation-duration: ${LOAD_MS * 3}ms; } }`;
}

export function layerCss() {
  return `${playerTokensCss(':host')}
:host { all: initial; position: absolute; inset: 0; display: block; z-index: ${LAYER_Z}; pointer-events: none; direction: ltr; }
.layer { position: absolute; inset: 0; pointer-events: none; opacity: 1; transition: opacity ${BAR_FADE_MS}ms linear; font-family: var(--tj-p-font-body); color: var(--tj-p-menu-text); --fs: 13px; --title-fs: 14px; --tip-fs: 12px; --big-fs: 28px; --row: 32px; }
.layer[data-size="fullscreen"] { --fs: 15px; --title-fs: 16px; --tip-fs: 14px; --big-fs: 32px; --row: 38px; }
.layer[data-bar="hidden"]:not([data-typing]):not([data-keep]) { opacity: 0; }
.layer[data-bar="hidden"]:not([data-typing]):not([data-keep]) * { pointer-events: none !important; }
.layer[data-bar="hidden"][data-keep] .tip { display: none; }
.layer[data-bar="hidden"][data-typing] .tip { display: none; }
.menu, .toast, .tip { -webkit-font-smoothing: antialiased; }

/* التلميح: اسم الزر (ومعنى حالته) فوقه عند المرور والتركيز. بعرض محتواه (فلا ينحصر عند طرف المشغّل) وبسطرين إن طال. */
.tip { position: absolute; left: var(--x, 50%); bottom: var(--y, 60px); transform: translateX(-50%); width: max-content; max-width: min(360px, calc(100% - 16px)); box-sizing: border-box; padding: 5px 9px; border-radius: 4px; background: var(--tj-p-tooltip-bg); color: #FFFFFF; font: 700 var(--tip-fs)/1.5 var(--tj-p-font-body); text-align: center; overflow-wrap: anywhere; direction: rtl; pointer-events: none; }
.tip[hidden] { display: none; }

/* القائمة: لوحة مداد دافئ شفاف بعرض 280 (264 في المشغّل الضيق و320 في ملء الشاشة من layer.js)، صفوف 32، وتمرير داخلي منضبط حين
   يضيق ارتفاع المشغّل فقط (أقصى الارتفاع من layer.js)، دون تمرير أفقي. أقسامها تفصلها خطوط (.sep) بعرضها كله. */
.menu { position: absolute; left: var(--x, 8px); bottom: var(--y, 60px); box-sizing: border-box; width: var(--w, 280px); max-width: calc(100% - 16px); max-height: var(--max-h, 70%); overflow-x: hidden; overflow-y: auto; overscroll-behavior: contain; padding: 8px; display: flex; flex-direction: column; gap: 4px; background: var(--tj-p-menu-bg); color: var(--tj-p-menu-text); border-radius: var(--tj-p-menu-radius); box-shadow: 0 12px 32px rgb(0 0 0 / 45%), 0 0 0 1px var(--tj-p-menu-line); -webkit-backdrop-filter: blur(12px); backdrop-filter: blur(12px); direction: rtl; text-align: right; font: 400 var(--fs)/1.5 var(--tj-p-font-body); pointer-events: auto; animation: tj-in var(--tj-p-motion-menu) ease-out; scrollbar-width: thin; scrollbar-color: rgb(255 255 255 / 30%) transparent; }
.menu[hidden] { display: none; }
@keyframes tj-in { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: none; } }
.title { margin: 0; padding: 2px 6px; font: 700 var(--title-fs)/1.5 var(--tj-p-font-head); }
.head { display: flex; align-items: center; justify-content: space-between; gap: 8px; min-height: 28px; padding: 0 0 0 2px; }
.head .title { padding: 2px 6px; }
.label { padding: 0 6px; font-size: 0.93em; line-height: 1.5; font-weight: 700; color: var(--tj-p-menu-text-2); }

/* مجموعة أزرار الخانات (الترجمات الموجودة، و«حفظ في»): المختارة بالإبراز بحبر داكن. */
.slots { display: inline-flex; gap: 2px; padding: 2px; border-radius: 6px; background: rgb(255 255 255 / 8%); direction: ltr; flex: none; }
button.slot { all: unset; box-sizing: border-box; position: relative; display: inline-grid; place-items: center; min-width: 32px; height: 24px; padding: 0 7px; border-radius: 4px; font: 700 12px/1 var(--tj-p-font-body); font-variant-numeric: tabular-nums; color: var(--tj-p-menu-text-2); cursor: pointer; }
button.slot.slot--new { direction: rtl; padding: 0 9px; }
button.slot::after { content: ""; position: absolute; inset: -4px 0; } /* هدف 32 ارتفاعًا (CL-018) */
button.slot[aria-checked="true"] { background: var(--tj-p-accent); color: var(--tj-p-accent-ink); cursor: default; }
button.slot:hover:not([aria-checked="true"]):not([aria-disabled="true"]) { background: var(--tj-p-menu-hover); color: #FFFFFF; }
button.slot[aria-disabled="true"] { cursor: default; }
.slots[aria-disabled="true"] button.slot { opacity: 0.6; }
.row.target { justify-content: space-between; min-height: var(--row); }
.row.edits { min-height: 24px; font-size: 0.93em; }
.row.edits[data-tone="warn"] { color: var(--tj-p-warn); }
.row.edits[data-tone="ok"] { color: var(--tj-p-ok); }
label.item[aria-disabled="true"] { color: rgb(255 255 255 / 45%); cursor: default; background: none; }
.sentences { display: flex; flex-direction: column; gap: 2px; }
button.item.sentence { display: block; min-width: 0; line-height: var(--row); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; unicode-bidi: isolate; text-align: right; }
button.item.sentence[aria-current="true"] { box-shadow: inset -3px 0 0 var(--tj-p-accent); background: rgb(255 255 255 / 8%); }
.tag { align-self: flex-start; display: inline-flex; align-items: center; min-height: 22px; padding: 0 8px; margin: 0 6px; border-radius: 11px; background: rgb(255 255 255 / 10%); color: var(--tj-p-menu-text); font-size: 0.93em; font-weight: 700; white-space: nowrap; }

/* سطر النتيجة: رمز SVG بنغمته ونص ثانوي، واسم الملف LTR معزول داخل الجملة؛ والخطأ بنصه كله. */
.line { all: unset; box-sizing: border-box; display: flex; align-items: flex-start; gap: 6px; padding: 1px 6px; font-size: 0.93em; line-height: 1.5; color: var(--tj-p-menu-text-2); unicode-bidi: isolate; overflow-wrap: anywhere; }
.line[data-tone="ok"] .glyph { color: var(--tj-p-ok); }
.line[data-tone="info"] .glyph { color: var(--tj-p-menu-text-2); }
.line[data-tone="error"] { color: var(--tj-p-error); }
.line__text { unicode-bidi: plaintext; text-align: right; min-width: 0; }
button.line { cursor: pointer; text-decoration: underline; text-underline-offset: 3px; }
.steps { direction: rtl; font-weight: 700; color: var(--tj-p-menu-text); }
.note-in { font-size: 0.93em; color: var(--tj-p-menu-text-2); }
.parts { display: flex; flex-direction: column; padding: 0 0 2px; }
.row.part { min-height: 22px; font: 500 0.93em/1.4 var(--tj-p-font-mono); color: var(--tj-p-menu-text-2); }
.row { box-sizing: border-box; min-height: var(--row); display: flex; align-items: center; gap: 8px; padding: 0 6px; }
.row.file { min-height: 22px; gap: 6px; }
.row.file .name { font: 500 0.93em/1.5 var(--tj-p-font-mono); color: var(--tj-p-menu-text-2); }
.row.summary { min-height: 22px; gap: 6px; font-size: 0.93em; color: var(--tj-p-menu-text-2); }
.row.status { min-height: 24px; gap: 6px; font-size: 0.93em; color: var(--tj-p-menu-text-2); unicode-bidi: isolate; }
.row.status[data-tone="ok"] .glyph { color: var(--tj-p-ok); }
.row.status[data-tone="warn"] .glyph { color: var(--tj-p-warn); }
.dim { color: var(--tj-p-menu-text-2); white-space: nowrap; }
.note { padding: 0 6px; font-size: 0.93em; line-height: 1.5; color: var(--tj-p-menu-text-2); }
.alert { padding: 6px 8px; border-radius: 6px; display: flex; gap: 8px; align-items: flex-start; line-height: 1.5; }
.alert[data-tone="info"] { background: rgb(255 255 255 / 8%); }
.alert[data-tone="warn"] { background: color-mix(in srgb, var(--tj-p-warn) 14%, transparent); }
.alert[data-tone="error"] { background: color-mix(in srgb, var(--tj-p-error) 14%, transparent); }
.alert[data-tone="info"] .glyph { color: var(--tj-p-menu-text-2); }
.alert[data-tone="warn"] .glyph { color: var(--tj-p-warn); }
.alert[data-tone="error"] .glyph { color: var(--tj-p-error); }
.summary[data-tone="warn"] .glyph { color: var(--tj-p-warn); }
.summary[data-tone="ok"] .glyph { color: var(--tj-p-ok); }
.sep { height: 1px; margin: 2px -8px; background: var(--tj-p-menu-line); flex: none; }
.ltr { direction: ltr; unicode-bidi: isolate; }
.mono { font-family: var(--tj-p-font-mono); }
.name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; direction: ltr; unicode-bidi: isolate; min-width: 0; }

/* رموز الحالة SVG (glyphs.js) بحجم السطر، بلون نغمته. */
svg.glyph { flex: none; width: 1.08em; height: 1.08em; margin-top: 0.2em; fill: none; stroke: currentColor; stroke-width: 2.2; stroke-linecap: round; stroke-linejoin: round; }
svg.glyph--btn { width: 16px; height: 16px; margin: 0; }
.layer[data-size="fullscreen"] svg.glyph--btn { width: 18px; height: 18px; }
.row.summary svg.glyph, .row.status svg.glyph { margin-top: 0; }

button.item { all: unset; box-sizing: border-box; min-height: var(--row); display: flex; align-items: center; gap: 8px; padding: 0 8px; border-radius: 6px; cursor: pointer; width: 100%; }
button.item:hover { background: var(--tj-p-menu-hover); }
button.item[aria-disabled="true"] { color: rgb(255 255 255 / 45%); cursor: default; background: none; }
button.item[role="menuitemradio"]::before { content: ""; flex: none; width: 14px; height: 14px; border-radius: 50%; box-shadow: inset 0 0 0 2px rgb(255 255 255 / 60%); }
button.item[aria-checked="true"] { color: var(--tj-p-accent); font-weight: 700; }
button.item[aria-checked="true"]::before { box-shadow: inset 0 0 0 2px var(--tj-p-accent); background: radial-gradient(circle, var(--tj-p-accent) 0 3.5px, transparent 4px); }
button.item[aria-expanded]::after { content: ""; margin-inline-start: auto; width: 6px; height: 6px; border-inline-start: 2px solid currentColor; border-block-end: 2px solid currentColor; transform: rotate(45deg); transition: transform 140ms; opacity: 0.8; }
button.item[aria-expanded="true"]::after { transform: rotate(-45deg); }
.reason { display: block; font-size: 0.93em; font-weight: 400; color: rgb(255 255 255 / 55%); }
.stack { display: flex; flex-direction: column; min-width: 0; }

/* صفوف الإجراءات: الرئيسي بالإبراز وحبر داكن، والثانوي شفاف محايد؛ في صف واحد بعرضين متساويين. */
.actions { display: flex; flex-direction: column; gap: 6px; padding: 2px 0 0; }
.actions.inline { flex-direction: row; }
.actions.inline > * { flex: 1 1 0; min-width: 0; }
button.primary, button.secondary, button.danger { all: unset; box-sizing: border-box; min-height: var(--row); display: flex; align-items: center; justify-content: center; gap: 6px; padding: 0 10px; border-radius: 6px; font-weight: 700; cursor: pointer; text-align: center; line-height: 1.25; }
button.primary > .stack, button.secondary > .stack { min-width: 0; }
button.primary { background: var(--tj-p-accent); color: var(--tj-p-accent-ink); }
button.primary:hover { filter: brightness(1.08); }
button.secondary { background: rgb(255 255 255 / 8%); color: #FFFFFF; }
button.secondary:hover { background: rgb(255 255 255 / 14%); }
button.danger { background: var(--tj-p-error); color: var(--tj-p-accent-ink); }
button.primary[aria-disabled="true"], button.secondary[aria-disabled="true"] { opacity: 0.45; cursor: default; filter: none; }
button.primary[aria-busy="true"] { cursor: progress; }
button.link { all: unset; cursor: pointer; color: var(--tj-p-accent); text-decoration: underline; text-underline-offset: 3px; font-size: 0.93em; font-weight: 700; padding: 7px 4px; margin: -7px -4px; } /* «لماذا؟» بهدف 32 دون تغيير السطر (CL-018) */

/* المقطّعة: خيار واحد من قليل في صف (وضع التصدير، وأوضاع العرض، والخطوة)؛ المختار بالإبراز بحبر داكن. */
.seg { display: flex; gap: 2px; padding: 2px; border-radius: 6px; background: rgb(255 255 255 / 8%); }
.seg button { all: unset; box-sizing: border-box; flex: 1 1 0; min-width: 0; min-height: calc(var(--row) - 4px); display: flex; align-items: center; justify-content: center; padding: 0 6px; border-radius: 4px; cursor: pointer; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; color: var(--tj-p-menu-text-2); font-weight: 700; }
.seg button:hover:not([aria-checked="true"]):not([aria-disabled="true"]) { background: var(--tj-p-menu-hover); color: #FFFFFF; }
.seg button[aria-checked="true"] { background: var(--tj-p-accent); color: var(--tj-p-accent-ink); }
.seg button[aria-disabled="true"] { opacity: 0.45; cursor: default; }
/* المقطّعة بجوار تسميتها في صف (خطوة الأزرار): بعرض محتواها فلا يُقص «مخصص»، والتسمية تأخذ الباقي. */
.row.field > .seg { flex: none; }
.row.field > .seg button { flex: none; min-width: 34px; padding: 0 9px; }

.big { padding: 2px 6px 0; text-align: center; font: 700 var(--big-fs)/1.3 var(--tj-p-font-head); }
.big[data-sign="positive"], .big[data-sign="negative"] { color: var(--tj-p-accent); }
.meaning { padding: 0 6px 2px; text-align: center; font-size: 0.93em; color: var(--tj-p-menu-text-2); }
.field { justify-content: space-between; }
.field label, .field .flabel { flex: 1; white-space: nowrap; font-weight: 700; color: var(--tj-p-menu-text-2); font-size: 0.93em; }
.row.field > .seg + * { flex: none; }
.field .unit { color: var(--tj-p-menu-text-2); }
input.num { all: unset; box-sizing: border-box; width: 80px; height: 28px; padding: 0 8px; border-radius: 6px; direction: ltr; text-align: left; font: 500 var(--fs)/1 var(--tj-p-font-mono); color: #FFFFFF; background: rgb(255 255 255 / 6%); box-shadow: inset 0 0 0 1px rgb(255 255 255 / 35%); cursor: text; }
input.num:focus { box-shadow: inset 0 0 0 2px var(--tj-p-accent); }
input.num[aria-invalid="true"] { box-shadow: inset 0 0 0 2px var(--tj-p-error); }
.field-error { padding: 0 6px 2px; color: var(--tj-p-error); font-size: 0.93em; }
.field-error:empty, .field-error[hidden] { display: none; }
input.check { flex: none; width: 16px; height: 16px; margin: 0; accent-color: var(--tj-p-accent); }
label.item { box-sizing: border-box; min-height: var(--row); display: flex; align-items: center; gap: 8px; padding: 0 8px; border-radius: 6px; cursor: pointer; }
label.item:hover { background: var(--tj-p-menu-hover); }

/* الرسائل العابرة فوق سطر الترجمة: ثلاث على الأكثر بعرض واحد، والإجراء («تراجع») بالإبراز مسطّرًا في طرفها. */
.toasts { position: absolute; left: 50%; bottom: var(--y, 60px); transform: translateX(-50%); width: min(420px, calc(100% - 24px)); display: flex; flex-direction: column; align-items: stretch; gap: 8px; pointer-events: none; }
.toast { box-sizing: border-box; max-width: 100%; display: flex; align-items: center; gap: 10px; padding: 8px 12px; border-radius: 8px; background: var(--tj-p-menu-bg); color: #FFFFFF; direction: rtl; font: 400 var(--fs)/1.5 var(--tj-p-font-body); box-shadow: 0 8px 24px rgb(0 0 0 / 40%), 0 0 0 1px var(--tj-p-menu-line); -webkit-backdrop-filter: blur(12px); backdrop-filter: blur(12px); pointer-events: auto; animation: tj-in var(--tj-p-motion-toast) ease-out; }
.toast[data-tone="error"] { box-shadow: 0 8px 24px rgb(0 0 0 / 40%), inset 0 0 0 1px color-mix(in srgb, var(--tj-p-error) 50%, transparent); }
.toast svg.glyph { margin-top: 0; width: 16px; height: 16px; }
.toast[data-tone="success"] .glyph { color: var(--tj-p-ok); }
.toast[data-tone="info"] .glyph { color: var(--tj-p-menu-text-2); }
.toast[data-tone="warning"] .glyph { color: var(--tj-p-warn); }
.toast[data-tone="error"] .glyph { color: var(--tj-p-error); }
.toast .text { min-width: 0; flex: 1 1 auto; overflow-wrap: anywhere; }
.toast button.x { all: unset; flex: none; cursor: pointer; width: 26px; height: 26px; display: flex; align-items: center; justify-content: center; border-radius: 6px; background: rgb(255 255 255 / 8%); color: #FFFFFF; }
.toast button.x .glyph { color: inherit; width: 14px; height: 14px; }
.toast button.x:hover { background: var(--tj-p-menu-hover); }
.toast button.act { all: unset; flex: none; cursor: pointer; padding: 2px 8px; border-radius: 6px; font-weight: 700; color: var(--tj-p-accent); text-decoration: underline; text-underline-offset: 3px; }
.toast button.act:hover { background: var(--tj-p-menu-hover); }

.menu :focus-visible, .toast :focus-visible { ${FOCUS} }
input.num:focus-visible { outline: none; box-shadow: inset 0 0 0 2px var(--tj-p-accent); }
@media (prefers-reduced-motion: reduce) { .menu, .toast { animation: none; } .layer { transition: none; } }`;
}
