// TJ-AUD-003 (جزء المحفوظات) وTJ-AUD-020 («عرض المزيد») وTJ-AUD-023a/b: أين يذهب التركيز بعد أفعال لوحة المفاتيح في
// التوسيع، وبعد «عرض المزيد»، وحين يصل تحديث تخزين من سياق آخر والقائمة «المزيد» مفتوحة أو حقل التسمية مفتوح.
// الـDOM الوهمي لا يعيد activeElement إلى body حين تُفصل العقدة المركّزة (المتصفح يفعل)، فالمقياس: هل activeElement
// متصل بالمستند؟ وإن لم يكن فالمتصفح الحقيقي يضعه على body.
import { TJ_ROOT as T } from '../_root.mjs';
const { createStore } = await import(`${T}/src/core/store/index.js`);
const { createLibrary } = await import(`${T}/src/pages/library/view.js`);
const { createMemoryArea } = await import(`${T}/test/helpers/chrome-storage.js`);
const { NOW, videoRecord } = await import(`${T}/test/helpers/fixtures.js`);
const { sampleBundle, seedBundle } = await import(`${T}/test/helpers/fixtures-v2.js`);
const { buttonNamed, findAll, newDocument, settle, textOf } = await import(`${T}/test/unit/pages/library/fake-dom.js`);

const IDS = ['AAAAAAAAAAA', 'BBBBBBBBBBB'];
function timers() {
  let n = 0;
  const q = new Map();
  return {
    setTimer: (fn, ms) => { q.set(++n, { fn, ms }); return n; },
    clearTimer: (id) => q.delete(id),
    async runAll() {
      for (let i = 0; i < 20 && q.size; i++) {
        const batch = [...q.entries()].filter(([, t]) => t.ms < 3000); // لا نُسقط الرسائل العابرة (3–12 ث)
        if (!batch.length) break;
        for (const [k] of batch) q.delete(k);
        for (const [, t] of batch) t.fn();
        await settle(2);
      }
    },
  };
}
async function mount({ extra = 0 } = {}) {
  let t = Date.parse(NOW);
  const area = createMemoryArea({ unlimited: true });
  const store = createStore({ area, now: () => (t += 1000) });
  await seedBundle(store, sampleBundle({ videoId: IDS[0], third: true })); // ثلاث ترجمات + سابقة من الخانة 2
  await store.updateVideo(IDS[1], () => ({ ...videoRecord({ videoId: IDS[1] }), title: 'ثانٍ' }));
  for (let i = 0; i < extra; i++) await store.updateVideo(`X${String(i).padStart(10, '0')}`, () => ({ ...videoRecord({ videoId: `X${String(i).padStart(10, '0')}` }), title: `x${i}` }));
  await area.flush();
  const doc = newDocument();
  const clock = timers();
  const answers = [];
  const lib = createLibrary({
    store, doc, now: () => Date.parse(NOW) + 3600 * 1000,
    openTab: async () => {}, openPage: async () => {}, saveFile: async () => ({ ok: true }), clipboardWrite: async () => {},
    pickFiles: async () => null, diagnosticsText: async () => '{}',
    confirm: async () => answers.shift() ?? false,
    setTimer: clock.setTimer, clearTimer: clock.clearTimer,
  });
  doc.body.append(lib.root);
  await lib.load();
  return { lib, store, area, doc, clock, answers, root: lib.root };
}
const rowFor = (m, id) => m.root.querySelectorAll('li.lib-row').find((r) => r.getAttribute('data-video') === id);
const expOf = (m, id) => rowFor(m, id).querySelector('.lib-exp');
const cardOf = (exp, n) => exp.querySelector(`section[data-slot="${n}"]`);
const where = (m) => {
  const a = m.doc.activeElement;
  const connected = m.doc.documentElement.contains(a);
  return connected ? `متصل: <${a.tagName}> data-fk=${a.getAttribute?.('data-fk')} aria-label=${a.getAttribute?.('aria-label') ?? textOf(a)}` : `منفصل (في المتصفح: body) — كان <${a.tagName}> data-fk=${a.getAttribute?.('data-fk')}`;
};
async function expand(m, id) {
  buttonNamed(rowFor(m, id), 'إظهار الترجمات').click();
  await settle(10);
  return expOf(m, id);
}
const quiesce = async (m) => { await settle(10); await m.area.flush(); await m.clock.runAll(); await settle(10); };

// 1) «تفعيل» في بطاقة غير نشطة
{
  const m = await mount();
  const exp = await expand(m, IDS[0]);
  const btn = buttonNamed(cardOf(exp, 2), 'تفعيل');
  btn.focus();
  btn.click();
  await quiesce(m);
  console.log('1) بعد «تفعيل» الخانة 2:', where(m), '| النشطة الآن =', (await m.store.getBundle(IDS[0])).active);
}
// 2) تسمية بـEnter
{
  const m = await mount();
  const exp = await expand(m, IDS[0]);
  buttonNamed(cardOf(exp, 3), 'تسمية الترجمة 3').click();
  const input = cardOf(exp, 3).querySelector('input');
  console.log('2) الحقل مركّز:', m.doc.activeElement === input);
  input.value = 'اسم جديد';
  input.dispatchEvent({ type: 'keydown', key: 'Enter' });
  await quiesce(m);
  console.log('2) بعد Enter لحفظ الاسم:', where(m), '| الاسم =', (await m.store.getBundle(IDS[0])).slots[2].name);
}
// 2b) Esc يلغي: التركيز إلى زر القلم
{
  const m = await mount();
  const exp = await expand(m, IDS[0]);
  buttonNamed(cardOf(exp, 3), 'تسمية الترجمة 3').click();
  cardOf(exp, 3).querySelector('input').dispatchEvent({ type: 'keydown', key: 'Escape' });
  await quiesce(m);
  console.log('2b) بعد Esc:', where(m));
}
// 3) حذف خانة (تأكيد بالموافقة؛ الحوار الأصلي يعيد التركيز إلى «حذف…» قبل الكتابة)
{
  const m = await mount();
  const exp = await expand(m, IDS[0]);
  const del = buttonNamed(cardOf(exp, 3), 'حذف…');
  del.focus();
  m.answers.push(true);
  del.click();
  await quiesce(m);
  console.log('3) بعد حذف الخانة 3:', where(m), '| الخانة 3 =', (await m.store.getBundle(IDS[0])).slots[2].track ? 'باقية' : 'محذوفة');
}
// 4) حذف النسخة السابقة
{
  const m = await mount();
  const exp = await expand(m, IDS[0]);
  const delPrev = exp.querySelector('[data-fk="AAAAAAAAAAA:prev:delete"]');
  delPrev.focus();
  m.answers.push(true);
  delPrev.click();
  await quiesce(m);
  console.log('4) بعد حذف النسخة السابقة:', where(m), '| السابقة =', (await m.store.getBundle(IDS[0])).previous ? 'باقية' : 'محذوفة');
}
// 5) استعادة النسخة السابقة (تبديل؛ السطر يبقى)
{
  const m = await mount();
  const exp = await expand(m, IDS[0]);
  const rest = exp.querySelector('[data-fk="AAAAAAAAAAA:prev:restore"]');
  rest.focus();
  m.answers.push(true);
  rest.click();
  await quiesce(m);
  console.log('5) بعد استعادة النسخة السابقة:', where(m));
}
// 6) «عرض المزيد» (TJ-AUD-020)
{
  const m = await mount({ extra: 50 });
  const more = buttonNamed(m.root, 'عرض المزيد');
  more.focus();
  more.click();
  await settle(5);
  console.log('6) بعد «عرض المزيد»:', where(m), '| صفوف =', m.root.querySelectorAll('li.lib-row').length);
}
// 7) TJ-AUD-023a: قائمة «المزيد» مفتوحة بلوحة المفاتيح ثم يصل تحديث فيديو من سياق آخر
{
  const m = await mount();
  const moreBtn = buttonNamed(rowFor(m, IDS[1]), 'المزيد');
  moreBtn.focus();
  moreBtn.dispatchEvent({ type: 'keydown', key: 'ArrowDown' });
  console.log('7) القائمة مفتوحة:', moreBtn.getAttribute('aria-expanded'), '| التركيز على:', textOf(m.doc.activeElement).slice(0, 20));
  await m.store.updateVideo(IDS[0], (r) => ({ ...r, title: 'تغيّر من تبويب آخر' }));
  await quiesce(m);
  const newMore = buttonNamed(rowFor(m, IDS[1]), 'المزيد');
  console.log('7) بعد تحديث خلفي: زر «المزيد» الجديد مختلف =', newMore !== moreBtn, '| aria-expanded =', newMore.getAttribute('aria-expanded'), '|', where(m));
  // مستمع pointerdown للقائمة القديمة باقٍ على المستند حتى أول نقرة
  console.log('7) مستمعات pointerdown على المستند:', m.doc._listeners.get('pointerdown')?.size ?? 0);
}
// 8) TJ-AUD-023b: حقل التسمية مفتوح بلا تغيير ثم تحديث خلفي (الـDOM الوهمي لا يطلق blur عند الفصل)
{
  const m = await mount();
  const exp = await expand(m, IDS[0]);
  buttonNamed(cardOf(exp, 3), 'تسمية الترجمة 3').click();
  const input = cardOf(exp, 3).querySelector('input');
  await m.store.updateVideo(IDS[1], (r) => ({ ...r, title: 'تغيّر فيديو آخر' }));
  await quiesce(m);
  const still = expOf(m, IDS[0]) && cardOf(expOf(m, IDS[0]), 3).querySelector('input');
  console.log('8) بعد تحديث خلفي دون blur: الحقل نفسه باقٍ =', still === input, '|', where(m));
  // محاكاة متصفح يطلق blur عند فصل العقدة المركّزة: نطلقه يدويًا كما يحدث بين replaceChildren وإعادة الإلحاق
  input.dispatchEvent({ type: 'blur' });
  await settle(5);
  console.log('8) لو أطلق المتصفح blur عند الفصل والاسم لم يتغير: الحقل باقٍ =', Boolean(cardOf(expOf(m, IDS[0]), 3).querySelector('input')));
}
