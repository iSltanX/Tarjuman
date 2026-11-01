// منقّي التشخيص والسجلات: لا روابط ولا pot ولا تواقيع ولا ملفات ارتباط ولا رموز طويلة.
// findSecrets يكشف، وsanitizeText يحذف. الفحص الآلي (scripts/check-secrets.mjs) يستعمل findSecrets.

const PATTERNS = [
  { type: 'url', re: /\bhttps?:\/\/[^\s"'<>)\]]+/giu },
  { type: 'url', re: /\b(?:www\.)?(?:youtube\.com|youtu\.be|googlevideo\.com)\/[^\s"'<>)\]]*/giu },
  { type: 'timedtext-path', re: /\/api\/timedtext\b/giu },
  { type: 'param', re: /(?<![A-Za-z0-9_])(?:pot|signature|sig|lsig|potc)\s*(?:=|"\s*:\s*"|:\s*")\s*[A-Za-z0-9_\-%.~+/=]{16,}/giu },
  { type: 'param', re: /(?<![A-Za-z0-9_])expire\s*(?:=|"\s*:\s*"?)\s*\d{9,}/giu },
  { type: 'param', re: /[?&]ei=[A-Za-z0-9_\-%]{8,}/giu },
  { type: 'param', re: /(?<![A-Za-z0-9_])(?:sparams|xorb|xobt|xovt)=[^\s&"']+/giu },
  { type: 'cookie', re: /(?<![A-Za-z0-9_])(?:SAPISID|APISID|HSID|SSID|SIDCC|SID|__Secure-[0-9A-Za-z_-]+|LOGIN_INFO|VISITOR_INFO1_LIVE|VISITOR_PRIVACY_METADATA|YSC|PREF)\s*=\s*[^;\s"']{4,}/gu },
  { type: 'header', re: /\b(?:set-)?cookie\s*:\s*\S/giu },
  { type: 'header', re: /\bauthorization\s*:\s*\S/giu },
  { type: 'header', re: /SAPISIDHASH/gu },
  { type: 'token', re: /[A-Za-z0-9_-]{80,}/gu },
];

/**
 * @param {string} text
 * @param {string[]} [ignoreTypes] أنواع تُتجاهل؛ مثل 'url' في نص ترجمة قد ينطق المتحدث فيه عنوانًا عامًا
 * @returns {{ type: string, index: number, length: number, sample: string }[]} المواضع مع عيّنة مقنّعة (أول 6 محارف فقط)
 */
export function findSecrets(text, ignoreTypes = []) {
  const found = [];
  const s = String(text);
  for (const { type, re } of PATTERNS) {
    if (ignoreTypes.includes(type)) continue;
    re.lastIndex = 0;
    for (const m of s.matchAll(re)) {
      found.push({ type, index: m.index, length: m[0].length, sample: `${m[0].slice(0, 6)}…(${m[0].length})` });
    }
  }
  return found.sort((a, b) => a.index - b.index);
}

/**
 * يستبدل كل ما يطابق الأنماط بعلامة محايدة.
 * @param {string} text
 */
export function sanitizeText(text) {
  let s = String(text);
  for (const { type, re } of PATTERNS) {
    re.lastIndex = 0;
    s = s.replace(re, `[${type}-محذوف]`);
  }
  return s;
}

/**
 * ينقّي كائنًا بعمق: النصوص تُنقّى، والمفاتيح الحساسة تُسقط قيمها.
 * @param {unknown} value
 * @returns {unknown}
 */
export function sanitizeDeep(value) {
  if (typeof value === 'string') return sanitizeText(value);
  if (Array.isArray(value)) return value.map(sanitizeDeep);
  if (value && typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      if (/^(?:url|href|baseUrl|cookie|cookies|headers|pot|signature|sig|authorization)$/i.test(k)) {
        out[k] = '[محذوف]';
      } else {
        out[k] = sanitizeDeep(v);
      }
    }
    return out;
  }
  return value;
}
