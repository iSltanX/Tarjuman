// نصوص مشتركة بين وحدات المحفوظات: عزل عنوان الفيديو اتجاهًا داخل الجمل العربية، والقص بحرف الحذف.

// عنوان الفيديو قد يكون إنجليزيًا داخل جملة عربية: يُعزل اتجاهًا (FSI…PDI) فلا تنقلب علامات الترقيم حوله في عناوين الحوارات.
const FSI = String.fromCodePoint(0x2068);
const PDI = String.fromCodePoint(0x2069);

/** @param {string} s */
export const isolate = (s) => `${FSI}${s}${PDI}`;

/** @param {string} s @param {number} max */
export const clip = (s, max) => (Array.from(s).length > max ? `${Array.from(s).slice(0, max - 1).join('')}…` : s);
