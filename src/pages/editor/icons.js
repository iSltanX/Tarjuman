// أيقونات المحرّر من مجموعة الهوية الواحدة (src/ui/icons.js): السهم إلى المحفوظات (chev-right، يمينًا في RTL كلوحة 14)
// والعلامة والدمج والشطر صارت فيها، فلا أيقونات محلية هنا منذ الهوية الرابعة (وهي اليوم بقواعد «قطّة القلم» في الخامسة «التاء»). الاسم editorIcon باقٍ للمستوردين.
import { icon } from '../../ui/components.js';

/**
 * @param {Parameters<typeof icon>[0]} name
 * @param {{ doc?: Document, className?: string }} [o]
 */
export const editorIcon = (name, { doc = document, className = 'tj-icon' } = {}) => icon(name, { doc, className });
