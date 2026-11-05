// TJ-AUD-008a: في Firefox هل يُرسل البلاغ دون موافقة technicalAndInteraction؟ نمرّ بالمسار الحقيقي: requestReportPermission
// (الطلب يضم origins وdata_collection) ثم sendReport بـhostGranted (يفحص المضيف وحده)، مع fetch وهمي يعدّ الطلبات.
const T = '$SCRATCH/tj';
const { reportPanel } = await import(`${T}/src/pages/settings/report.js`);
const { requestReportPermission, sendReport, hostGranted } = await import(`${T}/src/core/report/client.js`);
const { newDocument, settle, buttonNamed } = await import(`${T}/test/unit/pages/library/fake-dom.js`);

const DIAG = { appVersion: '1.1.0', os: 'linux', osVersion: 'unknown', arch: 'x86_64', browser: 'Firefox', browserVersion: '159.0', buildTarget: 'firefox', test: false };
async function scenario(name, { granted, userApproves, requestLies = false }) {
  const state = { origins: new Set(granted.origins), data: new Set(granted.data) };
  const asked = [];
  const api = { permissions: {
    request: async (p) => {
      asked.push(JSON.stringify(p));
      const missing = (p.origins ?? []).some((o) => !state.origins.has(o)) || (p.data_collection ?? []).some((d) => !state.data.has(d));
      if (!missing) return true;
      if (requestLies) return true; // افتراض نظري: المتصفح يعيد true دون منح البيانات
      if (!userApproves) return false;
      (p.origins ?? []).forEach((o) => state.origins.add(o));
      (p.data_collection ?? []).forEach((d) => state.data.add(d));
      return true;
    },
    contains: async (p) => (p.origins ?? []).every((o) => state.origins.has(o)) && (p.data_collection ?? []).every((d) => state.data.has(d)),
  } };
  let fetches = 0;
  const fakeFetch = async () => { fetches++; return new Response(JSON.stringify({ id: 1 }), { status: 201 }); };
  const doc = newDocument();
  const p = reportPanel({ doc, env: {
    diagnostics: async () => DIAG,
    requestPermission: (target) => requestReportPermission(api, target),
    send: (payload, key) => sendReport(payload, key, { granted: () => hostGranted(api), request: fakeFetch }),
    copy: async () => {}, newKey: () => '123e4567-e89b-42d3-a456-426614174000',
  } });
  doc.body.append(p.root);
  p.open();
  await settle(3);
  const ta = p.root.querySelector('textarea');
  ta.value = 'وصف';
  ta.dispatchEvent({ type: 'input' });
  buttonNamed(p.root, 'أرسل البلاغ').click();
  await settle(10);
  console.log(`${name}: طُلب ${asked.join(' ')} | أُرسل fetch = ${fetches} | الموافقة بعدها = ${state.data.has('technicalAndInteraction')} | النتيجة = ${p.state.outcome?.state}/${p.state.outcome?.failure ?? p.state.outcome?.id}`);
}
const H = 'https://app-reports.isultantf.workers.dev/*';
await scenario('أ) المضيف ممنوح وسُحبت الموافقة وحدها، والمستخدم يرفض', { granted: { origins: [H], data: [] }, userApproves: false });
await scenario('ب) المضيف ممنوح وسُحبت الموافقة وحدها، والمستخدم يوافق', { granted: { origins: [H], data: [] }, userApproves: true });
await scenario('ج) نظري: request يعيد true دون منح الموافقة', { granted: { origins: [H], data: [] }, userApproves: false, requestLies: true });
