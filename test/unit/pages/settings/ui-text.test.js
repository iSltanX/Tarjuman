// مراجعة نصوص الواجهة في الإعدادات: ما يتغير فيه السلوك مع النص (ق-2 وق-6 وق-7)، وصيغ العدّ (م-036 وم-070 وم-074).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_PREFS } from '../../../../src/core/model/prefs.js';
import { DEFAULT_SETTINGS } from '../../../../src/core/model/settings.js';
import { createStore } from '../../../../src/core/store/index.js';
import { restoreChangedLine } from '../../../../src/pages/settings/data.js';
import { LANGS_TEXT, undeterminedLine } from '../../../../src/pages/settings/langs.js';
import { sectionReset } from '../../../../src/pages/settings/model.js';
import { createSettings } from '../../../../src/pages/settings/view.js';
import { createMemoryArea } from '../../../helpers/chrome-storage.js';
import { NOW } from '../../../helpers/fixtures.js';
import { findAll, newDocument, settle, textOf } from '../library/fake-dom.js';

async function mountSettings({ patchStore = () => {} } = {}) {
  let t = Date.parse(NOW);
  const area = createMemoryArea({ unlimited: true });
  const store = createStore({ area, now: () => (t += 1000) });
  patchStore(store);
  await area.flush();
  const doc = newDocument();
  const settings = createSettings({
    store, doc, version: '2.0.0', clipboardWrite: async () => {}, diagnosticsText: async () => '{}',
    confirm: async () => false, setTimer: () => 0, clearTimer: () => {},
    nav: { get: () => 'langs', set: () => {}, onChange: () => () => {} },
  });
  doc.body.append(settings.root);
  await settings.load();
  await settle(20);
  const section = (id) => settings.root.querySelector(`section[data-section="${id}"]`);
  const unknownText = () => textOf(section('langs').querySelector('.st-lang-unknown__line'));
  return { settings, store, doc, section, unknownText };
}

test('م-036: عدّاد الترجمات بلا لغة بصيغ العدّ، والمثنى مجرور بعد «في»', () => {
  assert.equal(undeterminedLine(1, 1), 'ترجمة واحدة في فيديو واحد');
  assert.equal(undeterminedLine(2, 2), 'ترجمتان في فيديوهين');
  assert.equal(undeterminedLine(3, 3), '3 ترجمات في 3 فيديوهات');
  assert.equal(undeterminedLine(3, 12), '3 ترجمات في 12 فيديو');
  assert.equal(undeterminedLine(3, 100), '3 ترجمات في 100 فيديو');
});

test('م-074: رسالة تغيّر الفيديوهات بعد المعاينة تطابق العدد فعلًا وضميرًا', () => {
  assert.equal(restoreChangedLine(1), 'تغيّر فيديو واحد بعد المعاينة فلم يُستبدل. أعد المعاينة إن أردت استبداله.');
  assert.equal(restoreChangedLine(2), 'تغيّر فيديوهان بعد المعاينة فلم يُستبدلا. أعد المعاينة إن أردت استبدالهما.');
  assert.equal(restoreChangedLine(3), 'تغيّرت 3 فيديوهات بعد المعاينة فلم تُستبدل. أعد المعاينة إن أردت استبدالها.');
  assert.equal(restoreChangedLine(11), 'تغيّر 11 فيديو بعد المعاينة فلم يُستبدل. أعد المعاينة إن أردت استبداله.');
});

test('ق-7: زر كل قسم يعيد عتبته وحدها — «التصدير» حد نقص الأصل، و«المقارنة» فرق التوقيت', () => {
  const changed = { ...DEFAULT_SETTINGS, thresholds: { ...DEFAULT_SETTINGS.thresholds, completeness: 0.5 } };
  assert.equal(sectionReset(changed, 'export', DEFAULT_PREFS).isDefault, false);
  assert.deepEqual(sectionReset(changed, 'export', DEFAULT_PREFS).patch.thresholds, { completeness: DEFAULT_SETTINGS.thresholds.completeness });
  assert.equal(sectionReset(changed, 'compare', DEFAULT_PREFS).isDefault, true, 'تغيّر حد النقص لا يخص «المقارنة»');
  const drifted = { ...DEFAULT_SETTINGS, thresholds: { ...DEFAULT_SETTINGS.thresholds, driftMs: 500 } };
  assert.equal(sectionReset(drifted, 'export', DEFAULT_PREFS).isDefault, true, 'تغيّر فرق التوقيت لا يخص «التصدير»');
  assert.deepEqual(sectionReset(drifted, 'compare', DEFAULT_PREFS).patch, { thresholds: { driftMs: DEFAULT_SETTINGS.thresholds.driftMs } });
});

test('ق-7: حقل «حد التنبيه إلى نقص الأصل» في «التصدير» بعد «شكل المقاطع الافتراضي»، ولا يبقى في «المقارنة»', async () => {
  const m = await mountSettings();
  const labelsIn = (id) => findAll(m.section(id), (e) => e.classList?.contains('tj-num')).map((f) => textOf(f.querySelector('label')));
  assert.ok(labelsIn('export').includes('حد التنبيه إلى نقص الأصل'));
  assert.equal(labelsIn('compare').includes('حد التنبيه إلى نقص الأصل'), false);
  const text = textOf(m.section('export'));
  assert.ok(text.indexOf('شكل المقاطع الافتراضي') < text.indexOf('حد التنبيه إلى نقص الأصل'));
  assert.ok(text.indexOf('حد التنبيه إلى نقص الأصل') < text.indexOf('تقسيم الملفات الطويلة'));
});

test('م-038 وم-078: قسمان بلا وصف لا يتركان عنصرًا فارغًا تحت العنوان', async () => {
  const m = await mountSettings();
  for (const id of ['timing', 'about']) {
    const titles = m.section(id).querySelector('.st-section__titles');
    assert.ok(titles.querySelector('p') === null, id);
  }
});

test('ق-2: فشل قراءة الفهرس لا يطمئن المستخدم', async () => {
  const m = await mountSettings({ patchStore: (s) => { s.listIndex = async () => { throw new Error('تعذر'); }; } });
  await m.settings.langs.countUnknown();
  assert.equal(m.unknownText(), LANGS_TEXT.unknownUnread);
  assert.equal(LANGS_TEXT.unknownUnread, 'تعذّر التحقق من لغات الترجمات المحفوظة. أعد فتح القسم للمحاولة مجددًا.');
});

test('ق-2: فشل بعض الحزم يقول إن الأعداد تخص ما قُرئ، وفشلها كلها كفشل الفهرس', async () => {
  const entries = [{ videoId: 'aaaaaaaaaaa' }, { videoId: 'bbbbbbbbbbb' }];
  const partial = await mountSettings({
    patchStore: (s) => {
      s.listIndex = async () => entries;
      s.getBundle = async (id) => { if (id === 'aaaaaaaaaaa') throw new Error('تعذر'); return null; };
    },
  });
  await partial.settings.langs.countUnknown();
  assert.equal(partial.unknownText(), LANGS_TEXT.unknownPartial);

  const all = await mountSettings({
    patchStore: (s) => {
      s.listIndex = async () => entries;
      s.getBundle = async () => { throw new Error('تعذر'); };
    },
  });
  await all.settings.langs.countUnknown();
  assert.equal(all.unknownText(), LANGS_TEXT.unknownUnread);
});

test('ق-2: نجاح القراءة بلا ترجمات غير محددة يبقي الجملة المطمئنة', async () => {
  const m = await mountSettings();
  await m.settings.langs.countUnknown();
  assert.equal(m.unknownText(), LANGS_TEXT.unknownNone);
});
