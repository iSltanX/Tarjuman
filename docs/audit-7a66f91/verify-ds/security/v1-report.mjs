// تحقق مستقل (TJ-37، TJ-40، H-01): لوحة البلاغ الحقيقية بـDOM الاختبارات الوهمي وبيئة وهمية (لا شبكة ولا إذن حقيقي)،
// وفاحص الأسرار كما تستعمله اللوحة، وعميل البلاغ بطلب وهمي يلتقط init. لا طلب شبكي ولا خادم.
// تشغيل: command node v1-report.mjs
const TJ = '$SCRATCH/tj';
const { reportPanel } = await import(`${TJ}/src/pages/settings/report.js`);
const { findSecrets } = await import(`${TJ}/src/core/diagnostics/sanitize.js`);
const { sendReport, classify, parseRetryAfter, retryable } = await import(`${TJ}/src/core/report/client.js`);
const { failureText } = await import(`${TJ}/src/core/report/messages.js`);
const { newDocument, settle, buttonNamed } = await import(`${TJ}/test/unit/pages/library/fake-dom.js`);

const DIAG = { appVersion: '1.1.0', os: 'macos', osVersion: '15.6.1', arch: 'arm64', browser: 'Firefox', browserVersion: '159.0.1', buildTarget: 'firefox', test: false };

function harness() {
  const doc = newDocument();
  const sent = [];
  const env = {
    diagnostics: async () => DIAG,
    requestPermission: () => Promise.resolve(true),
    send: async (payload, key) => { sent.push({ payload, key }); return { ok: true, id: 7, replayed: false }; },
    copy: async () => {},
    newKey: () => '00000001-0000-4000-8000-000000000000',
  };
  const panel = reportPanel({ doc, env });
  doc.body.append(panel.root);
  const textarea = panel.root.querySelector('textarea');
  const type = (value) => { textarea.value = value; textarea.dispatchEvent({ type: 'input' }); };
  return { doc, panel, sent, type };
}

const h = harness();
h.panel.open();
await settle();
const texts = (sel) => [...h.panel.root.querySelectorAll(sel)].map((n) => n.textContent);
console.log('=== A) نصوص اللوحة الحرفية (report.js:115 و:120 و:127) ===');
console.log(JSON.stringify(texts('p.tj-caption').filter((t) => t.includes('معرّف') || t.includes('كما كتبته'))));
console.log(JSON.stringify(texts('strong.st-panel__title')));

console.log('\n=== B) وصف فيه رابط فيديو ومعرّفه وعنوانه وبريد: هل يُمنع أو يُنبَّه؟ وما الذي يُرسل؟ ===');
const desc = 'لا تظهر الترجمة في https://www.youtube.com/watch?v=Y-rmzh0PI3c وفي youtu.be/Y-rmzh0PI3c والمعرّف Y-rmzh0PI3c عنوانه Cosmos Laundromat وبريدي test@example.com';
h.type(desc);
await settle();
const sendBtn = buttonNamed(h.panel.root, 'أرسل البلاغ');
const alertP = h.panel.root.querySelector('.st-report__secret');
console.log(JSON.stringify({ secretsSeenByPanel: [...new Set(findSecrets(desc, ['url']).map((f) => f.type))], secretsIfUrlNotIgnored: [...new Set(findSecrets(desc).map((f) => f.type))], alertHidden: alertP.hidden, sendDisabled: sendBtn.getAttribute('aria-disabled') }));
sendBtn.click();
await settle();
const s = h.sent[0];
console.log(JSON.stringify({ sendCalled: h.sent.length, descriptionVerbatim: s?.payload.description === desc.trim(), payloadKeys: s ? Object.keys(s.payload) : null }));

console.log('\n=== C) صيغ أسرار: هل تمنع اللوحة الإرسال (aria-disabled) وتُظهر التنبيه؟ (قيم اصطناعية) ===');
const samples = {
  'SAPISID= (ضابط)': 'cookie SAPISID=abcdEFGH1234/xyz',
  'sapisid= حروف صغيرة': 'cookie sapisid=abcdEFGH1234/xyz',
  'SAPISID: بنقطتين': 'SAPISID: abcdEFGH1234/xyz',
  '__Secure-3PSID=': '__Secure-3PSID=g.a000abcdefghijklmnop',
  'Cookie: ترويسة': 'Cookie: YSC=abcd',
  'Authorization: Bearer': 'Authorization: Bearer abc.def.ghi',
  'Bearer وحده + JWT': 'Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U',
  'JWT وحده': 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U',
  'pot= 16 محرفًا': 'pot=ABCDEFGHIJKLMNOP',
  'pot= 15 محرفًا': 'pot=ABCDEFGHIJKLMNO',
  'pot%3D مرمّز': 'pot%3DABCDEFGHIJKLMNOPQRSTUV',
  'رمز 79 محرفًا': 'A'.repeat(79),
  'رمز 80 محرفًا': 'A'.repeat(80),
  'base64 بـ+/ طوله 120': 'Ab+/'.repeat(30),
  'SAPISIDHASH': 'SAPISIDHASH 1700000000_abcdef',
  'ya29. (رمز OAuth لغوغل، 60 محرفًا)': `ya29.${'a1B2'.repeat(15)}`,
};
for (const [label, value] of Object.entries(samples)) {
  h.type(`وصف: ${value}`);
  await settle();
  console.log(JSON.stringify({ label, blocked: sendBtn.getAttribute('aria-disabled') === 'true', alert: !alertP.hidden, types: [...new Set(findSecrets(value, ['url']).map((f) => f.type))] }));
}

console.log('\n=== D) TJ-40: Retry-After بلا سقف ===');
for (const header of ['120', '1e308', 'Wed, 21 Oct 2099 07:28:00 GMT', '-1', '1.5', 'abc']) {
  const after = parseRetryAfter(header, Date.parse('2026-11-05T00:00:00Z'));
  console.log(JSON.stringify({ header, retryAfterSeconds: after, text: after === undefined ? null : failureText('rate-limited', after).split('مؤقتًا. ')[1] }));
}

console.log('\n=== E) TJ-40: انقضاء المهلة أثناء قراءة جسم 201 ===');
{
  const KEY = '123e4567-e89b-42d3-a456-426614174000';
  const hang = (url, init) => new Promise((_, rej) => init.signal.addEventListener('abort', () => rej(new DOMException('aborted', 'AbortError'))));
  const r1 = await sendReport({ x: 1 }, KEY, { granted: async () => true, request: hang, timeoutMs: 100 });
  const slowBody = (url, init) => Promise.resolve(new Response(new ReadableStream({ start(c) { init.signal.addEventListener('abort', () => c.error(new DOMException('aborted', 'AbortError'))); } }), { status: 201 }));
  const r2 = await sendReport({ x: 1 }, KEY, { granted: async () => true, request: slowBody, timeoutMs: 100 });
  console.log(JSON.stringify({ headersNeverArrive: r1.failure, bodyNeverArrives: r2.failure, retryableBoth: retryable(r1.failure) && retryable(r2.failure) }));
  console.log(JSON.stringify({ textTimeout: failureText('timeout'), textUnexpected: failureText('unexpected') }));
}

console.log('\n=== F) H-01: ما يمرّره العميل إلى fetch، وما يفترضه fetch لما لم يُمرّر ===');
{
  let seen = null;
  const fake = async (url, init) => { seen = { url, init }; return new Response('{"id":3}', { status: 201 }); };
  await sendReport({ x: 1 }, '123e4567-e89b-42d3-a456-426614174000', { granted: async () => true, request: fake });
  const { signal, body, ...rest } = seen.init;
  console.log(JSON.stringify({ url: seen.url, init: rest, hasModeKey: 'mode' in seen.init }));
  const r = new Request(seen.url, seen.init);
  console.log(JSON.stringify({ defaultModeIfAbsent: r.mode, referrerPolicy: r.referrerPolicy, credentials: r.credentials, redirect: r.redirect }));
}
