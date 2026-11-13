// نص الأصل المحاذي لمقطع ترجمة بالتداخل الزمني. نُقل من لوحة المشغّل (src/player/panel/model.js) في الفكرة ١١، فتستعمله لوحة
// النص المتزامن وتصدير «مع الأصل» (src/core/export/bilingual.js) وحارس الاستيراد (src/core/import/bilingual.js) بتعريف واحد،
// فيحمل الملف المصدَّر تحت كل مقطع ما يراه المستخدم تحته في اللوحة. منطق نقي بلا DOM، والنواة لا تستورد من المشغّل.

/** @typedef {import('../model/cue.js').Cue} Cue */

/** @param {string} text مقطع بأسطر متعددة ← سطر واحد متصل (للوحة النص وسطر الأصل في الملف الثنائي). */
export const flatText = (text) => String(text ?? '').replace(/\s*\n\s*/g, ' ').trim();

/**
 * نص الأصل المتداخل زمنًا مع مدى مقطع عربي (يتداخلان إن بدأ أحدهما قبل نهاية الآخر وانتهى بعد بدايته)، مضمومًا بمسافة بترتيب
 * الزمن. البحث الثنائي على بدايات مرتبة وأكبر نهاية متراكمة (كالفهرس)، فالمجموع حتى آلاف المقاطع خفيف. التداخل في زمن
 * الملف المحفوظ: الإزاحة تنقل العربي والأصل معًا في الطبقة، فلا تغيّره.
 * @param {Cue[]} enCues
 * @returns {(startMs: number, endMs: number) => string}
 */
export function originalLookup(enCues) {
  const n = enCues.length;
  let list = enCues;
  for (let i = 1; i < n; i++) {
    if (enCues[i].startMs < enCues[i - 1].startMs) {
      list = enCues.map((c, k) => [c, k]).sort((a, b) => a[0].startMs - b[0].startMs || a[1] - b[1]).map((x) => x[0]);
      break;
    }
  }
  const starts = new Float64Array(n);
  const maxEnd = new Float64Array(n);
  let m = -Infinity;
  for (let i = 0; i < n; i++) {
    starts[i] = list[i].startMs;
    m = Math.max(m, list[i].endMs);
    maxEnd[i] = m;
  }
  return (startMs, endMs) => {
    let lo = 0;
    let hi = n;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (starts[mid] < endMs) lo = mid + 1;
      else hi = mid;
    }
    const out = [];
    for (let k = lo - 1; k >= 0 && maxEnd[k] > startMs; k--) {
      if (list[k].endMs > startMs) {
        const t = flatText(list[k].text);
        if (t) out.push(t);
      }
    }
    return out.reverse().join(' ');
  };
}
