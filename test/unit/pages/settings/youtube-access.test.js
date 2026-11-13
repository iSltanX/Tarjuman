// الفكرة ٣-أ (ح-41): سطر «الوصول إلى يوتيوب» أولَ قسم «التشخيص» في الإعدادات: «ممنوح» بلا زر، و«مسحوب» مع زر «السماح» الذي يعيد
// طلب إذن يوتيوب نفسه داخل الضغطة. يتحدّث مع أحداث الأذونات وعند ظهور الصفحة، وبعد المنح سطر «أعد تحميل صفحة يوتيوب المفتوحة…»
// لأن المنح لا يحقن سكربت المحتوى في التبويب المفتوح. والحال المجهول (لا واجهة) لا يدّعي شيئًا: السطر مخفي.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStore } from '../../../../src/core/store/index.js';
import { setLocale, t } from '../../../../src/i18n/index.js';
import { createSettings } from '../../../../src/pages/settings/view.js';
import { createMemoryArea } from '../../../helpers/chrome-storage.js';
import { findAll, newDocument, settle, textOf } from '../library/fake-dom.js';

const ARABIC = /[؀-ۿ]/;

/** إذن يوتيوب بمحاكاة: check بالقيمة الحالية، وrequest يسجّل ويمنح أو يرفض، وwatch يسجّل المستمع. */
function access({ has = true, answer = true } = {}) {
  const state = { has, answer, requests: 0, listeners: new Set() };
  return {
    state,
    youtubeAccess: {
      check: async () => state.has,
      request: () => {
        state.requests++;
        if (state.answer) state.has = true;
        return Promise.resolve(state.answer);
      },
      watch: (fn) => { state.listeners.add(fn); return () => state.listeners.delete(fn); },
    },
    set(v, { silent = false } = {}) {
      state.has = v;
      if (!silent) for (const fn of state.listeners) fn();
    },
  };
}

async function mount(env = {}) {
  const store = createStore({ area: createMemoryArea({ unlimited: true }) });
  const doc = newDocument();
  const settings = createSettings({
    store, doc, version: '2.2.0',
    clipboardWrite: async () => {}, diagnosticsText: async () => '{}',
    setTimer: (fn, ms) => setTimeout(fn, ms), clearTimer: (id) => clearTimeout(id),
    ...env,
  });
  doc.body.append(settings.root);
  await settings.load();
  await settle(5);
  return { settings, doc, root: settings.root };
}

const section = (m) => m.root.querySelector('#diagnostics');
const accessRow = (m) => findAll(section(m), (e) => e.getAttribute?.('data-row') === 'youtube-access')[0] ?? null;
const allowBtn = (m) => findAll(section(m), (e) => e.tagName === 'button' && e.getAttribute('data-action') === 'youtube-access')[0] ?? null;
const pill = (m) => findAll(accessRow(m), (e) => String(e.className).includes('tj-pill'))[0] ?? null;
const fire = (doc, type) => { for (const fn of [...(doc._listeners.get(type) ?? [])]) fn({ type }); };

test('ح-41: السطر أولَ ما في «التشخيص» قبل تقرير التشخيص، وممنوح بلا زر', async () => {
  const a = access({ has: true });
  const m = await mount({ youtubeAccess: a.youtubeAccess });
  const rows = findAll(section(m), (e) => String(e.className) === 'st-row');
  assert.ok(rows[0] === accessRow(m), 'أول صف في القسم');
  assert.equal(accessRow(m).hidden, false);
  assert.match(textOf(rows[0]), /الوصول إلى يوتيوب/);
  assert.equal(textOf(pill(m)), 'ممنوح');
  assert.match(String(pill(m).className), /tj-pill--success/);
  assert.ok(allowBtn(m) === null, 'لا زر والإذن ممنوح');
  assert.equal(a.state.requests, 0, 'لا طلب بلا ضغطة');
});

test('ح-41: مسحوب ← شارة «مسحوب» وزر «السماح» وسطر يقول إنه الإذن نفسه', async () => {
  const a = access({ has: false });
  const m = await mount({ youtubeAccess: a.youtubeAccess });
  assert.equal(textOf(pill(m)), 'مسحوب');
  assert.match(String(pill(m).className), /tj-pill--warning/);
  const b = allowBtn(m);
  assert.ok(b, 'زر السماح ظاهر');
  assert.equal(textOf(b), 'السماح');
  assert.equal(b.getAttribute('aria-label'), 'السماح بالوصول إلى يوتيوب', 'الاسم يبدأ بالنص الظاهر');
  assert.match(textOf(accessRow(m)), /الإذن نفسه/);
  assert.equal(a.state.requests, 0);
});

test('ح-41: «السماح» يطلب الإذن متزامنًا في الضغطة، والمنح يُخفي الزر ويقول «أعد تحميل صفحة يوتيوب المفتوحة…»', async () => {
  const a = access({ has: false, answer: true });
  const m = await mount({ youtubeAccess: a.youtubeAccess });
  m.settings.select('diagnostics');
  allowBtn(m).focus();
  allowBtn(m).dispatchEvent({ type: 'click' });
  assert.equal(a.state.requests, 1, 'الطلب قبل أي انتظار');
  await settle(5);
  assert.equal(textOf(pill(m)), 'ممنوح');
  assert.ok(allowBtn(m) === null);
  assert.match(textOf(accessRow(m)), /أعد تحميل صفحة يوتيوب المفتوحة لتعمل أدوات ترجمان فيها\./);
  assert.ok(m.doc.activeElement === m.root.querySelector('#st-diagnostics-title'), 'التركيز إلى عنوان القسم لا يضيع مع اختفاء الزر');
});

test('ح-41: رفض الطلب يبقي «مسحوب» والزر، وعلامة تقول لم يُمنح', async () => {
  const a = access({ has: false, answer: false });
  const m = await mount({ youtubeAccess: a.youtubeAccess });
  allowBtn(m).dispatchEvent({ type: 'click' });
  await settle(5);
  assert.equal(textOf(pill(m)), 'مسحوب');
  assert.ok(allowBtn(m));
  assert.match(textOf(accessRow(m)), /لم يُمنح الإذن/);
  assert.equal(/أعد تحميل/.test(textOf(accessRow(m))), false);
});

test('ح-41: يتحدّث مع أحداث الأذونات وعند ظهور الصفحة؛ ومنح من خارج الصفحة يُظهر سطر إعادة التحميل أيضًا', async () => {
  const a = access({ has: true });
  const m = await mount({ youtubeAccess: a.youtubeAccess });
  a.set(false);
  await settle(5);
  assert.equal(textOf(pill(m)), 'مسحوب', 'onRemoved');
  assert.ok(allowBtn(m));
  a.set(true, { silent: true });
  assert.equal(textOf(pill(m)), 'مسحوب', 'لم تعلم الصفحة بعد');
  fire(m.doc, 'visibilitychange');
  await settle(5);
  assert.equal(textOf(pill(m)), 'ممنوح', 'الظهور يعيد القراءة');
  assert.match(textOf(accessRow(m)), /أعد تحميل صفحة يوتيوب المفتوحة/);
  a.set(false);
  await settle(5);
  assert.equal(/أعد تحميل/.test(textOf(accessRow(m))), false, 'السحب يمحو سطر إعادة التحميل');
});

test('ح-41: حال مجهول (لا واجهة أو رمت) لا يدّعي شيئًا: السطر مخفي بلا زر، وتقرير التشخيص كما هو', async () => {
  const m = await mount();
  assert.equal(accessRow(m).hidden, true);
  assert.ok(allowBtn(m) === null);
  const thrown = await mount({ youtubeAccess: { check: async () => { throw new Error('x'); }, request: async () => false } });
  assert.equal(accessRow(thrown).hidden, true);
  assert.ok(findAll(section(m), (e) => e.tagName === 'button' && /نسخ تقرير التشخيص/.test(textOf(e))).length, 'زر التقرير باقٍ');
});

test('ح-41: الإلغاء يزيل مستمع الأذونات', async () => {
  const a = access({ has: true });
  const m = await mount({ youtubeAccess: a.youtubeAccess });
  assert.equal(a.state.listeners.size, 1);
  m.settings.dispose();
  assert.equal(a.state.listeners.size, 0);
});

test('ح-41: النصوص بالإنجليزية بلا عربية، والمفاتيح نفسها', async () => {
  setLocale('en');
  try {
    const a = access({ has: false });
    const m = await mount({ youtubeAccess: a.youtubeAccess });
    const text = textOf(accessRow(m));
    assert.equal(ARABIC.test(text), false, text);
    assert.match(text, /YouTube access/);
    assert.equal(textOf(allowBtn(m)), 'Allow');
    assert.equal(allowBtn(m).getAttribute('aria-label'), 'Allow YouTube access');
    assert.match(t('settings.access.reload'), /^Reload/);
  } finally {
    setLocale('ar');
  }
});
