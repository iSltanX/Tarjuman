// إثبات G-F16.a: زر «مسح البحث» في حالة «لا نتائج» (view.js:829) لا يستدعي syncClear، فيبقى زر المسح في الحقل
// (lib-search__clear) بـhidden=false والحقل فارغ؛ وCSS (library.css:34) يجعله opacity:0 مع :placeholder-shown، فيصله Tab ولا يُرى.
// ضابط: زر المسح في الحقل نفسه (view.js:137-146) يستدعي syncClear.
// الاستعمال: command node f16a-library-clear.mjs <جذر الشيفرة>
const R = process.argv[2];
if (!R) throw new Error('مرّر جذر الشيفرة');
const { readFileSync } = await import('node:fs');
const { createStore } = await import(`${R}/src/core/store/index.js`);
const { createLibrary } = await import(`${R}/src/pages/library/view.js`);
const { createMemoryArea } = await import(`${R}/test/helpers/chrome-storage.js`);
const { NOW, videoRecord } = await import(`${R}/test/helpers/fixtures.js`);
const { newDocument, settle, buttonNamed, findAll } = await import(`${R}/test/unit/pages/library/fake-dom.js`);

async function mount() {
  let t = Date.parse(NOW);
  const area = createMemoryArea({ unlimited: true });
  const store = createStore({ area, now: () => (t += 1000) });
  await store.updateVideo('BBBBBBBBBBB', () => ({ ...videoRecord({ videoId: 'BBBBBBBBBBB' }), title: 'ثانٍ' }));
  await area.flush();
  const doc = newDocument();
  const lib = createLibrary({
    store, doc, now: () => Date.parse(NOW) + 3600 * 1000,
    openTab: async () => {}, openPage: async () => {}, saveFile: async () => ({ ok: true }), clipboardWrite: async () => {},
    pickFiles: async () => null, diagnosticsText: async () => '{}', confirm: async () => false,
    setTimer: () => 0, clearTimer: () => {},
  });
  doc.body.append(lib.root);
  await lib.load();
  return { doc, root: lib.root };
}

const m = await mount();
const search = m.root.querySelector('.lib-search__input');
const clear = m.root.querySelector('.lib-search__clear');
search.value = 'لا يوجد هذا';
search.dispatchEvent({ type: 'input' });
await settle();
const stateBtn = findAll(m.root, (e) => e.tagName === 'button' && e !== clear && e.textContent.includes('مسح البحث'))[0];
const before = { inputValue: search.value, clearHidden: clear.hidden, emptyStateButton: Boolean(stateBtn) };
stateBtn.focus();
stateBtn.click();
await settle();
const after = {
  inputValue: search.value, clearHidden: clear.hidden, clearHasTabindexMinus1: clear.getAttribute('tabindex') === '-1',
  clearAriaHidden: clear.getAttribute('aria-hidden'), focusOnInput: m.doc.activeElement === search,
};

// ضابط: زر المسح في الحقل نفسه
search.value = 'لا يوجد هذا';
search.dispatchEvent({ type: 'input' });
await settle();
clear.focus();
clear.click();
await settle();
const control = { inputValue: search.value, clearHidden: clear.hidden };

const css = readFileSync(`${R}/src/pages/library/library.css`, 'utf8').split('\n')
  .map((l, i) => [i + 1, l]).filter(([, l]) => l.includes('lib-search__clear'));
const base = readFileSync(`${R}/src/ui/base.css`, 'utf8').split('\n').map((l, i) => [i + 1, l]).filter(([, l]) => l.startsWith('[hidden]'));

console.log(JSON.stringify({
  before, actual_afterEmptyStateClear: after, control_afterFieldClear: control,
  expected_afterEmptyStateClear: { inputValue: '', clearHidden: true },
  css_rules: css, hidden_rule: base,
  note: 'في المتصفح: clearHidden=false مع الحقل الفارغ ⇒ القاعدة :placeholder-shown تجعل الزر opacity:0 وهو قابل للتركيز بـTab بعد الحقل',
}, null, 2));
