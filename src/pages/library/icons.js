// أيقونات الصفحات رُفعت إلى src/ui/components.js (icon)؛ هذا الملف يبقي الاسم القديم pageIcon للمستوردين.
import { ICON_NAMES, icon } from '../../ui/components.js';

/**
 * @param {Parameters<typeof icon>[0]} name
 * @param {{ doc?: Document, className?: string }} [o]
 */
export const pageIcon = (name, o) => icon(name, o);

export const PAGE_ICON_NAMES = ICON_NAMES;
