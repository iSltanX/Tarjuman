// أدوات اختبار الأدوات: شريط يوتيوب مبسّط (أدوات يسرى ويمنى بأزرار أصلية)، ومتحكم وهمي بأفعال العقد يغيّر حالته
// كما يفعل الحقيقي (فورًا ثم وعد)، وتدفقا تصدير واستيراد وهميان يسجّلان ما طُلب، وحافظة وهمية. فوق الـDOM الوهمي.
import { TjError } from '../../../../src/core/errors/index.js';
import { DEFAULT_PREFS } from '../../../../src/core/model/prefs.js';
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

/** ترجمة خانة بشكل ArabicTrack المختصر: الأصل والنسخة الحالية واسم الملف والمقارنة. */
export const slotTrack = ({ cues = AR_CUES, current = null, fileName = 'talk.ar.srt', comparison = matched() } = {}) => ({ original: cues, current, fileName, comparison });

/**
 * حقول الإصدار الثاني في الحالة من خانات وهمية (عقد interfaces §١٢): الحزمة ونماذج 1 2 3 والنشطة ومقاطعها.
 * @param {(ReturnType<typeof slotTrack> | null)[]} tracks @param {{ active?: number | null, offsets?: number[], names?: (string | null)[] }} [o]
 */
export function withSlots(tracks, { active = 1, offsets = [0, 0, 0], names = [null, null, null] } = {}) {
  const slots = [1, 2, 3].map((n, i) => ({ n, name: tracks[i] ? names[i] ?? null : null, track: tracks[i] ?? null, offsetMs: tracks[i] ? offsets[i] ?? 0 : 0, marks: [], position: null }));
  const has = slots.some((x) => x.track);
  const act = has ? (slots[(active ?? 1) - 1]?.track ? active : slots.find((x) => x.track).n) : null;
  const t = act ? slots[act - 1].track : null;
  return {
    bundle: has ? { videoId: A, active: act, slots, previous: null } : null,
    activeSlot: act,
    slots: slots.map((x) => ({ n: x.n, filled: !!x.track, active: x.n === act, name: x.name, edited: !!x.track && x.track.current !== null, cueCount: x.track ? (x.track.current ?? x.track.original).length : 0 })),
    arabic: t ? { cues: t.current ?? t.original, edited: t.current !== null, fileName: t.fileName, comparison: t.comparison } : null,
    marks: act ? { slot: act, items: [] } : null,
  };
}

export function makeState(over = {}) {
  const a = over.arabic ?? null;
  const v2 = withSlots(a ? [{ original: a.cues, current: a.edited ? a.cues : null, fileName: a.fileName, comparison: a.comparison }] : []);
  return {
    videoId: A, title: 'محاضرة', durationMs: 1085000, loading: false, saved: null, captured: [], captureIssue: null,
    arabic: null, english: null, view: { displayOffsetMs: 0, displayMode: 'ar' }, settings: DEFAULT_SETTINGS,
    notice: null, error: null, version: 1, ...v2, previous: null, prefs: DEFAULT_PREFS, ...over,
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
      const b = state.bundle;
      const tracks = b ? b.slots.map((x) => x.track) : [null, null, null];
      const active = b?.active ?? 1;
      tracks[active - 1] = { original: input.cues, current: null, fileName: input.fileName, comparison: input.comparison };
      set({
        ...withSlots(tracks, { active, names: b ? b.slots.map((x) => x.name) : [null, null, null] }),
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
    // ———— الإصدار الثاني (عقد interfaces §١٢) ————
    async activateSlot(n) {
      calls.push(['activateSlot', n]);
      if (opts.activateFails) throw new TjError(opts.activateFails);
      const b = state.bundle;
      if (!b?.slots[n - 1]?.track) throw new TjError('ST_SLOT_EMPTY');
      const offsets = b.slots.map((x) => (x.n === b.active ? state.view.displayOffsetMs : x.offsetMs));
      set({ ...withSlots(b.slots.map((x) => x.track), { active: n, offsets, names: b.slots.map((x) => x.name) }), view: Object.freeze({ ...state.view, displayOffsetMs: offsets[n - 1] }) });
      return state;
    },
    async loadArabicInto(n, input, { replace = false, activate } = {}) {
      calls.push(['loadArabicInto', n, input, { replace, activate }]);
      if (opts.loadFails) throw new TjError(opts.loadFails);
      if (opts.loadGate) await opts.loadGate;
      const b = state.bundle;
      const filled = !!b?.slots[n - 1]?.track;
      if (filled && !replace) throw new TjError('ST_ARABIC_EXISTS');
      const tracks = b ? b.slots.map((x) => x.track) : [null, null, null];
      const offsets = b ? b.slots.map((x) => (x.n === b.active ? state.view.displayOffsetMs : x.offsetMs)) : [0, 0, 0];
      tracks[n - 1] = { original: input.cues, current: input.current ?? null, fileName: input.fileName, comparison: input.comparison };
      const wasActive = b?.active ?? null;
      const offsetWas = wasActive === n ? offsets[n - 1] : 0;
      offsets[n - 1] = 0;
      const active = (activate ?? !filled) || !wasActive ? n : wasActive;
      set({
        ...withSlots(tracks, { active, offsets, names: b ? b.slots.map((x) => x.name) : [null, null, null] }),
        view: Object.freeze({ ...state.view, displayOffsetMs: offsets[active - 1] }),
        notice: offsetWas !== 0 ? { code: 'ST_OFFSET_RESET', tone: 'info', at: ++seq } : filled ? { code: 'ST_PREVIOUS_SAVED', tone: 'info', at: ++seq } : null,
      });
      return { record: null, replaced: filled, activated: active === n && wasActive !== n };
    },
    async markCue({ index }, kind = 'todo') {
      calls.push(['markCue', index, kind]);
      if (opts.markFails) throw new TjError(opts.markFails);
      const mark = { n: state.arabic.cues[index].n, kind };
      return {
        mark,
        undo: async () => {
          calls.push(['undoMark', index]);
          if (opts.undoFails) throw new TjError(opts.undoFails);
        },
      };
    },
    async updatePrefs(patch) {
      calls.push(['updatePrefs', patch]);
      return state.prefs;
    },
  };
}

/** تدفقا التصدير والاستيراد الوهميان: يسجّلان المدخلات، والنتيجة قابلة للضبط. */
export function fakeFlows() {
  const built = [];
  const downloads = [];
  const reads = [];
  const reviews = [];
  const instructionCalls = [];
  const flows = {
    built, downloads, reads, reviews, instructionCalls,
    saveResults: [],
    saveGate: null,
    saveError: null,
    onSave: null,
    nameHint: null,
    known: [],
    knownFails: false,
    buildError: null,
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
        const parts = n > 1 ? Array.from({ length: n }, (_, i) => ({ index: i + 1, from: i * 2 + 1, to: i * 2 + 2 })) : null;
        return {
          files: Array.from({ length: n }, (_, i) => ({ name: name(i + 1), text: 'srt'.repeat(i + 1), part: parts ? { ...parts[i], total: n } : null, cueCount: 5 })),
          fingerprint: { id: 'fp_new0000001', mode: spec.mode, parts },
          instructions: INSTRUCTIONS,
          warnings: [...flows.warnings],
        };
      },
      instructions(spec) {
        instructionCalls.push(spec);
        return `${INSTRUCTIONS}+قاموس(${spec.glossary.length})`;
      },
      async saveFile(file, env) {
        if (flows.saveGate) await flows.saveGate;
        flows.onSave?.(file);
        if (flows.saveError) throw new TjError(flows.saveError);
        const r = flows.saveResults.length ? flows.saveResults.shift() : { ok: true, mode: 'downloads', downloadId: downloads.length + 1 };
        if (r.ok) downloads.push({ name: file.name, hasDoc: !!env?.doc });
        return r;
      },
    },
    importFlow: {
      async readImport(files, opts) {
        reads.push({ names: files.map((f) => f.name), opts });
        if (flows.readGate) await flows.readGate;
        return flows.readResult(files);
      },
      reviewIncoming(args) {
        reviews.push(args);
        return { references: [], suggested: null, certain: false, nameHint: flows.nameHint };
      },
      async knownVideos() {
        if (flows.knownFails) throw new Error('storage');
        return flows.known;
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
export function mountPage({ state = makeState(), controllerOpts = {}, width = 640, height = 360, withBar = true, clipboard = 'ok', brave = false } = {}) {
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
  if (brave) env.win.navigator.brave = { isBrave: async () => true };
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
