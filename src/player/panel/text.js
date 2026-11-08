// نصوص لوحة النص المتزامن ودوالها النقية (docs/product-spec.md §٦.٦، ولوحات التصميم WatchPanel وPanelStates وWatchNarrow).
// أرقام لاتينية، والإزاحة بعلامتها (formatOffset)، والعدّ بالعربية (formatCount). لا شيء هنا يعرف DOM.
import { t, texts } from '../../i18n/index.js';
import { COUNT_FORMS, formatCount, formatOffset } from '../../ui/format.js';
import { languageName as sharedLanguageName } from '../../ui/lang.js';

/** نصوص اللوحة من الفهرس (player.panel) باللغة الحالية عند كل قراءة. */
export const LABELS = texts('player.panel');

const T = (key, params) => t(`player.panel.${key}`, params);

/**
 * سطر الخطوة المنجزة في حالة الفراغ: ما التُقط من الأصل ولغته ونوعه وعدد مقاطعه.
 * @param {{ langName: string, via?: string | null, kind: string, saved: boolean, count: number }} cap
 */
export const captureLine = (cap) => T('captureLine', { lang: cap.langName, via: cap.via ?? null, kind: cap.kind, saved: cap.saved, count: formatCount(cap.count, COUNT_FORMS.cue) });

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

/** @param {string} text مقطع بأسطر متعددة ← سطر واحد متصل للوحة النص. */
export const flatText = (text) => String(text ?? '').replace(/\s*\n\s*/g, ' ').trim();

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

/** @param {string} langName «مع الإنجليزية». */
export const withOriginal = (langName) => T('withOriginal', { name: langName });

/**
 * أجزاء سطر الحالة: «متزامن · الترجمة 2 «مراجعة» · 412 مقطعًا». الاسم يُحذف إن لم يُسمَّ، والرقم إن لم تُعرف الخانة.
 * @param {{ slot: number | null, name: string | null, count: number }} s
 * @returns {string[]}
 */
export function statusParts({ slot, name, count }) {
  const parts = [LABELS.synced];
  if (slot) parts.push(name ? T('statusSlotNamed', { n: slot, name }) : T('statusSlot', { n: slot }));
  parts.push(formatCount(count, COUNT_FORMS.cue));
  return parts;
}
