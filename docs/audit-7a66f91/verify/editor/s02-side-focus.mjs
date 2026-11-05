// TJ-AUD-003 (جزء المحرّر): هل تُعاد اللوحة الجانبية بـreplaceChildren بعد فعل بلوحة المفاتيح فينفصل العنصر المركّز
// (فيسقط التركيز في المتصفح إلى body)؟ مربعات «الاستكمال»، وقائمة «مرجع المقارنة»، و«إزالة العلامات اليتيمة»، وشرائح العلامات.
import { mounted, log, attached, sampleBundle, markOn, buttonNamed } from './harness.mjs';

const bundle = sampleBundle();
bundle.slots[0].marks.push(markOn({ n: 99, startMs: 999000, text: 'لا مقطع بهذا' }, 'todo'));
const { editor, env } = await mounted({ bundle });
const doc = env.doc;

// 1) «الاستكمال»: تبديل مربع بالمسافة (click على مربع اختيار يطلق change).
env.root.querySelector('#ed-tab-complete').click();
await env.flush();
for (const key of ['marked', 'noArabic', 'missing']) {
  const box = env.root.querySelector(`input[data-group="${key}"]`);
  if (!box) { log('[003] لا مربع', key); continue; }
  box.focus();
  box.checked = !box.checked;
  box.dispatchEvent({ type: 'change' });
  await env.flush();
  const now = env.root.querySelector(`input[data-group="${key}"]`);
  log(`[003] مربع «${key}» (معطّل؟ ${box.disabled}): المركّز ما زال متصلًا؟`, attached(doc, doc.activeElement), '| المربع نفسه أُعيد بناؤه؟', now !== box);
}

// 2) «مرجع المقارنة» في تبويب المراجعة.
env.root.querySelector('#ed-tab-review').click();
await env.flush();
const sel = env.root.querySelector('select.ed-ref-choice');
sel.focus();
const other = [...sel.children].find((o) => o.getAttribute('value') !== sel.value);
sel.value = other.getAttribute('value');
sel.dispatchEvent({ type: 'change' });
await env.flush();
log('[003] بعد تغيير «مرجع المقارنة»: المركّز متصل؟', attached(doc, doc.activeElement), '| معاينة =', editor.state.refPreview !== undefined);

// 3) «إزالة العلامات اليتيمة».
const orphanBtn = buttonNamed(env.root, 'إزالة العلامات اليتيمة');
log('[003] زر العلامات اليتيمة موجود؟', Boolean(orphanBtn), '| يتيمة =', editor.state.markView.orphans.length);
orphanBtn.focus();
orphanBtn.click();
await env.flush(6);
log('[003] بعد «إزالة العلامات اليتيمة»: المركّز متصل؟', attached(doc, doc.activeElement), '| يتيمة الآن =', editor.state.markView.orphans.length);

// 4) شريحة علامة (تقفز إلى الصف وتركّز نصه: لا سقوط).
const chip = env.root.querySelector('.ed-chip--todo');
chip.focus();
chip.click();
await env.flush();
const a = doc.activeElement;
log('[003] بعد شريحة علامة: المركّز متصل؟', attached(doc, a), '|', a.tagName, a.getAttribute('data-field'));

// 5) بند في «المشكلات» (يقفز ويركّز): للمقارنة.
// 6) هل تُعاد اللوحة الجانبية مع كل ضغطة في نص صف (renderChrome) فيسقط تركيز على عنصر فيها؟ نركّز مربعًا في «الاستكمال»
//    ثم تأتي كتابة من الجلسة (برمجيًا) كما بعد تغيّر خارجي أو مؤقت المقارنة.
env.root.querySelector('#ed-tab-complete').click();
await env.flush();
const box2 = env.root.querySelector('input[data-group="missing"]');
box2.focus();
editor.state.session.setText(3, 'نص جديد');
await env.flush();
log('[003] مربع مركّز في «الاستكمال» ثم تغيّر الجلسة (renderChrome): المركّز متصل؟', attached(doc, doc.activeElement));
