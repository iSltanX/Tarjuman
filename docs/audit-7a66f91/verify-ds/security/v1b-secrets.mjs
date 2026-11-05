// تكملة TJ-37 (ج): صيغ نسخ واقعية للكوكيز من أدوات المطوّر أو إضافات تصدير الكوكيز (قيم اصطناعية)، بفاحص اللوحة نفسه
// (findSecrets بتجاهل url)، ومن يستعمل الفاحص المشترك نفسه. بلا متصفح.
// تشغيل: command node v1b-secrets.mjs
const TJ = '$SCRATCH/tj';
const { findSecrets, sanitizeText } = await import(`${TJ}/src/core/diagnostics/sanitize.js`);
const v = 'AbCdEfGhIjKlMnOp/QrStUvWxYz0123456';
const samples = {
  'صف من جدول الكوكيز في DevTools (مفصول بـTab)': `SAPISID\t${v}\t.youtube.com\t/\t2027-01-01T00:00:00.000Z`,
  'JSON من إضافة تصدير الكوكيز': `{"name": "SAPISID", "value": "${v}", "domain": ".youtube.com"}`,
  'سطر Netscape cookies.txt': `.youtube.com\tTRUE\t/\tTRUE\t1798761600\tSAPISID\t${v}`,
  'document.cookie منسوخ (ضابط)': `SAPISID=${v}; SID=${v}`,
  'ترويسة Cookie (ضابط)': `cookie: SAPISID=${v}`,
};
for (const [label, s] of Object.entries(samples)) console.log(JSON.stringify({ label, panelTypes: [...new Set(findSecrets(s, ['url']).map((f) => f.type))], sanitized: sanitizeText(s) !== s }));
