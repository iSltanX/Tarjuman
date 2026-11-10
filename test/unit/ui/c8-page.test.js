// تدقيق 7a66f91، U103 (T-01): src/ui/page.js (تشغيل الصفحة وحدّ الأخطاء وفتح الصفحات) لم يكن يحمّله أي اختبار. وإعادتا التصدير
// pages/library/menu.js وicons.js حُذفتا (ح6): لم يستوردهما شيء.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startPage, openPage, extensionVersion } from '../../../src/ui/page.js';
import { TjError } from '../../../src/core/errors/index.js';
import { FakeDocument, FakeElement, textOf } from '../pages/library/fake-dom.js';

/** مستند وهمي بما يحتاجه startPage: getElementById وbody.appendChild وclassList وparentNode.insertBefore. */
function pageDoc({ withApp = false } = {}) {
  const doc = new FakeDocument();
  const proto = FakeElement.prototype;
  if (!proto.appendChild) proto.appendChild = function appendChild(n) { this.append(n); return n; };
  if (withApp) {
    const app = doc.createElement('main');
    app.setAttribute('id', 'app');
    doc.body.append(app);
  }
  return doc;
}

test('startPage: يضبط العنوان وينشئ #app عند غيابه ويضيف tj-container، ويستدعي render بالحاوية', async () => {
  const doc = pageDoc();
  let got = null;
  await startPage({ title: 'المحفوظات', render: (app) => { got = app; }, doc });
  assert.equal(doc.title, 'ترجمان — المحفوظات');
  const app = doc.getElementById('app');
  assert.ok(app, 'أُنشئت الحاوية');
  assert.ok(got === app);
  assert.ok(app.classList.contains('tj-container'));
  assert.ok(!app.classList.contains('tj-container--wide'));
});

test('startPage: #app موجود يُستعمل كما هو، وwide يضيف الصنف، وnav يضيف الشريط العلوي قبل الحاوية', async () => {
  const doc = pageDoc({ withApp: true });
  const existing = doc.getElementById('app');
  await startPage({ title: 'الإعدادات', wide: true, nav: 'settings', render: async () => {}, doc });
  assert.ok(doc.getElementById('app') === existing);
  assert.ok(existing.classList.contains('tj-container--wide'));
  const bar = doc.querySelectorAll('header.tj-topbar')[0];
  assert.ok(bar, 'الشريط العلوي');
  const current = doc.querySelectorAll('a[aria-current="page"]');
  assert.equal(current.length, 1);
  assert.ok(textOf(current[0]).includes('الإعدادات'));
  assert.ok([...doc.body.children].indexOf(bar) < [...doc.body.children].indexOf(existing), 'قبل الحاوية');
});

test('startPage: render يرمي TjError: تنبيه خطر بالرسالة العربية والرمز بدل صفحة بيضاء، ولا يرمي startPage', async () => {
  const doc = pageDoc();
  await startPage({ title: 'ت', render: () => { throw new TjError('ST_READ_FAILED'); }, doc });
  const text = textOf(doc.getElementById('app'));
  assert.ok(text.includes('تعذّر عرض الصفحة'), text);
  assert.ok(text.includes('(ST_READ_FAILED)'), text);
});

test('startPage: خطأ عام غير TjError (وعد مرفوض) يُعرض كذلك برمز عام', async () => {
  const doc = pageDoc();
  await startPage({ title: 'ت', render: async () => { throw new Error('عطل'); }, doc });
  const text = textOf(doc.getElementById('app'));
  assert.ok(text.includes('تعذّر عرض الصفحة'));
  assert.match(text, /\([A-Z_]+\)/, 'رمز بين قوسين');
});

test('openPage: يبني عنوان الصفحة من getURL، ومعها v وhash اختياريان، ويعيد وعد tabs.create', async () => {
  const created = [];
  const api = {
    runtime: { getURL: (p) => `chrome-extension://tj/${p}` },
    tabs: { create: async (o) => { created.push(o); return { id: 7 }; } },
  };
  const tab = await openPage('library', undefined, { api });
  assert.deepEqual(tab, { id: 7 });
  assert.match(created[0].url, /^chrome-extension:\/\/tj\/.*library/);
  assert.ok(!created[0].url.includes('#'));
  await openPage('editor', { v: 'AAAAAAAAAAA' }, { api, hash: 'q=hi' });
  assert.match(created[1].url, /editor.*\?v=AAAAAAAAAAA#q=hi$/);
  assert.throws(() => openPage('nope', undefined, { api }), RangeError);
  assert.throws(() => openPage('editor', { v: 'bad' }, { api }), RangeError);
});

test('extensionVersion: من البيان', () => {
  assert.equal(extensionVersion({ runtime: { getManifest: () => ({ version: '1.2.3' }) } }), '1.2.3');
});
