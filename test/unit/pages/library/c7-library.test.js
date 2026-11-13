// تدقيق 7a66f91، المرحلة C7 (المحفوظات): الـDOM الوهمي يُسقط التركيز عند الفصل (U72)، والتركيز يبقى بعد أفعال التوسيع
// والقائمة و«عرض المزيد» (U50، U58)، والقائمة المفتوحة تُغلق نظيفة بتحديث في الخلفية، وزر مسح البحث خارج Tab والحقل فارغ،
// والرسالة بتراجع تثبت ما دام التركيز فيها وتعيده إلى الشريحة، وعنوان «تصدير» مجموعة، والتنبيهات role=alert لا تُعاد مع كل
// حرف (U90)، وحقل الاسم لا يُغلق بفصله في الخلفية (I05)، وسبب المرجع يتبع الاختيار وصيغ العدد (U59)، وتحذير محو السابقة (U76).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TjError } from '../../../../src/core/errors/index.js';
import { createStore } from '../../../../src/core/store/index.js';
import { writeSrt } from '../../../../src/core/srt/writer.js';
import { createLibrary } from '../../../../src/pages/library/view.js';
import { deleteSummary, fingerprintLabel } from '../../../../src/pages/library/model.js';
import { createMemoryArea } from '../../../helpers/chrome-storage.js';
import { NOW, makeCues, videoRecord } from '../../../helpers/fixtures.js';
import { sampleBundle, seedBundle } from '../../../helpers/fixtures-v2.js';
import { buttonNamed, newDocument, settle, textOf } from './fake-dom.js';

const IDS = ['AAAAAAAAAAA', 'BBBBBBBBBBB', 'CCCCCCCCCCC'];

function timers() {
  let n = 0;
  const q = new Map();
  return {
    q,
    setTimer: (fn, ms) => { q.set(++n, { fn, ms }); return n; },
    clearTimer: (id) => q.delete(id),
    /** يمضي المؤقتات القصيرة وحدها (التأجيل وإعلانات الرسائل)، وتبقى مهلة الرسائل (3–12 ث) حتى يطلبها الاختبار. */
    async runShort() {
      for (let i = 0; i < 20; i++) {
        const batch = [...q.entries()].filter(([, t]) => t.ms < 3000);
        if (!batch.length) break;
        for (const [k] of batch) q.delete(k);
        for (const [, t] of batch) t.fn();
        await settle(2);
      }
    },
  };
}

async function mount({ store: wrap, extra = 0, pick = null, seed = null } = {}) {
  let t = Date.parse(NOW);
  const area = createMemoryArea({ unlimited: true });
  const store = createStore({ area, now: () => (t += 1000) });
  if (seed) await seed(store);
  else {
    await seedBundle(store, sampleBundle({ videoId: IDS[0], third: true }));
    await store.updateVideo(IDS[1], () => ({ ...videoRecord({ videoId: IDS[1] }), title: 'ثانٍ' }));
    await store.updateVideo(IDS[2], () => ({ ...videoRecord({ videoId: IDS[2] }), title: 'ثالث' }));
  }
  for (let i = 0; i < extra; i++) {
    const id = `X${String(i).padStart(10, '0')}`;
    await store.updateVideo(id, () => ({ ...videoRecord({ videoId: id }), title: `x${i}` }));
  }
  await area.flush();
  const doc = newDocument();
  const clock = timers();
  const answers = [];
  const confirms = [];
  const lib = createLibrary({
    store: wrap ? wrap(store) : store, doc, now: () => Date.parse(NOW) + 3600 * 1000,
    openTab: async () => {}, openPage: async () => {}, saveFile: async () => ({ ok: true }), clipboardWrite: async () => {},
    pickFiles: async () => pick, diagnosticsText: async () => '{}',
    confirm: async (o) => { confirms.push(o); return answers.shift() ?? false; },
    setTimer: clock.setTimer, clearTimer: clock.clearTimer,
  });
  doc.body.append(lib.root);
  await lib.load();
  return { lib, store, area, doc, clock, answers, confirms, root: lib.root };
}

const rowFor = (m, id) => m.root.querySelectorAll('li.lib-row').find((r) => r.getAttribute('data-video') === id);
const cardOf = (m, id, n) => rowFor(m, id).querySelector(`.lib-exp section[data-slot="${n}"]`);
const fkOf = (node) => node?.getAttribute?.('data-fk') ?? null;
/** التركيز متصل بالمستند (المفصول هو body في المتصفح) وليس body. */
const focusedOk = (m) => m.doc.activeElement !== m.doc.body && m.doc.documentElement.contains(m.doc.activeElement);
const quiesce = async (m) => { await settle(10); await m.area.flush(); await m.clock.runShort(); await settle(10); };
async function expand(m, id) {
  buttonNamed(rowFor(m, id), 'إظهار الترجمات').click();
  await settle(10);
}
const press = (node) => { node.focus(); node.click(); };

test('U72: الـDOM الوهمي كالمتصفح — فصل المركّز يعيده إلى body ويطلق blur وfocusout، والمفصول والمخفي لا يُركَّزان', () => {
  const doc = newDocument();
  const wrap = doc.createElement('div');
  const btn = doc.createElement('button');
  wrap.append(btn);
  const seen = [];
  btn.addEventListener('blur', () => seen.push('blur'));
  wrap.addEventListener('focusout', () => seen.push('focusout'));
  btn.focus();
  assert.ok(doc.activeElement === doc.body, 'المفصول لا يُركَّز');
  doc.body.append(wrap);
  btn.focus();
  assert.ok(doc.activeElement === btn);
  wrap.replaceChildren();
  assert.ok(doc.activeElement === doc.body, 'الفصل يعيد التركيز إلى body');
  assert.deepEqual(seen, ['blur'], 'blur على العقدة وحدها؛ وfocusout يصعد من المفصول فلا يصل أباه القديم');
  const hidden = doc.createElement('button');
  hidden.hidden = true;
  doc.body.append(hidden);
  hidden.focus();
  assert.ok(doc.activeElement === doc.body, 'المخفي لا يُركَّز');
  const t = doc.createElement('p');
  const inner = doc.createElement('button');
  t.append(inner);
  doc.body.append(t);
  inner.focus();
  t.textContent = 'نص';
  assert.ok(doc.activeElement === doc.body, 'ضبط textContent على الأب يفصل المركّز');
});

test('U50: «تفعيل» في بطاقة يُبقي التركيز على «تصدير…» في البطاقة نفسها (صارت النشطة)', async () => {
  const m = await mount();
  await expand(m, IDS[0]);
  press(buttonNamed(cardOf(m, IDS[0], 2), 'تفعيل'));
  await quiesce(m);
  assert.equal((await m.store.getBundle(IDS[0])).active, 2);
  assert.ok(focusedOk(m), 'التركيز لم يسقط إلى body');
  assert.equal(fkOf(m.doc.activeElement), `${IDS[0]}:card-2:export`);
});

test('U50: حفظ الاسم بـEnter يعيد التركيز إلى زر التسمية', async () => {
  const m = await mount();
  await expand(m, IDS[0]);
  buttonNamed(cardOf(m, IDS[0], 3), 'تسمية الترجمة 3').click();
  const input = cardOf(m, IDS[0], 3).querySelector('input');
  assert.ok(m.doc.activeElement === input);
  input.value = 'نهائية';
  input.dispatchEvent({ type: 'keydown', key: 'Enter' });
  await quiesce(m);
  assert.equal((await m.store.getBundle(IDS[0])).slots[2].name, 'نهائية');
  assert.ok(focusedOk(m));
  assert.equal(fkOf(m.doc.activeElement), `${IDS[0]}:card-3:rename`);
});

test('U50: حذف بطاقة بالتأكيد ينقل التركيز إلى البطاقة المجاورة لا إلى body', async () => {
  const m = await mount();
  await expand(m, IDS[0]);
  m.answers.push(true);
  press(buttonNamed(cardOf(m, IDS[0], 3), 'حذف…'));
  await quiesce(m);
  assert.equal((await m.store.getBundle(IDS[0])).slots[2].track, null);
  assert.ok(focusedOk(m));
  assert.match(fkOf(m.doc.activeElement) ?? '', new RegExp(`^${IDS[0]}:(card-2|empty)`), 'البطاقة قبلها (لا بطاقة بعدها) أو الخانة الفارغة');
});

test('U50: حذف النسخة السابقة يُبقي التركيز في التوسيع', async () => {
  const m = await mount();
  await expand(m, IDS[0]);
  const del = rowFor(m, IDS[0]).querySelector('.lib-prevl__delete');
  m.answers.push(true);
  press(del);
  await quiesce(m);
  assert.equal((await m.store.getBundle(IDS[0])).previous, null);
  assert.ok(focusedOk(m));
  assert.ok(rowFor(m, IDS[0]).contains(m.doc.activeElement), 'في صف الفيديو نفسه');
});

test('U50 (DS-TJ-09): «حذف بيانات الفيديو…» من «المزيد» ينقل التركيز إلى الصف التالي حين يزول الصف', async () => {
  const m = await mount();
  const more = buttonNamed(rowFor(m, IDS[1]), 'المزيد');
  more.focus();
  more.click();
  m.answers.push(true);
  more.parentNode.querySelectorAll('[role=menuitem]').find((i) => textOf(i).startsWith('حذف بيانات الفيديو')).click();
  await quiesce(m);
  assert.equal(rowFor(m, IDS[1]), undefined, 'زال الصف');
  assert.ok(focusedOk(m));
  assert.equal(m.doc.activeElement.tagName, 'li');
  assert.ok(IDS.includes(m.doc.activeElement.getAttribute('data-video')));
});

test('U58: «عرض المزيد» ينقل التركيز إلى أول صف جديد', async () => {
  const m = await mount({ extra: 50 });
  const before = m.root.querySelectorAll('li.lib-row').length;
  const btn = m.root.querySelector('.lib-more-rows');
  press(btn);
  await settle(5);
  const rows = m.root.querySelectorAll('li.lib-row');
  assert.ok(rows.length > before);
  assert.ok(focusedOk(m), 'الزر زال والتركيز لم يسقط');
  assert.ok(m.doc.activeElement === rows[before], 'أول صف جديد');
});

test('U58: تحديث في الخلفية والقائمة مفتوحة يغلقها نظيفة، ويعود التركيز إلى «المزيد» الجديد، ولا مستمع عالق', async () => {
  const m = await mount();
  const more = buttonNamed(rowFor(m, IDS[0]), 'المزيد');
  more.focus();
  more.dispatchEvent({ type: 'keydown', key: 'ArrowDown', preventDefault() {} });
  assert.equal(more.getAttribute('aria-expanded'), 'true');
  assert.equal(m.doc.activeElement.getAttribute('role'), 'menuitem', 'التركيز على أول بند');
  await m.store.updateVideo(IDS[1], (r) => ({ ...r, title: 'تغيّر من سياق آخر' }));
  await quiesce(m);
  const fresh = buttonNamed(rowFor(m, IDS[0]), 'المزيد');
  assert.ok(fresh !== more, 'أُعيد بناء الصف');
  assert.ok(m.doc.activeElement === fresh, 'التركيز على «المزيد» الجديد للصف نفسه');
  assert.equal(fresh.getAttribute('aria-expanded'), 'false');
  assert.equal(m.doc._listeners.get('pointerdown')?.size ?? 0, 0, 'لا مستمع pointerdown للقائمة القديمة');
});

test('U58: زر «مسح البحث» مخفي (خارج Tab) والحقل فارغ، ويظهر بالكتابة ويُخفى بالمسح', async () => {
  const m = await mount();
  const search = m.root.querySelector('.lib-search__input');
  const clear = m.root.querySelector('.lib-search__clear');
  assert.equal(clear.hidden, true);
  search.value = 'ثانٍ';
  search.dispatchEvent({ type: 'input' });
  assert.equal(clear.hidden, false);
  press(clear);
  assert.equal(clear.hidden, true);
  assert.ok(m.doc.activeElement === search, 'التركيز إلى البحث');
});

test('U58: رسالة التفعيل بفعلها، والإعلان يذكر طريقي التراجع، والتركيز فيها يوقف مهلتها، و«تراجع» يعيده إلى الشريحة', async () => {
  const m = await mount();
  const chip = rowFor(m, IDS[0]).querySelectorAll('.lib-chip').find((b) => b.getAttribute('data-slot') === '2');
  press(chip);
  await quiesce(m);
  const toast = m.root.querySelector('.tj-toast--action');
  assert.ok(textOf(toast).startsWith('فُعّلت الترجمة 2'));
  assert.match(textOf(m.lib.toaster.live), /للتراجع اختر «تراجع» في الرسالة، أو اضغط زر الترجمة 1/);
  const longTimers = () => [...m.clock.q.values()].filter((t) => t.ms >= 3000).length;
  assert.equal(longTimers(), 1, 'مهلة الرسالة جارية');
  const undo = buttonNamed(toast, 'تراجع');
  undo.focus();
  assert.equal(longTimers(), 0, 'التركيز في الرسالة يوقف مهلتها');
  undo.click();
  await quiesce(m);
  assert.equal((await m.store.getBundle(IDS[0])).active, 1, 'تراجع');
  assert.ok(focusedOk(m), 'زوال الرسالة وفيها التركيز لا يُسقطه');
  assert.ok(m.doc.activeElement.classList.contains('lib-chip'));
  assert.ok(rowFor(m, IDS[0]).contains(m.doc.activeElement));
});

test('U58 (DS-S5): عنوان «تصدير» في «المزيد» مجموعة باسمه تضم بنود التصدير', async () => {
  const m = await mount();
  const more = buttonNamed(rowFor(m, IDS[0]), 'المزيد');
  const group = more.parentNode.querySelector('[role=group]');
  assert.ok(group);
  assert.equal(group.getAttribute('aria-label'), 'تصدير');
  const items = group.querySelectorAll('[role=menuitem]').map((i) => textOf(i.querySelector('.tj-menu__label')));
  // بنود التصدير حتى الفاصل، ومنها «نص دراسي…» (تنزيل ملف أيضًا) كما تُرى تحت العنوان.
  assert.ok(items.length >= 3 && items.every((t) => /^(الترجمة|العربية|الإنجليزية|نص دراسي)/.test(t)), items.join(' | '));
  assert.equal(more.parentNode.querySelectorAll('[role=menuitem]').filter((i) => !group.contains(i)).map((i) => textOf(i.querySelector('.tj-menu__label')))[0], 'نسخ التعليمات', 'ما بعد الفاصل خارج المجموعة');
  assert.equal(more.parentNode.querySelector('[role=presentation]'), null);
  assert.equal(group.querySelector('.tj-menu__group').getAttribute('aria-hidden'), 'true', 'العنوان المرئي لا يُقرأ مرتين');
});

test('U90: تنبيه السعة role=alert يبقى العقدة نفسها مع الكتابة في البحث', async () => {
  const cap = { bytesInUse: 300 * 1024 * 1024, quotaBytes: null, unlimited: true, ratio: null, level: 'warning', code: 'ST_LARGE_LIBRARY' };
  const m = await mount({ store: (s) => ({ ...s, capacity: async () => cap }) });
  const first = m.root.querySelector('.lib-capacity-alert [role=alert]');
  assert.ok(first);
  const search = m.root.querySelector('.lib-search__input');
  for (const v of ['ث', 'ثا', 'ثان']) {
    search.value = v;
    search.dispatchEvent({ type: 'input' });
  }
  const after = m.root.querySelectorAll('.lib-capacity-alert [role=alert]');
  assert.equal(after.length, 1);
  assert.ok(after[0] === first, 'لم يُدرج من جديد');
});

test('U90: لوحة خطأ المحفوظات role=alert تبقى العقدة نفسها مع الكتابة في البحث', async () => {
  const m = await mount({ store: (s) => ({ ...s, listLibrary: async () => { throw new TjError('ST_READ_FAILED'); } }) });
  const first = m.root.querySelector('.lib-state--error');
  assert.ok(first);
  const search = m.root.querySelector('.lib-search__input');
  for (const v of ['a', 'ab', 'abc']) {
    search.value = v;
    search.dispatchEvent({ type: 'input' });
  }
  const after = m.root.querySelectorAll('[role=alert]');
  assert.equal(after.length, 1);
  assert.ok(after[0] === first);
});

test('I05: حقل الاسم المفتوح بلا تغيير لا يُغلق حين يُعاد بناء القائمة في الخلفية (فصلٌ يطلق blur)، ويبقى مركّزًا', async () => {
  const m = await mount();
  await expand(m, IDS[0]);
  buttonNamed(cardOf(m, IDS[0], 2), 'إعادة تسمية الترجمة 2').click();
  const input = cardOf(m, IDS[0], 2).querySelector('input');
  assert.ok(m.doc.activeElement === input);
  await m.store.updateVideo(IDS[1], (r) => ({ ...r, title: 'تغيّر' }));
  await quiesce(m);
  const now = cardOf(m, IDS[0], 2).querySelector('input');
  assert.ok(now === input, 'الحقل باقٍ');
  assert.ok(m.doc.activeElement === input, 'والتركيز عليه');
  // ومغادرته الحقيقية بلا تغيير تغلقه كما كانت.
  buttonNamed(rowFor(m, IDS[0]), 'المزيد').focus();
  await settle(3);
  assert.equal(cardOf(m, IDS[0], 2).querySelector('input'), null);
});

test('U59 وح5: سطر سبب المرجع في حوار الرفع للأقرب الذي اختاره ترجمان، بلا قائمة', async () => {
  const m = await mount({ seed: async (s) => seedBundle(s, sampleBundle({ videoId: IDS[0] })), pick: [new File([writeSrt(makeCues(5).map((c) => ({ ...c, text: `جديد ${c.n}` })))], 'x.ar.srt')] });
  buttonNamed(rowFor(m, IDS[0]), 'رفع ترجمة…').click();
  await settle(20);
  const content = m.confirms.at(-1).content;
  assert.ok(content.querySelector('select.lib-up__ref') === null, 'بصمتان: سطر لا قائمة');
  assert.match(textOf(content.querySelector('.lib-up__ref-line')), /— الأقرب/);
  assert.match(textOf(content.querySelector('.lib-up__why')), /مطابقة لهذا التصدير/, 'سبب المقترح');
});

test('U59: صيغ العدد — «جزآن» في وصف البصمة، و«ملفا أصل محفوظان» في ملخص الحذف، و«النتائج: …» في الإعلان', async () => {
  assert.match(fingerprintLabel({ trackKey: 'en|asr', mode: 'normal', count: 12, parts: [{}, {}] }), /جزآن/);
  assert.match(fingerprintLabel({ trackKey: 'en|asr', mode: 'normal', count: 12, parts: Array.from({ length: 11 }, () => ({})) }), /11 جزءًا/);
  const b = sampleBundle({ videoId: IDS[0] });
  const two = { ...b, record: { ...b.record, english: [b.record.english[0], { ...b.record.english[0], key: 'en|asr' }] } };
  assert.ok(deleteSummary(two, { scope: 'all' }).items.includes('ملفا أصل محفوظان'));
  const m = await mount();
  const search = m.root.querySelector('.lib-search__input');
  search.value = 'ث';
  search.dispatchEvent({ type: 'input' });
  const live = m.root.querySelectorAll('[role=status]').find((n) => n.classList.contains('tj-sr-only') && !n.hasAttribute('aria-atomic'));
  assert.equal(textOf(live), 'النتائج: فيديوهان');
});

test('U76: حوار الرفع إلى خانة ممتلئة يحذّر من محو النسخة السابقة ويسمّي خانتها، ولا تحذير بلا سابقة', async () => {
  const pick = [new File([writeSrt(makeCues(5).map((c) => ({ ...c, text: `جديد ${c.n}` })))], 'x.ar.srt')];
  const m = await mount({ pick });
  await expand(m, IDS[0]);
  buttonNamed(cardOf(m, IDS[0], 1), 'استبدال…').click();
  await settle(20);
  const text = textOf(m.confirms.at(-1).content);
  assert.match(text, /وتُحذف النسخة السابقة المحفوظة الآن \(من الترجمة 2،/);
  const n = await mount({ pick, seed: async (s) => seedBundle(s, { ...sampleBundle({ videoId: IDS[0], third: true }), previous: null }) });
  await expand(n, IDS[0]);
  buttonNamed(cardOf(n, IDS[0], 1), 'استبدال…').click();
  await settle(20);
  assert.equal(textOf(n.confirms.at(-1).content).includes('تحل الترجمة المستبدلة'), false);
});

test('U50 (المراجعة المستقلة): بديل «البطاقة المجاورة» يعمل وtagName بحروف كبيرة كما في المتصفح', async () => {
  const m = await mount();
  await expand(m, IDS[0]);
  const del = buttonNamed(cardOf(m, IDS[0], 3), 'حذف…');
  // في المتصفح tagName للعنصر «SECTION»؛ والـDOM الوهمي يخفضها، فتُرفع هنا للبطاقات القائمة قبل الفعل.
  for (const sec of rowFor(m, IDS[0]).querySelectorAll('.lib-exp section[data-slot]')) Object.defineProperty(sec, 'tagName', { value: 'SECTION' });
  m.answers.push(true);
  press(del);
  await quiesce(m);
  // الخانة 3 صارت البطاقة الفارغة: أول عنصر في بطاقة الخانة نفسها («رفع ترجمة…»)، لا أول عنصر في التوسيع (card-1:rename) كما كان
  // يحدث في المتصفح حين لا تُعرف البطاقة.
  assert.equal(fkOf(m.doc.activeElement), `${IDS[0]}:empty:upload`);
});
