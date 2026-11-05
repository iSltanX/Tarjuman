// قراءة حقول المحرّر: الزمن بصيغة HH:MM:SS,mmm ومقدار النقل بالثواني. تُقبل الأرقام العربية والفاصلة «،»
// والفاصلة العشرية «٫» كما تُكتب من لوحة مفاتيح عربية، ولا تخمين بعدها: ما لا يطابق الصيغة يُرفض. الزمن
// السالب يُقرأ سالبًا ليُعرض خطأً في لوحة المشكلات، لا ليُقصّ.
import { LIMITS } from '../model/validate.js';

const ARABIC_INDIC = /[٠-٩]/g;
const EXTENDED_INDIC = /[۰-۹]/g;
const TIME_RE = /^(-)?(\d{1,3}):([0-5]\d):([0-5]\d)[,.](\d{3})$/;
const SECONDS_RE = /^([+-])?(\d*)(?:\.(\d{1,3}))?$/;

/** أرقام لاتينية، والفاصلة العشرية العربية نقطة، والفاصلة العربية فاصلة، وعلامة الطرح الطباعية شرطة. */
function latin(text) {
  return text
    .trim()
    .replace(ARABIC_INDIC, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(EXTENDED_INDIC, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/٫/g, '.')
    .replace(/،/g, ',')
    .replace(/−/g, '-');
}

/**
 * @param {unknown} text مثل 00:04:01,200 أو 0:04:01.200
 * @returns {{ ok: true, ms: number } | { ok: false }}
 */
export function parseTimecode(text) {
  if (typeof text !== 'string') return { ok: false };
  const m = TIME_RE.exec(latin(text));
  if (!m) return { ok: false };
  const ms = Number(m[2]) * 3600000 + Number(m[3]) * 60000 + Number(m[4]) * 1000 + Number(m[5]);
  return { ok: true, ms: m[1] ? -ms : ms };
}

/**
 * رقم مقطع كما يُكتب (أرقام لاتينية أو عربية): عدد صحيح موجب، وإلا null (تدقيق 7a66f91، U27: مرساة الانجراف كانت ترفض «١٢»).
 * @param {unknown} text @returns {number | null}
 */
export function parseCueNumber(text) {
  if (typeof text !== 'string') return null;
  const m = /^\d{1,7}$/.exec(latin(text));
  return m ? Number(m[0]) : null;
}

/**
 * مقدار النقل بالثواني بإشارة اختيارية وثلاث خانات عشرية على الأكثر («+0.5» و«−1.25» و«٫٥»).
 * @param {unknown} text
 * @returns {{ ok: true, ms: number } | { ok: false }}
 */
export function parseSeconds(text) {
  if (typeof text !== 'string') return { ok: false };
  const m = SECONDS_RE.exec(latin(text).replace(',', '.'));
  if (!m || (!m[2] && !m[3])) return { ok: false };
  const ms = Number(m[2] || 0) * 1000 + Number((m[3] ?? '').padEnd(3, '0') || 0);
  if (ms > LIMITS.maxTimeMs) return { ok: false };
  return { ok: true, ms: m[1] === '-' && ms ? -ms : ms };
}
