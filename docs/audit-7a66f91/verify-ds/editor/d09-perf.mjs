// TJ-16 (DeepSeek ED-008): كلفة كل ضغطة في المحرّر مع آلاف المقاطع، وحصة فحص الكثافة منها. Node فقط (قرينة لا قياس متصفح).
import { ROOT, log, mounted, sampleBundle, englishTrack, fingerprint } from './harness.mjs';

const { findIssues } = await import(`${ROOT}/src/core/edit/issues.js`);
const { READING_DEFAULTS } = await import(`${ROOT}/src/core/edit/density.js`);
const words = ['الذكاء', 'الاصطناعي', 'نموذج', 'اللغة', 'يتعلّم', 'من', 'البيانات', 'كَتَبَ', 'الطالبُ', 'درسه', 'في', 'المكتبة'];
const text = (i) => {
  const w = Array.from({ length: 6 + (i % 7) }, (_, k) => words[(i * 7 + k * 3) % words.length]);
  const half = Math.ceil(w.length / 2);
  return `${w.slice(0, half).join(' ')}\n${w.slice(half).join(' ')}`;
};
const makeCues = (N) => Array.from({ length: N }, (_, i) => ({ n: i + 1, startMs: 1000 + i * 2600, endMs: 3400 + i * 2600, text: text(i) }));
const med = (a) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)];
const time = (fn, reps = 15) => {
  fn();
  const out = [];
  for (let k = 0; k < reps; k++) {
    const t0 = performance.now();
    fn();
    out.push(performance.now() - t0);
  }
  return med(out).toFixed(1);
};

for (const N of [2400, 5000, 10000]) {
  const cues = makeCues(N);
  log(`${N} مقطع: findIssues بالكثافة ${time(() => findIssues(cues, { density: READING_DEFAULTS }))}ms، وبلا كثافة ${time(() => findIssues(cues, {}))}ms`);
}

// المحرّر مركّبًا: معالج input المتزامن لكل ضغطة (setText ← onSessionChange ← issues() كاملة).
for (const N of [2400, 10000]) {
  const cues = makeCues(N);
  const b = sampleBundle();
  const track = englishTrack({ cues: cues.map((c) => ({ ...c, text: `line ${c.n}` })) });
  const fp = fingerprint({ track, id: 'fp_test000001' });
  b.record.english = [track];
  b.record.fingerprints = [fp];
  const t1 = b.slots[0].track;
  t1.original = cues;
  t1.current = null;
  t1.editedAt = null;
  t1.comparison = null;
  b.slots[0].marks = [];
  b.slots[0].position = null;
  b.slots[1].track.fingerprintId = null;
  b.slots[1].track.comparison = null;
  b.previous = null;
  b.record.arabic = structuredClone(t1);
  const m = await mounted({ bundle: b });
  const ta = m.field(3, 'text');
  ta.focus();
  const sync = [];
  for (let k = 0; k < 12; k++) {
    ta.value = `${ta.value}ا`;
    const t0 = performance.now();
    ta.dispatchEvent({ type: 'input' });
    sync.push(performance.now() - t0);
    await m.env.flush(1);
  }
  log(`[مركّب] ${m.editor.state.session.count} مقطع: معالج input المتزامن وسيط ${med(sync).toFixed(1)}ms (density من التفضيلات: ${JSON.stringify(m.editor.state.prefs?.review ?? null)})`);
}
