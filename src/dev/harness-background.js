// سكربت خلفية للحزام الحي (جولة النشر T3)، في بناء التطوير لـFirefox وحده بعد العامل الخلفي: WebDriver BiDi لا ينتقل إلى صفحات
// moz-extension، وسكربت المحتوى لا يفتحها (ليست مكشوفة للويب)، فيفتح هذا صفحة الإضافة المسمّاة في تبويب جديد بطلب جسر الحزام
// (src/dev/harness-bridge.js). لا يجيب عن غير رسالته، ولا يدخل بناء الإنتاج ولا البيان الأساسي.

const PAGE = /^pages\/(?:popup|library|settings|editor)\/index\.html(?:[?#][\w=&%.:-]*)?$/;

chrome.runtime.onMessage.addListener((req, sender, sendResponse) => {
  if (sender.id !== chrome.runtime.id || !req || req.source !== 'tarjuman-harness' || req.op !== 'open') return undefined;
  if (!PAGE.test(String(req.rel))) {
    sendResponse({ ok: false, error: 'صفحة غير معروفة' });
    return undefined;
  }
  chrome.tabs.create({ url: chrome.runtime.getURL(req.rel) }).then(
    (tab) => sendResponse({ ok: true, tabId: tab.id }),
    (err) => sendResponse({ ok: false, error: String(err?.message ?? err) }),
  );
  return true;
});
