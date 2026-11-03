// أدوات اختبار لوحة النص المتزامن: صفحة مشاهدة يوتيوب مبسّطة (عمود أول بمشغّل وعمود ثانوي بمحتوى)، ومتحكم وهمي بحالة قابلة
// للتبديل تكتب أفعاله في الحالة كما يفعل الحقيقي (التفضيلات والإعدادات والإزاحة)، وفيديو بزمن قابل للكتابة، وتخطيط وهمي
// للقائمة (ارتفاعات الصفوف ومواضعها). كلها فوق الـDOM الوهمي المشترك (test/unit/player/overlay/fake-dom.js).
import { DEFAULT_PREFS, mergePrefs } from '../../../../src/core/model/prefs.js';
import { DEFAULT_SETTINGS, mergeSettings } from '../../../../src/core/model/settings.js';
import { normalizeOffset } from '../../../../src/core/model/timing.js';
import { mountPanel } from '../../../../src/player/panel/index.js';
import { makeCues } from '../../../helpers/fixtures.js';
import { addPlayer, createFakeEnv } from '../overlay/fake-dom.js';

export const A = 'AAAAAAAAAAA';
export const B = 'BBBBBBBBBBB';
/** عربي 1.0–3.0 و3.5–5.5 و6.0–8.0… (نصها «سطر n»). */
export const arCues = (n = 3, o = {}) => makeCues(n, { text: (i) => `سطر ${i}`, ...o });
export const enCues = (n = 3, o = {}) => makeCues(n, { text: (i) => `line ${i}`, ...o });

export const english = (over = {}) => ({ key: 'en|manual', kind: 'manual', lang: 'en', cues: enCues(3), source: 'captured', ...over });

/** حالة المتحكم بما تقرؤه اللوحة وحده؛ ترجمة عربية نشطة في الخانة 2 باسم «مراجعة» افتراضيًا. */
export function makeState(over = {}) {
  const cues = over.arabic === null ? null : (over.arabic?.cues ?? arCues(3));
  return {
    videoId: A, title: 'محاضرة', loading: false, error: null, version: 1,
    arabic: cues ? { cues, edited: false, fileName: 'talk.ar.srt', comparison: null } : null,
    english: null,
    view: { displayOffsetMs: 0, displayMode: 'ar' },
    settings: DEFAULT_SETTINGS,
    prefs: mergePrefs(DEFAULT_PREFS, { ui: { panelOpen: true } }),
    activeSlot: cues ? 2 : null,
    slots: [1, 2, 3].map((n) => ({ n, filled: !!cues && n === 2, active: !!cues && n === 2, name: cues && n === 2 ? 'مراجعة' : null, edited: false, cueCount: cues && n === 2 ? cues.length : 0 })),
    ...over,
  };
}

/**
 * متحكم وهمي: القراءة (getState/subscribe) وأفعال اللوحة (updatePrefs/updateSettings/nudgeOffset/resetOffset/setOffset/reload)
 * تغيّر الحالة فورًا وتبلّغ المشتركين ثم تعيد وعدًا، وكل نداء مسجَّل في calls.
 * @param {ReturnType<typeof makeState>} initial @param {{ prefsFail?: boolean, settingsFail?: boolean }} [opts]
 */
export function fakeController(initial = makeState(), opts = {}) {
  let state = Object.freeze(initial);
  const subs = new Set();
  const calls = [];
  const set = (patch) => {
    state = Object.freeze({ ...state, ...patch, version: state.version + 1 });
    for (const fn of [...subs]) fn(state);
  };
  const view = (patch) => {
    if (state.loading) return Promise.resolve(state);
    set({ view: Object.freeze({ ...state.view, ...patch }) });
    return Promise.resolve(state);
  };
  return {
    calls, opts, set,
    getState: () => state,
    subscribe(fn) {
      subs.add(fn);
      return () => subs.delete(fn);
    },
    subscribers: () => subs.size,
    nudgeOffset(dir) {
      calls.push(['nudgeOffset', dir]);
      return view({ displayOffsetMs: normalizeOffset(state.view.displayOffsetMs + dir * state.settings.offsetStepMs) });
    },
    setOffset(ms) {
      calls.push(['setOffset', ms]);
      return view({ displayOffsetMs: normalizeOffset(ms) });
    },
    resetOffset() {
      calls.push(['resetOffset']);
      return view({ displayOffsetMs: 0 });
    },
    async updatePrefs(patch) {
      calls.push(['updatePrefs', patch]);
      if (opts.prefsFail) throw new Error('prefs write failed');
      // حفظ بطيء (صدى التخزين يتأخر): يُطبَّق حين يُستدعى release.
      if (opts.prefsGate) await opts.prefsGate();
      set({ prefs: mergePrefs(state.prefs, patch) });
      return state.prefs;
    },
    async updateSettings(patch) {
      calls.push(['updateSettings', patch]);
      if (opts.settingsFail) throw new Error('settings write failed');
      set({ settings: mergeSettings(state.settings, patch) });
      return state.settings;
    },
    async reload() {
      calls.push(['reload']);
    },
  };
}

/** فيديو بزمن قابل للكتابة (والكتابة مسجَّلة)، وtickTo يقدّم الزمن ويطلق timeupdate كما يفعل المتصفح. */
export function prepareVideo(video, { currentTime = 0, paused = true } = {}) {
  let t = currentTime;
  video.writes = [];
  Object.defineProperty(video, 'currentTime', {
    get: () => t,
    set(v) {
      video.writes.push(v);
      t = v;
    },
  });
  video.paused = paused;
  video.ended = false;
  video.duration = 3600;
  video.tickTo = (sec) => {
    t = sec;
    video.dispatchEvent({ type: 'timeupdate' });
  };
  video.silentTo = (sec) => {
    t = sec;
  };
  video.setPlaying = (on) => {
    video.paused = !on;
    video.dispatchEvent({ type: on ? 'playing' : 'pause' });
  };
  return video;
}

const rectOf = (left, top, width, height) => ({ left, top, width, height, right: left + width, bottom: top + height });

/**
 * صفحة مشاهدة: ytd-watch-flexy ← #primary (المشغّل) و#secondary ← #secondary-inner (عنصر «related» موجود أصلًا).
 * الهندسة افتراضيًا تخطيط عريض: المشغّل 640×360، والعمود 402 يمينه.
 * @param {{ href?: string, state?: object, controllerOpts?: object, withColumn?: boolean, beside?: boolean }} [o]
 */
export function watchPage({ href = `https://www.youtube.com/watch?v=${A}`, state = makeState(), controllerOpts = {}, withColumn = true, beside = true } = {}) {
  const env = createFakeEnv({ href });
  const { doc, win } = env;
  const flexy = doc.createElement('ytd-watch-flexy');
  const primary = doc.createElement('div');
  primary.id = 'primary';
  const secondary = doc.createElement('div');
  secondary.id = 'secondary';
  const inner = doc.createElement('div');
  inner.id = 'secondary-inner';
  const related = doc.createElement('div');
  related.className = 'related';
  inner.appendChild(related);
  secondary.appendChild(inner);
  flexy.appendChild(primary);
  if (withColumn) flexy.appendChild(secondary);
  doc.body.appendChild(flexy);
  const parts = addPlayer(env, { width: 640, height: 360 });
  primary.appendChild(parts.player);
  prepareVideo(parts.video);
  const controller = fakeController(state, controllerOpts);
  const page = {
    env, doc, win, controller, flexy, primary, secondary, inner, related, ...parts,
    /** هندسة التخطيط: عريض (العمود يمين المشغّل) أو ضيق/مسرح (تحته). */
    setGeometry(wide, width = 402) {
      parts.player.rect = rectOf(0, 0, 640, 360);
      inner.rect = wide ? rectOf(664, 0, width, 700) : rectOf(0, 380, 640, 700);
    },
    mount(extra = {}) {
      const handle = mountPanel(controller, { doc, win, uiFonts: null, ...extra });
      page.handle = handle;
      return handle;
    },
    /** مضيف اللوحة في العمود (أو null). */
    hostEl: () => inner.children.find((c) => c.id === 'tarjuman-panel') ?? null,
    ev: (type) => doc.dispatchEvent({ type }),
    navigateTo(id) {
      doc.dispatchEvent({ type: 'yt-navigate-start' });
      win.navigate(`https://www.youtube.com/watch?v=${id}`);
      doc.dispatchEvent({ type: 'yt-navigate-finish' });
    },
  };
  page.setGeometry(beside);
  return page;
}

/** مُحدِّدات داخل جذر اللوحة المظلل. */
export function ui(page) {
  const host = page.hostEl();
  const root = host?.shadowRoot ?? null;
  const q = (sel) => root?.querySelector(sel) ?? null;
  return {
    host, root, q,
    qa: (sel) => root?.querySelectorAll(sel) ?? [],
    entry: q('.entry'), panel: q('.panel'), toast: q('.toast'),
    rows: () => root?.querySelectorAll('.row') ?? [],
    list: q('.list'),
    status: q('.status'),
    switchEl: q('.switch'),
    segs: () => (q('.segs')?.children ?? []),
    resume: q('.resume'),
  };
}

export const click = (el) => el.dispatchEvent({ type: 'click', bubbles: true, detail: 1 });
export const key = (el, k) => el.dispatchEvent({ type: 'keydown', bubbles: true, key: k });
export const hidden = (el) => el.hasAttribute('hidden');

/** تخطيط وهمي للقائمة: ارتفاع الصف rowH وارتفاع العرض viewH، وscrollTo يسجّل. @param {any} list */
export function layoutList(list, { rowH = 50, viewH = 400 } = {}) {
  const rows = list.children.filter((c) => c.hasAttribute('data-i'));
  rows.forEach((r, i) => {
    r.offsetTop = i * rowH;
    r.offsetHeight = rowH;
  });
  list.clientHeight = viewH;
  list.scrollHeight = rows.length * rowH;
  list.scrollTop = list.scrollTop ?? 0;
  list.scrolls = list.scrolls ?? [];
  list.scrollTo = ({ top, behavior }) => {
    list.scrolls.push({ top, behavior });
    list.scrollTop = top;
  };
  return rows;
}

export const flush = async () => {
  for (let i = 0; i < 5; i++) await Promise.resolve();
};

/** ينتظر انتهاء الوعود المعلّقة (سلاسل then المتداخلة). */
export const settle = () => new Promise((resolve) => setImmediate(resolve));
