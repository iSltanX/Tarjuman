// منطق اللوحة النقي: الجدول الزمني (المقطع الحالي بقاعدة الطبقة مع الإزاحة)، والنص الأصلي المتداخل، ونموذج العرض من الحالة،
// وتسمية اللغة من المسار الفعلي لا من نص مكتوب، وصيغ الأزمنة وسطر الحالة.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lookupMs } from '../../../../src/core/model/timing.js';
import { createSyncEngine } from '../../../../src/player/sync/engine.js';
import { createTimeline, derive, originalLookup } from '../../../../src/player/panel/model.js';
import { LABELS, clockLabel, flatText, languageName, offsetMeaningShort, statusParts } from '../../../../src/player/panel/text.js';
import { A, B, arCues, enCues, english, makeState } from './harness.js';

const cue = (n, startMs, endMs, text = `c${n}`) => ({ n, startMs, endMs, text });

test('الجدول الزمني: المقطع الحالي من currentTime ناقص الإزاحة، بقاعدة الفهرس نفسها', () => {
  const cues = arCues(4); // 1.0–3.0، 3.5–5.5، 6.0–8.0، 8.5–10.5
  const tl = createTimeline(cues);
  assert.equal(tl.locate(lookupMs(2, 0)).row, 0);
  assert.equal(tl.locate(lookupMs(4, 0)).row, 1);
  // إزاحة +1.5 ث: الترجمة تظهر لاحقًا، فعند 2.0 ث (ناقص 1.5 = 0.5) لا مقطع، وعند 4.5 ث (3.0) نصل إلى حدّ الأول المنتهي
  assert.equal(tl.locate(lookupMs(2, 1500)).row, -1);
  assert.equal(tl.locate(lookupMs(5, 1500)).row, 1);
  // إزاحة سالبة: تظهر أبكر
  assert.equal(tl.locate(lookupMs(2, -1500)).row, 1);
});

test('الفجوة: المرساة آخر مقطع بدأ، والماضي ما قبله؛ وقبل الأول المرساة الأول بلا ماضٍ', () => {
  const tl = createTimeline(arCues(3));
  const gap = tl.locate(3200); // بين الأول (ينتهي 3000) والثاني (يبدأ 3500)
  assert.equal(gap.row, -1);
  assert.equal(gap.anchor, 0);
  assert.equal(gap.past, 1);
  const before = tl.locate(100);
  assert.equal(before.row, -1);
  assert.equal(before.anchor, 0);
  assert.equal(before.past, 0);
  const after = tl.locate(99999);
  assert.equal(after.anchor, 2);
  assert.equal(after.past, 3);
  const inside = tl.locate(4000);
  assert.equal(inside.row, 1);
  assert.equal(inside.anchor, 1);
  assert.equal(inside.past, 1);
});

test('الجدول يتفق مع محرّك الطبقة على المقطع الظاهر في عشرات الأزمنة مع إزاحات مختلفة', () => {
  const cues = [cue(1, 500, 1500), cue(2, 1400, 2600), cue(3, 4000, 4500), cue(4, 4400, 6000), cue(5, 7000, 7100)];
  const tl = createTimeline(cues);
  for (const off of [0, 700, -700, 3000]) {
    for (let sec = 0; sec <= 9; sec += 0.1) {
      let shown = null;
      const engine = createSyncEngine({ win: { requestAnimationFrame: () => 1, cancelAnimationFrame() {} }, onFrame: (f) => (shown = f.ar) });
      const video = { currentTime: sec, paused: true, ended: false, addEventListener() {}, removeEventListener() {} };
      engine.setVideo(video);
      engine.setSource({ ar: cues, en: null, offsetMs: off });
      const expected = shown ? cues.indexOf(shown) : -1;
      assert.equal(tl.locate(lookupMs(sec, off)).row, expected, `offset=${off} t=${sec.toFixed(1)}`);
      engine.destroy();
    }
  }
});

test('نافذة الجواب [from, to): ما دام الزمن داخلها فالمقطع نفسه', () => {
  const tl = createTimeline(arCues(5));
  const hit = tl.locate(4000);
  for (let ms = hit.from; ms < hit.to; ms += 100) assert.equal(tl.locate(ms).row, hit.row);
});

test('مقاطع غير مرتبة: الصفوف بترتيب المصفوفة والماضي بترتيب البداية', () => {
  const cues = [cue(1, 6000, 7000), cue(2, 1000, 2000), cue(3, 3000, 4000)];
  const tl = createTimeline(cues);
  assert.equal(tl.locate(3500).row, 2);
  assert.equal(tl.locate(3500).past, 1, 'رتبة الثالث بين البدايات الثانية (من صفر: 1)');
  const gap = tl.locate(2500);
  assert.equal(gap.row, -1);
  assert.equal(gap.anchor, 1);
  assert.equal(tl.rowAtRank(0), 1);
  assert.equal(tl.rowAtRank(2), 0);
});

test('مقاطع فارغة: لا مرساة ولا خطأ', () => {
  const tl = createTimeline([]);
  const r = tl.locate(1000);
  assert.deepEqual([r.row, r.anchor, r.past], [-1, -1, 0]);
});

test('الأصل المتداخل: يُضم نص ما يتداخل زمنًا مع مقطع عربي بترتيب الزمن', () => {
  const en = [cue(1, 0, 1500, 'one'), cue(2, 1500, 3000, 'two'), cue(3, 3000, 4000, 'three')];
  const lookup = originalLookup(en);
  assert.equal(lookup(1000, 3000), 'one two');
  assert.equal(lookup(3500, 5500), 'three');
  assert.equal(lookup(4000, 5000), '', 'لا تداخل عند التماس فقط');
  assert.equal(lookup(1500, 3000), 'two', 'التماس عند الحد لا يُحتسب');
});

test('الأصل المتداخل: غير المرتب لا يفقد شيئًا، والأسطر المتعددة تُسوّى', () => {
  const en = [cue(2, 3000, 4000, 'late'), cue(1, 0, 3000, 'early\nsecond line')];
  assert.equal(originalLookup(en)(0, 5000), 'early second line late');
});

test('الأصل المتداخل يخدم آلاف المقاطع بلا مسح خطي', () => {
  const en = Array.from({ length: 5000 }, (_, i) => cue(i + 1, i * 1000, i * 1000 + 900, `e${i}`));
  const lookup = originalLookup(en);
  const t0 = process.hrtime.bigint();
  let hits = 0;
  for (let i = 0; i < 5000; i++) if (lookup(i * 1000 + 100, i * 1000 + 800) === `e${i}`) hits++;
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  assert.equal(hits, 5000);
  assert.ok(ms < 500, `5000 بحثًا في ${ms.toFixed(0)}ms`);
});

// ———— نموذج العرض ————

const page = (over = {}) => ({ videoId: A, navigating: false, visible: true, ...over });

test('derive: الشكل من التفضيلات: مغلقة ← زر، ومفتوحة ← لوحة، وزر مخفي ← لا شيء أو الرسالة وحدها', () => {
  const withUi = (ui) => makeState({ prefs: { ...makeState().prefs, ui: { ...makeState().prefs.ui, ...ui } } });
  assert.equal(derive(withUi({ panelOpen: false }), page(), { toast: false }).mode, 'entry');
  assert.equal(derive(withUi({ panelOpen: true }), page(), { toast: false }).mode, 'open');
  assert.equal(derive(withUi({ panelEntry: false, panelOpen: false }), page(), { toast: false }).mode, 'none');
  assert.equal(derive(withUi({ panelEntry: false, panelOpen: false }), page(), { toast: true }).mode, 'toast');
  assert.equal(derive(withUi({ panelOpen: true }), page({ visible: false }), { toast: true }).mode, 'none', 'ملء الشاشة أو خارج الفيديو');
});

test('derive: النوع: هيكل التحميل ثم الخطأ ثم لا ترجمة ثم جاهزة', () => {
  const kind = (state, p = page()) => derive(state, p, { toast: false }).kind;
  assert.equal(kind(makeState()), 'ready');
  assert.equal(kind(makeState({ loading: true, arabic: null })), 'loading');
  assert.equal(kind(makeState({ videoId: B })), 'loading', 'حالة فيديو غير فيديو الصفحة');
  assert.equal(kind(makeState(), page({ navigating: true })), 'loading');
  assert.equal(kind(makeState({ arabic: null })), 'empty');
  assert.equal(kind(makeState({ arabic: null, error: { code: 'ST_READ_FAILED', message: 'تعذّرت القراءة', detail: null } })), 'error');
  assert.equal(kind(makeState({ error: { code: 'ST_WRITE_FAILED', message: 'x', detail: null } })), 'ready', 'خطأ مع ترجمة معروضة لا يحجبها');
});

test('derive: النص الأصلي ومتاحه: المزدوج فعليًا بالتفضيل والتوفر معًا', () => {
  const base = makeState({ english: english({ lang: 'en' }) });
  const m = derive(base, page(), { toast: false });
  assert.equal(m.dual, true);
  assert.equal(m.original.lang, 'en');
  const off = derive({ ...base, prefs: { ...base.prefs, ui: { ...base.prefs.ui, panelDual: false } } }, page(), { toast: false });
  assert.equal(off.dual, false);
  assert.equal(off.dualPref, false);
  assert.ok(off.original, 'الأصل متاح وإن لم يُطلب');
  const none = derive(makeState({ english: null }), page(), { toast: false });
  assert.equal(none.dual, false);
  assert.equal(none.original, null);
});

test('derive: الإزاحة لفيديو الصفحة وحده، وسطر الحالة من الخانة النشطة واسمها', () => {
  const s = makeState({ view: { displayOffsetMs: 500, displayMode: 'ar' } });
  assert.equal(derive(s, page(), { toast: false }).offsetMs, 500);
  assert.equal(derive(s, page({ videoId: B }), { toast: false }).offsetMs, 0);
  assert.deepEqual(derive(s, page(), { toast: false }).status, { slot: 2, name: 'مراجعة', count: 3 });
});

test('سطر الحالة: «متزامن · الترجمة N «اسم» · M مقطعًا» والاسم والرقم يُحذفان إن غابا', () => {
  assert.equal(statusParts({ slot: 2, name: 'مراجعة', count: 412 }).join(' · '), 'متزامن · الترجمة 2 «مراجعة» · 412 مقطعًا');
  assert.equal(statusParts({ slot: 1, name: null, count: 1 }).join(' · '), 'متزامن · الترجمة 1 · مقطع واحد');
  assert.equal(statusParts({ slot: null, name: null, count: 2 }).join(' · '), 'متزامن · مقطعان');
  assert.equal(statusParts({ slot: 3, name: null, count: 7 }).join(' · '), 'متزامن · الترجمة 3 · 7 مقاطع');
});

test('اسم اللغة: من الرمز الفعلي بأسماء Intl.DisplayNames العربية، لا نص مكتوب بالشيفرة', () => {
  const ar = new Intl.DisplayNames(['ar'], { type: 'language' });
  for (const code of ['en', 'es', 'fr', 'de', 'ja', 'ar']) assert.equal(languageName(code), ar.of(code), code);
  assert.equal(languageName('en-GB'), ar.of('en'), 'اللغة الأساسية');
  assert.notEqual(languageName('es'), languageName('en'));
});

test('اسم اللغة: بدائل آمنة بلا رمي', () => {
  assert.equal(languageName(''), '');
  assert.equal(languageName(null), '');
  assert.equal(languageName('zzzz-invalid-???'), 'zzzz-invalid-???');
  assert.equal(languageName('en', null), 'en', 'لا Intl.DisplayNames ← الرمز');
  class Throws {
    constructor() {
      throw new RangeError('x');
    }
  }
  assert.equal(languageName('en', Throws), 'en');
  class Unknown {
    of(c) {
      return c;
    }
  }
  assert.equal(languageName('xx', Unknown), 'xx', 'يعيد الرمز نفسه ← الرمز');
});

test('زمن الصف: دقائق بخانتين، والساعات بخانة، والسالب صفر', () => {
  assert.equal(clockLabel(245000), '04:05');
  assert.equal(clockLabel(59999), '00:59');
  assert.equal(clockLabel(3725000), '1:02:05');
  assert.equal(clockLabel(-4000), '00:00');
  assert.equal(clockLabel(0), '00:00');
});

test('نص المقطع يُسوّى لسطر واحد، ومعنى الإزاحة المختصر', () => {
  assert.equal(flatText('سطر أول\n  سطر ثانٍ '), 'سطر أول سطر ثانٍ');
  assert.equal(offsetMeaningShort(500), 'تظهر لاحقًا');
  assert.equal(offsetMeaningShort(-500), 'تظهر أبكر');
  assert.equal(offsetMeaningShort(0), 'في توقيتها المحفوظ');
  assert.equal(offsetMeaningShort(40), 'في توقيتها المحفوظ', 'دون شبكة 100ms');
  assert.ok(LABELS.hideHint.includes('نافذة ترجمان'));
});

test('derive يحمل مراجع المقاطع نفسها (المتحكم يثبّتها ما لم يتغير مصدرها)', () => {
  const s = makeState();
  const m = derive(s, page(), { toast: false });
  assert.ok(m.cues === s.arabic.cues, 'المرجع نفسه (المتحكم يثبّته ما لم يتغير مصدره)');
  const e = enCues(2);
  assert.ok(derive(makeState({ english: english({ cues: e }) }), page(), { toast: false }).original.cues === e);
});
