// تدقيق Fable (FA-22، UX-25): في تخطيط مشاهدة يجرّبه يوتيوب لبعض ملفات التعريف الجديدة (رُصد في Edge بشريط
// Description/Comments يمين الفيديو) وقع العمود الثانوي فوق جزء من الفيديو بعرض 320، فوُضعت اللوحة فيه وغطّت أدوات المشغّل
// اليمنى («place: below» لأن الهندسة تداخل). الإصلاح بالهندسة لا بمحددات تخطيط لم يُرَ: عمود فوق المشغّل يُعامل كالعمود الواحد،
// فاللوحة في #below بعد بيانات الفيديو، والقرار ثابت لمفتاح التخطيط حتى يتغير، ولا حكم جديد في ملء الشاشة. ولا يُحكم بالتداخل إلا إن
// دام ثانية (OVERLAP_SETTLE_MS) في التخطيط نفسه، فقياس لحظي أثناء انتقال لا ينقل اللوحة (ملاحظة المراجعة المستقلة).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HEALTH_MS } from '../../../../src/player/panel/index.js';
import { OVERLAP_SETTLE_MS, chooseColumn, overlapsPlayer } from '../../../../src/player/panel/column.js';
import { watchPage } from './harness.js';

const rect = (left, top, width, height) => ({ left, top, width, height, right: left + width, bottom: top + height });

/** صفحة مشاهدة بـ#below (بيانات الفيديو في صندوق ثم التعليقات) كما في يوتيوب. */
function pageWithBelow() {
  const page = watchPage();
  const below = page.doc.createElement('div');
  below.id = 'below';
  const meta = page.doc.createElement('div');
  meta.className = 'box';
  meta.appendChild(page.doc.createElement('ytd-watch-metadata'));
  below.append(meta, page.doc.createElement('ytd-comments'));
  page.primary.appendChild(below);
  below.rect = rect(0, 380, 910, 900);
  return { page, below, meta };
}

/** هندسة التخطيط الجديد كما في لقطة Edge: المشغّل 910 والعمود 320 يبدأ عند 785 فوقه. */
const overlapping = (page) => {
  page.player.rect = rect(16, 80, 910, 512);
  page.inner.rect = rect(785, 56, 320, 830);
};

test('FA-22: overlapsPlayer — بجانب المشغّل وتحته لا تداخل، وفوق جزء منه تداخل، وبلا هندسة لا حكم', () => {
  const player = rect(0, 0, 640, 360);
  assert.equal(overlapsPlayer(player, rect(664, 0, 402, 700)), false, 'بجانبه');
  assert.equal(overlapsPlayer(player, rect(0, 380, 640, 700)), false, 'تحته (المسرح)');
  assert.equal(overlapsPlayer(player, rect(642, 0, 402, 700)), false, 'ملاصق بهامش 4');
  assert.equal(overlapsPlayer(player, rect(500, 0, 320, 700)), true, 'فوق جزء منه');
  assert.equal(overlapsPlayer(player, rect(0, 0, 0, 0)), false, 'عمود غير مرسوم');
  assert.equal(overlapsPlayer(null, rect(500, 0, 320, 700)), false, 'مشغّل غير معروف');
});

/** ساعة الاختبار مع مؤقتات النافذة الوهمية: تقدّمهما معًا. */
function clocked(page) {
  let t = 0;
  return { now: () => t, tick: (ms) => { t += ms; page.env.win.advance(ms); } };
}

test('FA-22: عمود ثانوي فوق المشغّل ثانيةً ← اللوحة في #below بعد بيانات الفيديو، لا فوق الفيديو', () => {
  const { page, below, meta } = pageWithBelow();
  overlapping(page);
  const clock = clocked(page);
  page.mount({ now: clock.now });
  assert.ok(page.hostEl(), 'أول رصد للتداخل لا ينقل بعد');
  clock.tick(OVERLAP_SETTLE_MS + HEALTH_MS + 10);
  const host = below.children.find((c) => c.id === 'tarjuman-panel');
  assert.ok(host, 'في #below');
  assert.ok(below.children[0] === meta && below.children[1] === host, 'بعد بيانات الفيديو');
  assert.equal(page.hostEl(), null, 'لا في العمود الثانوي');
  assert.equal(page.handle.peek().place, 'below');
  page.handle.unmount();
});

test('FA-22: تداخل لحظي يزول قبل ثانية (انتقال تخطيط) لا ينقل اللوحة', () => {
  const { page, below } = pageWithBelow();
  overlapping(page);
  const clock = clocked(page);
  page.mount({ now: clock.now });
  clock.tick(300);
  page.setGeometry(true);
  clock.tick(OVERLAP_SETTLE_MS + HEALTH_MS + 10);
  assert.ok(page.hostEl() && page.inner.children[0] === page.hostEl(), 'بقيت أول العمود');
  assert.equal(below.children.some((c) => c.id === 'tarjuman-panel'), false);
  assert.equal(page.handle.peek().place, 'beside');
  page.handle.unmount();
});

test('FA-22: القرار ثابت لمفتاح التخطيط فلا تتأرجح اللوحة، ويُعاد الحكم إذا تغيّر التخطيط', () => {
  const { page, below } = pageWithBelow();
  page.win.innerWidth = 1360;
  overlapping(page);
  const clock = clocked(page);
  page.mount({ now: clock.now });
  clock.tick(OVERLAP_SETTLE_MS + HEALTH_MS + 10);
  const host = below.children.find((c) => c.id === 'tarjuman-panel');
  assert.ok(host);
  // خروج اللوحة غيّر هندسة العمود فلم يعد فوق المشغّل، والتخطيط نفسه: تبقى تحت الفيديو.
  page.inner.rect = rect(950, 56, 320, 830);
  clock.tick(HEALTH_MS + 10);
  assert.ok(host.parentNode === below, 'لا تأرجح في التخطيط نفسه');
  // تغيّر التخطيط (عرض النافذة) والعمود بجانب المشغّل الآن: تعود إلى أول العمود الثانوي بالجلسة نفسها.
  page.win.innerWidth = 1600;
  page.player.rect = rect(0, 0, 640, 360);
  page.inner.rect = rect(664, 0, 402, 700);
  clock.tick(HEALTH_MS + 10);
  assert.ok(page.hostEl() === host && page.inner.children[0] === host, 'عادت أول العمود');
  assert.equal(page.handle.peek().place, 'beside');
  page.handle.unmount();
});

test('FA-22: التخطيط المعتاد (بجانب الفيديو، والمسرح تحته) كما كان، ولو وُجد #below', () => {
  for (const wide of [true, false]) {
    const { page } = pageWithBelow();
    page.setGeometry(wide);
    page.mount();
    assert.ok(page.hostEl() && page.inner.children[0] === page.hostEl(), wide ? 'بجانبه' : 'المسرح');
    assert.equal(page.handle.peek().place, wide ? 'beside' : 'below');
    page.handle.unmount();
  }
});

test('FA-22: ملء الشاشة لا يُنقل فيه المضيف (المشغّل يغطي النافذة)، ولا يُمس قرار التخطيط', () => {
  const memo = { overlapKey: null };
  const { page, below } = pageWithBelow();
  page.setGeometry(true);
  page.doc.fullscreenElement = page.player;
  page.player.rect = rect(0, 0, 1360, 900);
  assert.ok(chooseColumn(page.doc, page.win, memo) === page.inner, 'يبقى في العمود');
  memo.overlapKey = 'earlier';
  assert.ok(chooseColumn(page.doc, page.win, memo) === below, 'ويبقى تحت الفيديو إن كان');
  assert.equal(memo.overlapKey, 'earlier');
});
