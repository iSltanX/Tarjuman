// حالة شريط يوتيوب كما تحتاجها الأدوات: ظهوره (ytp-autohide)، وملء الشاشة والوضع الكبير، وعرض المشغّل وارتفاع
// الشريط، والمساحة الخالية فيه لأزرار ترجمان (room)، ومنها مقاس الأزرار (fitSize). كل اسم يوتيوب من youtube-dom؛ والمراقبة
// لسمة class على #movie_player وحجمه وحدث ملء الشاشة ومؤقت احتياطي خفيف، لا لشجرة المشغّل كلها.
import { CLASSES, SELECTORS, areControlsHidden, getChromeBottom, getLeftControls, isPlayerFullscreen } from '../youtube-dom.js';

export const BAR_POLL_MS = 500;
/** أقل من هذا العرض تُضغط الأزرار الخمسة (مواصفة التصميم الأولى §٥.١) ولا يُخفى منها شيء. */
export const COMPACT_BELOW_PX = 560;
/** ارتفاع الشريط حين لا يُقاس (قبل رسمه): كما في الوضع العادي ليوتيوب. */
const DEFAULT_LIFT = 48;

/** عرض زر الأيقونة وأدنى عرض للشارة بكل مقاس (styles.js)، والفسحة بين أدوات يوتيوب اليسرى وأزرار ترجمان. */
export const BUTTON_PX = Object.freeze({ normal: 48, compact: 40, tight: 34 });
export const BADGE_PX = Object.freeze({ normal: 56, compact: 50, tight: 42 });
export const ROOM_GAP_PX = 8;
/**
 * عنوان الفصل يُقتطع حتى سهمه «›»، فيُحجز بعد الوقت عرضُ السهم وحشوه ما دام للفيديو فصول، ظاهرًا كان العنوان أو مخفيًا (يخفيه
 * يوتيوب حين يتسع منزلق الصوت). ثبت حيًا: بعرض 1280 غطّت الأزرار نصف السهم حين لم يُحجز. يُحجز لاختيار المقاس (48 و40 و34) وحده،
 * لا للطي (ن-١).
 */
export const CHAPTER_MIN_PX = 44;
/**
 * منزلق الصوت يتسع 52px حين يمر المؤشر على زر الصوت (ثبت حيًا في Chrome وBrave 156) فيدفع الوقت يمينًا. يُحجز عرضه دائمًا ويُطرح
 * المتسع منه الآن، فلا يتبدل مقاس الأزرار تحت المؤشر، ولا يدفع المنزلقُ الوقتَ تحتها. لاختيار المقاس وحده، لا للطي (ن-١).
 */
export const VOLUME_RESERVE_PX = 52;
/** المساحة تُقرَّب إلى هذا المضاعف: تغيّر عرض الوقت بكسلًا لا يعيد الرسم. */
const ROOM_STEP = 4;

/**
 * @typedef {{
 *   hidden: boolean, fullscreen: boolean, size: 'normal' | 'compact' | 'fullscreen',
 *   width: number, height: number, lift: number, room: number | null, restRoom: number | null,
 * }} BarSnapshot room: المساحة بحجز سهم الفصل ومنزلق الصوت المتسع (لاختيار المقاس)؛ restRoom: المساحة في السكون بلا حجز (للطي، ن-١)
 */

/**
 * @param {{ fullscreen: boolean, big: boolean, small: boolean, width: number }} p
 * @returns {'normal' | 'compact' | 'fullscreen'}
 */
export function sizeFor({ fullscreen, big, small, width }) {
  if (fullscreen || big) return 'fullscreen';
  if (small || (width > 0 && width < COMPACT_BELOW_PX)) return 'compact';
  return 'normal';
}

/**
 * مقاس مجموعة ترجمان في الشريط بحسب المساحة الخالية فيه، لا بعرض المشغّل وحده: مشغّل يوتيوب الحديث بأزراره الكبيرة لا يتسع
 * للمجموعة بمقاسها العادي دون 800px تقريبًا، فتداخلت مع الوقت (ملاحظة سلطان 2026-11-03). بالترتيب: عادي (48)، فمضغوط (40)،
 * فأضيق (34) والأزرار كلها فيه، − و+ منها. فإن لم يتسع الأضيق للأزرار كلها طُوي − و+ داخل قائمة الشارة («مطوي»، بمقاس الأضيق
 * نفسه): ت-١ بقرار سلطان 2026-11-13 (product-spec §٦.١ و§٦.٦)، فكان الأضيق يبقى ويُقص زمن يوتيوب. فالعتبة حدّ الأضيق نفسه، لا رقم
 * جديد. فإن لم يتسع المطوي نفسه لما بقي وزر اللوحة بينها طُوي زر اللوحة في القائمة نفسها («مطوي باللوحة»، القرار ٢٨: ثبت القص
 * حيًا بعد طي − و+، والزر يُطوى ولا يُخفى)، والعتبة كذلك حدّ المطوي نفسه. وإن بقي زمن يوتيوب مقصوصًا بعد ذلك يُبلَّغ (timeClipped،
 * وCT_BAR_OVERFLOW). وملء الشاشة كما هو. بلا قياس: المقاس الأساسي.
 * والطي بالمساحة في السكون (restRoom) لا بالمحجوزة (ن-١، قرار سلطان بعد التحقق المستقل للجولة الثانية): كانت حسبة الطي تحجز منزلق
 * الصوت المتسع وسهم الفصل، فطُوي − و+ من مشغّل بعرض 800 وزر اللوحة من 732 في Chrome، وزمن يوتيوب لم يُقص في 2.2.0 إلا من 680.
 * فالأضيق يبقى ما اتسع له الشريط في السكون، كما في 2.2.0، ولا يُطوى شيء إلا حيث يبدأ القص فعلًا.
 * @param {{ size: 'normal' | 'compact' | 'fullscreen', room: number | null, restRoom?: number | null }} bar بلا restRoom: room
 * @param {number} icons أزرار الأيقونة الظاهرة غير الشارة (− و+ منها، وزر اللوحة إن كان ظاهرًا)
 * @param {{ panel?: boolean }} [o] panel: زر اللوحة بين icons ويجوز طيّه (لا يُطوى والشارة معطّلة، ن-١: session.js)
 * @returns {'normal' | 'compact' | 'tight' | 'folded' | 'folded-panel' | 'fullscreen'}
 */
export function fitSize(bar, icons, { panel = false } = {}) {
  if (bar.size === 'fullscreen' || bar.room === null) return bar.size;
  const need = (size, n = icons) => n * BUTTON_PX[size] + BADGE_PX[size] + ROOM_GAP_PX;
  if (bar.size === 'normal' && bar.room >= need('normal')) return 'normal';
  if (bar.room >= need('compact')) return 'compact';
  const rest = Math.max(bar.room, bar.restRoom ?? bar.room);
  if (rest >= need('tight')) return 'tight';
  if (!panel || rest >= need('tight', icons - 2)) return 'folded';
  return 'folded-panel';
}

/** − و+ في قائمة الشارة (ت-١)، ومعهما زر اللوحة في «المطوي باللوحة» (القرار ٢٨). @param {string | null | undefined} fit */
export const isFolded = (fit) => fit === 'folded' || fit === 'folded-panel';

/** زمن يوتيوب في الأدوات اليسرى، أو null. @param {Document} doc */
const timeDisplay = (doc) => getLeftControls(doc)?.querySelector?.(`.${CLASSES.timeDisplay}`) ?? null;

/**
 * الحافة اليمنى لزمن يوتيوب بعرض نصه لا بمستطيله (ت-١): حين يضيق الشريط ينضغط الزمن داخل حاويته فيُقص إلى «1:08 / 2»، ويبدو
 * مستطيله أن الشريط أوسع مما هو. null بلا زمن ظاهر أو مقصوص (أخفاه يوتيوب نفسه: بلا عرض ولا نص).
 * @param {Element | null} time
 * @returns {number | null}
 */
function naturalTimeRight(time) {
  if (!time?.getBoundingClientRect) return null;
  const r = time.getBoundingClientRect();
  const natural = Math.max(r.width || 0, time.scrollWidth || 0);
  return natural > 0 ? r.left + natural : null;
}

/**
 * زمن يوتيوب مقصوص (ت-١): نصه أعرض من صندوقه (ينضغط داخل حاويته ولا يتداخل مع شيء، فلم يكن كشف التداخل يراه)، أو صندوقه يمتد
 * تحت مجموعة ترجمان أو خارج حاوية الأدوات اليسرى. وزمن أخفاه يوتيوب نفسه (بلا عرض ولا نص) ليس قصًّا. قياس للتبليغ، لا إخفاء لشيء.
 * @param {Document} doc @param {Element | null} own مضيف المجموعة
 */
export function timeClipped(doc, own) {
  const time = timeDisplay(doc);
  if (!time?.getBoundingClientRect) return false;
  const r = time.getBoundingClientRect();
  const box = typeof time.clientWidth === 'number' ? time.clientWidth : r.width;
  if ((time.scrollWidth || 0) > (box || 0) + 1) return true;
  if (!(r.width > 0)) return false;
  const mine = own?.getBoundingClientRect?.();
  if (mine && mine.width > 0 && r.right > mine.left + 1 && r.left < mine.right - 1 && r.bottom > mine.top && r.top < mine.bottom) return true;
  const left = getLeftControls(doc)?.getBoundingClientRect?.();
  return !!left && left.width > 0 && r.right > left.right + 1;
}

/**
 * المساحة (px) المتاحة لمجموعة ترجمان: من نهاية أدوات يوتيوب اليسرى الأساسية (التشغيل والصوت والوقت بعرض نصه، وسهم عنوان الفصل وحده لأن
 * عنوانه يُقتطع، ومنزلق الصوت بعرضه المتسع دائمًا) إلى نهاية الشريط، ناقص أدوات يوتيوب اليمنى غير المجموعة. لا تتغير بمقاس المجموعة
 * نفسها ولا بمرور المؤشر، فلا تذبذب بين مقاسين.
 * @param {Document} doc @param {Element | null} own مضيف المجموعة
 * @returns {number | null} null إن لم يُرسم الشريط أو المجموعة
 */
export const roomFor = (doc, own) => roomsFor(doc, own)?.room ?? null;

/**
 * المساحة في السكون (ن-١): كـroomFor بلا حجز سهم الفصل ولا اتساع منزلق الصوت، ويُطرح ما اتسع من المنزلق الآن، فلا تتغير بمرور المؤشر
 * أيضًا. بها يُحكم الطي وحده (fitSize)، فيبدأ حيث يبدأ قص زمن يوتيوب في السكون.
 * @param {Document} doc @param {Element | null} own
 * @returns {number | null}
 */
export const restRoomFor = (doc, own) => roomsFor(doc, own)?.restRoom ?? null;

/**
 * المساحتان بقياس واحد. حافة السكون: نهاية الأدوات اليسرى والزمن بعرض نصه، ناقص ما اتسع من منزلق الصوت الآن (يدفع الزمن يمينًا
 * بقدره)؛ والمحجوزة: حافة السكون وسهم الفصل (إن كان للفيديو فصول) ومنزلق الصوت المتسع كله.
 * @param {Document} doc @param {Element | null} own
 * @returns {{ room: number, restRoom: number } | null}
 */
function roomsFor(doc, own) {
  const chrome = getChromeBottom(doc);
  const left = getLeftControls(doc);
  const right = own?.parentNode;
  if (!chrome || !left || !right?.getBoundingClientRect) return null;
  const cb = chrome.getBoundingClientRect();
  if (!(cb.width > 0)) return null;
  let edge = cb.left;
  let chapters = false;
  for (const k of left.children) {
    if (k.classList?.contains(CLASSES.chapter)) {
      chapters = !!k.textContent?.trim();
      continue;
    }
    const r = k.getBoundingClientRect();
    if (r.width > 0 && r.right > edge) edge = r.right;
  }
  // الزمن بعرض نصه: مستطيله المنضغط يجعل المساحة أوسع مما هي (ت-١).
  const timeRight = naturalTimeRight(timeDisplay(doc));
  if (timeRight !== null && timeRight > edge) edge = timeRight;
  const volume = Math.min(doc.querySelector(SELECTORS.volumePanel)?.getBoundingClientRect().width ?? 0, VOLUME_RESERVE_PX);
  const rest = edge - volume;
  const reserved = rest + (chapters ? CHAPTER_MIN_PX : 0) + VOLUME_RESERVE_PX;
  const others = right.getBoundingClientRect().width - own.getBoundingClientRect().width;
  const fit = (e) => Math.floor((cb.right - e - others) / ROOM_STEP) * ROOM_STEP;
  return { room: fit(reserved), restRoom: fit(rest) };
}

const KEYS = ['hidden', 'fullscreen', 'size', 'width', 'height', 'lift', 'room', 'restRoom'];
const same = (a, b) => KEYS.every((k) => a[k] === b[k]);

/**
 * @param {{ doc: Document, win: Window, player: HTMLElement, own?: () => Element | null, onChange: (s: BarSnapshot) => void, pollMs?: number }} opts
 *   own: مضيف مجموعة ترجمان (لقياس المساحة الخالية)
 */
export function watchBar({ doc, win, player, own = () => null, onChange, pollMs = BAR_POLL_MS }) {
  let lastLift = DEFAULT_LIFT;

  /** @returns {BarSnapshot} */
  function read() {
    const rect = player.getBoundingClientRect();
    const hidden = areControlsHidden(doc);
    const chrome = getChromeBottom(doc);
    const c = chrome?.getBoundingClientRect();
    // آخر ارتفاع مقيس للشريط يبقى معلومًا وهو مخفي، فتنفتح القوائم في موضعها حين يعود.
    if (!hidden && c && c.height > 0) lastLift = Math.max(0, Math.round(rect.bottom - c.top));
    const fullscreen = isPlayerFullscreen(doc);
    const width = Math.round(rect.width);
    const rooms = roomsFor(doc, own());
    return {
      hidden,
      fullscreen,
      size: sizeFor({ fullscreen, big: player.classList.contains(CLASSES.bigMode), small: player.classList.contains(CLASSES.smallMode), width }),
      width,
      height: Math.round(rect.height),
      lift: lastLift,
      room: rooms?.room ?? null,
      restRoom: rooms?.restRoom ?? null,
    };
  }

  let last = read();
  let stopped = false;
  const update = () => {
    if (stopped) return;
    const next = read();
    if (same(last, next)) return;
    last = next;
    onChange(next);
  };

  const MO = win.MutationObserver ?? globalThis.MutationObserver;
  const RO = win.ResizeObserver ?? globalThis.ResizeObserver;
  const mutation = MO ? new MO(update) : null;
  mutation?.observe(player, { attributes: true, attributeFilter: ['class'] });
  const resize = RO ? new RO(update) : null;
  resize?.observe(player);
  doc.addEventListener('fullscreenchange', update);
  const timer = win.setInterval(update, pollMs);

  return {
    snapshot: () => last,
    /** قراءة فورية (بعد فعل للمستخدم) دون انتظار المراقبات. */
    refresh() {
      update();
      return last;
    },
    stop() {
      stopped = true;
      mutation?.disconnect();
      resize?.disconnect();
      doc.removeEventListener('fullscreenchange', update);
      win.clearInterval(timer);
    },
  };
}
