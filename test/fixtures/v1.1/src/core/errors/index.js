// فهرس الأخطاء (عقد docs/contracts/errors.md): يجمع ملفات المجالات، ولكل مجال بادئات محجوزة له وحده.
// الخطأ رمز ثابت ورسالة عربية للمستخدم وتفاصيل تقنية منقّاة للتشخيص فقط.
import { sanitizeText } from '../diagnostics/sanitize.js';
import * as base from './base.js';
import * as extract from './extract.js';
import * as importDomain from './import.js';
import * as overlay from './overlay.js';
import * as controls from './controls.js';
import * as pages from './pages.js';
import * as editor from './editor.js';
import * as backup from './backup.js';

export const DOMAINS = Object.freeze([
  { name: 'base', owner: 'P2', ...base },
  { name: 'extract', owner: 'P3', ...extract },
  { name: 'import', owner: 'P4', ...importDomain },
  { name: 'overlay', owner: 'P5', ...overlay },
  { name: 'controls', owner: 'P6', ...controls },
  { name: 'pages', owner: 'P7', ...pages },
  { name: 'editor', owner: 'P8', ...editor },
  { name: 'backup', owner: 'P13', ...backup },
]);

const ALL = Object.freeze(Object.assign({}, ...DOMAINS.map((d) => d.MESSAGES)));
const MAX_DETAIL = 500;

/** @param {string} code */
export function hasCode(code) {
  return Object.prototype.hasOwnProperty.call(ALL, code);
}

/**
 * الرسالة العربية للرمز، والقوالب {name} تُملأ من params. الرمز المجهول يُعاد كما هو.
 * @param {string} code
 * @param {Record<string, string | number>} [params]
 */
export function messageFor(code, params) {
  const text = hasCode(code) ? ALL[code] : String(code);
  if (!params) return text;
  return text.replace(/\{(\w+)\}/g, (m, k) => (k in params ? String(params[k]) : m));
}

export class TjError extends Error {
  /**
   * @param {string} code
   * @param {{ detail?: string, params?: Record<string, string | number>, cause?: unknown }} [opts]
   */
  constructor(code, { detail, params, cause } = {}) {
    super(messageFor(code, params), cause === undefined ? undefined : { cause });
    this.name = 'TjError';
    this.code = code;
    this.params = params ?? null;
    this.detail = detail ? sanitizeText(String(detail)).slice(0, MAX_DETAIL) : null;
  }

  toJSON() {
    return { code: this.code, message: this.message, detail: this.detail };
  }
}

/** @param {unknown} err */
export function isTjError(err) {
  return err instanceof TjError;
}

/**
 * يحوّل أي خطأ إلى { code, message, detail } قابل للعرض والتشخيص. غير المعروف يصبح TJ_UNEXPECTED.
 * @param {unknown} err
 * @param {string} [fallback]
 */
export function toErrorInfo(err, fallback = 'TJ_UNEXPECTED') {
  if (err instanceof TjError) return err.toJSON();
  const detail = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
  return { code: fallback, message: messageFor(fallback), detail: sanitizeText(detail).slice(0, MAX_DETAIL) };
}
