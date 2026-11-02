// عيّنات الإصدار الثاني للمراحل كلها (عقد data-model §١٠–§١٥، وعقد storage §٧): تفضيلات بقاموس، وحزمة بثلاث ترجمات
// ونسخة سابقة وعلامات وآخر موضع، وزرعها في محاكاة التخزين بالتوابع كما يكتبها التخزين نفسه. تجتاز المدققات.
import { NOW, VIDEO_ID, comparison, englishTrack, fingerprint, makeCues, videoRecord } from './fixtures.js';

/** تفضيلات بقاموس من ثلاثة مصطلحات وحد قراءة ومجلد فرعي. */
export function samplePrefs({ mode = 'subfolder', folder = 'Tarjuman' } = {}) {
  return {
    schema: 1,
    glossary: {
      attach: true,
      terms: [
        { source: 'prompt', target: 'موجِّه', note: null },
        { source: 'token', target: 'رمز', note: 'في سياق النماذج اللغوية' },
        { source: 'fine-tuning', target: 'ضبط دقيق', note: null },
      ],
    },
    review: { maxCps: 17 },
    saveLocation: { mode, folder },
  };
}
