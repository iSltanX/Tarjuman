// M-2: رسائل خطأ الاستيراد تتراكم وتبقى بعد استيراد ناجح لاحق.
import { imp, settleN, log } from './common.mjs';
const H = await imp('test/unit/player/controls/harness.js');

const page = H.mountPage({ state: H.makeState() }); // بلا ترجمة: زر الرفع يفتح المنتقي مباشرة
const { ui, flows, env } = page;
const errors = [
  { code: 'IM_BAD_TIME', message: 'السطر 14: صيغة الزمن غير صالحة.' },
  { code: 'IM_EMPTY', message: 'الملف فارغ. اختر ملف SRT الناتج عن النموذج.' },
  { code: 'IM_NOT_UTF8', message: 'ترميز الملف ليس UTF-8.' },
];
let next = 0;
const ok = flows.readResult;
flows.readResult = (files) => (next < errors.length ? { ok: false, error: errors[next++] } : ok(files));

async function upload(name) {
  H.click(ui.btn('upload'));
  H.chooseFiles(ui, [{ name, size: 10, arrayBuffer: async () => new ArrayBuffer(10) }]);
  await settleN(6);
}
for (const n of ['bad-time.srt', 'empty.srt', 'utf16.srt']) await upload(n);
log('بعد ثلاثة أخطاء:', JSON.stringify(ui.toasts()));
await upload('good.ar.srt');
log('بعد استيراد ناجح: الترجمة محمّلة؟', !!page.controller.getState().arabic, '| القائمة المفتوحة:', ui.menuLabel());
log('الرسائل الظاهرة الآن:', JSON.stringify(ui.toasts()));
env.win.advance(60_000);
await settleN(2);
log('بعد 60 ثانية وهمية:', ui.toasts().length, 'رسائل، نغماتها', JSON.stringify(ui.toasts().map((t) => t.tone)));
log('مؤقتات معلّقة لإخفائها؟ (عدد المؤقتات الكلي):', env.win.pendingTimers());
