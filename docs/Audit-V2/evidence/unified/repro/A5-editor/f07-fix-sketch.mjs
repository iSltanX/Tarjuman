// رسم تحقق (لا يغيّر المنتج): هل يحقق «الدمج في إطار الأساس» معايير القبول في السيناريوهات الثلاثة، مقارنةً بتوصية التقرير
// (طرح committed من mine ثم إضافته إلى الناتج)؟ يستعمل mergeThreeWay وdiffTranslations من المنتج كما هما.
// الاستعمال: command node f07-fix-sketch.mjs <جذر الشيفرة>
const R = process.argv[2];
if (!R) throw new Error('مرّر جذر الشيفرة');
const { diffTranslations, mergeThreeWay } = await import(`${R}/src/core/align/index.js`);
const { createEditSession } = await import(`${R}/src/core/edit/session.js`);
const { makeCues } = await import(`${R}/test/helpers/fixtures.js`);

const shift = (cues, d) => cues.map((c) => ({ ...c, startMs: c.startMs + d, endMs: c.endMs + d }));
const changed = (base, side) => {
  const d = diffTranslations(base, side);
  return d.counts.textChanged + d.counts.timingChanged + d.counts.added + d.counts.removed;
};

/** المقترح: mine إلى إطار الأساس، والإزاحات في إطار الأساس، والناتج في إطار الأساس (التثبيت يُعاد خطوةً مستقلة بعده). */
function baseFrame({ base, mine, theirs, offsets }) {
  const c = offsets.committed ?? 0;
  const mineB = c ? shift(mine, -c) : mine;
  const merged = mergeThreeWay({ base, mine: mineB, theirs });
  const mineEff = offsets.mine + c;
  const mineMoved = mineEff !== offsets.base;
  const theirsMoved = offsets.theirs !== offsets.base;
  const conflict = mineMoved && theirsMoved && mineEff !== offsets.theirs;
  const offsetMs = conflict ? offsets.theirs : mineMoved ? mineEff : offsets.theirs;
  return { cues: merged.cues, conflicts: merged.conflicts.length, offsetMs, counts: { mine: changed(base, mineB), theirs: changed(base, theirs) } };
}
/** توصية التقرير: كالسابق ثم يُضاف committed إلى الناتج ويُطرح من الإزاحة. */
function reportFix(o) {
  const r = baseFrame(o);
  const c = o.offsets.committed ?? 0;
  return { ...r, cues: shift(r.cues, c), offsetMs: r.offsetMs - c };
}

const base = makeCues(12);
const s = createEditSession({ cues: base, offsetMs: 2000 });
s.commitOffset();
s.setText(0, 'مقطع أول معدّل');
const mine = s.snapshot();
const theirsA = structuredClone(base); theirsA[5].startMs += 100; theirsA[5].endMs += 100;
const scenarios = {
  A: { theirs: theirsA, offT: 2000, want: base.map((c, i) => c.startMs + 2000 + (i === 5 ? 100 : 0)) },
  B: { theirs: shift(base, 2000), offT: 0, want: base.map((c) => c.startMs + 2000) },
  C: { theirs: base, offT: 2500, want: base.map((c) => c.startMs + 2500) },
};
const out = {};
for (const [k, sc] of Object.entries(scenarios)) {
  const o = { base, mine, theirs: sc.theirs, offsets: { base: 2000, mine: s.offsetMs, theirs: sc.offT, committed: s.committedMs } };
  const row = {};
  for (const [name, fn] of [['baseFrame', baseFrame], ['reportFix', reportFix]]) {
    const r = fn(o);
    const shown = r.cues.map((c) => c.startMs + r.offsetMs);
    row[name] = { displayOk: shown.every((v, i) => v === sc.want[i]), conflicts: r.conflicts, counts: r.counts, offsetMs: r.offsetMs, storedCue1: r.cues[0].startMs, text1: r.cues[0].text };
  }
  out[k] = row;
}
console.log(JSON.stringify(out, null, 2));
