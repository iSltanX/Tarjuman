// نافذة الأيقونة في الإصدار الثاني (P12-AC6 الجزء الآلي): سطر حالة أدوات المشغّل والطبقة بسبب مفهوم عند التعطل، وسطر
// رفض الالتقاط، و«نسخ تشخيص الصفحة» منقّى (رموز وأعداد بلا نص ولا رابط ولا معرّف فيديو)، والقاموس المرفق.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { messageFor } from '../../../../src/core/errors/index.js';
import { pageDiagnosticsRequest } from '../../../../src/core/model/messages.js';
import { browserLabel as reportBrowserLabel, liveSources } from '../../../../src/core/report/diagnostics.js';
import { attachedGlossary, captureLine, pageReport, queryPageDiagnostics, toolsStatus } from '../../../../src/pages/popup/status.js';

/** كشف المتصفح في النافذة هو كشف قناة البلاغ نفسه (تدقيق 7a66f91، U53). */
const browserLabel = (nav) => reportBrowserLabel(liveSources({ nav, api: {} }));

const reply = (over = {}) => ({
  v: 1, ok: true, watch: true, videoId: 'iG9CE55wbtY', title: 'عنوان سري للفيديو', loading: false,
  english: { captured: [{ key: 'en|manual', kind: 'manual', cueCount: 412, ok: true }], saved: [] },
  arabic: { fileName: 'talk.ar.srt', cueCount: 412, edited: true, matched: true }, view: { displayOffsetMs: 500, displayMode: 'ar' },
  mounted: { overlay: 'mounted', controls: 'mounted' },
  slots: [{ n: 1, filled: true, active: true, name: 'ترجمتي' }, { n: 2, filled: false, active: false, name: null }, { n: 3, filled: false, active: false, name: null }],
  capture: { state: 'captured', count: 1, code: null },
  tools: { overlay: 'mounted', controls: 'mounted', code: null },
  ...over,
});

test('سطر الأدوات: تعمل، وبانتظار المشغّل، وتعذّر الربط للأدوات أو للطبقة بسببه من آخر رمز', () => {
  assert.deepEqual(toolsStatus(reply()), { tone: 'success', text: 'أدوات المشغّل تعمل', reason: null });
  assert.deepEqual(toolsStatus(reply({ mounted: { overlay: 'waiting', controls: 'waiting' } })), { tone: 'info', text: 'بانتظار المشغّل', reason: null });
  const controls = toolsStatus(reply({ mounted: { overlay: 'mounted', controls: 'error' }, tools: { overlay: 'mounted', controls: 'error', code: 'CT_MOUNT_FAILED' } }));
  assert.deepEqual(controls, { tone: 'danger', text: 'تعذّر ربط الأدوات بالمشغّل — أعد تحميل الصفحة', reason: messageFor('CT_MOUNT_FAILED') });
  const overlay = toolsStatus(reply({ mounted: { overlay: 'error', controls: 'mounted' }, tools: { overlay: 'error', controls: 'mounted', code: 'PL_MOUNT_FAILED' } }));
  assert.equal(overlay.text, 'تعذّر ربط طبقة الترجمة بالمشغّل — أعد تحميل الصفحة');
  assert.equal(overlay.reason, messageFor('PL_MOUNT_FAILED'));
  const old = toolsStatus(reply({ mounted: { overlay: 'error', controls: 'mounted' }, tools: undefined }));
  assert.equal(old.reason, null, 'رد الإصدار الأول بلا رمز: السطر وحده');
  assert.equal(toolsStatus(null), null);
  assert.equal(toolsStatus(reply({ watch: false })), null);
});

test('سطر الالتقاط: الرفض برسالته (مسار عربي أو مترجم آليًا)، والملتقط أو بلا التقاط لا سطر', () => {
  assert.deepEqual(captureLine(reply({ capture: { state: 'rejected', count: 0, code: 'EX_NOT_ENGLISH' } })), { tone: 'warning', text: messageFor('EX_NOT_ENGLISH') });
  assert.deepEqual(captureLine(reply({ capture: { state: 'rejected', count: 0, code: 'EX_TRANSLATED_TRACK' } })).text, messageFor('EX_TRANSLATED_TRACK'));
  assert.equal(captureLine(reply()), null);
  assert.equal(captureLine(reply({ capture: { state: 'none', count: 0, code: null } })), null);
  assert.equal(captureLine(reply({ capture: undefined })), null, 'رد الإصدار الأول');
  assert.equal(captureLine(null), null);
});

const fakeTabs = ({ answer, onSend } = {}) => ({
  query: async () => [{ id: 9 }],
  sendMessage: async (id, msg) => {
    onSend?.(id, msg);
    if (answer instanceof Error) throw answer;
    return answer;
  },
});

test('تشخيص الصفحة: طلبه إلى التبويب النشط، والرد غير الصالح أو الغائب null', async () => {
  const sent = [];
  const sections = { controller: { loading: false }, mounted: { overlay: { state: 'mounted' }, controls: { state: 'mounted' } } };
  assert.deepEqual(await queryPageDiagnostics({ tabs: fakeTabs({ answer: { v: 1, ok: true, sections }, onSend: (id, m) => sent.push([id, m]) }) }), sections);
  assert.deepEqual(sent, [[9, pageDiagnosticsRequest()]]);
  assert.equal(await queryPageDiagnostics({ tabs: fakeTabs({ answer: new Error('Receiving end does not exist.') }) }), null);
  assert.equal(await queryPageDiagnostics({ tabs: fakeTabs({ answer: { v: 1, ok: true } }) }), null);
  assert.equal(await queryPageDiagnostics({ tabs: fakeTabs({ answer: { v: 2, ok: true, sections } }) }), null);
});

test('التقرير منقّى: رموز وأعداد، بلا عنوان ولا اسم ملف ولا اسم ترجمة ولا رابط ولا معرّف فيديو', () => {
  const sections = {
    controller: { videoId: 'iG9CE55wbtY', loading: false, version: 12, extractor: { lastVideoId: 'iG9CE55wbtY', currentVideoId: 'iG9CE55wbtY', pending: [{ video_id: 'iG9CE55wbtY' }], accepted: 2, rejected: { EX_NOT_ENGLISH: 1 } } },
    mounted: {
      overlay: { state: 'mounted', lastCode: 'PL_FONT_FALLBACK', note: 'https://www.youtube.com/watch?v=iG9CE55wbtY' },
      controls: { state: 'mounted', session: { renders: 40, lastCode: 'CT_COPY_FAILED' } },
    },
  };
  const text = pageReport({ reply: reply(), sections, version: '0.2.0', browser: 'Brave 156', at: '2026-11-02T10:00:00.000Z' });
  const parsed = JSON.parse(text);
  assert.equal(parsed.tarjuman, '0.2.0');
  assert.equal(parsed.browser, 'Brave 156');
  for (const secret of ['iG9CE55wbtY', 'عنوان سري', 'talk.ar.srt', 'ترجمتي', 'youtube.com']) assert.equal(text.includes(secret), false, secret);
  assert.equal(parsed.sections.page.mounted.overlay.lastCode, 'PL_FONT_FALLBACK', 'رموز الطبقة في التقرير');
  assert.equal(parsed.sections.page.mounted.controls.session.lastCode, 'CT_COPY_FAILED');
  assert.deepEqual(parsed.sections.popup.slots, [{ n: 1, filled: true, active: true }, { n: 2, filled: false, active: false }, { n: 3, filled: false, active: false }]);
  assert.deepEqual(parsed.sections.popup.arabic, { cueCount: 412, edited: true, matched: true });
  const none = JSON.parse(pageReport({ reply: reply(), sections: null, version: '0.2.0', browser: 'Chrome 156' }));
  assert.deepEqual(none.sections.page, { unavailable: true }, 'لا رد من الصفحة: يُقال ذلك ولا يسقط التقرير');
});

test('اسم المتصفح ورقمه الرئيسي وحدهما (Firefox وEdge باسميهما، U53)؛ والقاموس المرفق وحده', async () => {
  assert.equal(await browserLabel({ userAgentData: { brands: [{ brand: 'Not A(Brand', version: '99' }, { brand: 'Brave', version: '156.1.98' }, { brand: 'Chromium', version: '156' }] } }), 'Brave 156');
  assert.equal(await browserLabel({ userAgentData: { brands: [{ brand: 'Google Chrome', version: '156' }, { brand: 'Chromium', version: '156' }] } }), 'Chrome 156');
  assert.equal(await browserLabel({ userAgentData: { brands: [{ brand: 'Chromium', version: '156' }, { brand: 'Microsoft Edge', version: '156' }] } }), 'Microsoft Edge 156');
  assert.equal(await browserLabel({ userAgent: 'Mozilla/5.0 (X11; Linux x86_64; rv:159.0) Gecko/20100101 Firefox/159.0' }), 'Firefox 159');
  assert.equal(await browserLabel({ userAgent: 'Mozilla/5.0 … Chrome/156.0.0.0 Safari/537.36 Edg/156.0.1.2' }), 'Microsoft Edge 156');
  assert.equal(await browserLabel({ userAgent: 'Mozilla/5.0 … Chrome/156.0.0.0 Safari/537.36' }), 'Chrome 156');
  assert.equal(await browserLabel({}), 'غير معروف');
  const terms = [{ source: 'prompt', target: 'موجِّه', note: null }];
  assert.strictEqual(attachedGlossary({ glossary: { attach: true, terms } }), terms);
  assert.equal(attachedGlossary({ glossary: { attach: false, terms } }), null);
  assert.equal(attachedGlossary({ glossary: { attach: true, terms: [] } }), null);
  assert.equal(attachedGlossary(null), null);
});
