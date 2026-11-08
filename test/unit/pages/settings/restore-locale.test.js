// تبديل لغة الواجهة من نافذة أخرى أثناء استعادة نسخة احتياطية: تكتمل الاستعادة وتقريرها بلا إعادة تحميل، ولا يُطبَّق التبديل قبل قراءة التقرير.
// كل البيانات في مخزن ذاكرة معزول.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createBackup } from '../../../../src/core/backup/index.js';
import { BACKUP_LIMITS } from '../../../../src/core/backup/format.js';
import { createStore } from '../../../../src/core/store/index.js';
import { getLocale, setLocale } from '../../../../src/i18n/index.js';
import { dataControl } from '../../../../src/pages/settings/data.js';
import { pageHeld } from '../../../../src/ui/page-hold.js';
import { startPage } from '../../../../src/ui/page.js';
import { createMemoryArea } from '../../../helpers/chrome-storage.js';
import { NOW } from '../../../helpers/fixtures.js';
import { sampleBundle, seedBundle } from '../../../helpers/fixtures-v2.js';
import { FakeDocument, FakeElement, textOf } from '../library/fake-dom.js';

const clock = () => Date.parse(NOW);
const idOf = (i) => `V${String(i).padStart(10, '0')}`;

async function backupOf(count) {
  const src = createStore({ area: createMemoryArea({ unlimited: true }), now: clock });
  for (let i = 0; i < count; i++) await seedBundle(src, sampleBundle({ videoId: idOf(i) }));
  const built = await createBackup({ store: src, appVersion: '2.0.0', pause: () => Promise.resolve() });
  return { size: built.text.length, text: async () => built.text, name: built.name };
}

function pageDoc() {
  const doc = new FakeDocument();
  FakeElement.prototype.appendChild ??= function appendChild(n) { this.append(n); return n; };
  const app = doc.createElement('main');
  app.setAttribute('id', 'app');
  doc.body.append(app);
  return doc;
}

async function setup({ count = BACKUP_LIMITS.batch + 3 } = {}) {
  const file = await backupOf(count);
  const area = createMemoryArea({ unlimited: true });
  const store = createStore({ area, now: clock });
  await store.setUiLocale('ar');
  await area.flush?.();
  let written = 0;
  const set = area.set;
  area.set = async (items) => {
    written += Object.keys(items).filter((k) => k.startsWith('video:')).length;
    return set.call(area, items);
  };
  const doc = pageDoc();
  const env = { reloads: 0, stops: [], at: null };
  let gate = null;
  let ctl = null;
  await startPage({
    title: 'x', doc, store, reload: () => { env.reloads++; env.at = { written, busy: ctl.busy }; },
    render: (app) => {
      ctl = dataControl({
        doc, store, version: '2.0.0', now: clock, pickFile: async () => file, confirm: async () => true, saveFile: async () => ({ ok: true }),
        pause: () => new Promise((resolve) => { if (gate) gate(resolve); else resolve(); }),
      });
      app.append(ctl.restoreRow);
    },
  });
  return {
    area, store, doc, env, count, written: () => written, ctl: () => ctl,
    stopAfterWrites(n) {
      return new Promise((stopped) => {
        gate = (go) => {
          if (written < n) { go(); return; }
          gate = null;
          stopped(go);
        };
      });
    },
  };
}

const flip = async (area, locale) => {
  await createStore({ area, now: clock }).setUiLocale(locale);
  await area.flush?.();
};

test('التبديل في منتصف الاستعادة لا يقطعها: تكتمل كل الفيديوهات ويظهر تقريرها بلغة بدايتها', async (ctx) => {
  ctx.after(() => setLocale('ar'));
  const s = await setup();
  const stopped = s.stopAfterWrites(1);
  const run = s.ctl().restoreFromFile();
  const go = await stopped;
  assert.ok(s.written() >= 1 && s.written() < s.count, `توقفت في المنتصف: ${s.written()} من ${s.count}`);
  assert.ok(s.ctl().busy);

  await flip(s.area, 'en');
  assert.equal(s.env.reloads, 0, 'لا إعادة تحميل أثناء busy');
  assert.equal(getLocale(), 'ar', 'لغة الصفحة كما هي حتى تنتهي');

  go();
  const report = await run;
  assert.equal(s.written(), s.count, 'كُتبت كلها');
  assert.equal(report.remaining.length, 0);
  assert.equal(s.ctl().busy, false);
  assert.ok(textOf(s.ctl().restoreRow).trim().length > 0, 'ظهر التقرير');
  assert.ok(/[؀-ۿ]/.test(textOf(s.ctl().restoreRow)), 'بلغة بداية الاستعادة');
  assert.equal(s.env.reloads, 0, 'التقرير الظاهر لا يُمحى بإعادة تحميل');
  assert.ok(pageHeld());

  s.ctl().releaseReport();
  assert.equal(s.env.reloads, 1, 'يُطبَّق التبديل بعد قراءة التقرير');
  assert.equal(getLocale(), 'en');
  assert.equal(pageHeld(), false);
});

test('بلا تبديل: تقرير الاستعادة لا يؤخر شيئًا ولا تحدث إعادة تحميل', async (ctx) => {
  ctx.after(() => setLocale('ar'));
  const s = await setup({ count: 2 });
  await s.ctl().restoreFromFile();
  assert.equal(s.written(), 2);
  assert.equal(s.env.reloads, 0);
  assert.equal(getLocale(), 'ar');
  s.ctl().releaseReport();
  assert.equal(s.env.reloads, 0);
  assert.equal(pageHeld(), false);
});

test('فشل قراءة ملف النسخة يفلت القبضة ولا يترك تبديلًا معلّقًا', async (ctx) => {
  ctx.after(() => setLocale('ar'));
  const area = createMemoryArea({ unlimited: true });
  const store = createStore({ area, now: clock });
  await store.setUiLocale('ar');
  await area.flush?.();
  const doc = pageDoc();
  let reloads = 0;
  let ctl = null;
  await startPage({
    title: 'x', doc, store, reload: () => { reloads++; },
    render: (app) => {
      ctl = dataControl({ doc, store, version: '2.0.0', now: clock, pause: () => Promise.resolve(), confirm: async () => true, pickFile: async () => ({ size: 3, text: async () => 'not json', name: 'x.json' }) });
      app.append(ctl.restoreRow);
    },
  });
  await ctl.restoreFromFile();
  assert.equal(pageHeld(), false);
  await flip(area, 'en');
  assert.equal(reloads, 1);
});
