// فهرس بحث المقاطع بالزمن (P5): بحث ثنائي O(log n) على بدايات مرتبة. يتحمّل الملف غير المرتب أو المتداخل
// (المحرّر وحده يحكم على ترتيب الأزمنة، فلا يُفترض هنا): عند التداخل يظهر المقطع الأحدث بدايةً بين النشطة.
// كل بحث يعيد النافذة [from, to) التي لا يتغير فيها الجواب، فيتخطى المحرّك البحث في الإطارات التي داخلها.

/**
 * @typedef {import('../../core/model/cue.js').Cue} Cue
 * @typedef {{ cue: Cue | null, from: number, to: number }} CueHit
 */

const cache = new WeakMap();

/**
 * @param {Cue[]} cues
 * @returns {{ size: number, find: (ms: number) => CueHit }}
 */
export function createCueIndex(cues) {
  const n = cues.length;
  let ordered = true;
  for (let i = 1; i < n; i++) {
    if (cues[i].startMs < cues[i - 1].startMs) {
      ordered = false;
      break;
    }
  }
  let list = cues;
  if (!ordered) {
    const order = cues.map((_, i) => i).sort((a, b) => cues[a].startMs - cues[b].startMs || a - b);
    list = order.map((i) => cues[i]);
  }
  const starts = new Float64Array(n);
  // أكبر نهاية حتى الفهرس i: إن لم تتجاوز زمن البحث فلا مقطع قبله نشط، فيتوقف المسح الخلفي.
  const maxEnd = new Float64Array(n);
  let m = -Infinity;
  for (let i = 0; i < n; i++) {
    starts[i] = list[i].startMs;
    m = Math.max(m, list[i].endMs);
    maxEnd[i] = m;
  }

  /** @param {number} ms @returns {CueHit} */
  function find(ms) {
    let lo = 0;
    let hi = n;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (starts[mid] <= ms) lo = mid + 1;
      else hi = mid;
    }
    const last = lo - 1; // آخر مقطع بدأ عند ms أو قبله
    const nextStart = last + 1 < n ? starts[last + 1] : Infinity;
    let k = last;
    while (k >= 0 && maxEnd[k] > ms) {
      if (list[k].endMs > ms) {
        return { cue: list[k], from: k === last ? list[k].startMs : ms, to: Math.min(list[k].endMs, nextStart) };
      }
      k--;
    }
    return { cue: null, from: last >= 0 ? maxEnd[last] : -Infinity, to: nextStart };
  }

  return { size: n, find };
}

/**
 * فهرس مخزَّن بمرجع مصفوفة المقاطع: المتحكم يثبّت المرجع ما لم يتغير مصدره، فلا يُعاد البناء عند كل حفظ.
 * @param {Cue[]} cues
 */
export function indexFor(cues) {
  let hit = cache.get(cues);
  if (!hit) {
    hit = createCueIndex(cues);
    cache.set(cues, hit);
  }
  return hit;
}
