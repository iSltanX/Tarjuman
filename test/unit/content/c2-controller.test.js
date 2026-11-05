// انحدارات C2 في المشغّل (تدقيق 7a66f91، U12)، محوّلة من verify/storage/player وverify-ds/storage/tj19-20-h04-controller:
// متحكمان فوق مخزنين على مساحة واحدة، موصولان بالإشعارات كما في content/main.js. الفعل في أ يقع قبل وصول إشعار ب.
//   ± فرقٌ على الخانة والملف اللذين رآهما المستخدم: لا قيمة مطلقة على خانة صارت نشطة، ولا على ملف استُبدل، ولا تضيع ± أخرى.
//   تأكيد الاستبدال مبني على ما رآه: إن تغيّرت الخانة قبله رُفض، فلا تسقط النسخة التي كان يمكن استعادتها.
//   العلامة على المقطع الذي رآه: إن تغيّر محتوى الخانة رُفضت ولا تقع على مقطع آخر.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStore } from '../../../src/core/store/index.js';
import { createController } from '../../../src/content/controller.js';
import { loadIntoFor } from '../../../src/player/controls/flows.js';
import { withActiveSlot, withSlotUpload } from '../../../src/core/model/bundle.js';
import { saveSlot } from '../../../src/pages/editor/persist.js';
import { messageFor } from '../../../src/core/errors/index.js';
import { createMemoryArea } from '../../helpers/chrome-storage.js';
import { NOW, makeCues } from '../../helpers/fixtures.js';
import { sampleBundle, seedBundle } from '../../helpers/fixtures-v2.js';
import { turns } from '../../helpers/store-race.js';

const ID = 'AAAAAAAAAAA';

async function pair() {
  const area = createMemoryArea({ unlimited: true });
  let t = Date.parse(NOW);
  const now = () => (t += 1000);
  const sA = createStore({ area, now });
  const sB = createStore({ area, now });
  await seedBundle(sA, sampleBundle({ videoId: ID }));
  const A = createController({ store: sA, page: {}, extractor: null, now });
  const B = createController({ store: sB, page: {}, extractor: null, now });
  sA.onChange((c) => A.handleStoreChange(c));
  sB.onChange((c) => B.handleStoreChange(c));
  await A.start(ID);
  await B.start(ID);
  await area.flush();
  await turns(10);
  return { area, sA, sB, A, B, now };
}

const offsets = async (s) => {
  const b = await s.getBundle(ID);
  return { active: b.active, s1: b.slots[0].offsetMs, s2: b.slots[1].offsetMs };
};
const upload = (name) => ({ fileName: `${ID}.${name}`, cues: makeCues(2, { text: (i) => `عينة ${i}` }) });

test('U12: ± بعد تفعيل خانة أخرى من تبويب آخر وقبل وصول الإشعار — لا تُكتب على الخانة الجديدة', async () => {
  const { area, sA, sB, A } = await pair();
  await sB.updateBundle(ID, (b) => withActiveSlot(b, 2, NOW));
  await A.nudgeOffset(1);
  await area.flush();
  await turns(10);
  assert.deepEqual(await offsets(sA), { active: 2, s1: 500, s2: -1200 }, 'لا إزاحة مطلقة على الخانة 2، ولا على 1 غير النشطة');
  assert.equal(A.getState().notice?.code, 'CT_ACTIVE_CHANGED');
  assert.notEqual(messageFor('CT_ACTIVE_CHANGED'), messageFor('TJ_UNEXPECTED'));
  assert.equal(A.getState().view.displayOffsetMs, -1200, 'المشغّل يعرض ما في التخزين الآن');
});

test('U12 (ضابط): ± بعد وصول الإشعار تُطبَّق على الخانة النشطة الجديدة', async () => {
  const { area, sA, sB, A } = await pair();
  await sB.updateBundle(ID, (b) => withActiveSlot(b, 2, NOW));
  await area.flush();
  await turns(10);
  await A.nudgeOffset(1);
  assert.deepEqual(await offsets(sA), { active: 2, s1: 500, s2: -1200 + A.getState().settings.offsetStepMs });
});

test('U12: ± من تبويبين على الخانة نفسها قبل وصول الإشعار — فرقان يُجمعان ولا تضيع ضغطة', async () => {
  const { area, sA, A, B } = await pair();
  const step = A.getState().settings.offsetStepMs;
  await B.nudgeOffset(1);
  await A.nudgeOffset(1);
  await area.flush();
  await turns(10);
  assert.equal((await offsets(sA)).s1, 500 + 2 * step);
});

test('U12: ± بعد استبدال الملف النشط من مكان آخر — لا تُكتب الإزاحة القديمة على الملف الجديد', async () => {
  const { area, sA, sB, A, now } = await pair();
  await sB.updateBundle(ID, (b) => withSlotUpload(b, 1, {
    videoId: ID, ...upload('جديد.ar.srt'), comparison: null, fingerprintId: null, notes: [], displayModeDefault: 'ar', current: null,
  }, new Date(now()).toISOString(), { replace: true }).bundle);
  await A.nudgeOffset(1);
  await area.flush();
  await turns(10);
  const b = await sA.getBundle(ID);
  assert.ok(b.slots[0].track.fileName.includes('جديد'));
  assert.equal(b.slots[0].offsetMs, 0, 'إزاحة الملف الجديد كما صُفّرت');
  assert.equal(A.getState().notice?.code, 'CT_ACTIVE_CHANGED');
});

test('U12: تأكيد استبدال قديم بعد استبدال من تبويب آخر — يُرفض والأصل قابل للاستعادة', async () => {
  const { area, sB, A, B } = await pair();
  const original = A.getState().bundle.slots[0].track.fileName;
  await B.loadArabicInto(1, upload('B.srt'), { replace: true });
  const r = await loadIntoFor({ controller: A, n: 1, replace: true, read: { videoId: ID, input: upload('C.srt') } });
  await area.flush();
  await turns(10);
  const fin = await sB.getBundle(ID);
  assert.equal(r.ok, false, 'رُفض التأكيد القديم');
  assert.equal(r.error.code, 'ST_CONFLICT');
  assert.ok(fin.slots[0].track.fileName.endsWith('B.srt'));
  assert.equal(fin.previous.track.fileName, original, 'الأصل قابل للاستعادة');
});

test('U12 (FS-2): علامة برقم مقطع من محتوى قديم — تُرفض ولا تقع على مقطع آخر', async () => {
  const { area, sA, sB, A, now } = await pair();
  const seen = A.getState().arabic.cues;
  const latest = await sB.getBundle(ID);
  const cues = structuredClone(latest.slots[0].track.current).slice(1);
  await saveSlot(sB, ID, latest, 1, { cues, offsetChanged: false, offsetMs: 0 }, { now });
  const marksBefore = (await sA.getBundle(ID)).slots[0].marks;
  await assert.rejects(A.markCue({ index: 1 }, 'todo'), { code: 'ST_CONFLICT' });
  await area.flush();
  const marksAfter = (await sA.getBundle(ID)).slots[0].marks;
  assert.deepEqual(marksAfter, marksBefore, 'لا علامة جديدة');
  assert.ok(seen[1], 'المقطع الذي رآه المستخدم');
});

test('U12 (ضابط المراجعة): ± معلّقة من التبويب نفسه ثم استبدال فوري — لا تعارض كاذب، والمستبدَل نسخةً سابقة', async () => {
  const { area, sB, A } = await pair();
  const original = A.getState().bundle.slots[0].track.fileName;
  const nudge = A.nudgeOffset(1);
  const r = await loadIntoFor({ controller: A, n: 1, replace: true, read: { videoId: ID, input: upload('C.srt') } });
  await nudge;
  await area.flush();
  assert.equal(r.ok, true, r.error?.code);
  const fin = await sB.getBundle(ID);
  assert.ok(fin.slots[0].track.fileName.endsWith('C.srt'));
  assert.equal(fin.previous.track.fileName, original);
});


test('C2 (أداء ±): حدث الكتابة نفسها يصل قبل ردها (كما مع العامل الخلفي) — لا قراءة كاملة زائدة بعد كل ضغطة', async () => {
  const area = createMemoryArea({ unlimited: true, eventsBeforeResolve: true });
  const s = createStore({ area });
  await seedBundle(s, sampleBundle({ videoId: ID }));
  const c = createController({ store: s, page: {}, extractor: null });
  s.onChange((ch) => c.handleStoreChange(ch));
  await c.start(ID);
  await turns(5);
  const get = area.get;
  let reads = 0;
  area.get = async (keys) => {
    if (Array.isArray(keys) && keys.includes(`video:${ID}`)) reads++;
    return get(keys);
  };
  for (let i = 0; i < 5; i++) await c.nudgeOffset(1);
  await turns(10);
  area.get = get;
  assert.equal(reads, 5, `قراءة واحدة لكل ضغطة (قراءة الكتابة نفسها)، لا إعادة قراءة: ${reads}`);
});

test('C2 (ضابط): كتابة من سياق آخر تصل أثناء ± — تُعاد القراءة بعدها ويظهر تغييرها', async () => {
  const { area, sB, A } = await pair();
  const get = sB.getBundle(ID);
  void get;
  const p = A.nudgeOffset(1);
  await sB.updateBundle(ID, (b) => ({ ...b, slots: b.slots.map((x) => (x.n === 2 ? { ...x, name: 'من الآخر' } : x)) }));
  await p;
  await area.flush();
  await turns(10);
  assert.equal(A.getState().bundle.slots[1].name, 'من الآخر');
});
