// التقسيم الاحتياطي (R11): لا يعمل إلا بطلب صريح، بترقيم مستمر يغطي 1..count دون فجوة ولا تداخل.
// size هو الحد الأقصى للجزء؛ والتوزيع متوازن فلا يبقى جزء أخير ضئيل (401 مقطعًا بحد 200 ← 134 و134 و133).

/**
 * @param {number} count عدد المقاطع
 * @param {number} size أقصى مقاطع في الجزء
 * @returns {{ index: number, from: number, to: number }[] | null} null إن لم يلزم تقسيم (count ≤ size)
 */
export function planParts(count, size) {
  if (!Number.isInteger(count) || count < 1) throw new RangeError(`عدد مقاطع غير صالح: ${count}`);
  if (!Number.isInteger(size) || size < 1) throw new RangeError(`حجم جزء غير صالح: ${size}`);
  if (count <= size) return null;
  const total = Math.ceil(count / size);
  const base = Math.floor(count / total);
  const extra = count % total;
  const parts = [];
  let from = 1;
  for (let index = 1; index <= total; index++) {
    const len = base + (index <= extra ? 1 : 0);
    parts.push({ index, from, to: from + len - 1 });
    from += len;
  }
  return parts;
}
