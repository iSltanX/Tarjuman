// STO-09: صفحتا إعدادات (سياقان بمخزنين مستقلين فوق المساحة نفسها) تعرضان القاموس نفسه؛ كلٌّ تضيف مصطلحًا قبل وصول
// إشعار الأخرى. وحالة ثانية: حذف مصطلح في صفحة لم يصلها مصطلح أضافته الأخرى. وقياس: بعد وصول الإشعار هل يُغلق الفاصل؟
import { load, out } from './common.mjs';
const { createStore } = await load('src/core/store/index.js');
const { glossaryControl } = await load('src/pages/settings/glossary.js');
const { createMemoryArea } = await load('test/helpers/chrome-storage.js');
const { newDocument, settle } = await load('test/unit/pages/library/fake-dom.js');

/** صفحة إعدادات مصغّرة بمنطق view.js نفسه: prefs محلية، وsavePrefs يضعها من نتيجة setPrefs، وonChange يعيد قراءتها. */
function page(area, { listen = true } = {}) {
  const store = createStore({ area });
  const st = { prefs: null };
  const doc = newDocument();
  const mark = { flash() {} };
  const ctl = glossaryControl({
    doc, getPrefs: () => st.prefs, attachMark: mark, listMark: mark,
    savePrefs: async (patch) => { try { st.prefs = await store.setPrefs(patch); return st.prefs; } catch { return null; } },
  });
  if (listen) store.onChange((c) => { if (c.prefs) store.getPrefs().then((p) => { st.prefs = p; ctl.sync(); }); });
  return {
    store, st, ctl,
    async init() { st.prefs = await store.getPrefs(); ctl.sync(); },
    add(source) {
      Object.assign(ctl.inputs.source, { value: source }); Object.assign(ctl.inputs.target, { value: 'مقابل' }); Object.assign(ctl.inputs.note, { value: '' });
      ctl.form.dispatchEvent({ type: 'submit', preventDefault() {} });
    },
    removeFirst() { ctl.list.querySelectorAll('button')[0].click(); },
  };
}
const terms = async (area) => (await createStore({ area }).getPrefs()).glossary.terms.map((t) => t.source);

{ // (أ) إضافتان متزامنتان من صفحتين
  const area = createMemoryArea({ unlimited: true });
  const p1 = page(area); const p2 = page(area);
  await p1.init(); await p2.init();
  p1.add('alpha'); p2.add('beta');
  await settle(20); await area.flush(); await settle(20);
  out('STO-09-concurrent-adds', { stored: await terms(area), p1View: p1.st.prefs.glossary.terms.map((t) => t.source), p2View: p2.st.prefs.glossary.terms.map((t) => t.source) });
}
{ // (ب) صفحة 1 تضيف gamma ثم صفحة 2 (لم يصلها الإشعار بعد) تحذف أول مصطلح
  const area = createMemoryArea({ unlimited: true });
  const seed = createStore({ area });
  await seed.setPrefs({ glossary: { terms: [{ source: 'one', target: 'واحد', note: null }, { source: 'two', target: 'اثنان', note: null }] } });
  const p1 = page(area); const p2 = page(area);
  await p1.init(); await p2.init();
  p1.add('gamma'); p2.removeFirst(); // الحذف في صفحة 2 قبل وصول إشعار gamma إليها
  await settle(20); await area.flush(); await settle(20);
  out('STO-09-add-then-stale-remove', { stored: await terms(area), expected: ['two', 'gamma'] });
}
{ // (ج) ضابط: الإضافة الثانية بعد وصول إشعار الأولى
  const area = createMemoryArea({ unlimited: true });
  const p1 = page(area); const p2 = page(area);
  await p1.init(); await p2.init();
  p1.add('alpha'); await settle(20); await area.flush(); await settle(20);
  p2.add('beta'); await settle(20); await area.flush(); await settle(20);
  out('STO-09-control-after-event', { stored: await terms(area) });
}
