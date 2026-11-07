// A6 — CL-N3: ما يفعله saveFile بملف فوق حد قناة سكربت المحتوى (16 مليون محرف)، وما تقوله docs/known-limitations.md:94، وما
// يراه المستخدم. بالوحدات الحقيقية: saveFile وdownload (Blob) وsaveFiles في أدوات المشغّل ونصوص الرسائل.
// الاستعمال: command node save-fallback.mjs <جذر الشيفرة>
import { readFileSync } from 'node:fs';

const R = process.argv[2];
if (!R) throw new Error('الوسيط الأول: جذر الشيفرة');
const { saveFile, SAVE_LIMITS, SAVE_TYPES } = await import(`${R}/src/core/save/index.js`);
const { saveFiles } = await import(`${R}/src/player/controls/flows.js`);
const { messageFor } = await import(`${R}/src/core/errors/index.js`);

let failures = 0;
const verdict = (name, actual, expected, ok) => {
  console.log(`- ${name}\n  الفعلي:   ${JSON.stringify(actual)}\n  المتوقع:  ${JSON.stringify(expected)}\n  ${ok ? 'مطابق' : 'غير مطابق (يثبت الادعاء)'}`);
  if (!ok) failures++;
};

/** وثيقة وهمية تلتقط ما ينزّله <a download> (الاسم ونوع Blob)، كحزام test/unit/export/flow.test.js. */
function sink() {
  const saved = [];
  const win = {
    URL: { createObjectURL: (b) => b, revokeObjectURL() {} },
    Blob: class { constructor(parts, opts) { this.size = parts.reduce((n, p) => n + p.length, 0); this.type = opts?.type; } },
    setTimeout() {},
  };
  const doc = {
    body: { append() {} },
    createElement: () => ({ style: {}, click() { saved.push({ name: this.download, type: this.href.type, chars: this.href.size }); }, remove() {} }),
    defaultView: win,
  };
  return { doc, saved };
}

const doc94 = readFileSync(`${R}/docs/known-limitations.md`, 'utf8').split('\n')[93];
console.log('# A6 — حفظ ملف فوق حد القناة من صفحة يوتيوب (CL-N3)');
console.log(`docs/known-limitations.md:94 يعد بـ: ${doc94.includes(messageFor('SV_TOO_LARGE')) ? `«${messageFor('SV_TOO_LARGE')}» و«لا فشل صامت»` : '(تغيّر النص)'}`);
console.log(`SAVE_LIMITS.maxMessageChars = ${SAVE_LIMITS.maxMessageChars}`);

// ١. سكربت المحتوى: ملف SRT أكبر من حد القناة.
{
  const sent = [];
  const api = { runtime: { sendMessage: async (m) => { sent.push(m.type); return { v: 1, ok: true, mode: 'subfolder', downloadId: 5 }; } } };
  const { doc, saved } = sink();
  const big = { name: `AAAAAAAAAAA.en.manual.srt`, text: 'x'.repeat(SAVE_LIMITS.maxMessageChars + 1) };
  const r = await saveFile(big, { api, doc });
  console.log('\n## ١. سكربت المحتوى، ملف SRT بـmaxMessageChars+1 محرف، والوضع المختار في الإعدادات «مجلد فرعي»');
  verdict('نتيجة saveFile', { result: r, sentToWorker: sent.length, blobDownloads: saved.map((s) => ({ name: s.name, type: s.type })) },
    { result: { ok: false, code: 'SV_TOO_LARGE' }, sentToWorker: 0, blobDownloads: [] }, r.ok === false && r.code === 'SV_TOO_LARGE');
  // ما يعرضه المشغّل: saveFiles يعيد blob=true، وsession.js:1065 يضيف SV_FALLBACK_BLOB إلى نتيجة القائمة.
  const flow = await saveFiles({ exportFlow: { saveFile: (f) => saveFile(f, { api, doc: sink().doc }) }, files: [big], doc });
  const shown = flow.blob ? messageFor('SV_FALLBACK_BLOB') : null;
  console.log(`  ما يراه المستخدم في قائمة التحميل (saveFiles ثم session.js:1065): ${JSON.stringify({ saved: flow.saved, blob: flow.blob, line: shown })}`);
  console.log('  ⇒ ليس فشلًا صامتًا: يُنزَّل إلى مجلد التنزيلات (أو حسب سؤال المتصفح) مع إشعار SV_FALLBACK_BLOB؛ والوثيقة تصف رسالة أخرى بلا تنزيل.');
}

// ٢. المسارات الأخرى إلى الرجوع نفسه من سكربت المحتوى (قابلة للبلوغ أكثر من الحجم).
{
  console.log('\n## ٢. مسارات الرجوع الأخرى من سكربت المحتوى');
  const file = { name: 'AAAAAAAAAAA.en.manual.srt', text: '1\n00:00:00,000 --> 00:00:01,000\nhi\n' };
  for (const [label, sendMessage] of [
    ['العامل يرد SV_FAILED', async () => ({ v: 1, ok: false, code: 'SV_FAILED' })],
    ['لا مستقبل (Receiving end does not exist)', async () => { throw new Error('Could not establish connection. Receiving end does not exist.'); }],
    ['سياق الإضافة لم يعد صالحًا (رمي متزامن بعد تحديث الإضافة)', () => { throw new Error('Extension context invalidated.'); }],
  ]) {
    const { doc, saved } = sink();
    const r = await saveFile(file, { api: { runtime: { sendMessage } }, doc });
    console.log(`  ${label}: ${JSON.stringify(r)} ← Blob: ${JSON.stringify(saved.map((s) => s.type))}`);
  }
}

// ٣. نوع MIME في الرجوع: ثابت SRT مهما كان الامتداد (المسار الذي يبلغه .json و.md هو صفحات الإضافة حين تتعذر التفضيلات أو التنزيل).
{
  console.log('\n## ٣. نوع Blob في الرجوع من صفحة إضافة (getPrefs يفشل)');
  let lastSave = 0;
  const store = { getPrefs: async () => { throw new Error('storage unavailable'); }, setLastSave: async () => { lastSave++; } };
  const api = { downloads: { download: async () => 1, search: async () => [] } };
  for (const name of ['tarjuman-backup.json', 'study.md', 'study.txt', 'AAAAAAAAAAA.ar.srt']) {
    const { doc, saved } = sink();
    const r = await saveFile({ name, text: '{}' }, { api, store, doc });
    const ext = name.split('.').pop();
    verdict(`${name}`, { result: r.mode, blobType: saved[0]?.type }, { result: 'blob', blobType: SAVE_TYPES[ext] }, saved[0]?.type === SAVE_TYPES[ext]);
  }
  console.log(`  setLastSave في الرجوع: ${lastSave} (لا معرّف تنزيل لرابط <a download>، فلا «آخر ملف»)`);
}

// ٤. قابلية البلوغ من المشغّل: حد جسم الالتقاط 20 مليون محرف (src/extract/message.js MAX_BODY_CHARS)، ونسبة SRT إلى json3 في العينتين.
{
  console.log('\n## ٤. هل يبلغ ملف SRT من المشغّل 16 مليون محرف؟');
  const { sample, makeExtractor, captureMsg } = await import(`${R}/test/unit/extract/helpers.js`);
  const { buildExport } = await import(`${R}/src/core/export/index.js`);
  const { MAX_BODY_CHARS } = await import(`${R}/src/extract/message.js`);
  let worst = 0;
  for (const kind of ['manual', 'asr']) {
    const s = sample(kind);
    const { extractor } = makeExtractor({ videoId: s.fixture.videoId, durationMs: s.fixture.durationMs });
    extractor.handleMessage(captureMsg({ videoId: s.fixture.videoId, body: s.body, trackKind: kind }));
    const conv = extractor.convert(extractor.tracks()[0].key);
    const out = buildExport({ videoId: s.fixture.videoId, title: 'x', mode: 'normal', now: '2026-11-01T12:00:00.000Z', track: { key: conv.key, lang: conv.lang, kind: conv.kind, cues: conv.cues, warnings: conv.warnings } });
    const ratio = out.files[0].text.length / s.body.length;
    worst = Math.max(worst, ratio);
    console.log(`  ${kind}: json3 ${s.body.length} محرفًا ← SRT ${out.files[0].text.length} (النسبة ${ratio.toFixed(3)})`);
  }
  console.log(`  أقصى SRT تقديري = MAX_BODY_CHARS ${MAX_BODY_CHARS} × ${worst.toFixed(3)} ≈ ${Math.round(MAX_BODY_CHARS * worst)} < ${SAVE_LIMITS.maxMessageChars}؛ ففرع الحجم شبه غير قابل للبلوغ من المشغّل، والفروع في §٢ هي القابلة للبلوغ.`);
}

console.log(`\nالخلاصة: ${failures} حالة غير مطابقة (المتوقع: ١ للحجم مقابل الوثيقة، و٣ لنوع MIME بغير .srt).`);
