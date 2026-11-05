// TJ-AUD-017b: حوار الرفع بمرجعين: سطر #…-why (aria-describedby للقائمة) لا يتحدث بتغيير المرجع، بينما تنبيه المقارنة يتحدث.
const T = '$SCRATCH/tj';
const { createStore } = await import(`${T}/src/core/store/index.js`);
const { createLibrary } = await import(`${T}/src/pages/library/view.js`);
const { writeSrt } = await import(`${T}/src/core/srt/writer.js`);
const { createMemoryArea } = await import(`${T}/test/helpers/chrome-storage.js`);
const { NOW, makeCues } = await import(`${T}/test/helpers/fixtures.js`);
const { sampleBundle, seedBundle } = await import(`${T}/test/helpers/fixtures-v2.js`);
const { newDocument, settle, textOf, buttonNamed } = await import(`${T}/test/unit/pages/library/fake-dom.js`);

const ID = 'AAAAAAAAAAA';
let t = Date.parse(NOW);
const area = createMemoryArea({ unlimited: true });
const store = createStore({ area, now: () => (t += 1000) });
await seedBundle(store, sampleBundle({ videoId: ID }));
await area.flush();
const b = await store.getBundle(ID);
console.log('البصمات:', b.record.fingerprints.map((f) => `${f.id}(${f.mode},${f.count})`).join(' | '));
let seen = null;
const doc = newDocument();
const lib = createLibrary({
  store, doc, now: () => Date.parse(NOW) + 3600e3, openTab: async () => {}, openPage: async () => {}, saveFile: async () => ({ ok: true }),
  clipboardWrite: async () => {}, diagnosticsText: async () => '{}',
  pickFiles: async () => [new File([writeSrt(makeCues(5).map((c) => ({ ...c, text: `جديد ${c.n}` })))], 'x.ar.srt')],
  confirm: async (o) => { seen = o; return false; },
});
doc.body.append(lib.root);
await lib.load();
const row = lib.root.querySelector('li.lib-row');
buttonNamed(row, 'المزيد').click();
row.querySelectorAll('[role=menuitem]').find((i) => textOf(i).startsWith('رفع ترجمة')).click();
await settle(20);
const content = seen?.content;
const select = content?.querySelector('select.lib-up__ref');
if (!select) { console.log('لا قائمة مرجع (بصمة واحدة؟)'); process.exit(0); }
const why = content.querySelector(`#${select.getAttribute('aria-describedby')}`);
const alertText = () => textOf(content.querySelector('.lib-up__compare'));
console.log('الخيارات:', select.querySelectorAll('option').map((o) => `${o.getAttribute('value') || '∅'}=${textOf(o)}`).join(' | '));
console.log('قبل: المختار =', select.value, '| why =', JSON.stringify(textOf(why)), '| المقارنة =', JSON.stringify(alertText().slice(0, 60)));
const other = select.querySelectorAll('option').map((o) => o.getAttribute('value')).find((v) => v && v !== select.value);
select.value = other;
select.dispatchEvent({ type: 'change' });
console.log('بعد: المختار =', select.value, '| why =', JSON.stringify(textOf(why)), '| المقارنة =', JSON.stringify(alertText().slice(0, 60)));
select.value = '';
select.dispatchEvent({ type: 'change' });
console.log('«بلا مرجع»: why =', JSON.stringify(textOf(why)), '| المقارنة =', JSON.stringify(alertText().slice(0, 60)));
