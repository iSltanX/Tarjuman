// سكربت عالم الصفحة (MAIN) عند document_start: يقرأ نسخة من استجابة /api/timedtext التي طلبها
// المشغّل نفسه، دون أي طلب جديد. الغلافان يمرّران استدعاء الصفحة الأصلي مرة واحدة كما هو، ولا
// يغيّران معاملاته ولا نتيجته. من الرابط تُستخرج القيم المسموح بها فقط ثم يُسقط.
// ومنذ 2.0.0 (AA1) يقرأ قائمة مسارات الفيديو من بيانات المشغّل التي في الصفحة أصلًا (رمز اللغة والنوع والاسم المعروض وحدها،
// بلا رابط ولا رمز)، قراءةً لا تبديلًا: لا يختار مسارًا ولا يطلبه (قاعدة player-api وقرار سلطان ق١؛ المستخدم يختار من يوتيوب).
// لا يقبل هذا السكربت أي رسالة من الصفحة، ولا يسجّل شيئًا.
import { readTimedtextParams } from '../extract/timedtext-params.js';

const MAX_BODY_CHARS = 20 * 1024 * 1024;
const origin = window.location.origin;

function post(meta, transport, status, body) {
  const tooLarge = body.length > MAX_BODY_CHARS;
  window.postMessage({
    source: 'tarjuman', v: 1, kind: 'timedtext',
    videoId: meta.videoId, lang: meta.lang, trackKind: meta.trackKind, kindParam: meta.kindParam,
    capsAsr: meta.capsAsr, hasTlang: meta.hasTlang, tlang: meta.tlang, format: meta.format, hasPot: meta.hasPot,
    transport, status, bodyLength: body.length, body: tooLarge ? '' : body, truncated: tooLarge,
  }, origin);
  scheduleTracks();
}

const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;
const MAX_TRACKS = 64;
// الوثيقة حاضرة دائمًا في عالم الصفحة؛ وغيابها (بيئة اختبار الغلافين) يعطّل قائمة المسارات وحدها.
const doc = typeof document === 'undefined' ? null : document;
let lastList = '';
let timers = [];

function currentVideoId() {
  try {
    const v = new URL(window.location.href).searchParams.get('v');
    return v && VIDEO_ID.test(v) ? v : null;
  } catch {
    return null;
  }
}

/** استجابة المشغّل للفيديو المعروض: من المشغّل نفسه، وإلا من بيانات الصفحة الأولى إن كانت للفيديو نفسه. */
function playerResponse(id) {
  try {
    const el = doc ? doc.getElementById('movie_player') : null;
    const r = el && typeof el.getPlayerResponse === 'function' ? el.getPlayerResponse() : null;
    if (r && r.videoDetails && r.videoDetails.videoId === id) return r;
  } catch {
    // المشغّل لم يجهز بعد.
  }
  try {
    const r = window.ytInitialPlayerResponse;
    if (r && r.videoDetails && r.videoDetails.videoId === id) return r;
  } catch {
    // لا بيانات أولى.
  }
  return null;
}

const textOf = (n) => (!n ? '' : typeof n.simpleText === 'string' ? n.simpleText
  : Array.isArray(n.runs) ? n.runs.map((x) => (x && typeof x.text === 'string' ? x.text : '')).join('') : '');

/** يرسل قائمة مسارات الفيديو المعروض إن تغيّرت: اللغة والنوع والاسم وحدها، وهل يترجم يوتيوب آليًا. */
function postTracks() {
  const id = currentVideoId();
  const r = id ? playerResponse(id) : null;
  if (!r) return;
  const rend = r.captions && r.captions.playerCaptionsTracklistRenderer;
  const list = rend && Array.isArray(rend.captionTracks) ? rend.captionTracks : [];
  const tracks = list.slice(0, MAX_TRACKS).map((t) => ({
    lang: t && typeof t.languageCode === 'string' ? t.languageCode : '',
    kind: t && t.kind === 'asr' ? 'asr' : 'manual',
    name: textOf(t && t.name),
  }));
  const translatable = Boolean(rend && Array.isArray(rend.translationLanguages) && rend.translationLanguages.length);
  const key = JSON.stringify([id, tracks, translatable]);
  if (key === lastList) return;
  lastList = key;
  window.postMessage({ source: 'tarjuman', v: 1, kind: 'tracklist', videoId: id, tracks, translatable }, origin);
}

/** بعد كل تنقل أو تحديث للمشغّل أو التقاط: محاولات قليلة متباعدة حتى تجهز بيانات المشغّل. */
function scheduleTracks() {
  if (!doc) return;
  for (const t of timers) clearTimeout(t);
  timers = [0, 400, 1500, 4000].map((ms) => setTimeout(() => {
    try {
      postTracks();
    } catch {
      // لا شيء: الفشل هنا لا يؤثر في الصفحة.
    }
  }, ms));
}

if (doc) {
  for (const name of ['yt-navigate-finish', 'yt-page-data-updated', 'yt-player-updated']) doc.addEventListener(name, scheduleTracks);
  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', scheduleTracks, { once: true });
  else scheduleTracks();
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
