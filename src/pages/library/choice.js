// مجموعة الاختيار رُفعت إلى src/ui/components.js (choiceGroup)؛ هذا الملف يبقي الاسم القديم radioGroup لحوارات المحفوظات.
import { choiceGroup } from '../../ui/components.js';

/**
 * @param {{ legend: string, options: { value: string, label: string, hint?: string }[], value?: string, doc?: Document }} o
 * @returns {{ root: HTMLElement, value: () => string }}
 */
export const radioGroup = (o) => choiceGroup(o);
