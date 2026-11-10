// تفضيلات الإصدار الثاني (عقد data-model §١٤): القاموس بحدوده، وحد سرعة القراءة، ومكان الحفظ؛ القراءة متسامحة لكل حقل
// والمصطلح التالف يسقط وحده، والكتابة صارمة، والدمج حتى المجموعة، وفي مفتاح مستقل لا تمسه كتابة الإعدادات.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_PREFS, GLOSSARY_LIMITS, isValidFolderName, mergePrefs, normalizePrefs, validatePrefs,
} from '../../../src/core/model/prefs.js';
import { createStore } from '../../../src/core/store/index.js';
import { createMemoryArea } from '../../helpers/chrome-storage.js';
import { samplePrefs } from '../../helpers/fixtures-v2.js';

const term = (source, target = 'مقابل', note = null) => ({ source, target, note });

test('الافتراضيات صالحة: قاموس فارغ مرفق، وحد القراءة الافتراضي، ومجلد التنزيلات وTarjuman', () => {
  assert.equal(validatePrefs(structuredClone(DEFAULT_PREFS)).ok, true);
  assert.deepEqual(normalizePrefs(undefined), structuredClone(DEFAULT_PREFS));
  assert.equal(DEFAULT_PREFS.saveLocation.mode, 'downloads');
  assert.equal(validatePrefs(samplePrefs()).ok, true);
});

test('الكتابة صارمة: الحدود، والسطر الواحد، والتكرار دون حالة الأحرف، والمفاتيح المجهولة', () => {
  const bad = (patch) => validatePrefs(mergePrefs(structuredClone(DEFAULT_PREFS), patch)).ok;
  assert.equal(bad({ glossary: { terms: [term('x'.repeat(81))] } }), false);
  assert.equal(bad({ glossary: { terms: [term('x', 'ع'.repeat(81))] } }), false);
  assert.equal(bad({ glossary: { terms: [term('x', 'ع', 'م'.repeat(121))] } }), false);
  assert.equal(bad({ glossary: { terms: [term(' padded ')] } }), false, 'مشذّب');
  assert.equal(bad({ glossary: { terms: [term(`a${String.fromCharCode(10)}b`)] } }), false, 'سطر واحد');
  assert.equal(bad({ glossary: { terms: [term('Prompt'), term('prompt')] } }), false, 'مكرر');
  assert.equal(bad({ glossary: { terms: Array.from({ length: GLOSSARY_LIMITS.maxTerms + 1 }, (_, i) => term(`t${i}`)) } }), false);
  assert.equal(bad({ glossary: { terms: Array.from({ length: GLOSSARY_LIMITS.maxTerms }, (_, i) => term(`t${i}`)) } }), true);
  assert.equal(bad({ review: { maxCps: 4 } }), false);
  assert.equal(bad({ review: { maxCps: 17 } }), true);
  assert.equal(bad({ saveLocation: { mode: 'desktop' } }), false);
  assert.equal(bad({ saveLocation: { folder: 'a/b' } }), false);
  assert.equal(bad({ extra: 1 }), false);
  assert.equal(bad({ glossary: { terms: [{ ...term('a'), x: 1 }] } }), false);
});

test('اسم المجلد الفرعي: مجلد واحد داخل التنزيلات بلا فواصل ولا رموز محجوزة ولا أسماء Windows المحجوزة', () => {
  for (const ok of ['Tarjuman', 'ترجماتي', 'My subs 2026', 'a-b_c.d']) assert.equal(isValidFolderName(ok), true, ok);
  for (const no of ['', 'a/b', 'a\\b', '..', '.hidden', 'trail.', ' lead', 'a:b', 'a*b', 'a?b', 'a"b', 'a<b', 'a|b', 'CON', 'nul', 'COM1', 'lpt9.txt', 'x'.repeat(61), `a${String.fromCharCode(0)}b`]) {
    assert.equal(isValidFolderName(no), false, JSON.stringify(no));
  }
});

test('القراءة متسامحة: الحقل التالف يعود افتراضيه، والمصطلح التالف أو المكرر يسقط وحده دون فقد البقية', () => {
  const raw = {
    schema: 1,
    glossary: { attach: 'yes', terms: [term('prompt', 'موجِّه'), { source: 1 }, term('PROMPT'), term('token', 'رمز', 'في سياق النماذج')] },
    review: { maxCps: 999 },
    saveLocation: { mode: 'subfolder', folder: '../../etc' },
  };
  const p = normalizePrefs(raw);
  assert.equal(p.glossary.attach, true);
  assert.deepEqual(p.glossary.terms.map((t) => t.source), ['prompt', 'token']);
  assert.equal(p.review.maxCps, null);
  assert.deepEqual(p.saveLocation, { mode: 'subfolder', folder: 'Tarjuman' });
  assert.equal(validatePrefs(p).ok, true);
});

test('التخزين: مفتاح prefs مستقل؛ كتابة الإعدادات لا تمسه، وكتابته لا تمس الإعدادات، ويصل حدثه', async () => {
  const area = createMemoryArea({ unlimited: true });
  const store = createStore({ area });
  const events = [];
  store.onChange((c) => events.push(c));
  await store.setPrefs({ glossary: { terms: [term('prompt', 'موجِّه')] }, saveLocation: { mode: 'ask' } });
  await store.setSettings({ offsetStepMs: 1000 });
  const p = await store.getPrefs();
  assert.equal(p.glossary.terms.length, 1);
  assert.equal(p.saveLocation.mode, 'ask');
  assert.equal(p.saveLocation.folder, 'Tarjuman', 'الدمج حتى المجموعة');
  assert.equal((await store.getSettings()).offsetStepMs, 1000);
  assert.equal(Object.keys(area.dump().settings).includes('glossary'), false, 'لا حقل جديد في settings');
  await assert.rejects(store.setPrefs({ review: { maxCps: 2 } }), (e) => e.code === 'MD_INVALID');
  await area.flush();
  assert.ok(events.some((e) => e.prefs && e.prefs.newValue.saveLocation.mode === 'ask'));
});

test('تفضيلات الواجهة (product-spec §٦.٦): زر اللوحة مفعّل، والصور مطفأة حتى تُفعَّل (و2)، واللوحة مغلقة ومع الأصل افتراضيًا؛ والقراءة متسامحة والكتابة صارمة', () => {
  assert.deepEqual(DEFAULT_PREFS.ui, { thumbnails: false, panelEntry: true, panelOpen: false, panelDual: true });
  const old = structuredClone(DEFAULT_PREFS);
  delete old.ui;
  assert.deepEqual(normalizePrefs(old).ui, DEFAULT_PREFS.ui, 'تفضيلات الإصدار الثاني بلا ui تُقرأ بالافتراضي');
  assert.equal(validatePrefs(old).ok, false, 'الكتابة تشترط المجموعة كاملة');
  const broken = { ...structuredClone(DEFAULT_PREFS), ui: { thumbnails: 'نعم', panelEntry: false, panelOpen: 1, panelDual: false } };
  assert.deepEqual(normalizePrefs(broken).ui, { thumbnails: false, panelEntry: false, panelOpen: false, panelDual: false }, 'التالف وحده يعود افتراضيه (الصور مطفأة منذ و2)');
  assert.equal(validatePrefs({ ...structuredClone(DEFAULT_PREFS), ui: { ...DEFAULT_PREFS.ui, extra: true } }).ok, false);
});
