// يُحمَّل في كل عملية ملف اختبار (--import من scripts/run-tests.mjs) بدل --test-force-exit (تحقق الجولة الثانية، ن-٧).
// --test-force-exit كان يُنهي العملية فور آخر اختبار، فيُبتلع خطأ مؤقت لاحق أو وعد مرفوض متأخرًا ويخرج التشغيل 0. وبلاه وحده يعلّق
// التشغيل كله إن بقي في الملف مقبض حي (مؤقت اختبار معلّق أو متسرّب)، لأن node --test ينتظر خروج عملية الملف: المهلة تُفشل الاختبار
// المعلّق باسمه ولا تُنهي عمليته.
// فهنا: بعد آخر اختبار في الملف تُترك العملية تخرج وحدها، وما يقع في الأثناء يذكره node:test خطأً كما في 2.2.0؛ فإن بقيت حيةً
// بعد المهلة الإضافية خرجت بالرمز 1 باسم الملف والمقابض الحية: لا تعليق ولا نجاح صامت.
// المهلة الإضافية 30 ث (TJ_TEST_EXIT_GRACE_MS لغيرها): أطول ما يبقى اليوم مؤقت إشعار المحفوظات (6 ث في pages/library/row.test.js)،
// وما زاد عليها يُبطئ التشغيل بلا سبب فيُسمّى.
import path from 'node:path';

if (process.env.NODE_TEST_CONTEXT === 'child-v8') {
  const { after } = await import('node:test');
  const DEFAULT_GRACE_MS = 30_000;
  const env = Number(process.env.TJ_TEST_EXIT_GRACE_MS);
  const graceMs = Number.isInteger(env) && env > 0 ? env : DEFAULT_GRACE_MS;
  // خطاف after على مستوى الجذر يُستدعى بعد آخر اختبار في الملف ولو بقيت مقابض حية (node:test يستدعيه لهذا)؛ والمؤقت unref فلا
  // يُبقي العملية وحده.
  after(() => {
    setTimeout(() => {
      const abs = process.argv[1] ?? '(ملف مجهول)';
      const rel = path.relative(process.cwd(), abs);
      const file = rel && !rel.startsWith('..') ? rel : abs;
      // كما يعدّها node، ومنها أنابيب المخرج نفسه (PipeWrap): للتشخيص لا للحكم.
      const counts = new Map();
      for (const h of process.getActiveResourcesInfo()) counts.set(h, (counts.get(h) ?? 0) + 1);
      const handles = [...counts].map(([h, n]) => (n > 1 ? `${h}×${n}` : h)).join('، ');
      process.stderr.write(`run-tests: ${file} بقي حيًّا ${graceMs}ms بعد آخر اختباراته (المقابض الحية: ${handles}): `
        + 'اختبار معلّق أو مقبض متسرّب، فهو فشل\n');
      process.exit(1);
    }, graceMs).unref();
  });

  // ص-١٠ (التحقق الأخير لـ2.3.0، check:all على Node 22): قبل Node 24 لا تصل --test-timeout إلى كل اختبار في عملية ملفه، بل تُطبَّق
  // على عملية الملف كلها، فيُنهيها node --test باسم الملف وحده («test at <ملف>:1:1») لا باسم الاختبار المعلّق (ع-٢٩). فهنا: يحفظ
  // الحارس أسماء الاختبارات الجارية، ويطبع قبيل انقضاء مهلة الملف (TJ_TEST_TIMEOUT_MS من run-tests.mjs) اسم كل اختبار لم ينتهِ، فيبقى
  // الفشل باسمه. وفي Node 24 فأحدث تُفشله المهلة نفسها باسمه، فلا شيء هنا. والمؤقت unref فلا يُبقي العملية وحده.
  const major = Number(process.versions.node.split('.')[0]);
  const fileTimeoutMs = Number(process.env.TJ_TEST_TIMEOUT_MS);
  if (major < 24 && Number.isInteger(fileTimeoutMs) && fileTimeoutMs > 0) {
    const { beforeEach, afterEach } = await import('node:test');
    const active = new Set();
    beforeEach((t) => { active.add(t.name); });
    afterEach((t) => { active.delete(t.name); });
    const margin = Math.min(1_000, Math.max(100, Math.floor(fileTimeoutMs / 10)));
    setTimeout(() => {
      for (const name of active) {
        process.stdout.write(`run-tests: «${name}» لم ينتهِ قبل مهلة ${fileTimeoutMs}ms (Node ${process.versions.node} يطبّقها على عملية الملف كلها)\n`);
      }
    }, fileTimeoutMs - margin).unref();
  }
}
