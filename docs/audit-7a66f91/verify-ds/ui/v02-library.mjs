// تحقق مستقل في المحفوظات: DS-TJ-09 (التفعيل وحذف بيانات الفيديو)، وDS-TJ-43، وDS-TJ-44 (جزء toast.js)، وDS-TJ-49، وDS-S5.
// الصفحة الحقيقية createLibrary فوق تخزين المحاكاة والـDOM الوهمي. الـDOM الوهمي لا يُسقط التركيز عند فصل العقدة، فالمقياس
// «هل العنصر النشط متصل بالمستند؟»؛ المنفصل يعني body في المتصفح. والتأكيد يحاكي <dialog> الأصلي: يعيد التركيز عند الإغلاق
// إلى ما كان مركّزًا لحظة showModal (HTML: previously focused element).
import { T, imp, log } from './common.mjs';

const { createStore } = await imp('src/core/store/index.js');
const { createLibrary } = await imp('src/pages/library/view.js');
const { createToaster, TOAST_MS } = await imp('src/ui/toast.js');
const { computeCapacity } = await imp('src/core/store/capacity.js');
const { createMemoryArea } = await imp('test/helpers/chrome-storage.js');
const { NOW, videoRecord } = await imp('test/helpers/fixtures.js');
const { sampleBundle, seedBundle } = await imp('test/helpers/fixtures-v2.js');
const { buttonNamed, newDocument, settle, textOf } = await imp('test/unit/pages/library/fake-dom.js');
const { readFileSync } = await import('node:fs');

const IDS = ['AAAAAAAAAAA', 'BBBBBBBBBBB', 'CCCCCCCCCCC'];
function clockFor() {
  let n = 0; const q = new Map();
  return {
    q,
    setTimer: (fn, ms) => { q.set(++n, { fn, ms }); return n; },
    clearTimer: (id) => q.delete(id),
    async run(maxMs = Infinity) {
      for (let i = 0; i < 20 && q.size; i++) {
        const b = [...q.entries()].filter(([, t]) => t.ms <= maxMs);
        if (!b.length) break;
        for (const [k] of b) q.delete(k);
        for (const [, t] of b) t.fn();
        await settle(3);
      }
    },
  };
}
async function mount({ capacity = null } = {}) {
  let t = Date.parse(NOW);
  const area = createMemoryArea({ unlimited: true });
  const real = createStore({ area, now: () => (t += 1000) });
  await seedBundle(real, sampleBundle({ videoId: IDS[0], third: true }));
  await real.updateVideo(IDS[1], () => ({ ...videoRecord({ videoId: IDS[1] }), title: 'ثانٍ' }));
  await real.updateVideo(IDS[2], () => ({ ...videoRecord({ videoId: IDS[2] }), title: 'ثالث' }));
  await area.flush();
  const store = capacity ? { ...real, capacity: async () => capacity } : real;
  const doc = newDocument();
  const clock = clockFor();
  const answers = [];
  const lib = createLibrary({
    store, doc, now: () => Date.parse(NOW) + 3600 * 1000,
    openTab: async () => {}, openPage: async () => {}, saveFile: async () => ({ ok: true }), clipboardWrite: async () => {},
    pickFiles: async () => null, diagnosticsText: async () => '{}',
    confirm: async () => { const before = doc.activeElement; const a = answers.shift() ?? false; await settle(1); before?.focus?.(); return a; },
    setTimer: clock.setTimer, clearTimer: clock.clearTimer,
  });
  doc.body.append(lib.root);
  await lib.load();
  return { lib, store: real, area, doc, clock, answers, root: lib.root };
}
const rowFor = (m, id) => m.root.querySelectorAll('li.lib-row').find((r) => r.getAttribute('data-video') === id) ?? null;
const where = (m) => {
  const a = m.doc.activeElement;
  if (a === m.doc.body) return 'body';
  return m.doc.documentElement.contains(a) ? `متصل data-fk=${a.getAttribute?.('data-fk')}` : `منفصل (⇐ body) كان data-fk=${a.getAttribute?.('data-fk')}`;
};
const quiesce = async (m) => { await settle(10); await m.area.flush(); await m.clock.run(1000); await settle(10); };

log('== DS-TJ-09 ==');
{
  const m = await mount();
  buttonNamed(rowFor(m, IDS[0]), 'إظهار الترجمات').click();
  await settle(10);
  const act = rowFor(m, IDS[0]).querySelector('.lib-exp').querySelector('section[data-slot="2"]').querySelectorAll('button').find((b) => b.getAttribute('data-fk') === `${IDS[0]}:card-2:activate`);
  act.focus(); act.click();
  await quiesce(m);
  log(`1) «تفعيل» الخانة 2 من البطاقة: ${where(m)} | النشطة=${(await m.store.getBundle(IDS[0])).active}`);
}
{
  const m = await mount();
  const row = rowFor(m, IDS[1]);
  const more = buttonNamed(row, 'المزيد');
  more.focus(); more.click();
  const item = more.parentNode.querySelectorAll('[role=menuitem]').find((i) => textOf(i).startsWith('حذف بيانات الفيديو'));
  m.answers.push(true);
  item.focus(); item.click(); // البند يعيد التركيز إلى «المزيد» قبل فتح الحوار (menu.js:53)
  await quiesce(m);
  const order = m.root.querySelectorAll('li.lib-row').map((r) => r.getAttribute('data-video'));
  log(`2) «حذف بيانات الفيديو…» من «المزيد» (الصف الأوسط): ${where(m)} | الصف باقٍ؟ ${!!rowFor(m, IDS[1])} | الصفوف الآن: ${order.join('، ')} | البديل المطلوب toggleKeyOf = ${IDS[1]}:toggle (زال مع الصف)`);
}
{
  const m = await mount();
  const row = rowFor(m, IDS[1]);
  const more = buttonNamed(row, 'المزيد');
  more.focus(); more.click();
  const item = more.parentNode.querySelectorAll('[role=menuitem]').find((i) => textOf(i).startsWith('حذف الترجمة النشطة'));
  log(`3) بند «حذف الترجمة النشطة…» في صف الوسط موجود؟ ${!!item}`);
  const m2 = await mount();
  const more2 = buttonNamed(rowFor(m2, IDS[0]), 'المزيد');
  more2.focus(); more2.click();
  const item2 = more2.parentNode.querySelectorAll('[role=menuitem]').find((i) => textOf(i).startsWith('حذف الترجمة النشطة'));
  m2.answers.push(true);
  item2.focus(); item2.click();
  await quiesce(m2);
  log(`   «حذف الترجمة النشطة…» لصف فيه ترجمات (الصف يبقى): ${where(m2)}`);
}

log('\n== DS-TJ-43 ==');
{
  const m = await mount();
  const clear = m.root.querySelector('.lib-search__clear');
  const search = m.root.querySelector('.lib-search__input');
  const tabbable = !clear.hidden && clear.getAttribute('tabindex') !== '-1' && !clear.disabled;
  const css = readFileSync(`${T}/src/pages/library/library.css`, 'utf8').split('\n');
  const i = css.findIndex((l) => l.includes(':placeholder-shown) .lib-search__clear'));
  log(`البحث «${search.value}» | الزر في ترتيب Tab؟ ${tabbable} | aria-label=«${clear.getAttribute('aria-label')}» | library.css:${i + 1}: ${css[i].trim()}`);
  log(`  library.css:${i}: ${css[i - 1].trim()}`);
}

log('\n== DS-TJ-44 (toast.js في المحفوظات) ==');
{
  const doc = newDocument();
  const clock = clockFor();
  const t = createToaster({ doc, setTimer: clock.setTimer, clearTimer: clock.clearTimer });
  doc.body.append(t.root, t.live);
  const node = t.show('الترجمة 2', 'success', { action: { label: 'تراجع', onClick: () => {} } });
  const btn = node.querySelector('button');
  btn.focus();
  const ms = [...clock.q.values()].map((x) => x.ms);
  const listeners = ['focusin', 'mouseenter', 'pointerenter', 'focus'].filter((ty) => node._listeners?.has(ty) || btn._listeners?.has(ty));
  await clock.run();
  log(`المؤقتات=${JSON.stringify(ms)} (TOAST_MS=${TOAST_MS}) | مستمعو إيقاف: ${listeners.join('، ') || 'لا شيء'} | بعد الانقضاء والتركيز على «تراجع»: ${doc.documentElement.contains(doc.activeElement) ? 'متصل' : 'منفصل (⇐ body)'} | الإعلان «${t.live.textContent}» يذكر «تراجع»؟ ${t.live.textContent.includes('تراجع')}`);
  // النقر على «تراجع» نفسه بلوحة المفاتيح يزيل الرسالة (drop) قبل التنفيذ
  const node2 = t.show('الترجمة 3', 'success', { action: { label: 'تراجع', onClick: () => {} } });
  const b2 = node2.querySelector('button');
  b2.focus(); b2.click();
  log(`  تفعيل «تراجع» بلوحة المفاتيح: الرسالة باقية؟ ${doc.documentElement.contains(node2)} | التركيز: ${doc.documentElement.contains(doc.activeElement) ? 'متصل' : 'منفصل (⇐ body)'}`);
}
{
  const m = await mount();
  const pill = rowFor(m, IDS[0]).querySelectorAll('button.lib-chip').find((b) => textOf(b).includes('2'));
  pill.focus(); pill.click();
  await settle(10); await m.area.flush(); await settle(10); await m.clock.run(30);
  const toasts = m.root.querySelector('.tj-toasts');
  const live = m.root.children[m.root.children.length - 1];
  log(`تفعيل شريحة الخانة 2 في الصف: نص الرسالة «${textOf(toasts)}» | المنطقة الحية «${live.textContent}» | الحاوية بعد القائمة؟ ${[...m.root.children].map((c) => c.className.split(' ')[0]).join(' ← ')}`);
}

log('\n== DS-TJ-49 ==');
{
  const cap = computeCapacity(300 * 1024 * 1024, { quotaBytes: 0, unlimited: true });
  const m = await mount({ capacity: cap });
  const host = m.root.querySelector('.lib-capacity-alert');
  const seen = new Set();
  const snap = () => { const a = host.querySelector('[role=alert]'); if (a) seen.add(a); return a; };
  const first = snap();
  const search = m.root.querySelector('.lib-search__input');
  for (const ch of ['ث', 'ا', 'ن']) { search.value += ch; search.dispatchEvent({ type: 'input' }); snap(); }
  m.root.querySelector('.lib-sort__select').value = 'title';
  m.root.querySelector('.lib-sort__select').dispatchEvent({ type: 'change' }); snap();
  log(`السعة (unlimited، 300 م.ب): code=${cap.code} level=${cap.level} | التنبيه «${textOf(first)}» | عقد role=alert مختلفة بعد التحميل و3 أحرف وتغيير ترتيب: ${seen.size}`);
  const small = computeCapacity(50 * 1024 * 1024, { quotaBytes: 0, unlimited: true });
  log(`  مع unlimitedStorage و50 م.ب: code=${small.code} (لا تنبيه)`);
}
{
  // حالة الخطأ (مثل U03 في Firefox 140–143): لوحة الخطأ role=alert تُعاد مع كل حرف بحث
  const m = await mount();
  m.lib.state.status = 'error';
  m.lib.state.error = { code: 'ST_READ_FAILED', message: 'x' };
  const search = m.root.querySelector('.lib-search__input');
  const seen = new Set();
  const grab = () => { const a = m.root.querySelector('.lib-list-host').querySelector('[role=alert]'); if (a) seen.add(a); };
  search.value = 'a'; search.dispatchEvent({ type: 'input' }); grab();
  search.value = 'ab'; search.dispatchEvent({ type: 'input' }); grab();
  search.value = 'abc'; search.dispatchEvent({ type: 'input' }); grab();
  log(`حالة الخطأ: شريط الأدوات ظاهر؟ ${!m.root.querySelector('.lib-toolbar').hidden} | عقد role=alert للخطأ بعد 3 أحرف: ${seen.size}`);
}

log('\n== DS-S5 ==');
{
  const m = await mount();
  const more = buttonNamed(rowFor(m, IDS[0]), 'المزيد');
  more.click();
  const menu = more.parentNode.querySelector('[role=menu]');
  const kids = [...menu.children].map((c) => `${c.getAttribute('role')}:«${textOf(c).slice(0, 24)}»`);
  log(`أبناء القائمة: ${kids.join(' | ')}`);
}
