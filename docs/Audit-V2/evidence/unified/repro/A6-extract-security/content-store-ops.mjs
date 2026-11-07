// A6 — CL-N1: ما يقبله العامل الخلفي من سكربت المحتوى على يوتيوب، وما يرسله جانب يوتيوب فعلًا، وحدود قائمة السماح المقترحة.
// بالوحدات الحقيقية: createStoreService وcreateWriter وcreateStore والمتحكم، ومساحة التخزين ومحاكاة العامل من مساعدات المشروع.
// الاستعمال: command node content-store-ops.mjs <جذر الشيفرة>
const R = process.argv[2];
if (!R) throw new Error('الوسيط الأول: جذر الشيفرة');
const { createMemoryArea } = await import(`${R}/test/helpers/chrome-storage.js`);
const { storeEnv } = await import(`${R}/test/helpers/store-env.js`);
const { sampleBundle, seedBundle } = await import(`${R}/test/helpers/fixtures-v2.js`);
const { createWriter } = await import(`${R}/src/core/store/writer.js`);
const { createStore } = await import(`${R}/src/core/store/index.js`);
const { versionOf } = await import(`${R}/src/core/store/version.js`);
const { createStoreService } = await import(`${R}/src/background/store-service.js`);
const { storeRequest, STORE_OPS } = await import(`${R}/src/core/model/messages.js`);
const { createController } = await import(`${R}/src/content/controller.js`);

const IDS = ['AAAAAAAAAAA', 'BBBBBBBBBBB', 'CCCCCCCCCCC'];
const runtime = { id: 'ext', getURL: (p) => `chrome-extension://ext/${p}`, onMessage: { addListener() {}, removeListener() {} } };
const contentSender = { id: 'ext', tab: { id: 7 }, url: `https://www.youtube.com/watch?v=${IDS[0]}` };
let wid = 0;
const req = (op, args = {}) => storeRequest(op, args, `wid-a6-${String(++wid).padStart(6, '0')}`);
const at = () => new Date('2026-11-08T00:00:00.000Z').toISOString();
const videos = (area) => Object.keys(area.dump()).filter((k) => k.startsWith('video:')).map((k) => k.slice(6)).sort();
let failures = 0;
const verdict = (name, actual, expected, ok) => {
  console.log(`- ${name}\n  الفعلي:   ${JSON.stringify(actual)}\n  المتوقع:  ${JSON.stringify(expected)}\n  ${ok ? 'مطابق' : 'غير مطابق (يثبت الادعاء)'}`);
  if (!ok) failures++;
};

async function seeded() {
  const env = storeEnv({ area: createMemoryArea({ unlimited: true }) });
  const s = env.context();
  for (const id of IDS) await seedBundle(s, sampleBundle({ videoId: id }));
  await s.setLangPrefs({ remember: true });
  await env.area.flush?.();
  env.sent.length = 0;
  return env;
}

console.log('# A6 — عمليات الكاتب من سكربت المحتوى (CL-N1)');
console.log(`STORE_OPS = ${JSON.stringify(STORE_OPS)}`);

// ١. القبول: عمليات لا يرسلها جانب يوتيوب تُقبل من مرسِل بصفة سكربت محتوى على يوتيوب.
{
  console.log('\n## ١. عمليات تُقبل من سكربت المحتوى (العقد يساويه بصفحات الإضافة)');
  const env = await seeded();
  const svc = createStoreService({ runtime, writer: createWriter({ area: env.area }) });
  const r1 = await svc.handle(req('langPrefs', { patch: { remember: false } }), contentSender);
  verdict('langPrefs من سكربت المحتوى', r1.ok, 'مرفوض (لا يرسله جانب يوتيوب)', r1.ok !== true);
  const r2 = await svc.handle(req('saves', { downloadId: 99, at: at() }), contentSender);
  verdict('saves من سكربت المحتوى', r2.ok, 'مرفوض (يكتبه العامل نفسه محليًا)', r2.ok !== true);
  const r3 = await svc.handle(req('delete', { videoId: IDS[1] }), contentSender);
  verdict(`delete بلا base لفيديو غير المعروض (${IDS[1]})`, { ok: r3.ok, videos: videos(env.area) }, 'مرفوض', r3.ok !== true);
  const before = Object.keys(env.area.dump()).length;
  const r4 = await svc.handle(req('clear', { at: at() }), contentSender);
  verdict('clear من سكربت المحتوى', { ok: r4.ok, value: r4.value, keysBefore: before, keysAfter: Object.keys(env.area.dump()) }, 'مرفوض', r4.ok !== true);
  const r5 = svc.handle(req('clear', { at: at() }), { id: 'ext', tab: { id: 8 }, url: 'https://evil.example/' });
  console.log(`  ضابط: مرسِل من موقع آخر يُتجاهل (null): ${r5 === null}`);
}

// ٢. ما يرسله جانب يوتيوب في تدفقاته: المتحكم بأفعاله الكتابية كلها تقريبًا، وقائمة المحفوظات المختصرة لقائمة الرفع (listIndex).
{
  console.log('\n## ٢. العمليات التي يرسلها جانب يوتيوب فعلًا (تتبع ديناميكي لأفعال المتحكم وlistIndex)');
  const env = await seeded();
  // سجل بلا مُلخّص وتابع يتيم: ليمر listIndex بفرعي الإصلاح (index وorphan) كما قد يجدهما في التخزين.
  const area = env.area;
  await area.remove(`index:${IDS[2]}`);
  await area.set({ [`index:DDDDDDDDDDD`]: { videoId: 'DDDDDDDDDDD' } });
  env.sent.length = 0;
  const store = env.context();
  const c = createController({ store, extractor: null, page: { title: () => 'عنوان', durationMs: () => 60000 } });
  await c.start(IDS[0]);
  const acts = [
    ['nudgeOffset', () => c.nudgeOffset(1)],
    ['setDisplayMode', () => c.setDisplayMode('dual')],
    ['updateSettings', () => c.updateSettings({ offsetStepMs: 1000 })],
    ['updatePrefs', () => c.updatePrefs({ ui: { panelOpen: true } })],
    ['activateSlot', () => c.activateSlot(2)],
    ['markCue', () => c.markCue({ index: 0 }, 'todo')],
    ['setSlotLang', () => c.setSlotLang(1, 'ar')],
    ['listIndex', () => env.context().listIndex()],
  ];
  const perAct = {};
  for (const [name, fn] of acts) {
    const n0 = env.sent.length;
    try { await fn(); } catch (e) { perAct[name] = `خطأ ${e.code ?? e.message}`; continue; }
    perAct[name] = [...new Set(env.sent.slice(n0).map((x) => x.op))];
  }
  const used = [...new Set(env.sent.map((x) => x.op))].sort();
  console.log(`  العمليات لكل فعل: ${JSON.stringify(perAct)}`);
  verdict('مجموعة العمليات المرسلة من جانب يوتيوب في هذه التدفقات', used, 'ضمن ready وput وorphan وindex وsettings وprefs، بلا clear ولا langPrefs ولا saves ولا delete',
    used.every((o) => ['ready', 'put', 'orphan', 'index', 'settings', 'prefs'].includes(o)));
  console.log(`  (ملاحظة: delete لا يصدر من أي فعل في المتحكم؛ كل دوال الكتابة فيه تعيد سجلًا أو undefined لا null.)`);
}

// ٣. حد قائمة السماح المقترحة: تمنع clear دفعة واحدة، لكن سياقًا مخترقًا يقرأ النسخ من التخزين مباشرة ويحذف كل فيديو بشرط base.
{
  console.log('\n## ٣. قائمة السماح المقترحة (محاكاة غلاف حول الخدمة نفسها، دون تعديل المنتج) أمام سياق محتوى مخترق');
  const env = await seeded();
  const svc = createStoreService({ runtime, writer: createWriter({ area: env.area }) });
  const CONTENT_OPS = new Set(['ready', 'put', 'delete', 'orphan', 'index', 'settings', 'prefs']);
  const guarded = (r, sender) => {
    const fromContent = sender?.tab && String(sender.url).startsWith('https://www.youtube.com/');
    if (fromContent && (!CONTENT_OPS.has(r.op) || (r.op === 'delete' && typeof r.base !== 'string'))) return Promise.resolve({ v: 1, ok: false, code: 'TJ_FORBIDDEN_OP' });
    return svc.handle(r, sender);
  };
  const rc = await guarded(req('clear', { at: at() }), contentSender);
  console.log(`  clear عبر الغلاف: ${JSON.stringify(rc)}`);
  // السياق المخترق: سكربت المحتوى يقرأ storage.local مباشرة (كما يقرؤه المنتج في area.js)، فيعرف نسخة كل فيديو.
  const raw = env.area.dump();
  const results = [];
  for (const id of IDS) {
    const base = versionOf(raw[`video:${id}`]);
    const r = await guarded(req('delete', { videoId: id, base }), contentSender);
    results.push(`${id}:${r.ok}`);
  }
  verdict('حذف كل فيديو بشرط base بعد قراءة النسخ مباشرة من التخزين (مع قائمة السماح)', { deletes: results, videosLeft: videos(env.area) },
    'قائمة السماح وحدها تمنع ذلك', videos(env.area).length === IDS.length);
  console.log('  (والأقصر لسياق مخترق: chrome.storage.local.clear() مباشرة، فلا setAccessLevel في المصدر ومستوى local الافتراضي يتيح سكربتات المحتوى.)');
}

console.log(`\nالخلاصة: ${failures} حالة غير مطابقة للمتوقع (المتوقع: ٤ في القسم ١ تثبت القبول، و١ في القسم ٣ تثبت أن قائمة السماح جزئية؛ والقسم ٢ مطابق).`);
