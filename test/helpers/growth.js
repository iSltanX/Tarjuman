// اختبارات الأداء بالنمو لا بزمن مطلق (تحقق الجولة الثانية، §١١): ثلاثة اختبارات بحدود مطلقة بزمن الساعة (60 و1000 م.ث، ونسبة بين
// حجمين متقاربين) سقطت تحت حمل الجهاز ونجحت منفردة. والسبب أن زمن الساعة يحسب ما أعطاه النظام لغير العملية، والقراءة الطويلة (الحجم
// الكبير) أكثر تعرضًا له: قيس تحت تشغيلين متوازيين للحزمة أسٌّ 1.78 لعمل خطي بزمن الساعة، و1.32 أقصى بزمن المعالج.
// فهنا: زمن المعالج للعملية (process.cpuUsage، ومنه خيوط جمع المهملات)، وحجمان بينهما أضعاف كثيرة، بالتناوب بعد إحماء، وأفضل
// القراءات لكلٍّ؛ ويُحكم بالأس المقدّر log(tL/tS)/log(nL/nS): نحو 1 للخطي ونحو 2 للتربيعي، والحد بينهما 1.5. والحد المطلق بعده سخي
// يكشف الانهيار وحده.

/** الحد بين الخطي والتربيعي للأس المقدّر. */
export const LINEAR_MAX_EXPONENT = 1.5;
/** الحد بين الثابت (لا يتعلق بالحجم) والخطي: عمل لا ينسخ الملف كله في كل خطوة. */
export const CONSTANT_MAX_EXPONENT = 0.5;

/** زمن المعالج للعملية بالملي ثانية. */
const cpuMs = () => {
  const u = process.cpuUsage();
  return (u.user + u.system) / 1000;
};

/**
 * @param {{ small: number, large: number, prepare: (n: number) => () => unknown, reps?: number, floorMs?: number }} o
 *   prepare يبني المدخل لحجم n خارج القياس ويعيد العمل المقيس وحده؛ ويُستدعى لكل قراءة، فالعمل الذي يغيّر مدخله يبدأ من جديد.
 *   floorMs أدنى زمن يُحسب، فلا يُقسم على قراءة صفرية.
 * @returns {{ small: number, large: number, exponent: number, note: string }} أفضل زمن معالج لكل حجم بالملي ثانية، والأس المقدّر
 */
export function growth({ small, large, prepare, reps = 5, floorMs = 0.05 }) {
  const once = (n) => {
    const run = prepare(n);
    const t = cpuMs();
    run();
    return cpuMs() - t;
  };
  once(small);
  once(large); // إحماء المترجم الفوري للحجمين
  let a = Infinity;
  let b = Infinity;
  for (let i = 0; i < reps; i++) {
    a = Math.min(a, once(small));
    b = Math.min(b, once(large));
  }
  const exponent = Math.log(Math.max(b, floorMs) / Math.max(a, floorMs)) / Math.log(large / small);
  return { small: a, large: b, exponent, note: `زمن المعالج ${a.toFixed(2)}ms عند ${small} ← ${b.toFixed(2)}ms عند ${large}، الأس ${exponent.toFixed(2)}` };
}
