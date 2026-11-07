// قواعد الشيفرة الممنوعة المشتركة بين الحارسين (تدقيق 7a66f91، U61): scripts/check-static.mjs على المصدر سطرًا بسطر، و
// scripts/release/audit.mjs على الحزمة المشحونة نصًا كاملًا. كان التدقيق أضيق من الفحص، فمرّت حزم فيها ما يمنعه الفحص (رابط
// بلا بروتوكول، وnew Image، وlocalStorage). وهذه القواعد بلا استثناء لملف أو سطر: لا شيء في src يحتاجها، وما له استثناء مسمّى
// (fetch، وطلب الإذن، والتنزيلات، والروابط، والتخزين) يبقى في كل حارس بقائمته المراجَعة.
// والقواعد نصية لا محلل كامل: تحرس من الخطأ لا من التمويه المتعمد. ولذلك تمنع أيضًا الصيغ الديناميكية التي تفلت من الأسماء
// الحرفية (وصل الأسماء بالأقواس، وReflect، وتفكيك الكائنات العامة، وconstructor، وimport بغير حرفي، ووصل الروابط)، ولا استعمال
// لأيٍّ منها في src. وesbuild (minifySyntax) يطوي وصل السلاسل الحرفية في الحزمة، فيكشفها التدقيق بالاسم أو الرابط بعد الطي.

/** @typedef {{ id: string, re: RegExp, msg: string }} CodeRule */

/** @type {readonly CodeRule[]} */
export const CODE_RULES = Object.freeze([
  {
    id: 'html-string',
    re: /\b(?:innerHTML|outerHTML|insertAdjacentHTML|setHTMLUnsafe|parseHTMLUnsafe|createContextualFragment|srcdoc)\b|\bdocument\s*\.\s*write(?:ln)?\b|parseFromString\([^)]*text\/html/,
    msg: 'إدراج HTML نصي ممنوع؛ textContent وDOM فقط',
  },
  // eval اسمًا أينما ورد، ومنه بعد نقطة: window.eval( وglobalThis.eval( كانا يمرّان من الفحص الثابت (تدقيق Fable، FA-02).
  { id: 'eval', re: /(?<![\w$])eval\b|(?<![\w$])Function\s*\(|set(?:Timeout|Interval)\s*\(\s*['"`]/, msg: 'تنفيذ نص كشيفرة ممنوع' },
  { id: 'remote-code', re: /\bimport\s*\(\s*['"`](?:https?:)?\/\/|\bimportScripts\b|<script[^>]*\bsrc\s*=\s*["'](?:https?:)?\/\//i, msg: 'شيفرة بعيدة ممنوعة' },
  { id: 'player-api', re: /\bsetOption\s*\(|\bloadModule\s*\(/, msg: 'تفعيل المشغّل برمجيًا ممنوع دون قرار سلطان' },
  { id: 'innertube', re: /youtubei\/v1|innertube|get_transcript|get_panel/i, msg: 'طلبات InnerTube ممنوعة' },
  { id: 'network-channel', re: /\b(?:sendBeacon|WebSocket|EventSource|RTCPeerConnection|WebTransport)\b|\bnew\s+(?:Request|Image)\s*\(/, msg: 'قنوات شبكة ممنوعة' },
  { id: 'web-storage', re: /\b(?:localStorage|sessionStorage|indexedDB)\b/, msg: 'التخزين عبر src/core/store وحده (لا localStorage ولا IndexedDB)' },
  { id: 'console', re: /\bconsole\b/, msg: 'التسجيل في الكونسول ممنوع؛ الأخطاء برموز وتقرير التشخيص' },
  {
    id: 'bracket-name',
    re: /\[\s*['"`](?:innerHTML|outerHTML|insertAdjacentHTML|setHTMLUnsafe|eval|fetch|sendBeacon|storage|downloads|write|writeln|XMLHttpRequest|constructor)['"`]\s*\]/,
    msg: 'وصول بالأقواس إلى اسم ممنوع',
  },
  // ---- الصيغ الديناميكية (DS-T-08): لا تظهر فيها الأسماء حرفيًا ----
  { id: 'dynamic-global', re: /\b(?:globalThis|window|self|chrome|browser|navigator|document)\s*(?:\?\.\s*)?\[/, msg: 'وصول محسوب بالأقواس إلى كائن عام أو واجهة المتصفح' },
  // الوصول المحسوب وحده (بعد اسم أو ) أو ])، لا المصفوفة الحرفية ['x' + n]. والقالب `${k}px` لا يُمنع: لا يطويه esbuild.
  { id: 'concat-key', re: /[\w$)\]]\s*\[\s*['"`][^'"`\]]*['"`]\s*\+|[\w$)\]]\s*\[[^\]'"`]*\+\s*['"`][^'"`[]*['"`]\s*\]/, msg: 'اسم خاصية مبني بوصل نصوص' },
  { id: 'reflect', re: /\bReflect\s*\.\s*(?:get|set|apply|construct|getOwnPropertyDescriptor)\b/, msg: 'وصول غير مباشر بـReflect' },
  // الكائنات التي فيها fetch وواجهات الإضافة؛ وأسماء navigator وdocument الخطرة (sendBeacon وinnerHTML وwrite) ممنوعة بأسمائها.
  { id: 'destructure-global', re: /\}\s*=\s*(?:globalThis|window|self|chrome|browser)\b(?!\s*(?:\.|\?\.|\[))/, msg: 'تفكيك كائن عام أو واجهة المتصفح' },
  { id: 'constructor-call', re: /\.\s*constructor\s*\(/, msg: 'إنشاء دالة عبر constructor ممنوع' },
  { id: 'dynamic-import', re: /\bimport\s*\(\s*(?!['"`])/, msg: 'استيراد ديناميكي بغير سلسلة حرفية' },
  // بداية رابط مقسومة (ht + tps:// أو // + مضيف)، لا مسار نسبي مثل '/' + id.
  { id: 'concat-url', re: /['"`](?:h|ht|htt|https?:?\/{0,2}|\/\/)['"`]\s*\+/, msg: 'رابط مبني بوصل نصوص' },
]);

/**
 * المخالفات في نص (سطر من المصدر بعد نزع التعليقات، أو ملف حزمة كاملًا).
 * @param {string} text @returns {CodeRule[]}
 */
export function codeViolations(text) {
  return CODE_RULES.filter((r) => r.re.test(text));
}
