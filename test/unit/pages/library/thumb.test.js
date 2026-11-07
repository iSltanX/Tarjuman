// صورة الفيديو ومدتها (docs/identity-redesign.md §٥، قرار سلطان 2026-11-03): العنوان من المعرّف المُتحقَّق منه وحده، والصورة
// بالسمات المعتمدة (lazy وasync وno-referrer وalt فارغ)، وبلاطة الأيقونة عند الإطفاء أو الخطأ أو الصورة الرمادية البديلة
// (عرض ≤ 120)، والمدة من عدد موجب وحده؛ وتبديل الصورة بتفضيل «صور الفيديو» لا يعيد بناء ما لم يتغيّر.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PLACEHOLDER_MAX_WIDTH, THUMB_BASE, THUMB_FILE, formatDuration, thumbUrl, thumbnail } from '../../../../src/pages/library/thumb.js';
import { findAll, newDocument, textOf } from './fake-dom.js';

const ID = 'dQw4w9WgXcQ';
const imgOf = (t) => t.root.querySelector('img');
const durOf = (t) => t.root.querySelector('.lib-thumb__dur');
const make = (o = {}) => thumbnail({ doc: newDocument(), videoId: ID, enabled: true, ...o });
/** يحاكي load بعرض طبيعي. */
const loaded = (img, naturalWidth) => {
  img.naturalWidth = naturalWidth;
  img.dispatchEvent({ type: 'load' });
};

test('العنوان من معرّف الفيديو المُتحقَّق منه وحده: البادئة المسمّاة ثم المعرّف ثم mqdefault.jpg', () => {
  assert.equal(THUMB_BASE, 'https://i.ytimg.com/vi/');
  assert.equal(THUMB_FILE, 'mqdefault.jpg');
  assert.equal(thumbUrl(ID), `https://i.ytimg.com/vi/${ID}/mqdefault.jpg`);
  assert.equal(thumbUrl('AAAAAAAAAAA'), 'https://i.ytimg.com/vi/AAAAAAAAAAA/mqdefault.jpg');
  assert.equal(thumbUrl('a-_1B2c3D4e'), 'https://i.ytimg.com/vi/a-_1B2c3D4e/mqdefault.jpg');
  // غير الصالح لا ينتج عنوانًا (فلا يدخل نص مخزَّن غير موثوق في عنوان خارجي).
  for (const bad of ['', 'short', 'toolongvideoid1', '../../etc/x', 'dQw4w9WgXc/', 'dQw4w9WgX"Q', 'dQw4w9 WgXc', 'dQw4w9WgXc\n', 'dQw4w9WgXcQ?x=1', null, undefined, 42, {}, ['dQw4w9WgXcQ']]) {
    assert.equal(thumbUrl(bad), null, JSON.stringify(bad));
  }
});

test('مفعّلة: عنصر img واحد بالسمات المعتمدة وعنوانه المبني من المعرّف، بلا شيء آخر', () => {
  const t = make();
  const img = imgOf(t);
  assert.ok(img);
  assert.equal(findAll(t.root, (e) => e.tagName === 'img').length, 1);
  assert.equal(img.getAttribute('src'), `https://i.ytimg.com/vi/${ID}/mqdefault.jpg`);
  assert.equal(img.getAttribute('alt'), '', 'زخرفية: العنوان في الصف يسمّي الفيديو');
  assert.equal(img.getAttribute('loading'), 'lazy');
  assert.equal(img.getAttribute('decoding'), 'async');
  assert.equal(img.getAttribute('referrerpolicy'), 'no-referrer');
  assert.equal(t.root.getAttribute('data-state'), 'image');
  assert.equal(t.state(), 'image');
  assert.equal(t.root.querySelector('.lib-thumb__fallback'), null);
  // لا رابط آخر في أي سمة.
  const urls = findAll(t.root, () => true).flatMap((e) => [...e._attrs.values()]).filter((v) => /^https?:/.test(v));
  assert.deepEqual(urls, [`https://i.ytimg.com/vi/${ID}/mqdefault.jpg`]);
});

test('مُطفأة (prefs.ui.thumbnails = false): بلاطة بأيقونة التشغيل ولا img ولا أي عنوان صورة', () => {
  const t = make({ enabled: false });
  assert.equal(imgOf(t), null);
  assert.equal(t.state(), 'fallback');
  assert.equal(t.root.getAttribute('data-state'), 'fallback');
  const tile = t.root.querySelector('.lib-thumb__fallback');
  assert.ok(tile);
  const svg = tile.children[0];
  assert.equal(svg.tagName, 'svg');
  assert.equal(svg.getAttribute('aria-hidden'), 'true', 'الأيقونة زخرفية');
  assert.deepEqual([...svg.children].map((c) => c.tagName), ['path'], 'أيقونة التشغيل (لوحة 13) لا لقطة');
  const everything = findAll(t.root, () => true).flatMap((e) => [...e._attrs.values(), e.textContent]).join('|');
  assert.equal(/ytimg|\.jpg|https?:/.test(everything), false, 'لا طلب ولا عنوان حين تُطفأ');
});

test('معرّف غير صالح مع التفعيل: بلاطة لا img (لا عنوان يُبنى)', () => {
  const t = thumbnail({ doc: newDocument(), videoId: 'x/../y', enabled: true });
  assert.equal(imgOf(t), null);
  assert.equal(t.state(), 'fallback');
});

test('الخطأ: تتحول الصورة إلى البلاطة ولا تعود من تلقاء نفسها، ويعيد تبديل التفضيل المحاولة', () => {
  const t = make();
  imgOf(t).dispatchEvent({ type: 'error' });
  assert.equal(imgOf(t), null);
  assert.equal(t.state(), 'fallback');
  assert.ok(t.root.querySelector('.lib-thumb__fallback'));
  t.setEnabled(true); // لا تغيير في التفضيل: لا إعادة محاولة تلقائية
  assert.equal(imgOf(t), null);
  t.setEnabled(false);
  t.setEnabled(true);
  assert.ok(imgOf(t), 'إعادة التفعيل تعيد المحاولة');
  assert.equal(t.state(), 'image');
});

test('الصورة الرمادية البديلة (404 بعرض 120) لا تُعرض أبدًا: load بعرض ≤ 120 أو 0 بلاطة، وmqdefault الحقيقية (320) تبقى', () => {
  assert.equal(PLACEHOLDER_MAX_WIDTH, 120);
  for (const width of [120, 90, 1, 0, undefined]) {
    const t = make();
    loaded(imgOf(t), width);
    assert.equal(imgOf(t), null, `عرض ${width}: صورة غائبة`);
    assert.equal(t.state(), 'fallback');
    assert.ok(t.root.querySelector('.lib-thumb__fallback'));
  }
  for (const width of [121, 320, 480]) {
    const t = make();
    loaded(imgOf(t), width);
    assert.ok(imgOf(t), `عرض ${width}: صورة حقيقية`);
    assert.equal(t.state(), 'image');
  }
});

test('حدث متأخر من صورة استُبدلت لا يغيّر الحال الحالية', () => {
  const t = make();
  const old = imgOf(t);
  t.setEnabled(false);
  old.dispatchEvent({ type: 'error' }); // وصل بعد الإطفاء
  t.setEnabled(true);
  assert.ok(imgOf(t), 'الخطأ القديم لم يُفشل المحاولة الجديدة');
  assert.ok(imgOf(t) !== old);
  const fresh = imgOf(t);
  old.dispatchEvent({ type: 'error' });
  assert.ok(imgOf(t) === fresh, 'ولا في الحال الحالية');
});

test('تبديل التفضيل: الإطفاء بلاطة والتفعيل صورة، ومثله لا يعيد بناء شيء', () => {
  const t = make();
  const first = imgOf(t);
  t.setEnabled(true);
  assert.ok(imgOf(t) === first, 'الحال نفسها: العقدة نفسها');
  t.setEnabled(false);
  assert.equal(imgOf(t), null);
  t.setEnabled(true);
  assert.ok(imgOf(t));
});

test('المدة من عدد موجب وحده: لا شيء إن جُهلت أو صفر أو سالبة أو ليست عددًا (لا تُخمَّن)', () => {
  for (const bad of [null, undefined, 0, -1000, NaN, Infinity, '60000', {}]) {
    const t = make({ durationMs: bad });
    assert.equal(durOf(t), null, String(bad));
  }
  const t = make({ durationMs: 52 * 60000 + 18000 });
  assert.equal(textOf(durOf(t).querySelector('bdi')), '52:18');
  assert.equal(durOf(t).querySelector('bdi').dir, 'ltr', 'LTR معزول داخل الصفحة العربية');
  assert.equal(textOf(durOf(t).querySelector('.tj-sr-only')), 'المدة', 'ولقارئ الشاشة «المدة»');
  assert.equal(textOf(durOf(make({ durationMs: 3600000 + 12 * 60000 + 40000 }))), 'المدة 1:12:40');
  // على بلاطة الإطفاء أيضًا (المدة بيانات محلية لا صورة).
  assert.equal(textOf(durOf(make({ enabled: false, durationMs: 19 * 60000 + 47000 })).querySelector('bdi')), '19:47');
});

test('setDuration: يضيف المدة ويبدّلها ويزيلها دون إعادة بناء الصورة (فلا تُعاد قراءتها ولا تومض)', () => {
  const t = make();
  const img = imgOf(t);
  assert.equal(durOf(t), null);
  t.setDuration(60000);
  assert.equal(textOf(durOf(t).querySelector('bdi')), '1:00');
  assert.ok(imgOf(t) === img, 'الصورة نفسها');
  t.setDuration(125000);
  assert.equal(textOf(durOf(t).querySelector('bdi')), '2:05');
  assert.equal(t.root.querySelectorAll('.lib-thumb__dur').length, 1, 'شارة واحدة');
  t.setDuration(null);
  assert.equal(durOf(t), null);
  assert.ok(imgOf(t) === img);
  // الإطفاء يحفظ المدة المعروفة.
  t.setDuration(60000);
  t.setEnabled(false);
  assert.equal(textOf(durOf(t).querySelector('bdi')), '1:00');
});

test('formatDuration: «52:18» و«1:12:40» و«9:05» من عدد موجب وحده، وغيره لا شيء (لا تُخمَّن مدة)', () => {
  assert.equal(formatDuration(52 * 60000 + 18000), '52:18');
  assert.equal(formatDuration(3600000 + 12 * 60000 + 40000), '1:12:40');
  assert.equal(formatDuration(9 * 60000 + 5000), '9:05');
  assert.equal(formatDuration(59999), '0:59');
  assert.equal(formatDuration(500), '0:01');
  for (const bad of [0, -5, null, undefined, NaN, Infinity, '60000', {}]) assert.equal(formatDuration(bad), null, String(bad));
});
