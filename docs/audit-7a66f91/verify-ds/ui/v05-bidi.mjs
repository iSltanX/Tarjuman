// تحقق مستقل: DS-TJ-46 (أجزاء المشغّل) وموضع settings/data.js من FINDINGS. النصوص من الدوال الحقيقية (text.js وmodel.js
// وformat.js)، والترتيب البصري من محرّك UBA المبسّط في uba-engine.mjs بعد معايرته بحالات معروفة (CL-001 وCL-002).
import { imp, log } from './common.mjs';
import { visual } from './uba-engine.mjs';

const { offsetInline, formatOffset, ltrInline } = await imp('src/ui/format.js');
const { downloadedLine, nameOtherLine } = await imp('src/player/controls/text.js');
const { nameHintText } = await imp('src/pages/library/model.js');
const FSI = '⁨'; const PDI = '⁩';
const show = (label, text, dir) => log(`${label}\n   منطقي: ${JSON.stringify(text)} (${dir}) ⇒ يُرسم يسارًا←يمينًا: ${visual(text, dir)}`);

log('== المعايرة ==');
show('CL-001 بلا عزل (خلل معروف «0.5+»)', `الإزاحة ${formatOffset(500)} ث`, 'rtl');
show('CL-001 معزولة (الإصلاح المعتمد)', `الإزاحة ${offsetInline(500)} ث`, 'rtl');
show('CL-002 المحفوظات تعزل العنوان', nameHintText({ differs: true, videoId: 'AAAAAAAAAAA' }, () => 'What is AI?'), 'rtl');

log('\n== تنبيه الاسم في تأكيد الرفع (menus.js:375 ← text.js:156–161) ==');
for (const title of ['What is AI?', 'Is it real?!', '10 Tips for Beginners', 'React 19 in 100 Seconds']) {
  show(`العنوان «${title}»`, nameOtherLine(title), 'rtl');
}
show('بالإصلاح (FSI…PDI حول العنوان)', `الاسم يشير إلى فيديو آخر · ${FSI}10 Tips for Beginners${PDI}`, 'rtl');

log('\n== سطر «نُزّل» (menus.js:185، .line__text unicode-bidi: plaintext ⇒ الاتجاه من أول حرف قوي «ن» = RTL) ==');
for (const name of ['-dQw4w9WgXcQ.en.manual.normal.srt', '_abcDEF1234.en.asr.long.srt', 'dQw4w9WgXcQ.en.manual.normal.srt', '1a2B3c4D5e6.en.manual.normal.srt']) {
  show(`الاسم «${name}»`, downloadedLine(name), 'rtl');
}
show('بالإصلاح ltrInline (LRI…PDI)', downloadedLine(ltrInline('-dQw4w9WgXcQ.en.manual.normal.srt')), 'rtl');

log('\n== settings/data.js (FINDINGS UI-010 البند 2، لم ينتقل إلى التقرير) ==');
show('data.js:118 قائمة المعرّفات المتخطاة', 'لم يُضمَّن فيديوهان لتعذّر قراءة سجله: -AAAAAAAAAA، BBBBBBBBBBB', 'rtl');
show('data.js:156 سطر «معرّف: رسالة»', '-dQw4w9WgXcQ: السجل تالف', 'rtl');
