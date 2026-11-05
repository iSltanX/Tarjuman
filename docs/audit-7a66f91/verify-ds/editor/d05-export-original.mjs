// TJ-12 (DeepSeek ED-004 = PIPE-08): تصدير «الأصل المستورد» من المحرّر ومن المحفوظات بالإزاحة نفسها (+0.5، الخانة 1 النشطة).
// المحرّر مركّبًا بـsaveFile ملتقط، والمحفوظات بـexportArabic الحقيقية. لا متصفح.
import { ROOT, log, createStore, mountEditor, createMemoryArea, NOW, sampleBundle, seedBundle, editorDocument, browserLikeTypes, openDialogEl, textOf } from './harness.mjs';

const { exportArabic } = await import(`${ROOT}/src/pages/library/actions.js`);
const firstTime = (srt) => srt.split('\n').find((l) => l.includes('-->'));

const area = createMemoryArea({ unlimited: true });
let at = Date.parse(NOW);
const now = () => (at += 1000);
const store = createStore({ area, now });
const bundle = sampleBundle();
await seedBundle(store, bundle);
log('الخانة النشطة =', bundle.active, '| إزاحتها =', bundle.slots[0].offsetMs, '| view.displayOffsetMs =', bundle.record.view.displayOffsetMs, '| أول مقطع في الأصل =', bundle.slots[0].track.original[0].startMs);

// ---- المحرّر ----
const env = editorDocument({ videoId: bundle.videoId });
browserLikeTypes(env.doc.defaultView);
const saved = [];
const saveFile = async (file) => { saved.push(file); return { ok: true, mode: 'downloads', downloadId: saved.length }; };
const editor = await mountEditor(env.root, { videoId: bundle.videoId, store, doc: env.doc, now, saveFile });
await env.flush();
const exportBtn = env.root.querySelector('.ed-head').querySelectorAll('button').find((b) => textOf(b).startsWith('تصدير'));
exportBtn.click();
await env.flush(1);
const item = [...env.doc.body.descendants()].find((e) => e.getAttribute?.('role') === 'menuitem' && textOf(e).startsWith('الترجمة SRT'));
item.click();
await env.flush(1);
const d = openDialogEl(env);
const radio = [...d.descendants()].find((e) => e.tagName === 'input' && e.getAttribute('name') === 'ed-variant' && e.getAttribute('value') === 'original');
radio.checked = true;
radio.dispatchEvent({ type: 'change' });
log('[المحرّر] حوار التصدير بعد اختيار «الأصل»: أسئلة التوقيت ظاهرة؟', Boolean([...d.descendants()].find((e) => e.getAttribute?.('name') === 'ed-timing')),
  '| الملاحظة:', JSON.stringify(textOf(d.querySelector('p.tj-caption'))), '| الاسم:', JSON.stringify(textOf(d.querySelector('p.tj-body-sm'))));
d.close('download');
await env.flush(3);
log('[المحرّر] الملف:', saved[0]?.name, '| أول توقيت:', firstTime(saved[0]?.text ?? ''));
void editor;

// ---- المحفوظات ----
let asked = null;
const files = [];
const r = await exportArabic({ store, videoId: bundle.videoId, variant: 'original', askTiming: async (ms) => { asked = ms; return 'shown'; }, save: async (f) => { files.push(f); return { ok: true, mode: 'downloads', downloadId: 1 }; } });
log('[المحفوظات] سُئل المستخدم عن الإزاحة؟', asked, '| الاختيار الافتراضي «الظاهر» | الملف:', r.name, '| أول توقيت:', firstTime(files[0].text));
