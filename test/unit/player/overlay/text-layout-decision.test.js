// منطق الطبقة النقي: اتجاه الأسطر (عيّنة النص المختلط، P5-AC2 الجزء الآلي)، والهندسة، وقرار العرض.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hasArabic, lineDirection, splitLines } from '../../../../src/player/overlay/text.js';
import { fontPx, layoutFor, scaleOf } from '../../../../src/player/overlay/layout.js';
import { decide } from '../../../../src/player/overlay/decision.js';
import { DEFAULT_SETTINGS } from '../../../../src/core/model/settings.js';
import { makeCues } from '../../../helpers/fixtures.js';
import { SAMPLES } from './samples.js';

test('اتجاه كل سطر من حروفه: RTL إن احتوى عربيًا ولو بدأ بلاتينية، وإلا LTR', () => {
  for (const s of SAMPLES) {
    const lines = splitLines(s.text);
    assert.equal(lines.length, s.dirs.length, `عيّنة ${s.id}: عدد الأسطر`);
    assert.deepEqual(lines.map(lineDirection), s.dirs, `عيّنة ${s.id}`);
  }
  assert.equal(lineDirection('2026'), 'ltr', 'أرقام بلا عربية');
  assert.equal(lineDirection('(OK) 85%'), 'ltr');
  assert.equal(lineDirection('ok مرحبا'), 'rtl');
  assert.equal(hasArabic('ﷲ'), true, 'أشكال العرض');
  assert.equal(hasArabic('ݐ'), true, 'العربية المكمّلة');
  assert.equal(hasArabic('שלום'), false, 'العبرية ليست عربية');
});

test('تقسيم الأسطر: لا فراغات طرفية ولا أسطر فارغة، وكل أنواع نهاية السطر', () => {
  assert.deepEqual(splitLines('  أ \r\n\n ب\rج\n'), ['أ', 'ب', 'ج']);
  assert.deepEqual(splitLines(''), []);
  assert.deepEqual(splitLines(null), []);
  assert.deepEqual(splitLines('<b>غامق</b>'), ['<b>غامق</b>'], 'النص خام، لا يُفسَّر');
});

test('حجم الخط نسبي لارتفاع المشغّل: 22 عند 480 و33 عند 720 و50 في ملء الشاشة 1080 (عند 100%)', () => {
  assert.equal(fontPx(480, 100), 22);
  assert.equal(fontPx(720, 100), 33);
  assert.equal(fontPx(1080, 100), 50);
  assert.equal(fontPx(0, 100), 12, 'حد أدنى');
  assert.equal(fontPx(NaN, 160), 12);
  assert.equal(fontPx(480, undefined), 22, 'نسبة غائبة = 100%');
});

test('نسبة الحجم من الإعدادات (70% إلى 160%) فوق الحجم النسبي، والمقاسات القديمة بنسبها', () => {
  assert.deepEqual([70, 85, 100, 120, 145, 160].map((p) => fontPx(480, p)), [15, 19, 22, 26, 32, 35]);
  assert.equal(fontPx(1080, 160), 79, 'ملء شاشة 1080 عند 160%');
  assert.equal(scaleOf({ scale: 160 }), 160);
  assert.equal(scaleOf({ scale: 400 }), 160, 'مقصورة على الحد الأعلى');
  assert.equal(scaleOf({ scale: 10 }), 70, 'وعلى الأدنى');
  assert.deepEqual(['s', 'm', 'l', 'xl'].map((size) => scaleOf({ size })), [85, 100, 120, 145], 'القيم القديمة (قبل W4) بنسبها');
  assert.equal(scaleOf({}), 100);
  assert.equal(scaleOf(null), 100);
  assert.equal(layoutFor({ appearance: { size: 'xl', position: 'bottom' }, playerHeight: 480, chromeLift: 0 }).fontPx, 32, 'مقاس قديم وصل كما هو');
  assert.equal(layoutFor({ appearance: { ...DEFAULT_SETTINGS.appearance, scale: 160 }, playerHeight: 720, chromeLift: 0 }).fontPx, 53);
});

test('الموضع: أسفل 8% ومرتفع 20% وأعلى 8% من الأعلى', () => {
  const ap = (position, scale = 100) => ({ scale, position });
  assert.deepEqual(layoutFor({ appearance: ap('bottom'), playerHeight: 400, chromeLift: 0 }), { fontPx: 18, anchor: 'bottom', offsetPx: 32 });
  assert.deepEqual(layoutFor({ appearance: ap('raised'), playerHeight: 400, chromeLift: 0 }), { fontPx: 18, anchor: 'bottom', offsetPx: 80 });
  assert.deepEqual(layoutFor({ appearance: ap('top'), playerHeight: 400, chromeLift: 0 }), { fontPx: 18, anchor: 'top', offsetPx: 32 });
});

test('ظهور شريط التحكم يرفع الطبقة السفلية فوقه بمسافة أمان، واختفاؤه ينزلها', () => {
  const ap = { scale: 100, position: 'bottom' };
  const shown = layoutFor({ appearance: ap, playerHeight: 360, chromeLift: 54 });
  const hidden = layoutFor({ appearance: ap, playerHeight: 360, chromeLift: 0 });
  assert.equal(shown.offsetPx, 62, '54 + 8');
  assert.equal(hidden.offsetPx, 29, '8% من 360');
  assert.ok(shown.offsetPx > hidden.offsetPx);
  // المرتفع أعلى أصلًا من الشريط فلا يتحرك إلا إن تجاوزه الشريط.
  assert.equal(layoutFor({ appearance: { scale: 100, position: 'raised' }, playerHeight: 600, chromeLift: 54 }).offsetPx, 120);
  assert.equal(layoutFor({ appearance: { scale: 100, position: 'raised' }, playerHeight: 200, chromeLift: 54 }).offsetPx, 62);
  // «أعلى» لا ترفعها شيء من الأسفل.
  assert.equal(layoutFor({ appearance: { scale: 100, position: 'top' }, playerHeight: 360, chromeLift: 54 }).offsetPx, 29);
});

const AR = makeCues(3, { text: (i) => `سطر ${i}` });
const EN = makeCues(3, { text: (i) => `line ${i}` });
const A = 'AAAAAAAAAAA';
const B = 'BBBBBBBBBBB';
const baseState = (over = {}) => ({
  videoId: A, loading: false, arabic: { cues: AR }, english: { cues: EN },
  view: { displayOffsetMs: 500, displayMode: 'ar' }, settings: DEFAULT_SETTINGS, ...over,
});
const page = (over = {}) => ({ videoId: A, navigating: false, ad: false, ...over });

test('القرار: العربية وحدها، والإزاحة والمظهر من الحالة', () => {
  const d = decide(baseState(), page());
  assert.deepEqual([d.engaged, d.visible, d.hideNative], [true, true, true]);
  assert.equal(d.ar, AR);
  assert.equal(d.en, null);
  assert.equal(d.offsetMs, 500);
  assert.equal(d.appearance, DEFAULT_SETTINGS.appearance);
});

test('القرار: الوضع المزدوج يضيف الإنجليزية إن وُجدت، وإلا العربية وحدها', () => {
  const dual = baseState({ view: { displayOffsetMs: 0, displayMode: 'dual' } });
  assert.equal(decide(dual, page()).en, EN);
  assert.equal(decide({ ...dual, english: null }, page()).en, null);
});

test('القرار: لا عرض إن لم يطابق معرّف الحالة معرّف الصفحة الفعلي (لا خلط بين الفيديوهات)', () => {
  const d = decide(baseState(), page({ videoId: B }));
  assert.deepEqual([d.engaged, d.visible, d.hideNative, d.ar, d.en], [false, false, false, null, null]);
  assert.equal(decide(baseState({ videoId: null }), page({ videoId: null })).engaged, false);
});

test('القرار: التنقل الجاري والتحميل يمنعان العرض فورًا', () => {
  assert.equal(decide(baseState(), page({ navigating: true })).visible, false);
  assert.equal(decide(baseState({ loading: true }), page()).visible, false);
});

test('القرار: الإعلان يخفي العرض ويبقي الإخفاء المقدَّم، ثم يعود بعده', () => {
  const during = decide(baseState(), page({ ad: true }));
  assert.deepEqual([during.visible, during.ar, during.en], [false, null, null]);
  assert.equal(decide(baseState(), page({ ad: false })).visible, true);
});

test('القرار: بلا ترجمة عربية أو بوضع الإيقاف تبقى ترجمة يوتيوب الأصلية ظاهرة', () => {
  const none = decide(baseState({ arabic: null }), page());
  assert.deepEqual([none.engaged, none.hideNative], [false, false], 'لا نخفي الأصلية إن لم يكن عندنا بديل');
  const off = decide(baseState({ view: { displayOffsetMs: 0, displayMode: 'off' } }), page());
  assert.deepEqual([off.engaged, off.hideNative, off.visible], [false, false, false]);
});
