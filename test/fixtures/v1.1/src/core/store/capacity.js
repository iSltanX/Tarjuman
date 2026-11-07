// قياس السعة (عقد storage §٥). بلا unlimitedStorage: الحد 10 م.ب، وتحذير عند 80%، وامتلاء عند 98%.
// ومع unlimitedStorage لا حد فعلي، فتحذير استرشادي عند حجم كبير يبطئ القراءة الكاملة.

export const WARN_RATIO = 0.8;
export const FULL_RATIO = 0.98;
export const ADVISORY_BYTES = 256 * 1024 * 1024;

/**
 * @typedef {{
 *   bytesInUse: number, quotaBytes: number | null, unlimited: boolean, ratio: number | null,
 *   level: 'normal' | 'warning' | 'full', code: 'ST_CAPACITY_WARNING' | 'ST_QUOTA_EXCEEDED' | 'ST_LARGE_LIBRARY' | null
 * }} Capacity
 */

/**
 * @param {number} bytesInUse
 * @param {{ quotaBytes: number, unlimited: boolean }} area
 * @returns {Capacity}
 */
export function computeCapacity(bytesInUse, { quotaBytes, unlimited }) {
  if (unlimited) {
    const large = bytesInUse >= ADVISORY_BYTES;
    return { bytesInUse, quotaBytes: null, unlimited: true, ratio: null, level: large ? 'warning' : 'normal', code: large ? 'ST_LARGE_LIBRARY' : null };
  }
  const ratio = quotaBytes > 0 ? bytesInUse / quotaBytes : 1;
  const level = ratio >= FULL_RATIO ? 'full' : ratio >= WARN_RATIO ? 'warning' : 'normal';
  const code = level === 'full' ? 'ST_QUOTA_EXCEEDED' : level === 'warning' ? 'ST_CAPACITY_WARNING' : null;
  return { bytesInUse, quotaBytes, unlimited: false, ratio: Math.round(ratio * 1000) / 1000, level, code };
}
