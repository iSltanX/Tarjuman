// أدوات اختبار الأدوات: شريط يوتيوب مبسّط (أدوات يسرى ويمنى بأزرار أصلية)، ومتحكم وهمي بأفعال العقد يغيّر حالته
// كما يفعل الحقيقي (فورًا ثم وعد)، وتدفقا تصدير واستيراد وهميان يسجّلان ما طُلب، وحافظة وهمية. فوق الـDOM الوهمي.
import { TjError } from '../../../../src/core/errors/index.js';
import { DEFAULT_SETTINGS, mergeSettings } from '../../../../src/core/model/settings.js';
import { normalizeOffset } from '../../../../src/core/model/timing.js';
import { DISPLAY_MODES } from '../../../../src/core/model/video.js';
import { mountControls } from '../../../../src/player/controls/index.js';
import { NOW, makeCues } from '../../../helpers/fixtures.js';
import { addPlayer, createFakeEnv } from '../overlay/fake-dom.js';

export const A = 'AAAAAAAAAAA';
export const B = 'BBBBBBBBBBB';
export const EN_CUES = makeCues(5, { text: (i) => `line ${i}` });
export const AR_CUES = makeCues(5, { text: (i) => `سطر ${i}` });
export const INSTRUCTIONS = 'تعليمات-سرية-لا-تُعرض';

/** @param {Partial<import('../../../../src/extract/index.js').TrackInfo>} [o] */
export const trackInfo = (o = {}) => ({
  key: 'en|manual', lang: 'en', kind: 'manual', capturedAt: NOW, ok: true, code: null, warnings: [], cueCount: 412, completeness: 1, lastEndMs: 1083000, ...o,
});

export const matched = (o = {}) => ({
  fingerprintId: 'fp_test000001', matched: true, countSource: 5, countTarget: 5, numbering: 'same', missing: [], extra: [], drift: [],
  empty: [], noArabic: [], restoreTimingAvailable: true, driftThresholdMs: 100, notes: [], ...o,
});

export const arabic = (o = {}) => ({ cues: AR_CUES, edited: false, fileName: 'talk.ar.srt', comparison: matched(), ...o });

export function makeState(over = {}) {
  return {
    videoId: A, title: 'محاضرة', durationMs: 1085000, loading: false, saved: null, captured: [], captureIssue: null,
    arabic: null, english: null, view: { displayOffsetMs: 0, displayMode: 'ar' }, settings: DEFAULT_SETTINGS,
    notice: null, error: null, version: 1, ...over,
  };
}

/**
 * متحكم وهمي بواجهة العقد (interfaces §١): الأفعال تغيّر الحالة فورًا وتبلّغ المشتركين ثم تعيد وعدًا.
 * @param {ReturnType<typeof makeState>} initial
 * @param {{ recordFails?: boolean, loadFails?: string | null }} [opts]
 */
export function fakeController(initial = makeState(), opts = {}) {
  let state = Object.freeze(initial);
  let seq = 0;
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
    calls,
    opts,
    getState: () => state,
    subscribe(fn) {
      subs.add(fn);
      return () => subs.delete(fn);
    },
    subscribers: () => subs.size,
    set,
    nudgeOffset(dir) {
      calls.push(['nudgeOffset', dir]);
      if (dir !== 1 && dir !== -1) throw new RangeError('dir');
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
    setDisplayMode(mode) {
      calls.push(['setDisplayMode', mode]);
      if (!DISPLAY_MODES.includes(mode)) throw new TjError('MD_INVALID');
      return view({ displayMode: mode });
    },
    async loadArabic(input, { replace = false } = {}) {
      calls.push(['loadArabic', input, { replace }]);
      if (opts.loadFails) throw new TjError(opts.loadFails);
      if (state.arabic && !replace) throw new TjError('ST_ARABIC_EXISTS');
      const was = state.view.displayOffsetMs;
      set({
        arabic: { cues: input.cues, edited: false, fileName: input.fileName, comparison: input.comparison },
        view: Object.freeze({ ...state.view, displayOffsetMs: 0 }),
        notice: was !== 0 ? { code: 'ST_OFFSET_RESET', tone: 'info', at: ++seq } : null,
      });
      return state;
    },
    async recordExport(p) {
      calls.push(['recordExport', p]);
      if (opts.recordFails) throw new TjError('ST_WRITE_FAILED');
      return state;
    },
    convertCaptured(key, { mode = 'normal' } = {}) {
      calls.push(['convertCaptured', key, mode]);
      const t = state.captured.find((x) => x.key === key);
      if (!t || !t.ok) return { ok: false, code: t?.code ?? 'EX_NO_TRACK', key, lang: 'en', kind: 'manual', mode, cues: [], warnings: [], report: null };
      return { ok: true, code: null, key, lang: t.lang, kind: t.kind, mode, cues: EN_CUES.map((c) => ({ ...c })), warnings: [], report: null };
    },
    async updateSettings(patch) {
      calls.push(['updateSettings', patch]);
      if (opts.settingsFail) throw new TjError('ST_WRITE_FAILED');
      set({ settings: mergeSettings(state.settings, patch) });
      return state.settings;
    },
    dismissNotice() {
      calls.push(['dismissNotice']);
      if (state.notice) set({ notice: null });
    },
  };
}

/** تدفقا التصدير والاستيراد الوهميان: يسجّلان المدخلات، والنتيجة قابلة للضبط. */
export function fakeFlows() {
  const built = [];
  const downloads = [];
  const reads = [];
  const flows = {
    built, downloads, reads,
    buildError: null,
    downloadError: null,
    parts: 1,
    warnings: [],
    readResult: (files) => ({
      ok: true, fileName: files[0].name, cues: AR_CUES, comparison: matched(), fingerprintId: 'fp_test000001', notes: [], warnings: [],
    }),
    readGate: null,
    exportFlow: {
      buildExport(spec) {
        built.push(spec);
        if (flows.buildError) throw new TjError(flows.buildError);
        const n = flows.parts;
        const name = (i) => `${spec.videoId}.en.${spec.track.kind}.${spec.mode}${n > 1 ? `.part${i}of${n}` : ''}.srt`;
        return {
          files: Array.from({ length: n }, (_, i) => ({ name: name(i + 1), text: 'srt', part: null, cueCount: 5 })),
          fingerprint: { id: 'fp_new0000001', mode: spec.mode },
          instructions: INSTRUCTIONS,
          warnings: [...flows.warnings],
        };
      },
      download(file, env) {
        if (flows.downloadError) throw new TjError(flows.downloadError);
        downloads.push({ name: file.name, hasDoc: !!env?.doc });
      },
    },
    importFlow: {
      async readImport(files, opts) {
        reads.push({ names: files.map((f) => f.name), opts });
        if (flows.readGate) await flows.readGate;
        return flows.readResult(files);
      },
    },
  };
  return flows;
}

/** شريط يوتيوب داخل .ytp-chrome-bottom: أدوات يسرى، ويمنى بأزرار CC والإعدادات وملء الشاشة. */
export function addBar(env, parts, { width = 640 } = {}) {
  const { doc } = env;
  const controls = doc.createElement('div');
  controls.className = 'ytp-chrome-controls';
  const left = doc.createElement('div');
  left.className = 'ytp-left-controls';
  const right = doc.createElement('div');
  right.className = 'ytp-right-controls';
  const yt = ['ytp-subtitles-button', 'ytp-settings-button', 'ytp-fullscreen-button'].map((cls) => {
    const b = doc.createElement('button');
    b.className = `ytp-button ${cls}`;
    right.appendChild(b);
    return b;
  });
  controls.appendChild(left);
  controls.appendChild(right);
  parts.chrome.appendChild(controls);
  parts.chrome.rect = { ...parts.chrome.rect, left: 0, width, right: width };
  return { controls, left, right, yt, cc: yt[0] };
}

/**
 * صفحة مشاهدة بمشغّل وشريط وأدوات مركّبة.
 * @param {{ state?: object, controllerOpts?: object, width?: number, height?: number, withBar?: boolean, clipboard?: 'ok' | 'fail' | 'none' }} [o]
 */
export function mountPage({ state = makeState(), controllerOpts = {}, width = 640, height = 360, withBar = true, clipboard = 'ok' } = {}) {
  const env = createFakeEnv({ href: `https://www.youtube.com/watch?v=${A}` });
  const parts = addPlayer(env, { width, height });
  const bar = withBar ? addBar(env, parts, { width }) : {};
  const copied = [];
  env.win.navigator = clipboard === 'none' ? {} : {
    clipboard: {
      writeText: async (t) => {
        if (clipboard === 'fail') throw new Error('denied');
        copied.push(t);
      },
    },
  };
  const controller = fakeController(state, controllerOpts);
  const flows = fakeFlows();
  const handle = mountControls(controller, { doc: env.doc, win: env.win, exportFlow: flows.exportFlow, importFlow: flows.importFlow, now: () => Date.parse(NOW) });
  return { env, ...parts, ...bar, controller, flows, handle, copied, ui: inspect(env, parts) };
}

/** وصول الاختبار إلى ما داخل الجذور المغلقة (الـDOM الوهمي يحتفظ بها في shadowRoot). */
export function inspect(env, parts) {
  const groupHost = () => env.doc.querySelector('#tarjuman-controls');
  const layerHost = () => parts.player.children.find((c) => c.id === 'tarjuman-controls-layer') ?? null;
  const menu = () => layerHost()?.shadowRoot.querySelector('.menu') ?? null;
  const ui = {
    groupHost,
    layerHost,
    btn: (kind) => groupHost().shadowRoot.querySelector(`[data-kind="${kind}"]`),
    kinds: () => groupHost().shadowRoot.querySelector('.group').children.map((b) => b.getAttribute('data-kind')),
    size: () => groupHost().shadowRoot.querySelector('.group').getAttribute('data-size'),
    menu,
    menuOpen: () => !!menu() && !menu().hasAttribute('hidden'),
    menuText: () => (ui.menuOpen() ? menu().textContent : ''),
    menuLabel: () => menu()?.getAttribute('aria-label') ?? null,
    /** زر أو بند في القائمة يحوي النص. */
    item: (text) => menu().querySelectorAll('button').find((b) => b.textContent.includes(text)) ?? null,
    field: (fid) => menu().querySelector(`[data-fid="${fid}"]`),
    tip: () => {
      const t = layerHost().shadowRoot.querySelector('.tip');
      return t.hasAttribute('hidden') ? null : t.textContent;
    },
    barState: () => layerHost().shadowRoot.querySelector('.layer').getAttribute('data-bar'),
    toasts: () => layerHost().shadowRoot.querySelector('.toasts').children.map((t) => ({ tone: t.getAttribute('data-tone'), text: t.textContent })),
    toastClose: (i = 0) => layerHost().shadowRoot.querySelector('.toasts').children[i].querySelector('button'),
    fileInput: () => layerHost().shadowRoot.querySelector('input'),
  };
  return ui;
}

export const click = (el, detail = 1) => el.dispatchEvent({ type: 'click', bubbles: true, detail });
export const key = (el, k, type = 'keydown') => el.dispatchEvent({ type, key: k, bubbles: true });
export const pointerdown = (el) => el.dispatchEvent({ type: 'pointerdown', bubbles: true });
export const settle = () => new Promise((r) => setTimeout(r, 0));

/** يختار ملفات في منتقي الرفع كما يفعل المستخدم (بعد أن فُتح المنتقي). */
export function chooseFiles(ui, files) {
  const input = ui.fileInput();
  input.files = files;
  input.dispatchEvent({ type: 'change' });
}
