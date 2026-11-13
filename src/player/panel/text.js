// نصوص لوحة النص المتزامن ودوالها النقية (docs/product-spec.md §٦.٦، ولوحات التصميم WatchPanel وPanelStates وWatchNarrow).
// أرقام لاتينية، والإزاحة بعلامتها (formatOffset)، والعدّ بالعربية (formatCount). لا شيء هنا يعرف DOM.
import { t, texts } from '../../i18n/index.js';
import { COUNT_FORMS, formatCount, formatOffset, isolate, ltrInline } from '../../ui/format.js';
import { languageName as sharedLanguageName } from '../../ui/lang.js';
import { trackDescription } from '../../ui/track.js';

/** نصوص اللوحة من الفهرس (player.panel) باللغة الحالية عند كل قراءة. */
export const LABELS = texts('player.panel');

const T = (key, params) => t(`player.panel.${key}`, params);

/**
 * سطر الخطوة المنجزة في حالة الفراغ: ما التُقط من الأصل بالوصف الواحد مع النافذة وقائمة «تنزيل الأصل» (ح-57، src/ui/track.js)، باللغة
 * الأساسية وحدها كبقية اللوحة: «الإنجليزية · تلقائية · 412 مقطعًا · ملتقطة»، و«العربية، ترجمها يوتيوب آليًا عن الإنجليزية · 412 مقطعًا · محفوظة».
 * @param {{ lang: string, via?: string | null, kind: 'manual' | 'asr', saved: boolean, count: number }} cap via: رمز لغة المصدر
 */
export const captureLine = (cap) => trackDescription(cap, { count: cap.count, state: cap.saved ? 'saved' : 'captured', region: false });

/**
 * اسم لغة الأصل للوحة: اللغة الأساسية وحدها (en-GB ← الإنجليزية) من الدالة المشتركة (src/ui/lang.js)؛ وبلا اسم معروف الرمز
 * نفسه، وبلا رمز أو برمز غير محدد نص فارغ (فيُكتب «الأصل»). لا يرمي أبدًا.
 * @param {string | null | undefined} code
 * @param {typeof Intl.DisplayNames | null} [DisplayNames] للاختبار
 */
export function languageName(code, DisplayNames = globalThis.Intl?.DisplayNames) {
  return sharedLanguageName(code, { region: false, DisplayNames }) ?? '';
}

/**
 * زمن الصف: «04:05» أو «1:04:05» (دقائق بخانتين دائمًا؛ لا ملي ثوانٍ). الزمن السالب (إزاحة تسبق البداية) يُقصر على صفر.
 * @param {number} ms
 */
export function clockLabel(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const p = (n) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${p(m)}:${p(s)}` : `${p(m)}:${p(s)}`;
}

/** مقطع بأسطر متعددة ← سطر واحد متصل للوحة النص: تعريف النواة نفسه الذي يكتب به التصدير سطر الأصل (الفكرة ١١). */
export { flatText } from '../../core/align/original.js';

const sign = (ms) => (Math.round(ms / 100) === 0 ? 0 : Math.sign(ms));

/** @param {number} ms معنى الإزاحة المختصر تحت قيمتها: «تظهر لاحقًا» أو «تظهر أبكر» أو «في توقيتها المحفوظ». */
export function offsetMeaningShort(ms) {
  const s = sign(ms);
  return T(s > 0 ? 'meaningLater' : s < 0 ? 'meaningEarlier' : 'meaningZero');
}

/** @param {number} ms «+0.5» أو «−1.0» أو «0.0». */
export const offsetValue = formatOffset;

/** @param {number} stepMs الخطوة بالثواني بلا أصفار زائدة: 500 ← «0.5»، 1500 ← «1.5». */
export const stepLabel = (stepMs) => String(Math.round(stepMs / 100) / 10);

/** @param {number} stepMs */
export const earlierTip = (stepMs) => T('earlierTip', { step: stepLabel(stepMs), unit: LABELS.seconds });
/** @param {number} stepMs */
export const laterTip = (stepMs) => T('laterTip', { step: stepLabel(stepMs), unit: LABELS.seconds });

/** اسم زمن الصف المعلَّم «أعود إليه» (ف9). @param {string} time «00:12» */
export const markedSeekLabel = (time) => T('seekMarked', { time });

/** رسالة إزالة «أعود إليه» من صف (ف9). @param {number} n رقم المقطع */
export const unmarkedNote = (n) => T('unmarked', { n });

/** اسم الوصول لحقل تحرير نص المقطع (الفكرة ٦): «نص المقطع 12». @param {number} n رقم المقطع */
export const editFieldLabel = (n) => T('editField', { n });

/** رسالة حفظ نص المقطع من اللوحة (الفكرة ٦): «عُدِّل نص المقطع 12». @param {number} n رقم المقطع */
export const editedNote = (n) => T('edited', { n });

/**
 * سطر المفاتيح تحت حقل التحرير (الفكرة ٦): أسماء المفاتيح اختصاراتٌ داخل جملة عربية، فهي معزولة LTR (الهوية §٤) وترسمها اللوحة
 * عناصر ذرية (ltrParts)، فلا تنقلب «Shift+Enter» مع الجملة إن انكسر سطرها.
 */
export const editHintText = () => T('editHint', { save: ltrInline('Enter'), newline: ltrInline('Shift+Enter'), cancel: ltrInline('Esc') });

/**
 * سبب منع حفظ نص من اللوحة (الفكرة ٦، ح-54) بإحالة إلى المحرّر، من رمز فحص المحرّر الذي منعه (cueTextIssue في model.js).
 * @param {{ code: string, params: Record<string, string | number> | null }} issue
 */
export function editIssueText(issue) {
  if (issue.code === 'ED_TEXT_EMPTY') return LABELS.editEmpty;
  if (issue.code === 'ED_TEXT_BLANK_LINE') return LABELS.editBlankLine;
  if (issue.code === 'ED_TEXT_BREAKS_SRT') return LABELS.editBreaksSrt;
  return T('editInvalid', { max: issue.params?.max ?? '' });
}

/** @param {string} langName «مع الإنجليزية». */
export const withOriginal = (langName) => T('withOriginal', { name: langName });

/**
 * أجزاء سطر الحالة: «متزامن · الترجمة 2 «مراجعة» · 412 مقطعًا». الاسم يُحذف إن لم يُسمَّ، والرقم إن لم تُعرف الخانة. والاسم
 * معزول (FSI…PDI) كما في المحرّر: اسم لاتيني مثل «Pro (v2)» لا تنقلب أقواسه وترقيمه في الجملة العربية.
 * @param {{ slot: number | null, name: string | null, count: number }} s
 * @returns {string[]}
 */
export function statusParts({ slot, name, count }) {
  const parts = [LABELS.synced];
  if (slot) parts.push(name ? T('statusSlotNamed', { n: slot, name: isolate(name) }) : T('statusSlot', { n: slot }));
  parts.push(formatCount(count, COUNT_FORMS.cue));
  return parts;
}
