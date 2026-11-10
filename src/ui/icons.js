// مجموعة أيقونات الواجهة الواحدة (بيانات بلا DOM): الصفحات عبر icon() في components.js، ولوحة النص المتزامن (player/panel/dom.js)،
// ورموز الحالة في قوائم المشغّل (player/controls/glyphs.js)، وأدوات الشريط (player/controls/icons.js). وحدة مستقلة فلا يسحب سكربت
// المحتوى مكوّنات الصفحات ولا الشعار معها.

/** شبكة الأيقونات: 20 بحشو 2 (منطقة الرسم 16)، وسماكة الخط 1.75 من الـCSS (2 في 16 و14، و1.9 في المشغّل). */
export const ICON_VIEWBOX = '0 0 20 20';

/**
 * أيقونات الهوية الرابعة (لوحة 06 «الأيقونات»، ومعها «مبادلة» من لوحة النافذة 09): رُسمت لترجمان في لوحة الهوية على شبكة 20
 * بخط واحد وزوايا مستديرة، والمصمتة منها (التشغيل والإيقاف والمزيد والرمز) بكتلة تعادل المخطّطة. المسارات حرفيًا من رموز
 * #i-* في project/*.dc.html (الإصدار 1794035287-e3de). الاتجاهية منها (chev-left/right، undo/redo) تُقلب بالـCSS عند الحاجة لا هنا،
 * وأيقونات الزمن والوسائط لا تُقلب. والنسبة في THIRD_PARTY_NOTICES.txt (scripts/release/notices.mjs).
 */
export const IDENTITY_ICONS = Object.freeze({
  download: [['path', { d: 'M10 3v10M6 9l4 4 4-4' }], ['path', { d: 'M3 15v1a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-1' }]],
  upload: [['path', { d: 'M10 13V3M6 7l4-4 4 4' }], ['path', { d: 'M3 15v1a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-1' }]],
  copy: [['rect', { x: 7, y: 7, width: 10, height: 10, rx: 2 }], ['path', { d: 'M13 7V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2' }]],
  edit: [['path', { d: 'M13.5 3.5a1.8 1.8 0 0 1 2.6 2.6L7 15.2 3.5 16.5l1.3-3.5z' }]],
  library: [['rect', { x: 3, y: 4, width: 4, height: 12, rx: 1 }], ['rect', { x: 8, y: 4, width: 4, height: 12, rx: 1 }], ['path', { d: 'M13.5 4.5l3 11' }]],
  settings: [['path', { d: 'M3 6h7.5M14.5 6H17M3 10h2.5M9.5 10H17M3 14h9.5M16.5 14H17' }], ['circle', { cx: 12.5, cy: 6, r: 1.75 }], ['circle', { cx: 7.5, cy: 10, r: 1.75 }], ['circle', { cx: 14.5, cy: 14, r: 1.75 }]],
  search: [['circle', { cx: 9, cy: 9, r: 5.5 }], ['path', { d: 'M13 13l4 4' }]],
  panel: [['rect', { x: 3, y: 4, width: 14, height: 12, rx: 2 }], ['path', { d: 'M12 4v12M6 8h3M6 11h3' }]],
  clock: [['circle', { cx: 10, cy: 10, r: 7 }], ['path', { d: 'M10 6v4l2.5 2' }]],
  sync: [['path', { d: 'M3.5 10a6.5 6.5 0 0 1 11-4.7L16 7M16.5 10a6.5 6.5 0 0 1-11 4.7L4 13' }], ['path', { d: 'M16 3v4h-4M4 17v-4h4' }]],
  minus: [['path', { d: 'M5 10h10' }]],
  plus: [['path', { d: 'M10 5v10M5 10h10' }]],
  check: [['path', { d: 'M4 10.5l4 4 8-9' }]],
  x: [['path', { d: 'M5 5l10 10M15 5L5 15' }]],
  more: [['circle', { cx: 5, cy: 10, r: 1.25, fill: 'currentColor', stroke: 'none' }], ['circle', { cx: 10, cy: 10, r: 1.25, fill: 'currentColor', stroke: 'none' }], ['circle', { cx: 15, cy: 10, r: 1.25, fill: 'currentColor', stroke: 'none' }]],
  'chev-down': [['path', { d: 'M5 8l5 5 5-5' }]],
  'chev-up': [['path', { d: 'M5 12l5-5 5 5' }]],
  'chev-left': [['path', { d: 'M12 5l-5 5 5 5' }]],
  'chev-right': [['path', { d: 'M8 5l5 5-5 5' }]],
  external: [['path', { d: 'M9 4H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1v-4M12 3h5v5M17 3l-8 8' }]],
  info: [['circle', { cx: 10, cy: 10, r: 7 }], ['path', { d: 'M10 9v5M10 6.5v.5' }]],
  warning: [['path', { d: 'M10 3l8 14H2z' }], ['path', { d: 'M10 8v4M10 14.5v.5' }]],
  error: [['circle', { cx: 10, cy: 10, r: 7 }], ['path', { d: 'M7.5 7.5l5 5M12.5 7.5l-5 5' }]],
  play: [['path', { d: 'M6 4l10 6-10 6z', fill: 'currentColor', stroke: 'none' }]],
  pause: [['rect', { x: 5, y: 4, width: 3.5, height: 12, rx: 1, fill: 'currentColor', stroke: 'none' }], ['rect', { x: 11.5, y: 4, width: 3.5, height: 12, rx: 1, fill: 'currentColor', stroke: 'none' }]],
  eye: [['path', { d: 'M2 10s3-6 8-6 8 6 8 6-3 6-8 6-8-6-8-6z' }], ['circle', { cx: 10, cy: 10, r: 2.5 }]],
  'eye-off': [['path', { d: 'M3 3l14 14M8.5 4.3A8 8 0 0 1 18 10s-1 2-3 3.7M5 6.2C3 7.7 2 10 2 10s3 6 8 6c1.3 0 2.5-.3 3.5-.8' }]],
  trash: [['path', { d: 'M4 6h12M8 6V4h4v2M6 6l1 10h6l1-10' }]],
  undo: [['path', { d: 'M8 5L4 9l4 4' }], ['path', { d: 'M4 9h8a4 4 0 0 1 0 8h-2' }]],
  redo: [['path', { d: 'M12 5l4 4-4 4' }], ['path', { d: 'M16 9H8a4 4 0 0 0 0 8h2' }]],
  save: [['path', { d: 'M4 4h9l3 3v9H4z' }], ['path', { d: 'M7 4v4h5V4M7 16v-5h6v5' }]],
  split: [['path', { d: 'M10 3v14' }], ['path', { d: 'M4 7h3M4 13h3M13 7h3M13 13h3' }]],
  merge: [['path', { d: 'M4 6h5M4 14h5M9 6v8M9 10h7' }], ['path', { d: 'M13 7l3 3-3 3' }]],
  flag: [['path', { d: 'M5 17V4h9l-2 3 2 3H5' }]],
  file: [['path', { d: 'M5 3h7l4 4v10H5z' }], ['path', { d: 'M12 3v4h4' }]],
  shield: [['path', { d: 'M10 3l6 2v5c0 4-2.5 6.5-6 7.5C6.5 16.5 4 14 4 10V5z' }]],
  compare: [['rect', { x: 3, y: 4, width: 6, height: 12, rx: 1.5 }], ['rect', { x: 11, y: 4, width: 6, height: 12, rx: 1.5 }], ['path', { d: 'M5 8h2M5 11h2M13 8h2M13 11h2' }]],
  restore: [['path', { d: 'M3.5 10a6.5 6.5 0 1 1 2 4.7' }], ['path', { d: 'M3 15v-4h4' }], ['path', { d: 'M10 7v3l2 1.5' }]],
  filter: [['path', { d: 'M3 5h14l-5.5 6.5V16l-3-1.5v-3z' }]],
  sort: [['path', { d: 'M6 4v12M3 13l3 3 3-3M14 16V4M11 7l3-3 3 3' }]],
  'text-size': [['path', { d: 'M3 15l4-10 4 10M4.5 12h5M12 15l2.5-6 2.5 6M13 13h3' }]],
  position: [['rect', { x: 3, y: 4, width: 14, height: 12, rx: 2 }], ['path', { d: 'M6 13h8' }]],
  glossary: [['path', { d: 'M4 4h7a3 3 0 0 1 3 3v9H7a3 3 0 0 1-3-3z' }], ['path', { d: 'M4 4v9a3 3 0 0 1 3-3h7' }]],
  backup: [['path', { d: 'M4 8a6 6 0 0 1 11.5-2.3A3.5 3.5 0 0 1 14.5 13H6a3 3 0 0 1-2-5z' }], ['path', { d: 'M10 9v6M7.5 12.5l2.5 2.5 2.5-2.5' }]],
  activity: [['path', { d: 'M2 10h3l2-5 3 10 2-7 2 2h4' }]],
  keyboard: [['rect', { x: 2.5, y: 5, width: 15, height: 10, rx: 2 }], ['path', { d: 'M6 8h1M9 8h1M12 8h1M6 11h1M9 11h1M12 11h1M7 13.5h6' }]],
  sun: [['circle', { cx: 10, cy: 10, r: 3.5 }], ['path', { d: 'M10 2v2M10 16v2M2 10h2M16 10h2M4.3 4.3l1.4 1.4M14.3 14.3l1.4 1.4M4.3 15.7l1.4-1.4M14.3 5.7l1.4-1.4' }]],
  moon: [['path', { d: 'M16 12.5A6.5 6.5 0 0 1 7.5 4a6.5 6.5 0 1 0 8.5 8.5z' }]],
  cc: [['rect', { x: 2.5, y: 5, width: 15, height: 11, rx: 2 }], ['path', { d: 'M8.5 9.3a1.6 1.6 0 1 0 0 2.4M14 9.3a1.6 1.6 0 1 0 0 2.4' }]],
  'logo-t': [['path', { d: 'M7 3l3 3-3 3-3-3zM13 3l3 3-3 3-3-3z', fill: 'currentColor', stroke: 'none' }], ['path', { d: 'M3 12h2.4c2.3 0 3.6 1 4.6 2.6 1-1.6 2.3-2.6 4.6-2.6H17v5H3z', fill: 'currentColor', stroke: 'none' }]],
  swap: [['path', { d: 'M4 7h11M12 4l3 3-3 3M16 13H5M8 10l-3 3 3 3' }]],
  // لوح الحافظة لـ«لصق ترجمة…» في صف المحفوظات (2026-11-10): أيقونة النسخ نفسها تلتبس بالنسخ بجانب زر.
  paste: [['rect', { x: 4.5, y: 4, width: 11, height: 13, rx: 2 }], ['rect', { x: 7.5, y: 2.5, width: 5, height: 3, rx: 1 }], ['path', { d: 'M7.5 10h5M7.5 13h3' }]],
});

/**
 * أسماء دلالية في الشيفرة ← أيقونة الهوية: نغمات الرسائل والتنبيهات (success وdanger)، والسهم المنسدل، وسهما اللوحة. لا رسم
 * خاص بها: كلٌّ منها يشير إلى أيقونة من المجموعة.
 */
export const ICON_ALIASES = Object.freeze({
  success: 'check',
  danger: 'error',
  chevron: 'chev-down',
  'arrow-up': 'chev-up',
  'arrow-down': 'chev-down',
});

export const ICONS = Object.freeze({
  ...IDENTITY_ICONS,
  ...Object.fromEntries(Object.entries(ICON_ALIASES).map(([alias, name]) => [alias, IDENTITY_ICONS[name]])),
});
