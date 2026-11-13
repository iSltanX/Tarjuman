#!/usr/bin/env node
// «هل تغيّر يوتيوب؟» (ف8، 2026-11-10): جولة حية واحدة بلا نافذة وبلا الإضافة، على الفيديو المرجعي. تجمع ما يعتمد عليه ترجمان في
// صفحة يوتيوب أشكالًا بلا قيم (الإصدار 2، الفكرة ١: سجل youtube-dom.js كله، ومواضع اللوحة، وشارة البث وزر CC، وشكل طلب الترجمة وصنف
// fmt، وشكل قائمة المسارات، وأحداث التنقل بعد انتقال واحد إلى فيديو مقترح، ثم مجسّا حالة: الوضع الداكن والعمود الواحد)، وتقارنها بخط
// الأساس المحفوظ test/fixtures/youtube/shapes-baseline.json، وتطبع الفروق وما لم يُرصد هذه المرة وصف السجل لـ docs/maintenance.md §٦.
// تذكر الفروق ولا تحكم بالفشل (رمز الخروج 0 ما لم تتعذّر الجولة). الأدلة في test-results/live/ لا في المستودع.
// والانتقال إلى المقترح شرط الجولة: إن لم يحدث فعلًا (v في العنوان) طُبع «تعذّر التنقل» وخرجت بالرمز 1 دون كتابة شيء، ولا يُحدَّث خط
// الأساس (تحقق Gemini، Y2: كان أول مقترح هو الفيديو الحالي برابط مخفي، فلا تنقل ولا فرق يظهر).
// حية: يُسأل سلطان قبلها كما في «الاختبارات الحية» من docs/development.md. و--update يكتب اللقطة خط أساس جديدًا بعد قبول الفروق.
//   npm run youtube:shapes -- --browser chrome [--video iG9CE55wbtY] [--update]
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { BROWSERS, Page, launch, sleep } from './browser.mjs';
import { clickRelated, dismissConsent, ensureCC, relatedIds, waitForPlayer } from './youtube.mjs';
import {
  NAV_EVENTS, SHAPES_VERSION, collectInPage, diffLine, diffShapes, inPageWatch, logRow, snapshot, unobservedNow,
} from '../../../scripts/youtube-shapes.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const BASELINE = path.join(ROOT, 'test/fixtures/youtube/shapes-baseline.json');
const argv = process.argv.slice(2);
const val = (k, d = null) => (argv.includes(`--${k}`) ? argv[argv.indexOf(`--${k}`) + 1] : d);
const browser = val('browser', 'chrome');
const video = val('video', 'iG9CE55wbtY');
const update = argv.includes('--update');
if (!BROWSERS[browser]) {
  console.error(`متصفح غير معروف: ${browser}`);
  process.exit(2);
}

const b = await launch({ browser, extensionPath: null, profile: `${browser}-shapes`, headless: true });
const requests = [];
try {
  const page = await Page.open(b.conn, 'about:blank');
  await page.send('Network.enable');
  page.on('Network.requestWillBeSent', (p) => {
    // الرابط لا يُحفظ: يُحوَّل إلى شكله (المسار وأسماء المعاملات) في snapshot، ولا يُكتب في الأدلة.
    if (/\/api\/timedtext\b/.test(p.request.url)) requests.push(p.request.url);
  });
  await page.goto(`https://www.youtube.com/watch?v=${video}`);
  await dismissConsent(page);
  if (!(await waitForPlayer(page, video, 45000))) {
    console.error('تعذّرت الجولة: لم يجهز المشغّل خلال 45 ث (تحدٍّ أو موافقة أو شبكة). لم يُكتب شيء.');
    process.exitCode = 1;
    throw new Error('player-not-ready');
  }
  await ensureCC(page, true);
  await sleep(3000);
  // الوسائط نصوص (evaluate يمرّرها JSON): المحددات والأصناف والسمات من youtube-dom.js.
  const watch = inPageWatch();
  const inPage = await page.eval(collectInPage, { args: [watch] });
  // أول مقترح ظاهر غير الفيديو الحالي (relatedIds)؛ والعمود قد يتأخر تحميله.
  let related = null;
  for (let i = 0; i < 15 && !related; i++) {
    related = (await relatedIds(page))[0] ?? null;
    if (!related) await sleep(1000);
  }
  if (!related) {
    console.error('تعذّر التنقل: لا مقترح ظاهر في العمود بعد 15 ث. لم يُكتب شيء.');
    process.exitCode = 1;
    throw new Error('no-related');
  }
  // طلبات ترجمة الفيديو المرجعي وحده: المقترح يتغيّر بين جولة وأخرى (يدوي أو آلي، ولطلب الآلي معاملات أخرى)، فلا يدخل شكل طلبه
  // في المقارنة؛ وكان خط الأساس يُجمع بلا انتقال أصلًا.
  const reference = [...requests];
  // الأحداث من الانتقال إلى المقترح وحده: يبدأ السماع والعدّاد فارغ قبل النقر مباشرة، فلا يدخله ما أطلقه التحميل الأول
  // (yt-page-data-updated وyt-navigate-finish وyt-player-updated تأتي منه أيضًا؛ تحقق الجولة الثانية، صف Y2).
  await page.eval((names) => {
    window.__tjShapeEvents = [];
    for (const n of names) document.addEventListener(n, () => window.__tjShapeEvents.push(n));
  }, { args: [NAV_EVENTS] });
  try {
    await clickRelated(page, related);
  } catch (err) {
    console.error(`${err.message}. لم يُكتب شيء.`);
    process.exitCode = 1;
    throw new Error('navigation-failed');
  }
  await sleep(4000);
  const events = (await page.eval(() => window.__tjShapeEvents ?? [])) ?? [];
  // مجسّا الحالة بعد قراءة الأحداث، فلا يدخل عدّادها ما يطلقانه: الوضع الداكن بمحاكاة تفضيل النظام (ATTRS.dark على html)، ثم عرض 800
  // للعمود الواحد (ATTRS.singleColumn على ytd-watch-flexy). كلٌّ ينتظر ظهور حالته حتى 4 ث ثم يجمع ويُعيد ما غيّره؛ وما لم يظهر أو
  // تعذّر يبقى 'unobserved' في اللقطة، فلا يُعدّ فرقًا ولا يُسقط الجولة (التذبذب بلا نافذة).
  const probes = [];
  const probe = async (name, apply, undo, ready) => {
    try {
      await apply();
      if (!(await page.waitFor(ready, { args: [watch], timeoutMs: 4000, intervalMs: 250 }))) console.log(`مجسّ ${name}: لم تظهر حالته خلال 4 ث، فتبقى «unobserved».`);
      probes.push(await page.eval(collectInPage, { args: [watch] }));
    } catch (err) {
      console.log(`مجسّ ${name}: تعذّر (${err.message})، فما يرصده «unobserved».`);
    } finally {
      await undo().catch(() => {});
    }
  };
  await probe(
    'الوضع الداكن',
    () => page.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'dark' }] }),
    () => page.send('Emulation.setEmulatedMedia', { features: [] }),
    (w) => document.documentElement.hasAttribute(w.attrs.dark),
  );
  await probe(
    'العمود الواحد',
    () => page.send('Emulation.setDeviceMetricsOverride', { width: 800, height: 950, deviceScaleFactor: 0, mobile: false }),
    () => page.send('Emulation.clearDeviceMetricsOverride'),
    (w) => !!document.querySelector(w.flexy)?.hasAttribute(w.attrs.singleColumn),
  );
  const at = new Date().toISOString();
  const now = snapshot({ inPage, probes, requests: reference, events, source: `${browser} ${b.version.product}`, at });
  const outDir = path.join(ROOT, 'test-results/live/youtube-shapes');
  await mkdir(outDir, { recursive: true });
  await writeFile(path.join(outDir, `${at.slice(0, 10)}-${browser}.json`), `${JSON.stringify(now, null, 2)}\n`);
  const base = JSON.parse(await readFile(BASELINE, 'utf8'));
  const diffs = diffShapes(base, now);
  if (base.version !== SHAPES_VERSION) console.log(`خط الأساس بالإصدار ${base.version} والفاحص بالإصدار ${SHAPES_VERSION}: الأقسام الجديدة تظهر «جديد»؛ راجعها ثم اكتب خط أساس جديدًا بـ--update.`);
  console.log(diffs.length ? `فروق عن خط الأساس (${base.source}، ${base.at.slice(0, 10)}):` : `لا فروق عن خط الأساس (${base.source}، ${base.at.slice(0, 10)}).`);
  for (const d of diffs) console.log(`- ${diffLine(d)}`);
  const unseen = unobservedNow(base, now);
  if (unseen.length) console.log(`لم يُرصد هذه المرة ما رُصد في خط الأساس (ليس فرقًا؛ مجسّ تذبذب أو اسم تغيّر): ${unseen.join('، ')}`);
  console.log('الانتقال: نُقر مقترح وتغيّر v في العنوان إليه، فأحداث التنقل من انتقال فعلي.');
  console.log('\nصف السجل (docs/maintenance.md §٦):');
  console.log(logRow({ date: at.slice(0, 10), browser, version: b.version.product.split('/')[1] ?? '', diffs, source: base.source }));
  if (update) {
    await writeFile(BASELINE, `${JSON.stringify(now, null, 2)}\n`);
    console.log(`\nكُتبت اللقطة خط أساس جديدًا: ${path.relative(ROOT, BASELINE)}`);
  }
} finally {
  await b.close();
}
