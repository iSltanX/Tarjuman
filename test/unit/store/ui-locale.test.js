// إعداد لغة الواجهة في التخزين: التهيئة الأولى الموحّدة بين الواجهات، وأولوية المحفوظ، وعزله عن بقية الإعدادات والبيانات، والترقية.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStore, createWriter } from '../../../src/core/store/index.js';
import { KEY_UI_LOCALE, parseKey } from '../../../src/core/store/keys.js';
import { normalizeUiLocale, validateUiLocale } from '../../../src/core/model/ui-locale.js';
import { createStoreService } from '../../../src/background/store-service.js';
import { storeRequest } from '../../../src/core/model/messages.js';
import { createBackup } from '../../../src/core/backup/index.js';
import { createMemoryArea } from '../../helpers/chrome-storage.js';

const NOW = Date.parse('2026-11-08T00:00:00.000Z');
const newStore = (area = createMemoryArea({ unlimited: true })) => createStore({ area, now: () => NOW });

test('التهيئة الأولى تُحفظ بمصدرها، والمفتاح معروف ومستقل', async () => {
  const area = createMemoryArea({ unlimited: true });
  const store = newStore(area);
  assert.equal(await store.getUiLocale(), null);
  const rec = await store.initUiLocale({ youtube: 'ar-SA', browser: 'en-US' });
  assert.deepEqual(rec, { schema: 1, locale: 'ar', source: 'youtube', at: new Date(NOW).toISOString() });
  assert.deepEqual(await store.getUiLocale(), rec);
  assert.deepEqual(parseKey(KEY_UI_LOCALE), { kind: 'uiLocale' });
});

test('واجهات مفتوحة معًا بإشارات مختلفة تنتهي إلى اختيار واحد: الأول يحسم', async () => {
  const area = createMemoryArea({ unlimited: true });
  const [a, b, c] = [newStore(area), newStore(area), newStore(area)];
  const out = await Promise.all([
    a.initUiLocale({ youtube: 'en-US', browser: 'ar' }),
    b.initUiLocale({ youtube: null, browser: 'ar' }),
    c.initUiLocale({ youtube: 'fr', browser: 'ar' }),
  ]);
  assert.deepEqual(out.map((r) => r.locale), ['en', 'en', 'en']);
  assert.deepEqual(out[1], out[0]);
  assert.equal((await a.getUiLocale()).source, 'youtube');
});

test('الاختيار المحفوظ يغلب إشارات يوتيوب والمتصفح اللاحقة', async () => {
  const store = newStore();
  await store.setUiLocale('en');
  const again = await store.initUiLocale({ youtube: 'ar', browser: 'ar' });
  assert.equal(again.locale, 'en');
  assert.equal(again.source, 'user');
});

test('التبديل بين اللغتين يُحفظ ويُستعاد من سياق جديد، ويصل حدثه إلى السياقات الأخرى', async () => {
  const area = createMemoryArea({ unlimited: true });
  const a = newStore(area);
  const b = newStore(area);
  const seen = [];
  const off = b.onChange((c) => { if (c.uiLocale) seen.push(c.uiLocale.newValue.locale); });
  await a.setUiLocale('en');
  await a.setUiLocale('ar');
  await area.flush?.();
  off();
  assert.deepEqual(seen, ['en', 'ar']);
  assert.equal((await newStore(area).getUiLocale()).locale, 'ar');
});

test('قيمة غير مدعومة تُرفض ولا تُكتب', async () => {
  const area = createMemoryArea({ unlimited: true });
  const store = newStore(area);
  await assert.rejects(store.setUiLocale('fr'), /./);
  assert.equal(await store.getUiLocale(), null);
});

test('القيمة التالفة تعيد التهيئة، واللغة الصالحة في قيمة ناقصة تبقى', async () => {
  assert.equal(normalizeUiLocale({ locale: 'fr' }), null);
  assert.equal(normalizeUiLocale('ar'), null);
  assert.equal(normalizeUiLocale({ locale: 'ar' }).locale, 'ar');
  assert.ok(validateUiLocale(normalizeUiLocale({ locale: 'ar' })).ok);
  const area = createMemoryArea({ unlimited: true, initial: { [KEY_UI_LOCALE]: { schema: 9, locale: 'xx' } } });
  const rec = await newStore(area).initUiLocale({ youtube: 'en' });
  assert.equal(rec.locale, 'en');
});

test('ترقية نسخة قائمة بلا الإعداد: تُهيَّأ اللغة وتبقى الإعدادات والتفضيلات وتفضيلات اللغات كما هي', async () => {
  const area = createMemoryArea({ unlimited: true });
  const store = newStore(area);
  await store.setSettings({ offsetStepMs: 300 });
  await store.setPrefs({ review: { maxCps: 20 } });
  await store.setLangPrefs({ pair: { from: 'fr', to: 'de' } });
  const before = { settings: await store.getSettings(), prefs: await store.getPrefs(), lang: await store.getLangPrefs() };
  await store.initUiLocale({ youtube: 'en-US' });
  await store.setUiLocale('ar');
  await store.setUiLocale('en');
  assert.deepEqual(await store.getSettings(), before.settings);
  assert.deepEqual(await store.getPrefs(), before.prefs);
  assert.deepEqual(await store.getLangPrefs(), before.lang);
});

test('«مسح كل البيانات» يُبقي لغة الواجهة، والمسح بلا لغة محفوظة لا يكتبها', async () => {
  const area = createMemoryArea({ unlimited: true });
  const store = newStore(area);
  await store.setUiLocale('en');
  await store.clearAll();
  assert.equal((await store.getUiLocale()).locale, 'en');
  const fresh = newStore();
  await fresh.clearAll();
  assert.equal(await fresh.getUiLocale(), null);
});

test('لغة الواجهة لا تدخل النسخة الاحتياطية', async () => {
  const store = newStore();
  await store.setUiLocale('en');
  const b = await createBackup({ store, appVersion: '2.0.0', pause: () => Promise.resolve() });
  assert.ok(!JSON.stringify(b).includes('uiLocale'));
});

test('سكربت المحتوى يهيّئ ولا يغيّر الاختيار، وصفحات الإضافة تغيّره', async () => {
  const runtime = { id: 'ext', getURL: (p) => `chrome-extension://ext/${p}`, onMessage: { addListener() {}, removeListener() {} } };
  const content = { id: 'ext', tab: { id: 7 }, url: 'https://www.youtube.com/watch?v=AAAAAAAAAAA' };
  const page = { id: 'ext', url: 'chrome-extension://ext/pages/settings/index.html' };
  const area = createMemoryArea({ unlimited: true });
  const svc = createStoreService({ runtime, writer: createWriter({ area }) });
  const at = new Date(NOW).toISOString();
  const init = await svc.handle(storeRequest('uiLocaleInit', { youtube: 'ar', browser: 'en', at }, 'wid-ui-000001'), content);
  assert.equal(init.ok, true);
  const denied = await svc.handle(storeRequest('uiLocale', { locale: 'en', at }, 'wid-ui-000002'), content);
  assert.deepEqual([denied.ok, denied.code], [false, 'TJ_BAD_MESSAGE']);
  const allowed = await svc.handle(storeRequest('uiLocale', { locale: 'en', at }, 'wid-ui-000003'), page);
  assert.equal(allowed.ok, true);
});
