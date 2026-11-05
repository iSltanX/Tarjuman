// L-29: كم بايتًا يُكتب في التخزين عند كل «آخر موضع» (سكون 4 ث على مقطع)؟ ملف بـ2000 مقطع معدَّل.
import { mounted, log, makeCues, sampleBundle, createMemoryArea } from './harness.mjs';

const N = Number(process.argv[2] ?? 2000);
const bundle = sampleBundle();
const original = makeCues(N, { text: (i) => `هذا نص عربي تجريبي للمقطع رقم ${i} بطول معتاد` });
const t = bundle.slots[0].track;
t.original = original;
t.current = original.map((c) => ({ ...c, text: `${c.text} (معدّل)` }));
t.fingerprintId = null;
t.comparison = null;
bundle.slots[0].marks = [];
bundle.slots[0].position = null;
bundle.record.arabic = structuredClone(t);
const area = createMemoryArea({ unlimited: true });
const writes = [];
const set = area.set.bind(area);
area.set = async (items) => { writes.push(Object.entries(items).map(([k, v]) => [k, JSON.stringify(v).length])); return set(items); };
const { env, field } = await mounted({ bundle, area });
writes.length = 0;
for (const i of [3, 5, 7]) {
  const ta = field(i, 'text');
  ta.focus();
  ta.dispatchEvent({ type: 'focusin' });
  await env.flush(4);
}
writes.forEach((w, k) => log(`كتابة ${k + 1}:`, w.map(([key, n]) => `${key}=${(n / 1024).toFixed(1)}KB`).join(' + '), `= ${(w.reduce((s, [, n]) => s + n, 0) / 1024).toFixed(1)}KB`));
log('عدد الكتابات لثلاثة مقاطع بسكون 4 ث:', writes.length);
