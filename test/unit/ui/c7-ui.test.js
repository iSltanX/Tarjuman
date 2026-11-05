// تدقيق 7a66f91، المرحلة C7 (المكوّنات المشتركة والنافذة والقفز): حوار التأكيد باسمه ووصفه (U51)، وسبب التعطيل وصفٌ لا يدخل
// اسم الزر (U91)، والأحجام بالصفر والغيغابايت (U59)، وتقرير التشخيص يُسقط الحقول الحرة (I07)، والنافذة تميّز صفحة يوتيوب بلا
// سكربت فتقول «أعد تحميلها» (Q31) وتعيد الاستعلام أثناء القراءة (U59 L-25)، والقفز يسأل عن المعرّف وحده ويحدّ على الأحدث (U102).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createDiagnosticReport } from '../../../src/core/diagnostics/report.js';
import { messageFor } from '../../../src/core/errors/index.js';
import { installMessageHandler } from '../../../src/content/messages.js';
import { button, confirmDialog } from '../../../src/ui/components.js';
import { formatBytes } from '../../../src/ui/format.js';
import { findVideoTabs, jumpToVideo } from '../../../src/ui/seek.js';
import { missText, queryPopupState, tabPlace, untilSettled } from '../../../src/pages/popup/status.js';
import { NOT_VIDEO_TEXT } from '../../../src/pages/popup/view.js';
import { newDocument, textOf } from '../pages/library/fake-dom.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const A = 'AAAAAAAAAAA';

/** اسم الوصول من المحتوى كما يحسبه المتصفح تقريبًا: النصوص خارج aria-hidden. */
function nameFromContent(node) {
  if (node.nodeType === 3) return node.textContent;
  if (node.getAttribute?.('aria-hidden') === 'true') return '';
  return node.childNodes.map(nameFromContent).join('');
}

test('U51: حوار التأكيد باسمه (العنوان) ووصفه (النص، أو المحتوى بلا نص)', async () => {
  const doc = newDocument();
  const pending = confirmDialog({ title: 'حذف الترجمة 2؟', body: 'لا يمكن التراجع.', confirmLabel: 'حذف', doc });
  const dialog = doc.body.querySelector('dialog');
  const title = doc.getElementById(dialog.getAttribute('aria-labelledby'));
  assert.ok(title && title.tagName === 'h2');
  assert.equal(textOf(title), 'حذف الترجمة 2؟');
  assert.equal(textOf(doc.getElementById(dialog.getAttribute('aria-describedby'))), 'لا يمكن التراجع.');
  dialog.close('cancel');
  assert.equal(await pending, false);
  const content = doc.createElement('div');
  content.append('الترجمة 2 — ملف talk.srt');
  const p2 = confirmDialog({ title: 'حذف؟', confirmLabel: 'حذف', content, doc });
  const d2 = doc.body.querySelector('dialog');
  assert.ok(doc.getElementById(d2.getAttribute('aria-describedby')) === content, 'المحتوى وصفٌ حين لا نص');
  d2.close('cancel');
  await p2;
});

test('U91: سبب التعطيل وصف الزر (aria-describedby) ولا يدخل اسمه المحسوب من محتواه؛ وزر الأيقونة اسمه aria-label', () => {
  const doc = newDocument();
  const b = button({ label: 'حفظ', disabledReason: 'لا تغييرات للحفظ.', doc });
  doc.body.append(b);
  assert.equal(nameFromContent(b), 'حفظ', 'كان «حفظلا تغييرات للحفظ.»');
  const reason = doc.getElementById(b.getAttribute('aria-describedby'));
  assert.equal(textOf(reason), 'لا تغييرات للحفظ.');
  assert.equal(reason.getAttribute('aria-hidden'), 'true');
  assert.equal(b.getAttribute('aria-disabled'), 'true');
  assert.equal(b.title, 'لا تغييرات للحفظ.');
});

test('U59: formatBytes — الصفر «0 ك.ب» لا «1 ك.ب»، وما فوق 1024 م.ب بالغيغابايت', () => {
  assert.equal(formatBytes(0), '0 ك.ب');
  assert.equal(formatBytes(300), '1 ك.ب');
  assert.equal(formatBytes(820 * 1024), '820 ك.ب');
  assert.equal(formatBytes(2.1 * 1024 * 1024), '2.1 م.ب');
  assert.equal(formatBytes(3 * 1024 ** 3), '3.0 غ.ب', 'كان «3072.0 م.ب»');
});

test('I07 (Q30): تقرير التشخيص يُسقط detail وlastDetail وvideoId وname أينما كانت، ويبقي الرموز والأعداد', () => {
  const r = createDiagnosticReport({
    version: '1.1.0', browser: 'Chrome 156', at: '2026-11-05T00:00:00.000Z',
    sections: { page: { controller: { lastListenerError: { code: 'TJ_UNEXPECTED', name: 'TypeError', detail: `v=${A} boom` }, videoId: A }, overlay: { state: 'error', lastDetail: `TypeError: ${A}`, count: 3 } } },
  });
  const text = JSON.stringify(r);
  assert.equal(text.includes(A), false);
  assert.equal(text.includes('TypeError'), false);
  assert.equal(r.sections.page.controller.lastListenerError.code, 'TJ_UNEXPECTED');
  assert.equal(r.sections.page.overlay.count, 3);
});

/** تبويب نشط وهمي: عنوانه (إن كشفه المتصفح) ورده. */
const tabsWith = ({ url, answer, reject = false }) => ({
  async query() { return [{ id: 7, ...(url === undefined ? {} : { url }) }]; },
  async sendMessage() {
    if (reject) throw new Error('Could not establish connection. Receiving end does not exist.');
    return answer;
  },
});
const stateReply = (o = {}) => ({ v: 1, ok: true, watch: true, videoId: A, title: 't', loading: false, english: { captured: [], saved: [] }, arabic: null, view: { displayOffsetMs: 0, displayMode: 'ar' }, mounted: { overlay: 'mounted', controls: 'mounted' }, ...o });

test('Q31: صفحة يوتيوب بلا سكربت ترجمان «أعد تحميلها»، وغير يوتيوب «افتح فيديو»، وبلا عنوان مكشوف الاحتمالان معًا', async () => {
  assert.equal(tabPlace({ url: 'https://www.youtube.com/watch?v=x' }), 'youtube');
  assert.equal(tabPlace({ url: 'https://example.com/' }), 'other');
  assert.equal(tabPlace({}), null);
  assert.deepEqual(await queryPopupState({ tabs: tabsWith({ url: 'https://www.youtube.com/watch?v=AAAAAAAAAAA', reject: true }) }), { reply: null, miss: 'stale' });
  assert.deepEqual(await queryPopupState({ tabs: tabsWith({ url: 'https://www.youtube.com/watch?v=AAAAAAAAAAA', answer: { v: 0, ok: true } }) }), { reply: null, miss: 'stale' }, 'نسخة أقدم');
  assert.deepEqual(await queryPopupState({ tabs: tabsWith({ url: 'https://example.com/', reject: true }) }), { reply: null, miss: 'elsewhere' });
  assert.deepEqual(await queryPopupState({ tabs: tabsWith({ reject: true }) }), { reply: null, miss: 'unknown' });
  const ok = await queryPopupState({ tabs: tabsWith({ answer: stateReply() }) });
  assert.equal(ok.miss, null);
  assert.equal(ok.reply.videoId, A);
  assert.equal(missText('stale'), messageFor('TJ_RELOAD_PAGE'));
  assert.match(missText('stale'), /أعد تحميلها/);
  assert.match(missText('unknown'), /افتح فيديو على يوتيوب.*فأعد تحميل صفحته/);
  assert.equal(missText('elsewhere'), NOT_VIDEO_TEXT);
  assert.equal(missText(null), NOT_VIDEO_TEXT);
});

test('U59 (L-25): «جارٍ القراءة» يُعاد استعلامه حتى يستقر، وبحد أقصى، وانقطاع الرد لا يمحو آخر حالة', async () => {
  const seq = [{ reply: stateReply({ loading: true }) }, { reply: stateReply({ loading: false, arabic: null }) }];
  let asked = 0;
  const slept = [];
  const sleep = async (ms) => { slept.push(ms); };
  const done = await untilSettled(async () => seq[Math.min(asked++, seq.length - 1)], { reply: stateReply({ loading: true }) }, { sleep, intervalMs: 400, maxMs: 5000 });
  assert.equal(done.reply.loading, false);
  assert.equal(asked, 2);
  let n = 0;
  const stuck = await untilSettled(async () => { n++; return { reply: stateReply({ loading: true }) }; }, { reply: stateReply({ loading: true }) }, { sleep, intervalMs: 400, maxMs: 2000 });
  assert.equal(stuck.reply.loading, true);
  assert.equal(n, 5, 'حد أقصى: 2000/400');
  const gone = await untilSettled(async () => ({ reply: null }), { reply: stateReply({ loading: true }) }, { sleep });
  assert.equal(gone.reply.loading, true, 'يبقى آخر رد معروف');
});

test('U102: القفز يسأل عن المعرّف وحده (لا عنوان ولا أسماء)، ويحدّ على الأحدث استعمالًا بلا المهملة: الفيديو في التبويب 203 يُجلب لا يُكرَّر', async () => {
  const sent = [];
  const list = Array.from({ length: 205 }, (_, i) => ({ id: i + 1, windowId: 1, active: false, lastAccessed: i === 202 ? 10_000 : i, discarded: i === 0 }));
  const tabs = {
    async query() { return list; },
    async sendMessage(id, m) {
      sent.push(m);
      if (m.type === 'tj:seek') return { v: 1, ok: true, ms: m.ms };
      return id === 203 ? { v: 1, ok: true, videoId: A } : { v: 1, ok: true, videoId: null };
    },
    async update() { return {}; },
    async create() { throw new Error('لا يُفتح تبويب جديد'); },
  };
  assert.deepEqual((await findVideoTabs(A, { tabs })).map((t) => t.id), [203]);
  assert.ok(sent.every((m) => m.type === 'tj:get-video-id' || m.type === 'tj:seek'), 'لا طلب حالة كاملة');
  assert.ok(!sent.some((m) => m === undefined));
  sent.length = 0;
  assert.deepEqual(await jumpToVideo({ videoId: A, ms: 1000 }, { tabs }), { ok: true, via: 'open', tabId: 203 });
  assert.equal(sent.filter((m) => m.type === 'tj:get-video-id').length, 200, 'الحد نفسه، على الأحدث، والمهمل خارجه');
});

test('U102: سكربت المحتوى يرد على طلب المعرّف بالمعرّف وحده، ومن صفحة الإضافة وحدها', () => {
  let listener = null;
  const runtime = { id: 'ext', getURL: (p) => `chrome-extension://ext/${p}`, onMessage: { addListener: (fn) => { listener = fn; }, removeListener() {} } };
  installMessageHandler({ controller: { getState: () => ({ videoId: A, title: 'سري' }) }, mounted: {}, runtime });
  const page = { id: 'ext', url: 'chrome-extension://ext/pages/library/index.html' };
  let got = null;
  listener({ type: 'tj:get-video-id', v: 1 }, page, (r) => { got = r; });
  assert.deepEqual(got, { v: 1, ok: true, videoId: A });
  got = 'لا رد';
  listener({ type: 'tj:get-video-id', v: 1 }, { id: 'other', url: 'https://evil.example/' }, (r) => { got = r; });
  assert.equal(got, 'لا رد');
});

test('U92: نافذة الأيقونة فيها h1 (اسم المنتج مخفيًا بصريًا)', async () => {
  const src = await readFile(path.join(ROOT, 'src/pages/popup/main.js'), 'utf8');
  assert.match(src, /el\('h1', \{ className: 'tj-sr-only', text: 'ترجمان' \}\)/);
});

test('U86: الشريط العلوي تحت 400px بلا أيقونتي الرابطين وبحشوات أضيق، وتحت 360px يلتف', async () => {
  const css = await readFile(path.join(ROOT, 'src/ui/base.css'), 'utf8');
  const at400 = /@media \(max-width: 400px\) \{([\s\S]*?)\n\}/.exec(css)?.[1] ?? '';
  assert.match(at400, /\.tj-topbar__link \.tj-icon \{ display: none; \}/);
  const at360 = /@media \(max-width: 360px\) \{([\s\S]*?)\n\}/.exec(css)?.[1] ?? '';
  assert.match(at360, /flex-wrap: wrap/);
});
