// تقرير التشخيص القابل للنسخ (R36، عقد errors §٤): الإصدار والمتصفح ورموز الأخطاء وأحجام وأعداد فقط.
// لا يتضمن أبدًا نص ترجمة ولا جسمًا ولا رابطًا ولا رمز جلسة: المفاتيح النصية تُسقط، ثم يُنقّى الباقي.
import { sanitizeDeep } from './sanitize.js';

const DROP = /^(?:text|texts|cues|body|srt|original|current|title|fileName|lines|words)$/i;

function strip(value) {
  if (Array.isArray(value)) return value.map(strip);
  if (value && typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = DROP.test(k) ? '[مستبعد]' : strip(v);
    return out;
  }
  return value;
}

/**
 * @param {{ version: string, browser?: string, at?: string, sections: Record<string, unknown> }} input
 * @returns {{ tarjuman: string, browser: string, at: string, sections: Record<string, unknown> }}
 */
export function createDiagnosticReport({ version, browser = 'غير معروف', at = new Date().toISOString(), sections }) {
  return /** @type {any} */ (sanitizeDeep({ tarjuman: String(version), browser: String(browser), at, sections: strip(sections) }));
}

/** @param {ReturnType<typeof createDiagnosticReport>} report */
export const formatDiagnosticReport = (report) => JSON.stringify(report, null, 2);
