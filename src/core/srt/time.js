// أزمنة SRT بصيغة HH:MM:SS,mmm بأرقام لاتينية. الساعات رقمان على الأقل.

const TIME_RE = /^(\d{2,}):([0-5]\d):([0-5]\d),(\d{3})$/;

/**
 * @param {number} ms زمن بالملي ثانية، عدد صحيح غير سالب.
 * @returns {string}
 */
export function formatSrtTime(ms) {
  if (!Number.isInteger(ms) || ms < 0) throw new RangeError(`زمن SRT غير صالح: ${ms}`);
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  const r = ms % 1000;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(r).padStart(3, '0')}`;
}

/**
 * @param {string} text
 * @returns {number | null} الزمن بالملي ثانية، أو null إن لم تطابق الصيغة الصارمة.
 */
export function parseSrtTime(text) {
  const m = TIME_RE.exec(text);
  if (!m) return null;
  return Number(m[1]) * 3600000 + Number(m[2]) * 60000 + Number(m[3]) * 1000 + Number(m[4]);
}
