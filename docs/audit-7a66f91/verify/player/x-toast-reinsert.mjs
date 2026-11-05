// ملاحظة عرضية: renderToasts يعيد إنشاء كل صناديق الرسائل (role=alert) عند أي تغيّر في القائمة، فتُدرج عقد alert قديمة من جديد.
import { imp, settleN, log } from './common.mjs';
const H = await imp('test/unit/player/controls/harness.js');
const page = H.mountPage({ state: H.makeState({ arabic: H.arabic() }) });
page.controller.set({ error: { code: 'E1', message: 'خطأ أول' } });
await settleN(2);
const root = page.ui.layerHost().shadowRoot;
const first = root.querySelector('.toast');
log('بعد الخطأ الأول: عقدة', first.uid, 'role', first.getAttribute('role'), '| الحاوية role', root.querySelector('.toasts').getAttribute('role'), 'aria-live', root.querySelector('.toasts').getAttribute('aria-live'));
page.controller.set({ error: { code: 'E2', message: 'خطأ ثانٍ' } });
await settleN(2);
const boxes = root.querySelector('.toasts').children;
log('بعد الخطأ الثاني: الصناديق', boxes.map((b) => `${b.uid}:${b.getAttribute('role')}:${b.textContent}`).join(' | '), '| هل بقيت عقدة الأول نفسها؟', boxes[0] === first);
