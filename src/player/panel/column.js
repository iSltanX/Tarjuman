// عمود يوتيوب الثانوي (docs/identity-redesign.md §٤): مضيف اللوحة أول أبنائه، فيضعه يوتيوب يمين الفيديو في التخطيط العريض
// وتحته في وضع المسرح، ولا يغطي الفيديو ولا أدواته. وفي تخطيط العمود الواحد (عرض ضيق، `is-single-column`) يُخفي يوتيوب
// العمود الثانوي كله وينقل مقترحاته إلى #below، فتنتقل اللوحة إلى #below بعد صندوق بيانات الفيديو (العنوان والقناة) كما في لوحة
// WatchNarrow، وتعود إلى العمود بعودة العمودين. هنا وحدها محددات هذه المواضع (مثل محددات youtube-dom.js: غير رسمية،
// فالحاجة إلى تغييرها في ملف واحد)، وقراءة هندسة المشغّل والعمود.

/** بالترتيب: الداخلي ثم الخارجي، داخل ytd-watch-flexy أولًا ثم مطلقًا (احتياط لتغيّر البنية). */
export const COLUMN_SELECTORS = Object.freeze([
  'ytd-watch-flexy #secondary-inner',
  'ytd-watch-flexy #secondary',
  '#secondary-inner',
  '#secondary',
]);

/** تخطيط العمود الواحد: سمة على ytd-watch-flexy، والموضع البديل تحت الفيديو وبعد بيانات الفيديو فيه. */
export const SINGLE_COLUMN_ATTR = 'is-single-column';
export const BELOW_SELECTOR = 'ytd-watch-flexy #below';
export const BELOW_ANCHOR_TAG = 'ytd-watch-metadata';

/** ارتفاع احتياطي للوحة قبل أن يُعرف ارتفاع المشغّل. */
export const FALLBACK_HEIGHT = 480;

/** @param {Document} doc @returns {HTMLElement | null} العمود الثانوي، أو #below في تخطيط العمود الواحد */
export function findColumn(doc) {
  if (doc.querySelector('ytd-watch-flexy')?.hasAttribute?.(SINGLE_COLUMN_ATTR)) {
    const below = doc.querySelector(BELOW_SELECTOR);
    if (below) return below;
  }
  for (const sel of COLUMN_SELECTORS) {
    const found = doc.querySelector(sel);
    if (found) return found;
  }
  return null;
}

/**
 * ابن #below الذي يحمل بيانات الفيديو (يوتيوب يضع ytd-watch-metadata داخل صندوق في #below لا ابنًا مباشرًا)، أو null.
 * @param {HTMLElement} column
 */
function belowAnchor(column) {
  let n = column.querySelector?.(BELOW_ANCHOR_TAG) ?? null;
  while (n && n.parentNode !== column) n = n.parentNode;
  return n ?? null;
}

/**
 * يضع المضيف أول ابن في العمود، وفي #below بعد صندوق بيانات الفيديو إن وُجد (أو يتركه إن كان كذلك). يوتيوب قد يعيد رسم العمود أو
 * يدرج قبل المضيف عنصرًا، فيُستدعى عند كل فحص دوري.
 * @param {HTMLElement} host @param {HTMLElement} column
 * @returns {boolean} هل نُقل أو أُدرج
 */
export function placeHost(host, column) {
  const anchor = column.id === 'below' ? belowAnchor(column) : null;
  const before = anchor ? anchor.nextSibling : column.firstChild;
  const placed = host.parentNode === column && (anchor ? anchor.nextSibling === host : (column.firstElementChild ?? column.firstChild) === host);
  if (placed) return false;
  column.insertBefore(host, before);
  return true;
}

/**
 * العمود بجانب المشغّل (تخطيط عريض: يبدأ فوق نهاية المشغّل ولا يتداخل معه أفقيًا) أم تحته. لا هندسة معروفة ← تحته (الأحذر).
 * @param {{ top: number, left: number, right: number, bottom: number, width: number } | null} player
 * @param {{ top: number, left: number, right: number, width: number } | null} column
 */
export function isBeside(player, column) {
  if (!player || !column || !(player.width > 0) || !(column.width > 0)) return false;
  const apart = column.left >= player.right - 4 || column.right <= player.left + 4;
  return apart && column.top < player.bottom - 4;
}

/** عمودا صفحة المشاهدة: الحاوية ذات flex، والعمود الأول (المشغّل) والثانوي. */
export const COLUMNS_SELECTOR = 'ytd-watch-flexy #columns';
export const PRIMARY_SELECTOR = 'ytd-watch-flexy #primary';
export const SECONDARY_SELECTOR = 'ytd-watch-flexy #secondary';
/** الخصائص الأفقية التي تتبادل جهتيها في المرآة. */
const SIDES = Object.freeze([['padding-left', 'paddingRight'], ['padding-right', 'paddingLeft'], ['margin-left', 'marginRight'], ['margin-right', 'marginLeft']]);
/**
 * عرض العمود الثانوي (المحتوى، px) واللوحة مفتوحة بجانب الفيديو: عرض عمود يوتيوب المعتاد (402)، مريح لسطر عربي وزمن، ولا يزيد.
 * يوسّع يوتيوب عموده إلى 560 وأكثر حين يضيّق المشغّل لنسبة الفيديو (4:3) أو لقصر النافذة، فتصير اللوحة بعرض الفيديو تقريبًا.
 */
export const SIDE_WIDTH = 402;

/**
 * تخطيط العمودين واللوحة ظاهرة فيهما (أنماط سطرية على #columns و#primary و#secondary وحدها، لا CSS عام ولا تغطية):
 * - **العرض:** إن كان عمود يوتيوب الثانوي أعرض من SIDE_WIDTH يُضيَّق إليه، فتبقى اللوحة بعرض مريح، ويتوسّط يوتيوب العمودين
 *   (حاويته justify-content: center) بدل فراغ بين اللوحة والفيديو. ولا يُوسَّع عمود أضيق (نافذة ضيقة).
 * - **المرآة:** في واجهة يوتيوب RTL (العربية) يضع يوتيوب عموده الثانوي يسار الفيديو، فيُعكس تخطيط العمودين كالمرآة (قرار سلطان
 *   2026-11-03: اللوحة يمين الفيديو في الواجهتين): `row-reverse` على الحاوية، ويتبادل كلٌّ من العمودين حشوَيه وهامشَيه الأيمن
 *   والأيسر كما حسبها يوتيوب، فيكون التخطيط صورة الأصل المعكوسة بالمقاسات نفسها. ويُقصّ الفائض الأفقي للحاوية (overflow-x: clip):
 *   توهّج «الإضاءة السينمائية» خلف المشغّل يمتد خارج حافته، وبعد العكس يمتد خارج حافة الصفحة اليسرى، وهي في صفحة RTL جهة تمرير
 *   فيظهر شريط تمرير أفقي (ثبت حيًا بعرض 1600). القص لا ينشئ حاوية تمرير، فلا يمس العناصر اللاصقة.
 * تُستعاد القيم السابقة كما كانت حين لا حاجة: إغلاق اللوحة أو إخفاء زرها، أو العمود الواحد، أو مغادرة صفحة الفيديو، أو إعادة
 * يوتيوب رسم العمودين. وإن غيّر يوتيوب تخطيطه (عرض النافذة أو سمات ytd-watch-flexy) تُستعاد ثم تُعاد بقيمه الجديدة.
 * @param {{ doc: Document, win: Window }} deps
 */
export function createColumnLayout({ doc, win }) {
  /** @type {null | { columns: HTMLElement, primary: HTMLElement, secondary: HTMLElement, key: string, rtl: boolean, fit: boolean, prev: Array<[HTMLElement, string, string]> }} */
  let applied = null;
  const styleOf = (el) => {
    try {
      return win.getComputedStyle?.(el) ?? null;
    } catch {
      return null;
    }
  };
  const layoutKey = () => {
    const flexy = doc.querySelector('ytd-watch-flexy');
    const attrs = flexy?.getAttributeNames?.() ?? [];
    return `${win.innerWidth ?? 0}|${attrs.filter((n) => /column|window|theater|full/.test(n)).sort().join(',')}`;
  };
  const px = (v) => {
    const n = Number.parseFloat(v);
    return Number.isFinite(n) ? n : 0;
  };

  function restore() {
    if (!applied) return false;
    for (const [el, prop, value] of applied.prev) {
      if (value) el.style.setProperty(prop, value);
      else el.style.removeProperty(prop);
    }
    applied = null;
    return true;
  }

  /**
   * @param {boolean} want اللوحة ظاهرة في العمود الثانوي (لا في #below)
   * @returns {boolean} هل يُضبط التخطيط الآن (عرض أو مرآة أو كلاهما)
   */
  function update(want) {
    const columns = doc.querySelector(COLUMNS_SELECTOR);
    const primary = doc.querySelector(PRIMARY_SELECTOR);
    const secondary = doc.querySelector(SECONDARY_SELECTOR);
    const key = layoutKey();
    if (applied && (applied.columns !== columns || applied.primary !== primary || applied.secondary !== secondary || applied.key !== key)) restore();
    const rtl = !!columns && !!primary && !!secondary && styleOf(columns)?.direction === 'rtl';
    if (applied && applied.rtl !== rtl) restore();
    if (!want || !columns || !primary || !secondary) {
      restore();
      return false;
    }
    if (applied) return true;
    // القيم المحسوبة تُنسخ كلها والتخطيط أصلي قبل أي كتابة: getComputedStyle حيّ، فقراءة جانب بعد كتابة الآخر تعيد المكتوب.
    const side = styleOf(secondary);
    const border = side?.boxSizing === 'border-box';
    const inset = border ? px(side.paddingLeft) + px(side.paddingRight) + px(side.borderLeftWidth) + px(side.borderRightWidth) : 0;
    const content = side ? px(side.width) - inset : 0;
    const fit = content > SIDE_WIDTH + 1;
    if (!rtl && !fit) return false;
    const native = rtl
      ? [primary, secondary].map((el) => {
        const cs = styleOf(el);
        return [el, cs ? Object.fromEntries(SIDES.map(([, from]) => [from, cs[from]])) : null];
      })
      : [];
    const prev = [];
    if (fit) {
      prev.push([secondary, 'width', secondary.style.getPropertyValue('width')]);
      secondary.style.setProperty('width', `${SIDE_WIDTH + inset}px`);
    }
    if (rtl) {
      prev.push([columns, 'flex-direction', columns.style.getPropertyValue('flex-direction')]);
      prev.push([columns, 'overflow-x', columns.style.getPropertyValue('overflow-x')]);
      for (const [el] of native) for (const [prop] of SIDES) prev.push([el, prop, el.style.getPropertyValue(prop)]);
      columns.style.setProperty('flex-direction', 'row-reverse');
      columns.style.setProperty('overflow-x', 'clip');
      for (const [el, cs] of native) {
        if (!cs) continue;
        for (const [prop, from] of SIDES) el.style.setProperty(prop, cs[from]);
      }
    }
    applied = { columns, primary, secondary, key, rtl, fit, prev };
    return true;
  }

  return {
    update,
    restore,
    get active() {
      return !!applied;
    },
    /** العمودان معكوسان (واجهة RTL). */
    get mirrored() {
      return !!applied?.rtl;
    },
    /** العمود الثانوي مضيَّق إلى SIDE_WIDTH. */
    get fitted() {
      return !!applied?.fit;
    },
  };
}
