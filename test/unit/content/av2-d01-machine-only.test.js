// تدقيق V2، U-034 بقرار سلطان D-01 (الخيار ١، 2026-11-08): ترجمة يوتيوب الآلية لا تتقدّم على مسار أصلي، وإن كانت الملتقط
// الوحيد عُرضت مختارة موسومة. يُمتحن عبر مسارات المنتج: المتحكم بالمستخرج الحقيقي، وردّ النافذة وحالة زوجها، وقائمة التحميل.
// والحالة الشائعة: تفضيل لغة الترجمات في يوتيوب عربي، فيطلب يوتيوب الترجمة الآلية إلى العربية بنفسه (عقد extraction.md).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createController } from '../../../src/content/controller.js';
import { createStore } from '../../../src/core/store/index.js';
import { buildVideoStateReply } from '../../../src/core/model/messages.js';
import { machineNote, pairState, PAIR_TEXT } from '../../../src/pages/popup/status.js';
import { createMemoryArea } from '../../helpers/chrome-storage.js';
import { captureMsg, makeExtractor, sample } from '../extract/helpers.js';
import { click, makeState, mountPage } from '../player/controls/harness.js';
import { LABELS } from '../../../src/player/controls/text.js';

const VID = 'AAAAAAAAAAA';
const BODY = sample('manual').body;
const MACHINE = { lang: 'en', hasTlang: true, tlang: 'ar' };

async function setup() {
  const { extractor, state } = makeExtractor({ videoId: VID, durationMs: null });
  const c = createController({ store: createStore({ area: createMemoryArea({ unlimited: true }) }), extractor, page: { title: () => 'عنوان', durationMs: () => null } });
  await c.start(VID);
  const capture = (t, over) => { state.t = t; return extractor.handleMessage(captureMsg({ videoId: VID, body: BODY }, over)); };
  const reply = () => buildVideoStateReply(c.getState(), { overlay: 'mounted', controls: 'mounted' });
  return { c, capture, reply };
}

/** نص قائمة التحميل في المشغّل. */
function menuText(c) {
  const page = mountPage({ state: makeState({ captured: c.getState().captured }) });
  click(page.ui.btn('download'));
  return page.ui.menu().textContent;
}

test('AV2 U-034 (D-01): الترجمة الآلية الملتقط الوحيد تُعرض مختارة موسومة، و«من» بلغتها مع سطر الآلية', async () => {
  const { c, capture, reply } = await setup();
  assert.equal(capture(1000, MACHINE).accepted, true);
  assert.equal(c.getState().english.key, 'ar|manual|en', 'المسار الوحيد مختار');
  const r = reply();
  assert.deepEqual([r.source.key, r.source.lang, r.source.via], ['ar|manual|en', 'ar', 'en']);
  const text = menuText(c);
  assert.ok(text.includes(LABELS.machine), 'قائمة التحميل تسمه «مترجمة آليًا من يوتيوب»');
  // «من» بلغة المحتوى وتحتها سطر الآلية؛ ومع «إلى» عربية يتعطل النسخ برسالة صريحة لا بصمت.
  const same = pairState({ reply: r, pair: { from: 'ar', to: 'ar' } });
  assert.equal(same.ready, false);
  assert.equal(same.reason, PAIR_TEXT.same);
  assert.equal(same.sourceNote, machineNote('en'));
  const other = pairState({ reply: r, pair: { from: 'ar', to: 'fr' } });
  assert.equal(other.ready, true, 'زوج مختلف ينسخ من ترجمة يوتيوب الآلية');
  assert.equal(other.sourceNote, machineNote('en'));
});

test('AV2 U-034 (D-01): الترجمة الآلية لا تتقدّم على أصلي التُقط قبلها أو بعدها', async () => {
  const after = await setup();
  after.capture(1000, {});
  after.capture(2000, MACHINE);
  assert.equal(after.c.getState().english.key, 'en|manual', 'الأصلي الأقدم يتقدّم على الآلية الأحدث');
  const before = await setup();
  before.capture(1000, MACHINE);
  assert.equal(before.c.getState().english.key, 'ar|manual|en');
  before.capture(2000, {});
  assert.equal(before.c.getState().english.key, 'en|manual', 'التقاط أصلي بعد الآلية يحل محلها افتراضيًا');
  assert.equal(before.reply().source.via ?? null, null);
});
