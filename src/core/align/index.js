// المحاذاة والفرق والدمج الثلاثي (واجهات الربط للإصدار الثاني). منطق نقي تستهلكه معاينة
// الاستبدال وإبقاء التعديلات (P12 وP13) والاستكمال وإنقاذ المسودة (P14)، والمقارن في src/core/compare.
export { ALIGN_DEFAULTS, alignCues, iou, isIdentity, toBlocks } from './align.js';
export { diffTranslations } from './diff.js';
export { keepEditsMerge, mergeThreeWay } from './merge.js';
