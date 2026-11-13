// ف8 (2026-11-10): «هل تغيّر يوتيوب؟» أشكال بلا قيم ومقارنتها بخط الأساس، والإصدار 2 (الفكرة ١): سجل youtube-dom.js كله، و'unobserved'
// لما لم يُستدعَ. الوحدة نقية؛ والمشغّل الحي في test/live لا يُشغَّل هنا (استيراده يفتح المتصفح).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import {
  BADGE, CC_ATTRS, FMT_CLASSES, KIND_CLASSES, NAV_EVENTS, PANEL_WATCHED, SECTIONS, SHAPES_VERSION, UNOBSERVED, WATCHED,
  collectInPage, diffLine, diffShapes, fmtClass, inPageWatch, logRow, requestShape, shapeOf, snapshot, unobservedNow, withProbes,
} from '../../../scripts/youtube-shapes.mjs';
import { readTimedtextParams } from '../../../src/extract/timedtext-params.js';
import { ATTRS, CLASSES, EVENTS, PANEL_SELECTORS, SELECTORS } from '../../../src/player/youtube-dom.js';

const BASELINE = JSON.parse(readFileSync(new URL('../../fixtures/youtube/shapes-baseline.json', import.meta.url), 'utf8'));

test('shapeOf: الأنواع والمفاتيح لا القيم، وأول عنصر من المصفوفة', () => {
  assert.deepEqual(shapeOf({ b: 'x', a: [{ lang: 'en', n: 3 }, { lang: 'ar' }], c: null }), { a: [{ lang: 'string', n: 'number' }], b: 'string', c: 'null' });
  assert.equal(shapeOf('secret-token-123'), 'string');
});

test('requestShape: صنف fmt وأسماء المعاملات مرتبة، بلا قيمة (لا معرّف ولا رمز pot) ولا مسار', () => {
  const s = requestShape('https://www.youtube.com/api/timedtext?v=AAAAAAAAAAA&lang=en&pot=SECRET&fmt=json3&lang=ar');
  assert.deepEqual(s, { fmt: 'json3', params: ['fmt', 'lang', 'pot', 'v'] });
  assert.ok(!JSON.stringify(s).includes('SECRET') && !JSON.stringify(s).includes('AAAAAAAAAAA'));
  assert.equal(requestShape('not a url'), null);
});

test('fmtClass (ح-37): صنف من قائمة مغلقة بمصنّف الالتقاط نفسه، لا نص المعامل', () => {
  const url = (q) => `https://www.youtube.com/api/timedtext?v=AAAAAAAAAAA&lang=en${q}`;
  assert.deepEqual(FMT_CLASSES, ['json3', 'srv3', 'vtt', 'other', 'default']);
  assert.equal(fmtClass(url('&fmt=json3')), 'json3');
  assert.equal(fmtClass(url('&fmt=srv3')), 'srv3');
  assert.equal(fmtClass(url('')), 'default', 'بلا fmt');
  assert.equal(fmtClass(url('&fmt=SECRET123')), 'other', 'قيمة غير معروفة لا تُحفظ');
  assert.equal(fmtClass('https://example.com/api/timedtext?fmt=json3'), 'other', 'طلب لا يقبله الالتقاط');
  assert.equal(fmtClass('not a url'), 'other');
  // vtt من المصنّف نفسه حين يعرفه (الفكرة ٤)؛ فالفاحص يتبع readTimedtextParams ولا يصنّف وحده.
  for (const q of ['&fmt=json3', '&fmt=srv3', '&fmt=vtt', '&fmt=srv1', '']) {
    const own = readTimedtextParams(url(q)).format;
    assert.equal(fmtClass(url(q)), FMT_CLASSES.includes(own) ? own : 'other', q);
    assert.ok(FMT_CLASSES.includes(fmtClass(url(q))), q);
  }
  // تغيّر الصيغة فرق في timedtext، والقيمة نفسها لا تدخل اللقطة.
  const at = { inPage: { dom: {} }, events: [], source: 'A', at: 'x' };
  const json3 = snapshot({ ...at, requests: [url('&fmt=json3')] });
  const srv3 = snapshot({ ...at, requests: [url('&fmt=srv3'), url('&fmt=srv3&tlang=ar')] });
  assert.deepEqual(json3.timedtext, [{ fmt: 'json3', params: ['fmt', 'lang', 'v'] }]);
  assert.deepEqual(diffShapes(json3, srv3).map(diffLine), ['تغيّر: timedtext']);
  assert.ok(!JSON.stringify(snapshot({ ...at, requests: [url('&fmt=SECRET123')] })).includes('SECRET123'));
});

test('snapshot وdiffShapes: عنصر غاب يُسمّى «غاب»، وطلب بمعامل جديد «تغيّر»، والمصدر والتاريخ لا يُقارنان', () => {
  const inPage = { dom: Object.fromEntries(Object.keys(SELECTORS).map((k) => [k, k !== 'liveBadge'])), tracklist: { renderer: { captionTracks: ['object'] }, track: { languageCode: 'string' } } };
  const base = snapshot({ inPage, requests: ['https://www.youtube.com/api/timedtext?v=x&lang=en'], events: ['yt-navigate-finish'], source: 'A', at: '2026-01-01' });
  const renamed = structuredClone(inPage);
  renamed.dom.rightControls = false;
  const now = snapshot({ inPage: renamed, requests: ['https://www.youtube.com/api/timedtext?v=y&lang=ar&pot=z'], events: ['yt-navigate-finish'], source: 'B', at: '2026-02-02' });
  const diffs = diffShapes(base, now);
  assert.deepEqual(diffs.map(diffLine), ['غاب: dom.rightControls', 'تغيّر: timedtext']);
  assert.deepEqual(diffShapes(base, structuredClone(base)), [], 'لا فروق مع نفسه');
  assert.deepEqual(Object.keys(base.events), NAV_EVENTS);
});

test('صف السجل بأعمدة الجدول، ويذكر الفروق', () => {
  const row = logRow({ date: '2026-11-10', browser: 'chrome', version: '157.0', diffs: [{ path: 'dom.rightControls', kind: 'missing' }], source: 'المشغّل المحلي' });
  assert.equal(row.split('|').length - 2, 5, 'خمسة أعمدة');
  assert.match(row, /\| 2026-11-10 \| — \| 157\.0 \| — \|/);
  assert.match(row, /غاب: dom\.rightControls/);
});

test('WATCHED: SELECTORS كلها كما هي، وزمن المشغّل بصنفه داخل الأدوات اليسرى كما يبحث عنه bar.js', () => {
  for (const [k, sel] of Object.entries(SELECTORS)) assert.equal(WATCHED[k], sel, k);
  assert.equal(WATCHED.timeDisplay, `${SELECTORS.leftControls} .${CLASSES.timeDisplay}`);
  assert.equal(CLASSES.timeDisplay, 'ytp-time-display');
  assert.deepEqual(Object.keys(WATCHED).sort(), [...Object.keys(SELECTORS), 'timeDisplay'].sort());
});

/** عنصر وهمي بقدر ما يقرؤه collectInPage: أصنافه وسماته وما في داخله بمحدده. */
function fakeElement({ classes = [], attrs = {}, inner = {} } = {}) {
  return {
    classList: { contains: (c) => classes.includes(c) },
    hasAttribute: (a) => Object.hasOwn(attrs, a),
    getAttribute: (a) => (Object.hasOwn(attrs, a) ? attrs[a] : null),
    getAttributeNames: () => Object.keys(attrs),
    querySelector: (sel) => inner[sel] ?? null,
  };
}

/**
 * صفحة يوتيوب وهمية: present() يقرر وجود كل محدد عام، والمشغّل وytd-watch-flexy والشارة وزر CC عناصر بأصنافها وسماتها.
 * @param {{ present?: (sel: string) => boolean, player?: { classes?: string[], inner?: string[] }, flexy?: object | null, html?: object,
 *   badge?: object | null, badgeDisplay?: string, cc?: object | null, response?: object | null }} [o]
 */
function fakePage({ present = () => true, player = {}, flexy = {}, html = {}, badge = null, badgeDisplay = 'none', cc = null, response = null } = {}) {
  const playerEl = fakeElement({ classes: player.classes, inner: Object.fromEntries((player.inner ?? []).map((c) => [`.${c}`, fakeElement()])) });
  playerEl.getPlayerResponse = () => response;
  const flexyEl = flexy ? fakeElement({ attrs: flexy }) : null;
  const badgeEl = badge ? fakeElement(badge) : null;
  const ccEl = cc ? fakeElement({ attrs: cc }) : null;
  const special = new Map([[SELECTORS.player, playerEl], [PANEL_SELECTORS.flexy, flexyEl], [SELECTORS.liveBadge, badgeEl], [SELECTORS.subtitlesButton, ccEl]]);
  return {
    document: {
      querySelector: (sel) => (special.has(sel) ? special.get(sel) : present(sel) ? fakeElement() : null),
      documentElement: fakeElement({ attrs: html }),
    },
    window: { getComputedStyle: (el) => ({ display: el === badgeEl ? badgeDisplay : 'block' }) },
  };
}

/** collectInPage كما يقيّمه المشغّل الحي: نص الدالة في سياق جديد لا يرى غير document وwindow، ووسيطه JSON، ونتيجته بالقيمة. */
function inPage(page, w = inPageWatch()) {
  return JSON.parse(vm.runInNewContext(`JSON.stringify((${collectInPage.toString()})(${JSON.stringify(w)}))`, { ...page }));
}

test('collectInPage: زمن بلا أدوات يسرى أو باسم آخر «غاب»، ووجوده في مكانه «موجود»', () => {
  const all = Object.values(WATCHED);
  const run = (sels) => inPage(fakePage({ present: (sel) => sels.includes(sel) })).dom;
  assert.equal(run(all).timeDisplay, true);
  const renamed = run(all.filter((sel) => sel !== WATCHED.timeDisplay));
  assert.equal(renamed.timeDisplay, false);
  assert.equal(renamed.leftControls, true);
  const base = snapshot({ inPage: { dom: run(all), tracklist: {} }, requests: [], events: [], source: 'A', at: 'x' });
  const now = snapshot({ inPage: { dom: renamed, tracklist: {} }, requests: [], events: [], source: 'B', at: 'y' });
  assert.deepEqual(diffShapes(base, now).map(diffLine), ['غاب: dom.timeDisplay']);
});

test('مطابقة السجل: كل مفتاح في SELECTORS وPANEL_SELECTORS وCLASSES وATTRS وكل حدث في EVENTS له مدخل في اللقطة، ووسائط الصفحة نصوص تعبر JSON كما هي', () => {
  const w = inPageWatch();
  assert.deepEqual(JSON.parse(JSON.stringify(w)), w, 'evaluate يمرّر الوسائط JSON: لا نمط ولا دالة تضيع');
  const snap = snapshot({ inPage: inPage(fakePage()), requests: [], events: [], source: 'A', at: 'x' });
  for (const [section, registry] of [['dom', SELECTORS], ['panel', PANEL_SELECTORS], ['classes', CLASSES], ['attrs', ATTRS]]) {
    for (const k of Object.keys(registry)) assert.ok(Object.hasOwn(snap[section], k), `${section}.${k}`);
  }
  assert.deepEqual(Object.keys(snap.panel).sort(), Object.keys(PANEL_SELECTORS).sort());
  assert.deepEqual(Object.keys(snap.classes).sort(), Object.keys(CLASSES).sort());
  assert.deepEqual(Object.keys(snap.attrs).sort(), Object.keys(ATTRS).sort());
  assert.equal(PANEL_WATCHED.belowAnchor, `${PANEL_SELECTORS.below} ${PANEL_SELECTORS.belowAnchor}`, 'صندوق بيانات الفيديو داخل #below كما تبحث عنه column.js');
  assert.deepEqual(Object.keys(snap), ['version', 'source', 'at', ...SECTIONS]);
  assert.equal(snap.version, 2);
  for (const name of Object.values(EVENTS)) assert.ok(NAV_EVENTS.includes(name), `events.${name}`);
});

test('collectInPage v2: الأصناف والسمات رُصدت أو «unobserved»، وأسماء سمات التخطيط، وشارة البث وزر CC أشكالًا بلا نص', () => {
  const page = fakePage({
    player: { classes: [CLASSES.autohide], inner: [CLASSES.timeDisplay] },
    flexy: { 'is-two-columns_': '', 'video-id': 'AAAAAAAAAAA', flexy: '', role: 'main' },
    html: { lang: 'ar', dark: '' },
    badge: {},
    cc: { 'aria-pressed': 'true', 'aria-label': 'Subtitles/closed captions (c)' },
  });
  const r = inPage(page);
  assert.equal(r.classes.autohide, true);
  assert.equal(r.classes.timeDisplay, true);
  for (const k of ['adShowing', 'adInterrupting', 'fullscreen', 'bigMode', 'smallMode', 'chapter']) assert.equal(r.classes[k], UNOBSERVED, k);
  assert.deepEqual(r.attrs, { singleColumn: UNOBSERVED, dark: true, layout: ['is-two-columns_'] });
  assert.deepEqual(r.badge, { shown: false, disabled: UNOBSERVED, liveHead: UNOBSERVED }, 'فيديو عادي: الشارة مخفية، وحالتا البث لم تُستدعيا');
  assert.deepEqual(r.cc, { 'aria-pressed': true, 'aria-disabled': false, disabled: false, on: true });
  assert.deepEqual(CC_ATTRS, ['aria-pressed', 'aria-disabled', 'disabled']);
  const text = JSON.stringify(r);
  for (const v of ['AAAAAAAAAAA', 'Subtitles', '"main"', '"ar"', 'video-id', 'aria-label']) assert.ok(!text.includes(v), `بلا قيمة سمة ولا سمة خارج النمط (${v})`);

  const live = inPage(fakePage({ badge: { classes: [BADGE.liveHead], attrs: { disabled: '' } }, badgeDisplay: 'flex' }));
  assert.deepEqual(live.badge, { shown: true, disabled: true, liveHead: true });
  const none = inPage(fakePage({ flexy: null, html: {} }));
  assert.equal(none.badge, UNOBSERVED);
  assert.equal(none.cc, UNOBSERVED);
  assert.deepEqual(none.attrs, { singleColumn: UNOBSERVED, dark: UNOBSERVED, layout: UNOBSERVED });
});

test('collectInPage v2: اتحاد مفاتيح المسارات كلها لا الأول وحده، وأصناف kind من قائمة مغلقة', () => {
  const response = {
    captions: {
      playerCaptionsTracklistRenderer: {
        captionTracks: [
          { languageCode: 'en', name: { simpleText: 'English' }, vssId: '.en' },
          { languageCode: 'en', kind: 'asr', name: { runs: [{ text: 'English (auto-generated)' }] }, vssId: 'a.en' },
          { languageCode: 'de', kind: 'forced', name: { simpleText: 'Deutsch' } },
        ],
        translationLanguages: [{ languageCode: 'ar' }],
      },
    },
  };
  const r = inPage(fakePage({ response }));
  assert.deepEqual(r.tracklist.track, { kind: 'string', languageCode: 'string', name: { runs: [{ text: 'string' }], simpleText: 'string' }, vssId: 'string' });
  assert.deepEqual(r.tracklist.kinds, ['absent', 'asr', 'other']);
  assert.ok(r.tracklist.kinds.every((k) => KIND_CLASSES.includes(k)));
  assert.ok(!JSON.stringify(r.tracklist).includes('forced') && !JSON.stringify(r.tracklist).includes('English'), 'بلا قيمة kind ولا اسم');
  const mixed = inPage(fakePage({ response: { captions: { playerCaptionsTracklistRenderer: { captionTracks: [{ name: 'x' }, { name: { simpleText: 'y' } }] } } } }));
  assert.deepEqual(mixed.tracklist.track, { name: 'mixed' });
  assert.deepEqual(inPage(fakePage()).tracklist, { renderer: 'missing', track: 'missing', kinds: 'missing' });
});

test('«unobserved» لا يُعدّ فرقًا في أي من الجهتين، ويُذكر ما رُصد في خط الأساس ولم يُرصد الآن؛ والمجسّات تضيف ما رصدته', () => {
  const page = (o) => inPage(fakePage(o));
  const wide = page({ flexy: { 'is-two-columns_': '' } });
  const dark = page({ flexy: { 'is-two-columns_': '' }, html: { dark: '' } });
  const narrow = page({ flexy: { 'is-single-column': '' }, player: { classes: [CLASSES.smallMode] } });
  const merged = withProbes(wide, [dark, null, narrow]);
  assert.deepEqual(merged.attrs, { singleColumn: true, dark: true, layout: ['is-two-columns_'] }, 'نمط التخطيط من اللقطة الأولى وحدها');
  assert.equal(merged.classes.smallMode, true);
  assert.equal(wide.attrs.dark, UNOBSERVED, 'المجسّات لا تغيّر اللقطة الأولى');

  const at = { requests: [], events: [], source: 'A', at: 'x' };
  const base = snapshot({ inPage: wide, probes: [dark, narrow], ...at });
  const now = snapshot({ inPage: wide, ...at });
  assert.deepEqual(diffShapes(base, now), [], 'لم يُرصد الآن ما رُصد قبلًا: ليس فرقًا');
  assert.deepEqual(diffShapes(now, base), [], 'رُصد الآن ما لم يُرصد قبلًا: ليس فرقًا');
  assert.deepEqual(unobservedNow(base, now), ['attrs.dark', 'attrs.singleColumn', 'classes.smallMode']);
  assert.deepEqual(unobservedNow(now, base), []);
  const noBadge = structuredClone(base);
  noBadge.badge = UNOBSERVED;
  assert.deepEqual(diffShapes(base, noBadge), []);
  assert.deepEqual(unobservedNow(base, noBadge), []);
  const liveBase = structuredClone(base);
  liveBase.badge = { shown: true, disabled: true, liveHead: true };
  assert.deepEqual(unobservedNow(liveBase, noBadge), ['badge']);
  // والمرصود في الجهتين يُقارن كالمعتاد.
  const renamed = structuredClone(base);
  renamed.attrs.layout = ['is-two-cols'];
  assert.deepEqual(diffShapes(base, renamed).map(diffLine), ['تغيّر: attrs.layout']);
  assert.equal(snapshot({ inPage: { dom: {} }, ...at }).panel, UNOBSERVED, 'قسم لم يُجمع');
  // خط أساس بإصدار أقدم بلا قسم: القسم «جديد» لا «تغيّر»، والقسم الذي غاب من اللقطة «غاب».
  const { panel, ...older } = base;
  assert.ok(panel);
  assert.deepEqual(diffShapes(older, base).map(diffLine), ['جديد: panel']);
  assert.deepEqual(diffShapes(base, older).map(diffLine), ['غاب: panel']);
});

test('خط الأساس في المستودع (الإصدار 2): أقسامه كلها بمفاتيح السجل، ومصدره مذكور، والتنقل الفعلي سُجّل، وأشكال بلا رابط ولا معرّف ولا عنوان', () => {
  // يُجمع حيًّا بعد الدمج (npm run youtube:shapes -- --browser chrome --update)، فيسقط هذا الاختبار وحده حتى ذلك الحين.
  assert.equal(BASELINE.version, SHAPES_VERSION);
  assert.equal(SHAPES_VERSION, 2);
  assert.ok(BASELINE.source && BASELINE.at);
  assert.deepEqual(Object.keys(BASELINE), ['version', 'source', 'at', ...SECTIONS]);
  assert.deepEqual(Object.keys(BASELINE.dom).sort(), Object.keys(WATCHED).sort());
  assert.deepEqual(Object.keys(BASELINE.panel).sort(), Object.keys(PANEL_WATCHED).sort());
  assert.deepEqual(Object.keys(BASELINE.classes).sort(), Object.keys(CLASSES).sort());
  assert.deepEqual(Object.keys(BASELINE.attrs).sort(), Object.keys(ATTRS).sort());
  assert.ok(['dom', 'panel'].every((k) => Object.values(BASELINE[k]).every((v) => v === true || v === false)));
  assert.ok(Object.values(BASELINE.classes).every((v) => v === true || v === UNOBSERVED));
  for (const k of ['badge', 'cc']) assert.ok(BASELINE[k] === UNOBSERVED || (BASELINE[k] && typeof BASELINE[k] === 'object'), k);
  // جُمع بعد انتقال فعلي إلى مقترح (Y2): كان yt-navigate-start false لأن الجولة لم تنتقل.
  assert.equal(BASELINE.events['yt-navigate-start'], true);
  const all = JSON.stringify(BASELINE);
  assert.ok(!/https?:|\/\//.test(all), 'بلا رابط');
  for (const id of ['iG9CE55wbtY', 'walkF00001x']) assert.ok(!all.includes(id), `بلا معرّف فيديو (${id})`);
  // كل نص في الأشكال اسمُ نوع أو معامل أو سمة أو صنف: بلا مسافة ولا حرف غير لاتيني، فلا عنوان فيديو ولا اسم مسار ولا قيمة.
  const { source, at, ...shapes } = BASELINE;
  assert.ok(typeof source === 'string' && typeof at === 'string');
  const leaves = [];
  const walk = (v) => (v && typeof v === 'object' ? Object.values(v).forEach(walk) : leaves.push(v));
  walk(shapes);
  for (const v of leaves) assert.ok(typeof v !== 'string' || /^[A-Za-z0-9_.-]{1,40}$/.test(v), `ورقة غير شكل: ${String(v).slice(0, 40)}`);
});

test('المشغّل الحي يبدأ سماع أحداث التنقل والعدّاد فارغ قبل نقر المقترح مباشرة، لا من التحميل الأول (تحقق الجولة الثانية، Y2)', () => {
  // نص المشغّل لا تشغيله: استيراده يفتح المتصفح (test/live يُفحص بـnode --check وحده).
  const src = readFileSync(new URL('../../live/harness/youtube-shapes.mjs', import.meta.url), 'utf8');
  const listen = src.indexOf('window.__tjShapeEvents = [];');
  assert.ok(listen > 0, 'السماع والتصفير في المشغّل');
  assert.equal(src.indexOf('window.__tjShapeEvents = [];', listen + 1), -1, 'موضع واحد للتصفير');
  assert.ok(listen > src.indexOf('await waitForPlayer('), 'بعد جاهزية المشغّل (أي بعد أحداث التحميل الأول)');
  assert.ok(listen > src.indexOf('const reference = [...requests];'), 'بعد طلبات الفيديو المرجعي');
  assert.ok(listen < src.indexOf('await clickRelated('), 'قبل نقر المقترح');
});

test('المشغّل الحي (الإصدار 2): وسائط الصفحة من inPageWatch، ومجسّا الحالة بعد قراءة الأحداث وكلٌّ يعيد ما غيّره، واللقطة بنتائجهما', () => {
  // نص المشغّل لا تشغيله، كالاختبار السابق.
  const src = readFileSync(new URL('../../live/harness/youtube-shapes.mjs', import.meta.url), 'utf8');
  const read = src.indexOf('window.__tjShapeEvents ?? []');
  assert.ok(read > 0);
  assert.match(src, /page\.eval\(collectInPage, \{ args: \[watch\] \}\)/);
  assert.ok(src.indexOf('const watch = inPageWatch();') < src.indexOf('page.eval(collectInPage'), 'الوسائط من inPageWatch قبل أول جمع');
  for (const [apply, undo] of [["'Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'dark' }] }", "'Emulation.setEmulatedMedia', { features: [] }"],
    ["'Emulation.setDeviceMetricsOverride', { width: 800", "'Emulation.clearDeviceMetricsOverride'"]]) {
    assert.ok(src.indexOf(apply) > read, `${apply}: بعد قراءة الأحداث`);
    assert.ok(src.indexOf(undo) > read, `${undo}: يُعاد ما غيّره المجسّ`);
  }
  assert.ok(/finally \{\s*await undo\(\)/.test(src), 'الإعادة في finally ولو تعذّر المجسّ');
  assert.match(src, /snapshot\(\{ inPage, probes, requests: reference, events,/);
  assert.match(src, /unobservedNow\(base, now\)/);
});
