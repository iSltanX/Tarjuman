// سكربت عالم الصفحة (MAIN) عند document_start: يقرأ نسخة من استجابة /api/timedtext التي طلبها
// المشغّل نفسه، دون أي طلب جديد. الغلافان يمرّران استدعاء الصفحة الأصلي مرة واحدة كما هو، ولا
// يغيّران معاملاته ولا نتيجته. من الرابط تُستخرج القيم المسموح بها فقط ثم يُسقط.
// لا يقبل هذا السكربت أي رسالة من الصفحة، ولا يسجّل شيئًا.
import { readTimedtextParams } from '../extract/timedtext-params.js';

const MAX_BODY_CHARS = 20 * 1024 * 1024;
const origin = window.location.origin;

function post(meta, transport, status, body) {
  const tooLarge = body.length > MAX_BODY_CHARS;
  window.postMessage({
    source: 'tarjuman', v: 1, kind: 'timedtext',
    videoId: meta.videoId, lang: meta.lang, trackKind: meta.trackKind, kindParam: meta.kindParam,
    capsAsr: meta.capsAsr, hasTlang: meta.hasTlang, format: meta.format, hasPot: meta.hasPot,
    transport, status, bodyLength: body.length, body: tooLarge ? '' : body, truncated: tooLarge,
  }, origin);
}

function metaFor(url) {
  try {
    return typeof url === 'string' ? readTimedtextParams(url, window.location.href) : null;
  } catch {
    return null;
  }
}

const origFetch = window.fetch;
window.fetch = function fetch(input, init) {
  const result = origFetch.apply(this, arguments); // الطلب الوحيد: طلب الصفحة نفسه.
  let meta = null;
  try {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input && input.url;
    meta = metaFor(url);
  } catch {
    meta = null;
  }
  if (meta) {
    // يُسجَّل قبل أن تعيد الدالة الوعد للصفحة، فيُنسخ الجسم قبل أن تستهلكه.
    result.then((res) => {
      let copy;
      try {
        copy = res.clone();
      } catch {
        return;
      }
      copy.text().then((body) => post(meta, 'fetch', res.status, body), () => {});
    }, () => {});
  }
  return result;
};

const XHR = window.XMLHttpRequest.prototype;
const origOpen = XHR.open;
const origSend = XHR.send;
const pending = new WeakMap();

XHR.open = function open(method, url) {
  const meta = metaFor(typeof url === 'string' ? url : url instanceof URL ? url.href : String(url));
  if (meta) pending.set(this, meta);
  else pending.delete(this);
  return origOpen.apply(this, arguments);
};

XHR.send = function send() {
  const meta = pending.get(this);
  if (meta) {
    this.addEventListener('loadend', () => {
      try {
        const type = this.responseType;
        if (type === '' || type === 'text') post(meta, 'xhr', this.status, this.responseText || '');
        else if (type === 'json') post(meta, 'xhr', this.status, this.response == null ? '' : JSON.stringify(this.response));
        else if (type === 'arraybuffer' && this.response) post(meta, 'xhr', this.status, new TextDecoder().decode(this.response));
        else if (type === 'blob' && this.response) this.response.text().then((b) => post(meta, 'xhr', this.status, b), () => {});
      } catch {
        // لا شيء: الفشل هنا لا يؤثر في الصفحة.
      }
    }, { once: true });
  }
  return origSend.apply(this, arguments);
};
