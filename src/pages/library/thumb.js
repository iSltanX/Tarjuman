// صورة الفيديو في صف المحفوظات (docs/identity-redesign.md §٥، قرار سلطان 2026-11-03). هذه الوحدة وحدها تحمل العنوان الخارجي
// الوحيد في صفحات الإضافة: <img src="https://i.ytimg.com/vi/‹المعرّف›/mqdefault.jpg"> بمعرّف الفيديو المحفوظ المُتحقَّق منه
// (isVideoId)، وحين `prefs.ui.thumbnails` وحده؛ لا fetch ولا XHR ولا Image()، فالمتصفح يحمّلها كأي صورة، وذاكرته المؤقتة هي
// الذاكرة الوحيدة (لا تخزين للصور في الإضافة). عند الإطفاء أو الخطأ أو الصورة البديلة الرمادية: بلاطة بأيقونة الفيديو لا توهم
// بأنها لقطة. والمدة من `record.durationMs` حين تكون عددًا موجبًا، وإلا لا شيء (لا تُخمَّن).
import { isVideoId } from '../../core/model/ids.js';
import { el, icon, ltr } from '../../ui/components.js';

/** البادئة الوحيدة المسموحة (استثناء مسمّى في check-static واختبار «لا شبكة»). */
export const THUMB_BASE = 'https://i.ytimg.com/vi/';
export const THUMB_FILE = 'mqdefault.jpg';
/**
 * يعيد يوتيوب لمعرّف غير موجود (أو فيديو محذوف أو خاص) صورة JPEG رمادية بديلة بعرض 120 مع حالة 404، فلا يُطلق المتصفح
 * `error` غالبًا؛ و`mqdefault` الحقيقية عرضها 320. فعرض ≤ 120 عند `load` يُعدّ غياب صورة ولا تُعرض الرمادية أبدًا.
 */
export const PLACEHOLDER_MAX_WIDTH = 120;

/**
 * مدة الفيديو للصورة المصغّرة: «52:18» و«1:12:40»؛ لا شيء (null) ما لم تكن عددًا موجبًا. لا تُخمَّن مدة أبدًا (مواصفة الهوية §٥).
 * @param {unknown} ms
 * @returns {string | null}
 */
export function formatDuration(ms) {
  if (typeof ms !== 'number' || !Number.isFinite(ms) || ms <= 0) return null;
  const total = Math.max(1, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const sec = String(total % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`;
}

/** @param {unknown} videoId @returns {string | null} */
export const thumbUrl = (videoId) => (isVideoId(videoId) ? `${THUMB_BASE}${videoId}/${THUMB_FILE}` : null);

/**
 * gate (Firefox، تدقيق 7a66f91 U01): موافقة تُقرأ لحظة إسناد العنوان. بها لا يُسند `src` إلا بعد arm() (حين يقترب الصف من
 * الشاشة) ثم «نعم» من gate؛ و«لا» أو الفشل بلاطة حتى setEnabled(true) لاحقًا. وبلا gate (Chromium) يُسند فورًا كما كان.
 * @param {{ doc?: Document, videoId: string, enabled: boolean, durationMs?: number | null, gate?: (() => Promise<boolean>) | null }} o
 * @returns {{
 *   root: HTMLElement, setEnabled: (on: boolean) => void, setDuration: (ms: number | null | undefined) => void, arm: () => void,
 *   state: () => 'image' | 'fallback', hasImage: () => boolean
 * }}
 */
export function thumbnail({ doc = document, videoId, enabled, durationMs = null, gate = null }) {
  const root = el('div', { className: 'lib-thumb', attrs: { 'data-state': 'fallback' }, doc });
  let on = Boolean(enabled);
  let failed = false;
  let armed = !gate;
  let duration = durationMs;
  let media = null;
  let img = null;
  let durNode = null;

  const durationNode = () => {
    const text = formatDuration(duration);
    return text ? el('span', { className: 'lib-thumb__dur', children: [el('span', { className: 'tj-sr-only', text: 'المدة ', doc }), ltr(text, { doc })], doc }) : null;
  };

  function giveUp(from) {
    if (media !== from) return;
    failed = true;
    paint();
  }

  /** يسند العنوان: فورًا بلا gate، ومعها بعد «نعم» لهذه العقدة نفسها ما دامت معروضة؛ وإلا تعود البلاطة. */
  function source(node, url) {
    if (!gate) {
      node.setAttribute('src', url);
      return;
    }
    const refuse = () => {
      if (media !== node) return;
      on = false;
      paint();
    };
    Promise.resolve().then(gate).then((ok) => {
      if (media !== node) return;
      if (ok === true) node.setAttribute('src', url);
      else refuse();
    }, refuse);
  }

  function paint() {
    const url = on && !failed ? thumbUrl(videoId) : null;
    img = null;
    if (url) {
      const node = el('img', { className: 'lib-thumb__img', attrs: { alt: '', loading: 'lazy', decoding: 'async', referrerpolicy: 'no-referrer', draggable: 'false' }, doc });
      node.addEventListener('error', () => giveUp(node));
      node.addEventListener('load', () => {
        if (!(node.naturalWidth > PLACEHOLDER_MAX_WIDTH)) giveUp(node);
      });
      img = node;
      media = node;
      if (armed) source(node, url);
    } else {
      media = el('span', { className: 'lib-thumb__fallback', children: [icon('play', { doc })], doc });
    }
    root.setAttribute('data-state', img ? 'image' : 'fallback');
    durNode = durationNode();
    root.replaceChildren(...[media, durNode].filter(Boolean));
  }

  paint();
  return {
    root,
    setEnabled(next) {
      if (Boolean(next) === on) return;
      on = Boolean(next);
      failed = false;
      paint();
    },
    setDuration(ms) {
      if (ms === duration) return;
      duration = ms;
      // الصورة لا تُعاد بناؤها (فلا تُعاد قراءتها ولا تومض): تتبدل عقدة المدة وحدها.
      durNode?.remove();
      durNode = durationNode();
      if (durNode) root.append(durNode);
    },
    /** الصف اقترب من الشاشة: يُسند عنوان الصورة المعلّقة (مع gate وحدها). */
    arm() {
      if (armed) return;
      armed = true;
      if (img && !img.hasAttribute('src')) source(img, thumbUrl(videoId));
    },
    state: () => (img ? 'image' : 'fallback'),
    hasImage: () => img !== null,
  };
}
