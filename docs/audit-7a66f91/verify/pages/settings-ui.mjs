// الإعدادات: TJ-AUD-017a (stepCustom بعد استعادة الافتراضي)، وTJ-DES-001 (استعادة «العرض» لا تشمل prefs.ui)، وL-4 (زرّا
// «استعادة الافتراضي» في التصدير)، وL-1 (كتابة #display عند التحميل)، وTJ-AUD-020 (التركيز بعد حذف مصطلح)، وL-6 (formatBytes).
import { TJ_ROOT as T } from '../_root.mjs';
const { createStore } = await import(`${T}/src/core/store/index.js`);
const { createSettings } = await import(`${T}/src/pages/settings/view.js`);
const { formatBytes } = await import(`${T}/src/ui/format.js`);
const { createMemoryArea } = await import(`${T}/test/helpers/chrome-storage.js`);
const { newDocument, settle, textOf, findAll, buttonNamed } = await import(`${T}/test/unit/pages/library/fake-dom.js`);

async function mount({ win = null } = {}) {
  const area = createMemoryArea({ unlimited: true });
  const store = createStore({ area });
  const doc = newDocument();
  if (win) doc.defaultView = win;
  const st = createSettings({ store, version: '1.1.0', doc, clipboardWrite: async () => {}, diagnosticsText: async () => '{}', setTimer: () => 0, clearTimer: () => {} });
  doc.body.append(st.root);
  await st.load();
  await settle(5);
  return { st, store, area, doc, root: st.root };
}
const segValue = (seg) => findAll(seg, (e) => e.tagName === 'input' && e.checked).map((e) => e.getAttribute('value')).join(',');

// --- TJ-AUD-017a ---
{
  const m = await mount();
  const timing = m.root.querySelector('section[data-section="timing"]');
  const seg = timing.querySelector('fieldset');
  const custom = findAll(seg, (e) => e.tagName === 'input' && e.getAttribute('value') === 'custom')[0];
  custom.checked = true;
  custom.dispatchEvent({ type: 'change' });
  const field = timing.querySelector('.st-custom input');
  field.value = '2';
  field.dispatchEvent({ type: 'change' });
  await settle(5);
  m.doc.activeElement = m.doc.body;
  console.log('017a) بعد مخصص=2: المحفوظ =', m.st.settings.offsetStepMs, '| المحدد =', segValue(seg), '| الحقل ظاهر =', !timing.querySelector('.st-custom').hidden);
  buttonNamed(timing, 'استعادة الافتراضي').click();
  await settle(10);
  console.log('017a) بعد «استعادة الافتراضي»: المحفوظ =', m.st.settings.offsetStepMs, '| المحدد =', segValue(seg), '| الحقل ظاهر =', !timing.querySelector('.st-custom').hidden, '| قيمة الحقل =', field.value);
}

// --- TJ-DES-001 ---
{
  const m = await mount();
  await m.store.setPrefs({ ui: { panelOpen: true, panelEntry: false, thumbnails: false } });
  await m.store.setSettings({ displayModeDefault: 'dual' });
  await m.area.flush(); await settle(10);
  const display = m.root.querySelector('section[data-section="display"]');
  buttonNamed(display, 'استعادة الافتراضي').click();
  await settle(10);
  console.log('DES-001) بعد استعادة «العرض»: displayModeDefault =', m.st.settings.displayModeDefault, '| prefs.ui =', JSON.stringify(m.st.prefs.ui));
}

// --- L-4 ---
{
  const m = await mount();
  const exp = m.root.querySelector('section[data-section="export"]');
  const resets = findAll(exp, (e) => e.tagName === 'button' && textOf(e) === 'استعادة الافتراضي');
  console.log('L-4) أزرار «استعادة الافتراضي» في التصدير =', resets.length, '| أسماء الوصول =', resets.map((b) => b.getAttribute('aria-label') ?? textOf(b)).join(' / '));
  const all = findAll(m.root, (e) => e.tagName === 'button' && textOf(e) === 'استعادة الافتراضي').length;
  console.log('L-4) كل أزرار «استعادة الافتراضي» في الصفحة =', all, '(الأقسام مخفية إلا واحدًا)');
}

// --- L-1: الكتابة في العنوان عند التحميل بلا جزء ---
{
  const calls = [];
  const win = {
    location: { hash: '', pathname: '/pages/settings/index.html', search: '' },
    history: { replaceState: (_s, _t, url) => { calls.push(url); win.location.hash = url.slice(url.indexOf('#')); } },
    addEventListener() {}, removeEventListener() {},
    setTimeout: (fn, ms) => setTimeout(fn, ms),
  };
  const area = createMemoryArea({ unlimited: true });
  const store = createStore({ area });
  const doc = newDocument();
  doc.defaultView = win;
  createSettings({ store, version: '1.1.0', doc, clipboardWrite: async () => {}, diagnosticsText: async () => '{}' });
  console.log('L-1) replaceState عند الإنشاء (قبل أي انتظار) =', JSON.stringify(calls));
}

// --- TJ-AUD-020: حذف مصطلح من القاموس ---
{
  const m = await mount();
  await m.store.setPrefs({ glossary: { terms: [{ source: 'API', target: 'واجهة', note: null }, { source: 'token', target: 'رمز', note: null }] } });
  await m.area.flush(); await settle(10);
  const gl = m.root.querySelector('section[data-section="glossary"]');
  const del = buttonNamed(gl, 'حذف المصطلح API');
  del.focus();
  del.click();
  await settle(10);
  const a = m.doc.activeElement;
  console.log('020/glossary) بعد حذف المصطلح: التركيز متصل =', m.doc.documentElement.contains(a), '| كان =', a.getAttribute('aria-label'), '| المصطلحات =', m.st.prefs.glossary.terms.map((t) => t.source).join(','));
  // أي حفظ آخر في الصفحة يعيد بناء جدول القاموس أيضًا
  const del2 = buttonNamed(gl, 'حذف المصطلح token');
  del2.focus();
  await m.store.setSettings({ displayModeDefault: 'dual' }); // من تبويب آخر
  await m.area.flush(); await settle(10);
  console.log('020/glossary) زر حذف مركّز ثم تغيّر إعداد من تبويب آخر: التركيز متصل =', m.doc.documentElement.contains(m.doc.activeElement));
}

// --- L-6 ---
console.log('L-6) formatBytes(0) =', formatBytes(0), '| 300 =', formatBytes(300), '| 3 GiB =', formatBytes(3 * 1024 ** 3));
{
  const m = await mount();
  // فيديو بترجمة واحدة بلا بدائل ولا سابقة
  const { videoRecord } = await import(`${T}/test/helpers/fixtures.js`);
  await m.store.updateVideo('AAAAAAAAAAA', () => videoRecord({ videoId: 'AAAAAAAAAAA' }));
  await m.area.flush();
  await new Promise((r) => setTimeout(r, 400)); await settle(10);
  const storage = m.root.querySelector('section[data-section="storage"]');
  console.log('L-6) سطر السعة لمكتبة بلا بدائل ولا سابقة:', textOf(storage.querySelector('.st-library-bytes')));
}
