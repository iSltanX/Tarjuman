// الجولة الرابعة (بند سلطان): اسم ملف النسخة الاحتياطية بعد «أُنشئت النسخة الاحتياطية: …» كان يُلحق بالجملة العربية بلا عزل، فإن انكسر
// سطره بعد «tarjuman-» تُرتَّب أجزاؤه سطرًا سطرًا مع الجملة. الآن هو معزول LTR، والتنبيه يرسمه عنصرًا ذريًا يلتف داخله.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createBackup } from '../../../../src/core/backup/index.js';
import { messageFor, TjError } from '../../../../src/core/errors/index.js';
import { createStore } from '../../../../src/core/store/index.js';
import { createSettings } from '../../../../src/pages/settings/view.js';
import { createMemoryArea } from '../../../helpers/chrome-storage.js';
import { NOW, videoRecord } from '../../../helpers/fixtures.js';
import { sampleBundle, seedBundle } from '../../../helpers/fixtures-v2.js';
import { buttonNamed, findAll, newDocument, settle, textOf } from '../library/fake-dom.js';

const LRI = String.fromCodePoint(0x2066);
const FSI = String.fromCodePoint(0x2068);
const PDI = String.fromCodePoint(0x2069);

/** إعدادات فوق مخزن معطى، وsaveFile وpickFile وconfirm بسيطة. */
async function mount(store, { pick = null, answer = false } = {}) {
  const doc = newDocument();
  const saves = [];
  const settings = createSettings({
    store, doc, version: '0.3.0', now: () => Date.parse('2026-11-02T10:00:00.000Z'), pause: () => Promise.resolve(),
    clipboardWrite: async () => {}, diagnosticsText: async () => '{}',
    saveFile: async (file) => { saves.push(file); return { ok: true, mode: 'downloads', downloadId: saves.length }; },
    savedPath: async () => null, pickFile: async () => pick, confirm: async () => answer, setTimer: () => 0, clearTimer: () => {},
  });
  doc.body.append(settings.root);
  await settings.load();
  const sec = findAll(settings.root, (e) => e.tagName === 'section' && textOf(e.querySelector('h2') ?? { textContent: '' }) === 'النسخ الاحتياطي')[0];
  return { settings, sec, saves };
}

test('«أُنشئت النسخة الاحتياطية: …» واسم ملفها عنصر bdi ذري معزول LTR يلتف داخله، والجملة خارجه', async () => {
  let t = Date.parse(NOW);
  const area = createMemoryArea({ unlimited: true });
  const store = createStore({ area, now: () => (t += 1000) });
  await seedBundle(store, sampleBundle());
  await area.flush();
  const doc = newDocument();
  const saves = [];
  const settings = createSettings({
    store, doc, version: '0.3.0', now: () => Date.parse('2026-11-02T10:00:00.000Z'), pause: () => Promise.resolve(),
    clipboardWrite: async () => {}, diagnosticsText: async () => '{}',
    saveFile: async (file) => { saves.push(file); return { ok: true, mode: 'downloads', downloadId: saves.length }; },
    savedPath: async () => null, pickFile: async () => null, confirm: async () => false, setTimer: () => 0, clearTimer: () => {},
  });
  doc.body.append(settings.root);
  await settings.load();
  const sec = findAll(settings.root, (e) => e.tagName === 'section' && textOf(e.querySelector('h2') ?? { textContent: '' }) === 'النسخ الاحتياطي')[0];
  buttonNamed(sec, 'إنشاء نسخة احتياطية').click();
  await settle(10);
  const name = saves[0].name;
  assert.equal(name, 'tarjuman-backup-2026-11-02.json');
  const p = findAll(sec, (e) => e.tagName === 'p' && e.classList.contains('tj-alert__text') && e.textContent.includes('أُنشئت النسخة الاحتياطية'))[0];
  assert.equal(p.textContent, `أُنشئت النسخة الاحتياطية: فيديو واحد. ${LRI}${name}${PDI}`);
  const iso = findAll(p, (e) => e.tagName === 'bdi')[0];
  assert.ok(iso, 'الاسم داخل عنصر');
  assert.equal(iso.dir, 'ltr');
  assert.ok(iso.classList.contains('tj-ltr--wrap'));
  assert.equal(iso.textContent, `${LRI}${name}${PDI}`);
  assert.equal(p.childNodes.filter((n) => n !== iso).map((n) => n.textContent).join(''), 'أُنشئت النسخة الاحتياطية: فيديو واحد. ');
});

test('تقرير الاستعادة الجزئية: معرّف الفيديو بلا عنوان معزول LTR أمام سبب التعذّر، والعنوان معزول اتجاهًا', async () => {
  const ID = '-KA3zmDkEUQ';
  const src = createStore({ area: createMemoryArea({ unlimited: true }) });
  await src.updateVideo(ID, () => ({ ...videoRecord({ videoId: ID }), title: null }));
  await src.updateVideo('BBBBBBBBBBB', () => ({ ...videoRecord({ videoId: 'BBBBBBBBBBB' }), title: 'Talk (v2).' }));
  const built = await createBackup({ store: src, appVersion: '0.3.0', pause: () => Promise.resolve() });
  const area = createMemoryArea({ unlimited: true });
  const store = createStore({ area });
  const faulty = Object.create(store);
  faulty.restoreVideo = () => Promise.reject(new TjError('ST_WRITE_FAILED'));
  await area.flush();
  const m = await mount(faulty, { pick: { size: built.text.length, text: async () => built.text }, answer: true });
  await m.settings.data.restoreFromFile();
  await settle(10);
  const text = textOf(m.sec);
  assert.ok(text.includes(`${LRI}${ID}${PDI}: ${messageFor('ST_WRITE_FAILED')}`), 'المعرّف معزول LTR');
  assert.ok(text.includes(`${FSI}Talk (v2).${PDI}: ${messageFor('ST_WRITE_FAILED')}`), 'العنوان معزول اتجاهًا');
});
