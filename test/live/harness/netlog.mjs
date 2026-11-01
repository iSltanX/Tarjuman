// سجل شبكة منقّى للحزام. لا يُحفظ أي رابط أو رأس أو قيمة pot: من طلبات timedtext تُحفظ القيم المسموح
// بها فقط (كما في الإضافة)، ومن كل الطلبات عدّادات ومصدر المستدعي (الصفحة أو الإضافة).
import { createHash } from 'node:crypto';
import { readTimedtextParams } from '../../../src/extract/timedtext-params.js';

/** @param {import('./browser.mjs').Page} page */
export function recordNetwork(page) {
  const timedtext = new Map(); // requestId → سجل
  const stats = { total: 0, extensionFrames: 0, extensionOnly: 0, extensionOnlySamples: [], packageReads: 0, byType: {} };
  const t0 = Date.now();

  const offs = [
    page.on('Network.requestWillBeSent', (p) => {
      // قراءة ملف من حزمة الإضافة نفسها (خطوط الترجمة في P6) ليست شبكة: تُعدّ وحدها.
      if (p.request.url.startsWith('chrome-extension://')) {
        stats.packageReads++;
        return;
      }
      stats.total++;
      stats.byType[p.type || 'Other'] = (stats.byType[p.type || 'Other'] || 0) + 1;
      const frames = collectFrames(p.initiator);
      const ext = frames.filter((u) => u.startsWith('chrome-extension://'));
      if (ext.length) {
        stats.extensionFrames++;
        // طلب أصله الإضافة وحدها: لا إطار من صفحة يوتيوب تحت إطارات الإضافة.
        const page = frames.some((u) => /^https:\/\/(www\.)?youtube\.com\//.test(u));
        if (!page) {
          stats.extensionOnly++;
          if (stats.extensionOnlySamples.length < 5) stats.extensionOnlySamples.push({ type: p.type, initiator: p.initiator?.type });
        }
      } else if (p.initiator?.url?.startsWith('chrome-extension://')) {
        stats.extensionOnly++;
      }
      const meta = readTimedtextParams(p.request.url);
      if (!meta) return;
      timedtext.set(p.requestId, {
        t: Date.now() - t0, method: p.request.method, ...meta,
        initiator: p.initiator?.type, viaExtensionWrapper: ext.length > 0,
        status: null, fromCache: false, encodedBytes: null, bodyBytes: null, bodySha256: null, failed: null,
      });
    }),
    page.on('Network.requestServedFromCache', ({ requestId }) => {
      const r = timedtext.get(requestId);
      if (r) r.fromCache = true;
    }),
    page.on('Network.responseReceived', ({ requestId, response }) => {
      const r = timedtext.get(requestId);
      if (!r) return;
      r.status = response.status;
      r.fromCache = r.fromCache || !!response.fromDiskCache || !!response.fromServiceWorker || !!response.fromPrefetchCache;
      r.mimeType = response.mimeType;
    }),
    page.on('Network.loadingFinished', async ({ requestId, encodedDataLength }) => {
      const r = timedtext.get(requestId);
      if (!r) return;
      r.encodedBytes = encodedDataLength;
      try {
        // قراءة جسم الاستجابة المخزّن في المتصفح: لا طلب جديد.
        const { body, base64Encoded } = await page.send('Network.getResponseBody', { requestId });
        const text = base64Encoded ? Buffer.from(body, 'base64').toString('utf8') : body;
        r.bodyBytes = Buffer.byteLength(text);
        r.bodyChars = text.length;
        r.bodySha256 = sha256(text);
      } catch (err) {
        r.bodyError = err.message.slice(0, 80);
      }
    }),
    page.on('Network.loadingFailed', ({ requestId, errorText, blockedReason }) => {
      const r = timedtext.get(requestId);
      if (r) r.failed = blockedReason || errorText;
    }),
  ];

  return {
    timedtext: () => [...timedtext.values()],
    stats: () => ({ ...stats }),
    stop: () => offs.forEach((off) => off()),
  };
}

function collectFrames(initiator) {
  const urls = [];
  let st = initiator?.stack;
  while (st) {
    for (const f of st.callFrames || []) if (f.url) urls.push(f.url);
    st = st.parent;
  }
  if (initiator?.url) urls.push(initiator.url);
  return urls;
}

export function sha256(text) {
  return createHash('sha256').update(text, 'utf8').digest('hex').slice(0, 16);
}
