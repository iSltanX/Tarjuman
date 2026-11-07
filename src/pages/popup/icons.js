// أيقونات نافذة الأيقونة من مجموعة الهوية الواحدة (src/ui/icons.js): «العين المشطوبة» لصف «زر النص المتزامن مخفي» صارت فيها،
// فلا أيقونات محلية هنا بعد الهوية الرابعة. الاسم popupIcon باقٍ للمستوردين.
import { icon } from '../../ui/components.js';

/**
 * @param {Parameters<typeof icon>[0]} name
 * @param {{ doc?: Document, className?: string }} [o]
 */
export const popupIcon = (name, { doc = document, className = 'tj-icon' } = {}) => icon(name, { doc, className });
