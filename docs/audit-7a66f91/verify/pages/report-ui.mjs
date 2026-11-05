// نموذج البلاغ: UI-03 (ابن dl المباشر p قبل التشخيص أو عند فشله)، وTJ-AUD-016 (عقدة role=alert/status تُبنى من جديد مع
// كل ضغطة في الوصف)، وL-20 («انسخ البلاغ» أثناء الإرسال: يبدو مفعّلًا ولا يفعل شيئًا، والزران بمؤشر انشغال).
const T = '$SCRATCH/tj';
const { reportPanel } = await import(`${T}/src/pages/settings/report.js`);
const { newDocument, settle, textOf, buttonNamed } = await import(`${T}/test/unit/pages/library/fake-dom.js`);

const DIAG = { appVersion: '1.1.0', os: 'linux', osVersion: 'unknown', arch: 'x86_64', browser: 'Firefox', browserVersion: '159.0', buildTarget: 'firefox', test: false };

// UI-03: قبل وصول التشخيص وعند فشله
for (const mode of ['pending', 'failed', 'ok']) {
  const doc = newDocument();
  let resolveDiag;
  const env = {
    diagnostics: () => (mode === 'failed' ? Promise.reject(new Error('x')) : new Promise((r) => { resolveDiag = r; })),
    requestPermission: async () => true, send: async () => ({ ok: true, id: 7 }), copy: async () => {}, newKey: () => 'k',
  };
  const p = reportPanel({ doc, env });
  doc.body.append(p.root);
  p.open();
  await settle(3);
  if (mode === 'ok') { resolveDiag(DIAG); await settle(3); }
  const dl = p.root.querySelector('dl');
  const kids = [...dl.children].map((c) => c.tagName);
  console.log(`UI-03) ${mode}: أبناء dl المباشرون =`, JSON.stringify([...new Set(kids)]), '| العدد =', kids.length);
}

// TJ-AUD-016: بعد فشل إرسال (role=alert) ثم الكتابة في الوصف
{
  const doc = newDocument();
  const env = {
    diagnostics: async () => DIAG, requestPermission: async () => true,
    send: async () => ({ ok: false, failure: 'network', status: null }), copy: async () => {}, newKey: () => 'k',
  };
  const p = reportPanel({ doc, env });
  doc.body.append(p.root);
  p.open();
  await settle(3);
  const ta = p.root.querySelector('textarea');
  ta.value = 'وصف المشكلة';
  ta.dispatchEvent({ type: 'input' });
  buttonNamed(p.root, 'أرسل البلاغ').click();
  await settle(10);
  const result = p.root.querySelector('.st-report__result');
  const alert1 = result.querySelector('[role="alert"]');
  console.log('016) بعد فشل الإرسال: عقدة alert =', Boolean(alert1), '| النص =', textOf(alert1).slice(0, 40));
  const seen = new Set([alert1]);
  for (const ch of ' إضافية') {
    ta.value += ch;
    ta.dispatchEvent({ type: 'input' });
    seen.add(result.querySelector('[role="alert"]'));
  }
  console.log('016) بعد 7 ضغطات: عقد alert مختلفة أُدرجت =', seen.size, '(1 = لا إعادة بناء)');
  // ونتيجة النسخ (role=status على الحاوية)
  buttonNamed(p.root, 'انسخ البلاغ').click();
  await settle(5);
  const s1 = result.firstChild ?? result.childNodes[0];
  ta.value += 'x';
  ta.dispatchEvent({ type: 'input' });
  const s2 = result.childNodes[0];
  console.log('016) بعد «نُسخ البلاغ» ثم ضغطة: عقدة النتيجة داخل role=status تبدّلت =', s1 !== s2, '| النص نفسه =', textOf(s1) === textOf(s2));
  // سطر الأسرار role=alert: نصه يُعاد كتابته مع كل ضغطة ما دام فيه سرّ
  ta.value = 'SAPISID=abcdefgh1234';
  ta.dispatchEvent({ type: 'input' });
  const secret = p.root.querySelector('.st-report__secret');
  const t1 = secret.childNodes[0];
  ta.value += ' ';
  ta.dispatchEvent({ type: 'input' });
  console.log('016+) سطر الأسرار role=alert: عقدة النص تبدّلت بضغطة =', t1 !== secret.childNodes[0], '| ظاهر =', !secret.hidden);
}

// L-20: أثناء الإرسال
{
  const doc = newDocument();
  let release;
  const copies = [];
  const env = {
    diagnostics: async () => DIAG, requestPermission: async () => true,
    send: () => new Promise((r) => { release = r; }), copy: async (t) => { copies.push(t); }, newKey: () => 'k',
  };
  const p = reportPanel({ doc, env });
  doc.body.append(p.root);
  p.open();
  await settle(3);
  const ta = p.root.querySelector('textarea');
  ta.value = 'وصف';
  ta.dispatchEvent({ type: 'input' });
  const send = buttonNamed(p.root, 'أرسل البلاغ');
  const copy = buttonNamed(p.root, 'انسخ البلاغ');
  send.click();
  await settle(3);
  console.log('L-20) أثناء الإرسال: نسخ aria-disabled =', copy.getAttribute('aria-disabled'), '| aria-busy (إرسال، نسخ) =', send.getAttribute('aria-busy'), copy.getAttribute('aria-busy'), '| title النسخ =', JSON.stringify(copy.title));
  copy.click();
  await settle(3);
  console.log('L-20) ضغطة «انسخ البلاغ» أثناء الإرسال: نُسخ =', copies.length, '| نتيجة ظاهرة =', JSON.stringify(textOf(p.root.querySelector('.st-report__result'))));
  release({ ok: true, id: 9 });
  await settle(3);
  const rows = [...p.root.querySelectorAll('.st-report__row')].map((r) => textOf(r));
  console.log('L-20) صف النظام في المعاينة =', rows.find((r) => r.startsWith('النظام')));
}
