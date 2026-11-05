// جسر الحزام الحي (جولة النشر T3)، في بناء التطوير وحده: سكربت محتوى ثانٍ يضيفه scripts/build.mjs بعد content/main.js في
// العالم المعزول نفسه، فيقرأ خطاف التطوير globalThis.__tarjuman. وWebDriver BiDi في Firefox لا يبلغ العالم المعزول كما يبلغه CDP
// في Chromium، فيجيب هذا الجسر عن رسائل الصفحة المسمّاة بعمليات قراءة الحزام: الحالة، ومواضع أزرار الشريط والطبقة، والمعروض فوق
// الفيديو، والخطوط، وحافظة بديلة. لا يدخل بناء الإنتاج ولا البيان الأساسي، ولا يكتب في التخزين.
// ولا يجيب إلا جلسة الحزام (تدقيق 7a66f91، U65؛ كان يجيب أي سكربت في صفحة يوتيوب بنصوص المقاطع كلها واسم الملف، ويستبدل
// الحافظة): رمز عشوائي لكل بناء تطوير يضعه scripts/build.mjs هنا وفي dev/harness-token.txt، ويقرؤه السائق من مجلد الإضافة
// (test/live/stores/driver.mjs) ويرسله مع كل طلب. فبناء تطوير مثبّت في ملف تعريف حقيقي لا يجيب صفحة لا تعرف الرمز، والرمز لا
// يصل إلى الصفحة ما لم يشغّل أحد الحزام فيها.

const REQUEST = 'tarjuman-harness';
const REPLY = 'tarjuman-harness-reply';
// __TJ_HARNESS_TOKEN__ ثابت يعرّفه البناء (define)، وفي اختبار الوحدة متغير عام.
const TOKEN = typeof __TJ_HARNESS_TOKEN__ === 'string' && __TJ_HARNESS_TOKEN__.length >= 16 ? __TJ_HARNESS_TOKEN__ : null;
const copies = [];

const hook = () => {
  const h = globalThis.__tarjuman;
  if (!h) throw new Error('خطاف التطوير غير موجود');
  return h;
};

async function digest(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((x) => x.toString(16).padStart(2, '0')).join('').slice(0, 16);
}

const OPS = {
  ping: () => Boolean(globalThis.__tarjuman),
  state: () => {
    const h = hook();
    const s = h.controller.getState();
    return {
      videoId: s.videoId ?? null, title: s.title, loading: s.loading, captured: s.captured.map((t) => ({ key: t.key, ok: t.ok })), activeSlot: s.activeSlot, view: s.view,
      arabic: s.arabic ? { count: s.arabic.cues.length, fileName: s.arabic.fileName, edited: s.arabic.edited, first: s.arabic.cues[0]?.text ?? null } : null,
      english: s.english ? { key: s.english.key, kind: s.english.kind, count: s.english.cues.length, source: s.english.source } : null,
      mounted: { overlay: h.mounted.overlay.state, controls: h.mounted.controls.state, panel: h.mounted.panel?.state ?? null },
    };
  },
  cueText: (n) => hook().controller.getState().arabic?.cues.find((c) => c.n === n)?.text ?? null,
  peek: () => hook().mounted.controls.peek(),
  overlay: () => (hook().mounted.overlay.peek(true)?.lines ?? []).map((l) => l.text),
  // تدقيق 7a66f91، C6: صناديق أسطر الطبقة (تراكب قائمة التوقيت مع السطر)، وما يُرى في اللوحة (نقاط Tab والمركّز ولون الأصل).
  overlayBoxes: () => hook().mounted.overlay.peek(true) ?? null,
  panel: (o) => hook().mounted.panel?.peek?.(o) ?? null,
  diagnostics: () => ({ controls: hook().mounted.controls.diagnostics?.() ?? null, overlay: hook().mounted.overlay.diagnostics?.() ?? null }),
  fonts: () => [...document.fonts].map((f) => ({ family: f.family, weight: String(f.weight), status: f.status })),
  /** حافظة بديلة في العالم المعزول (لا تُمسّ حافظة الجهاز)، تحفظ طول المنسوخ وبصمته. */
  stubClipboard: () => {
    copies.length = 0;
    Object.defineProperty(navigator.clipboard, 'writeText', {
      configurable: true,
      value: async (t) => { copies.push({ len: t.length, sha: await digest(t) }); },
    });
    return true;
  },
  copies: () => copies,
  /** أصل صفحات الإضافة (moz-extension://<uuid>/ أو chrome-extension://<id>/). */
  base: () => chrome.runtime.getURL(''),
  /**
   * يفتح صفحة من صفحات الإضافة في تبويب جديد عبر سكربت خلفية الحزام (Firefox وحده، src/dev/harness-background.js): BiDi لا
   * ينتقل إلى moz-extension بنفسه، وسكربت المحتوى لا يفتحها.
   */
  open: (rel) => chrome.runtime.sendMessage({ source: REQUEST, op: 'open', rel }),
};

window.addEventListener('message', async (event) => {
  if (event.source !== window) return;
  const d = event.data;
  if (!d || typeof d !== 'object' || d.source !== REQUEST || !Object.hasOwn(OPS, d.op)) return;
  // بلا رمز صحيح لا رد أصلًا (ولا «مرفوض»)، فلا تعرف الصفحة أن الجسر موجود.
  if (!TOKEN || d.token !== TOKEN) return;
  let reply;
  try {
    reply = { ok: true, value: await OPS[d.op](...(Array.isArray(d.args) ? d.args : [])) };
  } catch (err) {
    reply = { ok: false, error: String(err?.message ?? err) };
  }
  // نسخة JSON خالصة: تعبر حدود العالمين في المتصفحين بلا أغلفة.
  window.postMessage({ source: REPLY, id: d.id, ...JSON.parse(JSON.stringify(reply ?? { ok: true, value: null })) }, '*');
});
