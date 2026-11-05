// انحدارات C2 في الإعدادات (تدقيق 7a66f91) بصفحتين حقيقيتين فوق DOM وهمي ومخزنين على مساحة واحدة. محوّلة من
// verify/storage (sto09 وsto03):
//   U13 إضافة مصطلحين من صفحتين قبل وصول الإشعار تبقيهما، وحذف مصطلح من عرض قديم لا يُضيع مصطلحًا أضيف في الأخرى.
//   U11 استبدال فيديو من نسخة احتياطية لا يقع إن تغيّر بعد المعاينة، ويُذكر في التقرير.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStore } from '../../../../src/core/store/index.js';
import { createSettings } from '../../../../src/pages/settings/view.js';
import { createBackup } from '../../../../src/core/backup/create.js';
import { readBackup } from '../../../../src/core/backup/read.js';
import { planRestore, restoreItems, runRestore } from '../../../../src/core/backup/restore.js';
import { withSlotName } from '../../../../src/core/model/bundle.js';
import { messageFor } from '../../../../src/core/errors/index.js';
import { createMemoryArea } from '../../../helpers/chrome-storage.js';
import { NOW, videoRecord } from '../../../helpers/fixtures.js';
import { sampleBundle, seedBundle } from '../../../helpers/fixtures-v2.js';
import { buttonNamed, findAll, newDocument, settle, textOf } from '../library/fake-dom.js';

const ID = 'AAAAAAAAAAA';

async function page(area) {
  let t = Date.parse(NOW);
  const store = createStore({ area, now: () => (t += 1000) });
  const doc = newDocument();
  const calls = { confirms: [] };
  const answers = [];
  let picked = null;
  const settings = createSettings({
    store, doc, version: '1.1.0', now: () => Date.parse('2026-11-05T10:00:00.000Z'), pause: () => Promise.resolve(),
    clipboardWrite: async () => {}, diagnosticsText: async () => '{}',
    saveFile: async () => ({ ok: true, mode: 'downloads', downloadId: 1 }), savedPath: async () => null,
    pickFile: async () => picked,
    confirm: async (o) => { calls.confirms.push(o); const a = answers.shift(); if (typeof a === 'function') return (await a(o)) !== false; return a !== undefined && a !== false; },
    setTimer: () => 0, clearTimer: () => {},
  });
  doc.body.append(settings.root);
  await settings.load();
  const g = settings.glossary;
  return {
    store, settings, doc, calls, answers, root: settings.root, pick: (f) => { picked = f; },
    add(source) {
      g.inputs.source.value = source;
      g.inputs.target.value = 'مقابل';
      g.inputs.note.value = '';
      g.form.dispatchEvent({ type: 'submit', preventDefault() {} });
    },
    remove(source) {
      buttonNamed(g.list, `حذف المصطلح ${source}`).click();
    },
  };
}

const terms = async (area) => (await createStore({ area }).getPrefs()).glossary.terms.map((x) => x.source);

// ── U13 ───────────────────────────────────────────────────────────────────

test('U13: إضافتان متزامنتان من صفحتين — يبقى المصطلحان', async () => {
  const area = createMemoryArea({ unlimited: true });
  const p1 = await page(area);
  const p2 = await page(area);
  p1.add('alpha');
  p2.add('beta');
  await settle(20);
  await area.flush();
  await settle(20);
  assert.deepEqual((await terms(area)).sort(), ['alpha', 'beta']);
});

test('U13: صفحة تضيف وأخرى لم يصلها الإشعار تحذف مصطلحًا — لا يضيع المضاف', async () => {
  const area = createMemoryArea({ unlimited: true });
  await createStore({ area }).setPrefs({ glossary: { terms: [{ source: 'one', target: 'واحد', note: null }, { source: 'two', target: 'اثنان', note: null }] } });
  await area.flush();
  const p1 = await page(area);
  const p2 = await page(area);
  p1.add('gamma');
  p2.remove('one');
  await settle(20);
  await area.flush();
  await settle(20);
  assert.deepEqual((await terms(area)).sort(), ['gamma', 'two']);
});

test('U13 (ضابط): المكرر يُرفض بالخطأ نفسه تحت الحقل، ولو أضافته صفحة أخرى قبل وصول إشعارها', async () => {
  const area = createMemoryArea({ unlimited: true });
  const p1 = await page(area);
  const p2 = await page(area);
  p1.add('alpha');
  p2.add('Alpha');
  await settle(20);
  await area.flush();
  await settle(20);
  assert.deepEqual(await terms(area), ['alpha']);
  const both = textOf(p1.root) + textOf(p2.root);
  assert.ok(both.includes(messageFor('PG_TERM_DUPLICATE')), 'رسالة المكرر ظاهرة');
});

// ── U11 ───────────────────────────────────────────────────────────────────

async function backupWith(record) {
  const area = createMemoryArea({ unlimited: true });
  const s = createStore({ area });
  await s.updateVideo(ID, () => record);
  const built = await createBackup({ store: s, appVersion: '1.1.0' });
  return built.text;
}

test('U11 (المحرّك): المعاينة تحمل نسخة الموجود، والتغيّر بعدها يجعل الاستبدال «تغيّر» لا «استُبدل»', async () => {
  const area = createMemoryArea({ unlimited: true });
  let t = Date.parse(NOW);
  const page1 = createStore({ area, now: () => (t += 1000) });
  const otherTab = createStore({ area, now: () => (t += 1000) });
  await seedBundle(page1, sampleBundle({ videoId: ID }));
  const parsed = await readBackup((await createBackup({ store: page1, appVersion: '1.1.0' })).text);
  const lib = await page1.listLibrary();
  const seen = new Map(lib.map((x) => [x.entry.videoId, x.entry]));
  const plan = planRestore(parsed, [...seen.keys()], seen);
  await otherTab.updateBundle(ID, (b) => withSlotName(b, 1, 'اسم-جديد'));
  const { items, skipped } = restoreItems(plan, new Set([ID]));
  const report = await runRestore({ store: page1, items, skipped, pause: async () => {} });
  assert.equal(report.replaced.length, 0, 'لم يُستبدل');
  assert.deepEqual(report.changed, [ID]);
  assert.equal((await otherTab.getBundle(ID)).slots[0].name, 'اسم-جديد', 'تغيير التبويب الآخر باقٍ');
});

test('U11 (الواجهة): تغيّر الفيديو بعد المعاينة — لا استبدال، والتقرير يقول ذلك', async () => {
  const text = await backupWith({ ...videoRecord({ videoId: ID }), title: 'من النسخة' });
  const area = createMemoryArea({ unlimited: true });
  const local = createStore({ area });
  await local.updateVideo(ID, () => ({ ...videoRecord({ videoId: ID }), title: 'المحلي' }));
  await area.flush();
  const m = await page(area);
  const other = createStore({ area });
  m.pick({ size: Buffer.byteLength(text, 'utf8'), text: async () => text });
  m.answers.push(async (o) => {
    const row = findAll(o.content, (e) => e.tagName === 'input' && e.getAttribute('type') === 'checkbox').find((b) => b.getAttribute('data-video') === ID);
    row.checked = true;
    row.dispatchEvent({ type: 'change' });
    await other.updateVideo(ID, (r) => ({ ...r, title: 'تغيير بعد المعاينة' }));
    return true;
  });
  await m.settings.data.restoreFromFile();
  await settle(10);
  assert.equal((await other.getVideo(ID)).title, 'تغيير بعد المعاينة', 'ما حُفظ بعد المعاينة باقٍ');
  const sec = findAll(m.root, (e) => e.tagName === 'section' && textOf(e.querySelector('h2') ?? { textContent: '' }) === 'البيانات')[0];
  assert.ok(textOf(sec).includes(messageFor('BK_RESTORE_CHANGED', { n: 1 })), textOf(sec));
});
