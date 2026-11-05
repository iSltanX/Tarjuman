// CL-X4 (كلمة كاملة والتشكيل الأخير)، CL-X5 (الاستبدال عبر فاصل سطر)، TJ-DES-002 (التطويل اللاحق مع ignoreMarks)،
// E-8 (الأرقام الهندية). دوال نقية من src/core/edit/search.js وsnippet من src/pages/editor/search.js.
import { ROOT, log } from './harness.mjs';

const { searchCues, planReplace } = await import(`${ROOT}/src/core/edit/search.js`);
const { snippet } = await import(`${ROOT}/src/pages/editor/search.js`);
const cue = (text) => ({ n: 1, startMs: 0, endMs: 1000, text });
const show = (label, text, q, o = {}, rep) => {
  const cues = [cue(text)];
  const m = searchCues(cues, q, o);
  const spans = m.map((x) => JSON.stringify(text.slice(x.start, x.end)));
  const after = rep !== undefined && m.length ? JSON.stringify(planReplace(cues, m, rep).changes[0]?.after) : '';
  log(label, '| مطابقات:', `[${spans.join(', ')}]`, after ? `| بعد الاستبدال: ${after}` : '');
  return m;
};

log('— CL-X4: «كلمة كاملة» والتشكيل على آخر الكلمة —');
show('«محمد» كلمة كاملة في «جاء محمدٌ اليوم»', 'جاء محمدٌ اليوم', 'محمد', { wholeWord: true });
show('«محمد» كلمة كاملة في «جاء محمد اليوم» (بلا تشكيل)', 'جاء محمد اليوم', 'محمد', { wholeWord: true });
show('«محمد» بلا «كلمة كاملة» في «جاء محمدٌ اليوم»', 'جاء محمدٌ اليوم', 'محمد', {});
show('«محمد» كلمة كاملة + تجاهل التشكيل', 'جاء محمدٌ اليوم', 'محمد', { wholeWord: true, ignoreMarks: true });
show('«كتب» كلمة كاملة في «كَتَبَ الدرس»', 'كَتَبَ الدرس', 'كتب', { wholeWord: true });
show('«محمدٌ» (الاستعلام مشكول) كلمة كاملة', 'جاء محمدٌ اليوم', 'محمدٌ', { wholeWord: true });

log('— CL-X5: الاستبدال عبر فاصل سطر —');
const text5 = 'ذهبنا في\nالمدينة القديمة';
const m5 = show('«في المدينة» ← «في القرية»', text5, 'في المدينة', {}, 'في القرية');
const sn = snippet(text5, m5[0].start, m5[0].end);
log('مقتطف المعاينة كما يُعرض (del):', JSON.stringify(sn.hit), '| قبلها:', JSON.stringify(sn.before), '| بعدها:', JSON.stringify(sn.after), '| يظهر فاصل السطر في المعاينة؟', sn.hit.includes('\n'));

log('— TJ-DES-002: التطويل بعد الكلمة مع تجاهل التشكيل —');
show('«كتب» + تجاهل، في «كتبـــ الدرس»', 'كتبـــ الدرس', 'كتب', { ignoreMarks: true }, 'رسم');
show('«كتب» + تجاهل، في «الدرس كتبـــ» (آخر السطر)', 'الدرس كتبـــ', 'كتب', { ignoreMarks: true }, 'رسم');
show('«كتب» + تجاهل، في «كتبَ الدرس» (حركة بعد الكلمة: مقصود)', 'كتبَ الدرس', 'كتب', { ignoreMarks: true }, 'رسم');
show('«كتب» + تجاهل + كلمة كاملة، في «كتبـــ الدرس»', 'كتبـــ الدرس', 'كتب', { ignoreMarks: true, wholeWord: true }, 'رسم');
show('«الشبكة» + تجاهل، في «الشـبكة» (تطويل داخلي)', 'الشـبكة العصبية', 'الشبكة', { ignoreMarks: true });

log('— E-8: الأرقام الهندية واللاتينية —');
show('«2024» في «عام ٢٠٢٤»', 'عام ٢٠٢٤', '2024', { ignoreMarks: true });
show('«٢٠٢٤» في «عام 2024»', 'عام 2024', '٢٠٢٤', { ignoreMarks: true });
