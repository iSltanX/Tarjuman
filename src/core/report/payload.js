// «الإبلاغ عن مشكلة» (جولة النشر T2.1، عقد iSltanX/app-reports v1): جسم البلاغ كما يُرسل، وما يُعرض منه قبل الإرسال، ونسخته نصًّا.
// منطق خالص بلا واجهات المتصفح ولا شبكة. وما يُعرض هو ما يُرسل: صفوف المعاينة تُشتق من الجسم المبني نفسه لا من النموذج.
// ولا حقل لنص ترجمة ولا لمعرّف فيديو أو عنوانه أو رابطه ولا لمعرّف المستخدم أو جهازه: التشخيص قيم تقنية من المتصفح والإضافة
// بأشكال ضيقة (diagnosticsOf)، والوصف وحده نص المستخدم الذي كتبه ويراه. ولا مرفقات في هذا الإصدار.
import { getLocale, t, texts } from '../../i18n/index.js';

/** معرّف ترجمان في القناة المشتركة (وسم product:tarjuman). ثابت لا يُعاد تسميته. */
export const PRODUCT_ID = 'tarjuman';

/** سقوف العقد التي تفحصها الواجهة قبل الإرسال؛ والخادم يفرضها. */
export const LIMITS = Object.freeze({ description: 2000, diagnostics: 16 * 1024 });

export const REPORT_KINDS = Object.freeze(['bug', 'suggestion', 'other']);
/** تسميات الأنواع بلغة الواجهة (للعرض وحده؛ ما يُرسل هو الرمز bug وsuggestion وother). */
export const KIND_LABELS = texts('settings.report.kinds');

/**
 * @typedef {{
 *   appVersion: string, os: string, osVersion: string, arch: string,
 *   browser: string, browserVersion: string, buildTarget: string, test: boolean,
 * }} Diagnostics
 * @typedef {{ kind: string, description: string }} ReportForm
 */

/** أشكال القيم التقنية: اسم بحروف لاتينية ومسافات، وإصدار بأرقام ونقاط، ومعرّف قصير. وما خرج عن شكله «unknown» لا نص حر. */
const NAME = /^[A-Za-z][A-Za-z ]*$/;
const VERSION = /^\d+(?:\.\d+)*$/;
const IDENT = /^[a-z][a-z0-9_]*$/;
const narrow = (value, max, shape) => {
  const v = String(value ?? '').trim();
  return v && v.length <= max && shape.test(v) ? v : 'unknown';
};

/** @param {Diagnostics} d */
export function diagnosticsOf(d) {
  return {
    browser: narrow(d.browser, 32, NAME),
    browser_version: narrow(d.browserVersion, 32, VERSION),
    build_target: d.buildTarget === 'firefox' ? 'firefox' : 'chromium',
  };
}

/** @param {ReportForm} form @returns {'kind' | 'empty' | 'too-long' | null} */
export function formError({ kind, description }) {
  if (!REPORT_KINDS.includes(kind)) return 'kind';
  const text = String(description ?? '').trim();
  if (!text) return 'empty';
  if (text.length > LIMITS.description) return 'too-long';
  return null;
}

/** الجسم بعقد v1 بأسماء حقوله حرفًا. @param {ReportForm} form @param {Diagnostics} d */
export function buildPayload(form, d) {
  const error = formError(form);
  if (error) throw new Error(`بلاغ غير صالح: ${error}`);
  return {
    product: PRODUCT_ID,
    app_version: narrow(d.appVersion, 32, VERSION),
    os: narrow(d.os, 16, IDENT),
    os_version: narrow(d.osVersion, 32, VERSION),
    arch: narrow(d.arch, 16, IDENT),
    // لغة الواجهة وقت الإرسال: الحقل الوحيد في الجسم الذي يتبعها؛ وغيره قيم تقنية ووصف المستخدم كما كتبه.
    locale: getLocale(),
    kind: form.kind,
    description: form.description.trim(),
    diagnostics: diagnosticsOf(d),
    ...(d.test ? { test: true } : {}),
  };
}

/**
 * كل ما في الجسم صفًّا صفًّا، إلا الوصف فيُعرض في حقله كما كتبه المستخدم: لا حقل يُرسل ولا يُعرض.
 * @returns {{ label: string, value: string, field: string }[]}
 */
export function reviewRows(p) {
  const label = (k) => t(`settings.report.rows.${k}`);
  const rows = [
    { label: label('product'), value: p.product, field: 'product' },
    { label: label('kind'), value: `${KIND_LABELS[p.kind]} (${p.kind})`, field: 'kind' },
    { label: label('appVersion'), value: p.app_version, field: 'app_version' },
    { label: label('browser'), value: `${p.diagnostics.browser} ${p.diagnostics.browser_version}`, field: 'diagnostics.browser · browser_version' },
    { label: label('build'), value: p.diagnostics.build_target, field: 'diagnostics.build_target' },
    { label: label('system'), value: `${p.os} ${p.os_version} · ${p.arch}`, field: 'os · os_version · arch' },
    { label: label('locale'), value: p.locale, field: 'locale' },
  ];
  if (p.test) rows.push({ label: label('test'), value: label('testValue'), field: 'test' });
  return rows;
}

/** «انسخ البلاغ» (العقد): الجسم نفسه منسَّقًا، ويعمل بلا شبكة. */
export const serialise = (p) => JSON.stringify(p, null, 2);
