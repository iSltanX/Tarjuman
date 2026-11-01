// محرّك المزامنة: الحلقة أثناء التشغيل وحده، والتحديث الفوري عند القفز والسرعة والإيقاف، والإزاحة تغيّر
// وقت البحث فقط (لا كتابة في currentTime)، والسرعات 0.75× و1.5× و2× دون تأخر، وكلفة الإطار لملف كبير.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { createSyncEngine } from '../../../../src/player/sync/engine.js';
import { FakeVideo, fakeRaf } from './fakes.js';

const cue = (n, startMs, endMs) => ({ n, startMs, endMs, text: `c${n}` });
const makeCues = (count, { durMs = 2000, gapMs = 500 } = {}) =>
  Array.from({ length: count }, (_, i) => cue(i + 1, 1000 + i * (durMs + gapMs), 1000 + i * (durMs + gapMs) + durMs));

function setup({ cues = makeCues(10), en = null, offsetMs = 0, video = new FakeVideo() } = {}) {
  const raf = fakeRaf();
  const frames = [];
  const engine = createSyncEngine({ win: raf, onFrame: (f) => frames.push(f) });
  engine.setVideo(video);
  engine.setSource({ ar: cues, en, offsetMs });
  const last = () => frames.at(-1);
  return { raf, frames, engine, video, cues, last };
}

test('الحلقة لا تعمل وهو متوقف، وتبدأ مع التشغيل وتتوقف مع الإيقاف', () => {
  const { raf, engine, video } = setup();
  assert.equal(raf.pending(), 0, 'لا إطارات وهو متوقف');
  video.play();
  assert.equal(raf.pending(), 1);
  assert.equal(engine.stats().running, true);
  raf.step();
  assert.equal(raf.pending(), 1, 'تستمر ما دام التشغيل');
  video.pause();
  assert.equal(raf.pending(), 0, 'الإيقاف يلغي الإطار المجدول');
  assert.equal(engine.stats().running, false);
});

test('لا بلاغ إلا عند تغيّر المقطع الظاهر، فلا عمل DOM في الإطارات المتشابهة', () => {
  const { raf, frames, video, engine } = setup();
  const base = frames.length;
  video.play();
  video.seekTo(1.2);
  const afterSeek = frames.length;
  assert.equal(afterSeek, base + 1);
  for (let i = 0; i < 20; i++) {
    video.seekTo(1.2 + i * 0.01, { fire: false }); // الزمن يتقدم داخل المقطع نفسه
    raf.step();
  }
  assert.equal(frames.length, afterSeek, 'المقطع نفسه');
  video.seekTo(3.6, { fire: false });
  raf.step();
  assert.equal(frames.length, afterSeek + 1);
  assert.equal(frames.at(-1).ar.n, 2);
  assert.ok(engine.stats().lookups < 10, 'البحث عند حدود المقاطع وحدها');
});

test('القفز يحدّث فورًا ولو متوقفًا، ولا يحتاج إطارًا', () => {
  const { last, video, raf } = setup();
  video.seekTo(5.0);
  assert.equal(last().ar.n, 2, 'المقطع الثاني 3.5–5.5');
  video.seekTo(5.5);
  assert.equal(last().ar, null, 'النهاية غير شاملة');
  video.seekTo(0.5);
  assert.equal(last().ar, null, 'القفز للخلف قبل أول مقطع');
  assert.equal(raf.pending(), 0);
});

test('الإزاحة: + تأخير و− تقديم، وتغيّر وقت البحث وحده دون كتابة في currentTime', () => {
  const { last, video, engine, cues } = setup({ offsetMs: 500 });
  video.seekTo(1.2);
  assert.equal(last().ar, null, 'المقطع المحفوظ عند 1.0 يظهر عند 1.5 مع +0.5');
  video.seekTo(1.5);
  assert.equal(last().ar.n, 1);
  video.seekTo(0.2);
  engine.setSource({ ar: cues, offsetMs: -1000 });
  assert.equal(last().ar.n, 1, 'مع −1.0 يظهر المقطع قبل ثانية من زمنه المحفوظ');
  assert.equal(video.currentTime, 0.2, 'زمن الفيديو كما هو');
  assert.equal(video.writes, 0, 'لا محاولة كتابة في currentTime');
});

test('تغيير الإزاحة يُحدّث الظاهر فورًا بلا انتظار إطار', () => {
  const { last, video, engine, cues, raf } = setup();
  video.seekTo(1.2);
  assert.equal(last().ar.n, 1);
  engine.setSource({ ar: cues, offsetMs: 1000 });
  assert.equal(last().ar, null, 'صار وقت البحث 0.2 ث');
  engine.setSource({ ar: cues, offsetMs: 0 });
  assert.equal(last().ar.n, 1);
  assert.equal(raf.pending(), 0);
});

for (const rate of [0.75, 1, 1.5, 2]) {
  test(`السرعة ${rate}×: كل إطار يعرض المقطع الصحيح لزمنه بلا تأخر`, () => {
    const cues = makeCues(30, { durMs: 800, gapMs: 200 });
    const { raf, frames, video, engine } = setup({ cues });
    video.setRate(rate);
    video.seekTo(0);
    video.play();
    let expected = null;
    const at = (ms) => cues.find((c) => c.startMs <= ms && ms < c.endMs) ?? null;
    for (let f = 0; f < 60 * 25; f++) {
      video.seekTo(f * (1 / 60) * rate, { fire: false });
      raf.step();
      expected = at(Math.round(video.currentTime * 1000));
      const shown = frames.at(-1).ar;
      assert.equal(shown, expected, `إطار ${f} عند ${video.currentTime.toFixed(3)} ث`);
    }
    assert.ok(engine.stats().frames >= 60 * 25, 'الحلقة لم تتوقف');
  });
}

test('تغيّر السرعة يحدّث فورًا ويحافظ على الحلقة أثناء التشغيل', () => {
  const { video, raf, engine } = setup();
  video.play();
  video.setRate(2);
  assert.equal(raf.pending(), 1);
  assert.equal(engine.stats().loopStarts, 1, 'لا حلقة ثانية');
});

test('الوضع المزدوج: العربية والإنجليزية بنافذتين مستقلتين وإزاحة واحدة', () => {
  const ar = makeCues(3);
  const en = [cue(1, 1500, 2500), cue(2, 4000, 5000)];
  const { last, video } = setup({ cues: ar, en, offsetMs: 0 });
  video.seekTo(2.0);
  assert.equal(last().ar.n, 1);
  assert.equal(last().en.n, 1);
  video.seekTo(3.2);
  assert.equal(last().ar, null);
  assert.equal(last().en, null);
  video.seekTo(4.2);
  assert.equal(last().ar.n, 2);
  assert.equal(last().en.n, 2);
});

test('بلا مقاطع لا حلقة ولا بلاغ بعد التفريغ', () => {
  const { engine, video, raf, last } = setup();
  video.play();
  engine.setSource({ ar: null, en: null });
  assert.equal(raf.pending(), 0);
  assert.equal(last().ar, null);
  const n = engine.stats().emits;
  video.seekTo(2);
  assert.equal(engine.stats().emits, n, 'لا مقاطع فلا بلاغ');
});

test('تبديل عنصر الفيديو يفك الربط القديم ويحسب من الجديد', () => {
  const a = new FakeVideo({ currentTime: 1.2 });
  const b = new FakeVideo({ currentTime: 4.0 });
  const { engine, last, raf } = setup({ video: a });
  assert.equal(last().ar.n, 1);
  assert.ok(a.listenerCount() > 0);
  engine.setVideo(b);
  assert.equal(a.listenerCount(), 0, 'فُكّ ربط القديم');
  assert.equal(last().ar.n, 2);
  a.play();
  assert.equal(raf.pending(), 0, 'القديم لا يحرّك الحلقة');
  engine.setVideo(null);
  assert.equal(last().ar, null);
});

test('NaN في currentTime قبل التحميل لا يكسر ولا يكرر البحث', () => {
  const video = new FakeVideo({ currentTime: NaN });
  const { engine, last } = setup({ video });
  assert.equal(last().ar, null);
  const lookups = engine.stats().lookups;
  video.seekTo(NaN);
  assert.ok(engine.stats().lookups - lookups <= 1);
});

test('الفيديو المنتهي لا يشغّل الحلقة', () => {
  const { video, raf } = setup();
  video.ended = true;
  video.paused = false;
  video.dispatchEvent(new Event('play'));
  assert.equal(raf.pending(), 0);
});

test('destroy يوقف كل شيء ويفك الربط', () => {
  const { engine, video, raf } = setup();
  video.play();
  engine.destroy();
  assert.equal(raf.pending(), 0);
  assert.equal(video.listenerCount(), 0);
  const emits = engine.stats().emits;
  video.seekTo(2);
  assert.equal(engine.stats().emits, emits, 'بعد التدمير لا بلاغ');
});

test('الأداء (P5-AC7): ملف 20,000 مقطع وفيديو ساعتان، 60 إطارًا في الثانية، كلفة الإطار ميكروثواني', () => {
  const cues = makeCues(20000, { durMs: 300, gapMs: 50 }); // يمتد نحو ساعتين
  const en = makeCues(20000, { durMs: 300, gapMs: 50 });
  const video = new FakeVideo({ currentTime: 0, paused: false });
  const raf = fakeRaf();
  let emits = 0;
  const engine = createSyncEngine({ win: raf, onFrame: () => emits++ });
  engine.setVideo(video);
  engine.setSource({ ar: cues, en, offsetMs: 300 });
  const TWO_HOURS = 2 * 3600;
  const frameDt = 1 / 60;
  // القياس بدفعات من 1000 إطار: جدولة النظام قد تُوقف عملية الاختبار لحظات تحت اختبارات متوازية، فالمحك هو
  // أسوأ دفعة (متوسط كلفة الإطار فيها) لا إطار منفرد. ميزانية الإطار 16.7ms؛ والمطلوب ميكروثواني.
  const CHUNK = 1000;
  let worstChunkUs = 0;
  let inChunk = 0;
  let c0 = performance.now();
  const t0 = c0;
  for (let sec = 0; sec < TWO_HOURS; sec += frameDt) {
    video.seekTo(sec, { fire: false });
    raf.step();
    if (++inChunk === CHUNK) {
      const now = performance.now();
      worstChunkUs = Math.max(worstChunkUs, ((now - c0) / CHUNK) * 1000);
      c0 = now;
      inChunk = 0;
    }
  }
  const total = performance.now() - t0;
  const frames = Math.round(TWO_HOURS / frameDt);
  const avgUs = (total / frames) * 1000;
  assert.ok(emits > 10000, 'مرّت المقاطع كلها');
  assert.ok(avgUs < 50, `متوسط كلفة الإطار ${avgUs.toFixed(2)}µs (الميزانية 50µs؛ ميزانية الإطار 16,700µs)`);
  assert.ok(worstChunkUs < 500, `أسوأ دفعة ${worstChunkUs.toFixed(2)}µs للإطار (الميزانية 500µs)`);
  assert.ok(engine.stats().lookups < frames / 4, 'البحث عند الحدود وحدها');
});
