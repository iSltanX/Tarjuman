// S1 وTJ-AUD-008b: موافقة صور المحفوظات في Firefox تُقرأ عند load وعند تغيّر prefs وحدهما. نسحبها (permissions.getAll بلا
// browsingActivity) دون أي كتابة في التخزين، ثم نضغط «عرض المزيد» أو نبحث أو نفرز، ونعدّ عناوين i.ytimg.com الجديدة.
// وفي الإعدادات: هل يُعاد فحص الموافقة عند تغيّر prefs من تبويب آخر؟
const T = '$SCRATCH/tj';
const { createStore } = await import(`${T}/src/core/store/index.js`);
const { createLibrary } = await import(`${T}/src/pages/library/view.js`);
const { createSettings } = await import(`${T}/src/pages/settings/view.js`);
const { thumbnailsConsent } = await import(`${T}/src/core/consent/thumbnails.js`);
const { createMemoryArea } = await import(`${T}/test/helpers/chrome-storage.js`);
const { videoRecord } = await import(`${T}/test/helpers/fixtures.js`);
const { newDocument, settle, findAll, buttonNamed } = await import(`${T}/test/unit/pages/library/fake-dom.js`);

const ID = (n) => `V${String(n).padStart(10, '0')}`;
const area = createMemoryArea({ unlimited: true });
let clock = Date.parse('2026-11-01T12:00:00Z');
const store = createStore({ area, now: () => clock });
for (let i = 1; i <= 51; i++) {
  clock += 1000;
  await store.updateVideo(ID(i), () => ({ ...videoRecord({ videoId: ID(i) }), title: `عنوان ${i}` }));
}
await area.flush();

// permissions.getAll الحقيقية عبر thumbnailsConsent (هدف firefox) بمحاكاة القائمة.
let dataCollection = ['browsingActivity'];
const api = { permissions: { getAll: async () => ({ origins: [], permissions: [], data_collection: [...dataCollection] }) } };
const timers = [];
const doc = newDocument();
const lib = createLibrary({
  store, doc, now: () => clock, openTab: async () => {}, openPage: async () => {}, saveFile: async () => ({ ok: true }),
  clipboardWrite: async () => {}, pickFiles: async () => null, diagnosticsText: async () => '{}', confirm: async () => false,
  setTimer: (fn, ms) => { timers.push(fn); return timers.length; }, clearTimer: () => {},
  thumbsConsent: () => thumbnailsConsent(api, 'firefox'),
});
doc.body.append(lib.root);
await lib.load();
await settle(5);
const srcs = () => findAll(lib.root, (e) => e.tagName === 'img').map((e) => e.getAttribute('src'));
const before = new Set(srcs());
console.log('بعد التحميل والموافقة ممنوحة: صفوف =', lib.root.querySelectorAll('li.lib-row').length, '| صور =', before.size, '| thumbsGranted =', lib.state.thumbsGranted);

// سحب الموافقة من about:addons: لا كتابة في التخزين ولا حدث.
dataCollection = [];
console.log('سُحبت الموافقة. قراءتها الآن =', await thumbnailsConsent(api, 'firefox'), '| state.thumbsGranted ما زال =', lib.state.thumbsGranted);

// «عرض المزيد»
const more = buttonNamed(lib.root, 'عرض المزيد');
console.log('زر «عرض المزيد» موجود:', Boolean(more));
more.click();
await settle(5);
const after = srcs();
const fresh = after.filter((s) => !before.has(s));
console.log('بعد «عرض المزيد»: صور =', after.length, '| عناوين جديدة لم تكن قبل السحب =', fresh.length, fresh);

// البحث وإعادة الرسم: كل الصور تُبنى عقدًا جديدة بعنوانها
const imgNodesBefore = new Set(findAll(lib.root, (e) => e.tagName === 'img'));
const search = lib.root.querySelector('input[type="search"]');
search.value = 'عنوان 5';
search.dispatchEvent({ type: 'input' });
await settle(3);
const imgsAfterSearch = findAll(lib.root, (e) => e.tagName === 'img');
console.log('بعد البحث: صور =', imgsAfterSearch.length, '| عقد img جديدة (لم تكن قبل) =', imgsAfterSearch.filter((n) => !imgNodesBefore.has(n)).length, '| loading =', imgsAfterSearch[0]?.getAttribute('loading'));

// تغيّر فيديو من تبويب آخر يستدعي load() فيعيد قراءة الموافقة
clock += 1000;
await store.updateVideo(ID(1), (r) => ({ ...r, title: 'عنوان معدّل' }));
await area.flush();
for (const fn of timers.splice(0)) fn();
await settle(10);
console.log('بعد تغيّر فيديو (load): thumbsGranted =', lib.state.thumbsGranted, '| صور =', srcs().length);
lib.dispose();

// ---- TJ-AUD-008b: المنح من تبويب الإعدادات ثم تبويب المحفوظات ----
console.log('\n--- 008b: منح الموافقة من الإعدادات والتفضيل مكتوب سابقًا بـthumbnails=true ---');
await store.setPrefs({ ui: { thumbnails: true } }); // التفضيل مكتوب سابقًا
await area.flush();
dataCollection = [];
const doc2 = newDocument();
const lib2 = createLibrary({
  store, doc: doc2, now: () => clock, openTab: async () => {}, openPage: async () => {}, saveFile: async () => ({ ok: true }),
  clipboardWrite: async () => {}, pickFiles: async () => null, diagnosticsText: async () => '{}', confirm: async () => false,
  thumbsConsent: () => thumbnailsConsent(api, 'firefox'),
});
doc2.body.append(lib2.root);
await lib2.load();
await settle(5);
console.log('المحفوظات قبل المنح: صور =', findAll(lib2.root, (e) => e.tagName === 'img').length);
const sdoc = newDocument();
const sdocB = newDocument();
const mk = (d) => createSettings({
  store, version: '1.1.0', doc: d, clipboardWrite: async () => {}, diagnosticsText: async () => '{}',
  thumbsConsent: { needed: true, check: () => thumbnailsConsent(api, 'firefox'), request: async () => { dataCollection = ['browsingActivity']; return true; } },
});
const st = mk(sdoc);
const stB = mk(sdocB); // تبويب إعدادات ثانٍ
sdoc.body.append(st.root); sdocB.body.append(stB.root);
await st.load(); await stB.load();
const sw = st.root.querySelector('#st-ui-thumbnails');
const swB = stB.root.querySelector('#st-ui-thumbnails');
console.log('مفتاح الإعدادات قبل المنح (أ، ب):', sw.checked, swB.checked);
// محاكاة: المتجر في الذاكرة يطلق onChanged لكل set ولو تطابقت القيمة (كـFirefox على الأرجح؛ Chrome لا يطلقه للقيم المتطابقة)
let events = 0;
const off = store.onChange((c) => { if (c.prefs) events++; });
sw.checked = true;
sw.dispatchEvent({ type: 'change' });
await settle(5); await area.flush(); await settle(10);
off();
console.log('أحداث prefs بعد الكتابة المتطابقة في المحاكاة =', events, '| المحفوظات بعد المنح: صور =', findAll(lib2.root, (e) => e.tagName === 'img').length);
console.log('تبويب الإعدادات ب بعد المنح من أ: المفتاح =', swB.checked, '(يقرأ الموافقة عند load وحده؟)');
// السحب ثم تغيّر prefs آخر: الإعدادات لا تعيد قراءة الموافقة
dataCollection = [];
await store.setPrefs({ ui: { panelOpen: true } });
await area.flush(); await settle(10);
console.log('بعد سحب الموافقة وتغيّر prefs آخر: مفتاح الإعدادات أ =', sw.checked, '| المحفوظات صور =', findAll(lib2.root, (e) => e.tagName === 'img').length);
lib2.dispose(); st.dispose(); stB.dispose();
