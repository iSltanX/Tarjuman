// أنماط لوحة النص المتزامن: ورقة واحدة داخل Shadow DOM مغلق، فلا تتسرب أنماط يوتيوب إليها ولا أنماطها إلى يوتيوب. القيم من
// tokens.js (المطابقة لـsrc/ui/tokens.css باختبار)، والبنية والحالات من لوحات التصميم WatchPanel وPanelStates وWatchNarrow، والهوية
// الخامسة «التاء» (لوحة 13): رأس 52 برمز الشعار 22، والمقطع الحالي واحد لا يلتبس بصبغة المضيء ونقطة التاء وزمن بنص اللحظة.
// الاتجاه RTL، والأزمنة والإزاحة معزولة LTR. الألوان بالرموز وحدها، ولا ظل للبطاقة (طبقات مسطّحة)؛ خط حافة للقائمة والرسالة.
import { panelTokensCss } from './tokens.js';

export const HOST_ID = 'tarjuman-panel';
/** عرض العمود (px) حتى هذا الحد «ضيق»: تسميات مختصرة و±بلا كلمات. */
export const NARROW_MAX = 320;
/** عرض العمود (px) من هذا الحد «عريض» (اللوحة تحت الفيديو): القائمة بجانب عمود التوقيت. */
export const WIDE_MIN = 560;
/** أدنى ارتفاع للوحة المفتوحة بجانب الفيديو: مشغّل قصير (نافذة ضيقة) لا يترك للقائمة بضعة أسطر. */
export const MIN_HEIGHT = 400;

export function panelCss() {
  return `${panelTokensCss('.root')}
:host { all: initial; display: block; flex: none; box-sizing: border-box; width: 100%; min-width: 0; margin: 0 0 12px; }
:host([dir="rtl"]) { direction: rtl; }
:host([dir="ltr"]) { direction: ltr; }
:host([hidden]) { display: none !important; }
:host([data-mode="open"]) { height: max(var(--tj-panel-h, 480px), ${MIN_HEIGHT}px); }
:host([data-mode="open"][data-place="below"]) { height: clamp(300px, 46vh, 420px); }
*, *::before, *::after { box-sizing: border-box; }
[hidden] { display: none !important; }

.root { height: 100%; display: flex; flex-direction: column; font: 400 14px/22px var(--tj-font-body); color: var(--tj-text); text-align: start; -webkit-font-smoothing: antialiased; text-rendering: optimizeLegibility; }
.ltr { direction: ltr; unicode-bidi: isolate; display: inline-block; }
.spacer { flex: 1 1 auto; }
.muted { color: var(--tj-muted); }

.ic { width: 18px; height: 18px; flex: none; display: block; fill: none; stroke: currentColor; stroke-width: 1.75; stroke-linecap: round; stroke-linejoin: round; pointer-events: none; }
.ic--sm { width: 16px; height: 16px; }
.ic--xs { width: 14px; height: 14px; stroke-width: 2; }
.mark { display: block; flex: none; direction: ltr; pointer-events: none; color: var(--tj-logo-glyph); }
.mark path { fill: currentColor; }

.b, .switch, .resume, .act, .t, .segs button { all: unset; box-sizing: border-box; cursor: pointer; -webkit-tap-highlight-color: transparent; }
.b:focus-visible, .switch:focus-visible, .resume:focus-visible, .act:focus-visible, .segs button:focus-visible, .t:focus-visible, .num:focus-visible { outline: 2px solid var(--tj-focus); outline-offset: 2px; }

/* الأزرار بلا إطار دائم (لوحة 08): بخلفية الزر المحايدة والمرور والضغط أغمق منها، والشفاف بلا خلفية حتى المرور. الحد الشفاف
   يحفظ المقاس. (قائمة الخيارات ونمطها المفتوح حُذفا في ح4.) */
.b { display: inline-flex; align-items: center; justify-content: center; gap: 6px; height: var(--tj-control-sm); min-width: var(--tj-control-sm); padding: 0 10px; border: 1px solid transparent; border-radius: var(--tj-radius-md); background: var(--tj-control); color: var(--tj-text); font: 700 13px/20px var(--tj-font-body); white-space: nowrap; }
.b:hover { background: var(--tj-control-hover); }
.b:active { background: var(--tj-control-pressed); }
.b--ghost { background: transparent; color: var(--tj-text-2); }
.b--ghost:hover { background: var(--tj-hover); color: var(--tj-text); }
.b--ghost:active { background: var(--tj-pressed); }
.b--icon { padding: 0; width: var(--tj-control-sm); }
.b[aria-disabled="true"] { opacity: .5; cursor: not-allowed; }
.b[aria-disabled="true"]:hover, .b[aria-disabled="true"]:active { background: var(--tj-control); }
.b--ghost[aria-disabled="true"]:hover, .b--ghost[aria-disabled="true"]:active { background: transparent; }

/* اللوحة */
.panel { flex: 1 1 auto; min-height: 0; display: flex; flex-direction: column; position: relative; overflow: hidden; background: var(--tj-surface); border: 1px solid var(--tj-border); border-radius: var(--tj-radius-xl); }
.head { grid-area: head; position: relative; z-index: 1; flex: none; height: 52px; display: flex; align-items: center; gap: 8px; padding: 0; padding-inline: 14px 8px; }
/* حافة الصفحة تحت الرأس (الهوية «التاء»، لوحة 13): خط ينثني في وسطه كالخط الأعلى للكتاب في الشعار، بلا مساحة في التخطيط. */
.head::after { content: ""; position: absolute; inset-inline: 0; top: 100%; height: 8px; background: var(--tj-border-strong); -webkit-mask: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 340 8' preserveAspectRatio='none'%3E%3Cpath d='M0 1 C90 1 150 6 166 7.2 Q170 7.6 174 7.2 C190 6 250 1 340 1' fill='none' stroke='%23000' stroke-width='1.2' vector-effect='non-scaling-stroke'/%3E%3C/svg%3E") center / 100% 100% no-repeat; mask: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 340 8' preserveAspectRatio='none'%3E%3Cpath d='M0 1 C90 1 150 6 166 7.2 Q170 7.6 174 7.2 C190 6 250 1 340 1' fill='none' stroke='%23000' stroke-width='1.2' vector-effect='non-scaling-stroke'/%3E%3C/svg%3E") center / 100% 100% no-repeat; pointer-events: none; }
.head__mark { width: 22px; flex: none; display: flex; justify-content: center; }
.title { margin: 0; font: 700 16px/24px var(--tj-font-head); color: var(--tj-text); }
.load { display: inline-flex; align-items: center; gap: 6px; height: 10px; margin-inline-end: 10px; color: var(--tj-accent); }
.load i { width: 7px; height: 8px; background: currentColor; clip-path: polygon(62% 0, 100% 50%, 38% 100%, 0 50%); animation: tj-pulse 900ms var(--tj-ease) infinite; }
.load i + i { animation-delay: 450ms; }
@keyframes tj-pulse { 0%, 100% { opacity: .25; } 50% { opacity: 1; } }


/* الشريط: الحالة والنص والمتابعة */
.bar { grid-area: bar; flex: none; display: flex; flex-direction: column; gap: 8px; padding: 10px 14px; border-bottom: 1px solid var(--tj-border); }
.status { display: flex; align-items: center; gap: 6px; font-size: 12px; line-height: 18px; color: var(--tj-text-2); white-space: nowrap; overflow: hidden; }
.status__text { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dot { width: 6px; height: 7px; flex: none; background: var(--tj-success); clip-path: polygon(62% 0, 100% 50%, 38% 100%, 0 50%); }
.ctl { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.segs { display: inline-flex; padding: 2px; gap: 2px; border-radius: var(--tj-radius-md); background: var(--tj-surface-2); }
.segs button { display: inline-flex; align-items: center; height: 24px; padding: 0 8px; border-radius: var(--tj-radius-sm); color: var(--tj-text-2); font: 700 12px/24px var(--tj-font-body); white-space: nowrap; }
.segs button:hover:not([aria-checked="true"]):not([aria-disabled="true"]) { background: var(--tj-hover); color: var(--tj-text); }
.segs button[aria-checked="true"] { background: var(--tj-selected); color: var(--tj-selected-ink); }
.segs button[aria-disabled="true"] { opacity: .45; cursor: not-allowed; }
.switch { display: inline-flex; align-items: center; gap: 10px; color: var(--tj-text-2); font: 700 13px/20px var(--tj-font-body); }
.switch__track { width: 34px; height: 20px; flex: none; display: flex; justify-content: flex-start; padding: 2px; border-radius: 999px; background: var(--tj-surface-3); box-shadow: inset 0 0 0 1px var(--tj-border-input); transition: background-color var(--tj-motion-menu); }
.switch__thumb { width: 16px; height: 16px; border-radius: 50%; background: #FFFFFF; box-shadow: 0 1px 2px rgb(0 0 0 / 25%); }
.switch[aria-checked="true"] .switch__track { background: var(--tj-accent); box-shadow: none; justify-content: flex-end; }
/* المقبض المشغَّل بسطح الوضع: ‎--tj-accent-ink ليس في مرآة اللوحة فكان شفافًا (المطابقة البصرية لـST2)، والأبيض على المضيء الليلي دون 3:1. */
.switch[aria-checked="true"] .switch__thumb { background: var(--tj-surface); }
.inline-error, .act-error { display: flex; gap: 8px; align-items: flex-start; padding: 8px 10px; border-radius: var(--tj-radius-md); background: var(--tj-danger-bg); font-size: 12px; line-height: 18px; }
.inline-error .ic, .act-error .ic { color: var(--tj-danger); margin-top: 1px; }
.inline-error .b { margin-inline-start: auto; }
.act-error { flex: none; grid-area: note; margin: 8px 14px 0; align-items: center; }
.act-error .b { margin-inline-start: auto; height: 24px; min-width: 24px; width: 24px; }

/* الجسم: الصفوف، والهيكل، والخطوات، والخطأ */
.body { grid-area: body; flex: 1 1 auto; min-height: 0; position: relative; display: flex; flex-direction: column; }
.body[data-kind="ready"]::after { content: ""; position: absolute; left: 0; right: 0; bottom: 0; height: 32px; background: linear-gradient(to bottom, transparent, var(--tj-surface)); pointer-events: none; }
.list { flex: 1 1 auto; min-height: 0; position: relative; overflow-x: hidden; overflow-y: auto; overscroll-behavior: contain; padding: 6px; display: flex; flex-direction: column; gap: 1px; scrollbar-width: thin; scrollbar-color: var(--tj-border-strong) transparent; }
.row { flex: none; display: grid; grid-template-columns: 52px minmax(0, 1fr); gap: 8px; align-items: start; padding: 8px 0; padding-inline: 10px 12px; border-radius: var(--tj-radius-lg); cursor: pointer; }
.row:hover { background: var(--tj-hover); }
.t { display: flex; align-items: center; justify-content: flex-end; gap: 4px; height: 26px; border-radius: var(--tj-radius-sm); color: var(--tj-muted); font: 400 12px/26px var(--tj-font-mono); font-variant-numeric: tabular-nums; direction: ltr; cursor: pointer; }
.root[dir="ltr"] .t { justify-content: flex-start; }
.t::before { content: ""; display: none; width: 0; height: 0; border-style: solid; border-width: 4px 0 4px 7px; border-color: transparent transparent transparent currentColor; }
.row:hover .t { color: var(--tj-text); text-decoration: underline; text-underline-offset: 3px; }
.row:hover .t::before { display: block; }
.b2 { min-width: 0; }
.ar { display: block; font-size: 16px; line-height: 26px; color: var(--tj-text); text-align: match-parent; overflow-wrap: anywhere; unicode-bidi: isolate; }
.en { display: block; margin-top: 1px; font-size: 12px; line-height: 18px; color: var(--tj-text-2); text-align: match-parent; unicode-bidi: isolate; overflow-wrap: anywhere; }
.row.past .ar { color: var(--tj-text-2); }
.row.cur { background: var(--tj-current); }
.row.cur .t { color: var(--tj-current-ink); font-weight: 700; }
.row.cur .t::before { display: none; }
.row.cur .t::after { content: ""; order: -1; width: 7px; height: 8px; background: var(--tj-mark); clip-path: polygon(62% 0, 100% 50%, 38% 100%, 0 50%); }
.row.cur .ar { font-weight: 700; }
/* أفعال الصف (ف9): شريط واحد على طرف الصف الممرور عليه أو المركّز (يُرى بالمرور والتركيز وحدهما)، و«أعود إليه» خط على بدايته */
.row { position: relative; }
.row[data-mark="todo"]::before { content: ""; position: absolute; inset-block: 8px; inset-inline-start: 2px; width: 3px; border-radius: 2px; background: var(--tj-warning); }
.acts { position: absolute; top: 4px; inset-inline-end: 6px; z-index: 1; display: flex; gap: 2px; padding: 2px; border: 1px solid var(--tj-border); border-radius: var(--tj-radius-md); background: var(--tj-surface); opacity: 0; pointer-events: none; }
.row:hover > .acts, .row:focus-within > .acts { opacity: 1; pointer-events: auto; }
.ra { all: unset; box-sizing: border-box; width: 28px; height: 28px; display: inline-flex; align-items: center; justify-content: center; border-radius: var(--tj-radius-sm); color: var(--tj-text-2); cursor: pointer; }
.ra:hover { background: var(--tj-hover); color: var(--tj-text); }
.ra:focus-visible { outline: 2px solid var(--tj-focus); outline-offset: 1px; }
.ra[aria-pressed="true"] { color: var(--tj-warning); }
.ra[aria-pressed="true"] .ic path { fill: currentColor; }
.ra[aria-disabled="true"] { opacity: .45; cursor: not-allowed; }
.sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
/* تحرير نص المقطع (الفكرة ٦): الحقل مكان نص الصف بمقاسه وخطه، بحدّ الحقول (الهوية §٣) والتركيز طيني بهالة 3px؛ و«حفظ» الإجراء
   الرئيسي الواحد بالأرجوان العميق، و«إلغاء» شفاف، وسطر المفاتيح خافت. الصف المحرَّر لا يُنقر للقفز (المؤشر عادي). */
.row.editing { cursor: auto; }
.edit { display: flex; flex-direction: column; gap: 6px; }
.edit__field { display: block; box-sizing: border-box; width: 100%; margin: 0; padding: 6px 10px; resize: none; overflow-y: auto; border: 1px solid var(--tj-border-input); border-radius: var(--tj-radius-md); background: var(--tj-surface); color: var(--tj-text); font: 400 16px/26px var(--tj-font-body); white-space: pre-wrap; overflow-wrap: anywhere; text-align: start; }
.edit__field:focus { outline: 2px solid transparent; border-color: var(--tj-accent); box-shadow: 0 0 0 3px var(--tj-accent-track); }
.edit__field[aria-invalid="true"] { border-color: var(--tj-danger); }
.edit__field[readonly] { color: var(--tj-text-2); }
.edit__msg { font-size: 12px; line-height: 18px; color: var(--tj-danger); }
.edit__bar { display: flex; align-items: center; gap: 6px; }
.edit__hint { flex: 1 1 auto; min-width: 0; font-size: 12px; line-height: 18px; color: var(--tj-muted); }
.b--primary { background: var(--tj-brand); color: var(--tj-brand-ink); }
.b--primary:hover { background: var(--tj-brand-hover); }
.b--primary:active { background: var(--tj-brand-hover); }
.b--primary[aria-disabled="true"]:hover, .b--primary[aria-disabled="true"]:active { background: var(--tj-brand); }
.notes { grid-area: note; flex: none; display: flex; flex-direction: column; }
.note { display: flex; align-items: center; gap: 8px; margin: 8px 14px 0; padding: 4px; padding-inline-start: 12px; border-radius: var(--tj-radius-md); background: var(--tj-text); color: var(--tj-on-ink); font-size: 13px; line-height: 20px; }
.note__text { min-width: 0; }
.note__act { all: unset; box-sizing: border-box; cursor: pointer; margin-inline-start: auto; flex: none; display: inline-flex; align-items: center; height: 28px; padding: 0 10px; border-radius: var(--tj-radius-md); font-weight: 700; text-decoration: underline; text-underline-offset: 3px; }
.note__act:focus-visible { outline: 2px solid var(--tj-focus); outline-offset: 2px; }
.prog { display: block; margin-top: 6px; height: 3px; border-radius: 2px; background: var(--tj-accent-track); overflow: hidden; }
.prog i { display: block; height: 3px; border-radius: 2px; background: var(--tj-accent); transform-origin: right center; transform: scaleX(0); }
.root[dir="ltr"] .prog i { transform-origin: left center; }
.resume { position: absolute; bottom: 12px; left: 50%; transform: translateX(-50%); z-index: 2; display: inline-flex; align-items: center; gap: 6px; height: 32px; padding: 0 14px; border-radius: 999px; background: var(--tj-text); color: var(--tj-on-ink); box-shadow: var(--tj-e3); font: 700 13px/20px var(--tj-font-body); white-space: nowrap; }

.skel { padding: 14px 16px; display: flex; flex-direction: column; gap: 18px; overflow: hidden; }
.skel__row { display: flex; gap: 12px; }
.skel__col { flex: 1; display: flex; flex-direction: column; gap: 8px; }
.skel__bar { display: block; height: 12px; border-radius: var(--tj-radius-sm); background: var(--tj-surface-2); animation: tj-skel 1400ms ease-in-out infinite; }
.skel__bar--t { width: 40px; flex: none; }
@keyframes tj-skel { 0%, 100% { opacity: 1; } 50% { opacity: .5; } }
@media (prefers-reduced-motion: reduce) { .skel__bar, .load i { animation: none; } .switch__track { transition: none; } }

.empty, .err { padding: 18px 16px; display: flex; flex-direction: column; gap: 12px; overflow: auto; }
.empty__title { margin: 0; font: 700 16px/24px var(--tj-font-head); color: var(--tj-text); }
.steps { list-style: none; margin: 0; padding: 12px; display: flex; flex-direction: column; gap: 8px; border-radius: var(--tj-radius-lg); background: var(--tj-surface-2); }
.steps li { display: flex; align-items: center; gap: 10px; font-size: 13px; line-height: 20px; color: var(--tj-muted); }
.steps__n { width: 22px; height: 22px; flex: none; display: inline-flex; align-items: center; justify-content: center; border: 1.5px solid var(--tj-border-strong); border-radius: 50%; font-size: 12px; font-weight: 700; color: var(--tj-muted); }
.steps li.done { color: var(--tj-text-2); }
.steps li.done .steps__n { border-color: var(--tj-success); background: var(--tj-success-bg); color: var(--tj-success); }
.steps li.now { color: var(--tj-text); }
.steps li.now .steps__n { border-color: var(--tj-brand); background: var(--tj-brand); color: var(--tj-brand-ink); }
.alert { display: flex; gap: 10px; align-items: flex-start; padding: 10px 12px; border-radius: var(--tj-radius-md); background: var(--tj-danger-bg); font-size: 13px; line-height: 20px; }
.alert .ic { color: var(--tj-danger); margin-top: 1px; }
.alert__body { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.alert__title { font-weight: 700; }
.err__actions { display: flex; gap: 8px; }

/* التذييل: توقيت الترجمة المشترك */
.foot { grid-area: side; flex: none; display: flex; flex-direction: column; gap: 8px; padding: 10px 14px 12px; border-top: 1px solid var(--tj-border); background: var(--tj-sunken); }
.foot__row { display: flex; align-items: center; gap: 8px; }
.foot__title { font-size: 13px; line-height: 20px; font-weight: 700; }
.foot__hint { font-size: 12px; line-height: 18px; color: var(--tj-muted); }
.off { display: flex; align-items: center; gap: 6px; direction: ltr; }
.off .b { height: var(--tj-control-lg); }
.off .b:not(.b--icon) { padding: 0 12px; }
.off__val { flex: 1 1 auto; min-width: 0; height: var(--tj-control-lg); display: flex; align-items: center; justify-content: center; gap: 4px; border-radius: var(--tj-radius-md); background: var(--tj-brand-soft); color: var(--tj-brand-text); font-size: 13px; font-weight: 700; white-space: nowrap; }
.off__val b { font: 700 16px/24px var(--tj-font-mono); font-variant-numeric: tabular-nums; direction: ltr; unicode-bidi: isolate; } /* الإزاحة رقم تقني بالأحادي (اللوحة 13، والهوية §٤) */
.off__val.zero { background: var(--tj-surface-2); color: var(--tj-text-2); }
.num { all: unset; box-sizing: border-box; width: 56px; height: 24px; padding: 0 6px; border: 1px solid var(--tj-border-input); border-radius: var(--tj-radius-sm); background: var(--tj-surface); color: var(--tj-text); font: 700 12px/22px var(--tj-font-mono); direction: ltr; text-align: center; }
.num[aria-invalid="true"] { border-color: var(--tj-danger); }
.field-error { font-size: 12px; line-height: 18px; color: var(--tj-danger); }

/* رسالة التراجع (الزر مخفي) */
.toast { display: flex; align-items: center; gap: 12px; min-height: 44px; padding: 8px; padding-inline-end: 14px; border-radius: var(--tj-radius-lg); background: var(--tj-text); color: var(--tj-on-ink); box-shadow: var(--tj-e3); font-size: 14px; line-height: 20px; }
.toast .ic { opacity: .85; }
.act { display: inline-flex; align-items: center; height: 30px; padding: 0 10px; border-radius: var(--tj-radius-md); font-weight: 700; text-decoration: underline; text-underline-offset: 3px; }

/* عمود ضيق (≤ ${NARROW_MAX}px): تسميات مختصرة، و− و+ أيقونتان بلا كلمات، وحواشٍ أصغر */
.root[data-narrow] .head { height: 46px; }
.root[data-narrow] .bar { padding: 6px 10px; gap: 6px; }
.root[data-narrow] .foot { padding: 8px 10px; }
.root[data-narrow] .row { padding: 6px 8px; }
.root[data-narrow] .ar, .root[data-narrow] .edit__field { font-size: 14px; line-height: 22px; }
.root[data-narrow] .off .lbl, .root[data-narrow] .off__val .mean { display: none; }
.root[data-narrow] .off .b { width: var(--tj-control-lg); padding: 0; }
.root[data-narrow] .foot__hint { display: none; }

/* عريض (≥ ${WIDE_MIN}px، اللوحة تحت الفيديو): القائمة وعمود التوقيت جنبًا إلى جنب */
.root[data-wide][data-kind="ready"] .panel { display: grid; grid-template-columns: minmax(0, 1fr) 248px; grid-template-rows: auto auto auto minmax(0, 1fr); grid-template-areas: "head head" "note note" "bar side" "body side"; }
.root[data-wide][data-kind="ready"] .foot { border-top: 0; border-inline-start: 1px solid var(--tj-border); justify-content: center; }
.root[data-wide][data-kind="ready"] .foot__hint { display: none; }
.root[data-wide][data-kind="ready"] .off .lbl, .root[data-wide][data-kind="ready"] .off__val .mean { display: none; }
.root[data-wide][data-kind="ready"] .off .b { width: var(--tj-control-lg); padding: 0; }
/* ت-٥ (تحقق Fable للتصميم): المختار في وضع التباين العالي بحدّ بلون النظام، والمفتاح بمسار وإبهام ظاهرين. */
@media (forced-colors: active) {
  .segs button[aria-checked="true"], .ra[aria-pressed="true"] { outline: 2px solid Highlight; outline-offset: -2px; }
  .switch__track { border: 1px solid CanvasText; }
  .switch__thumb { forced-color-adjust: none; background: CanvasText; }
  .switch[aria-checked="true"] .switch__track { forced-color-adjust: none; background: Highlight; }
  .switch[aria-checked="true"] .switch__thumb { background: HighlightText; }
}`;
}
