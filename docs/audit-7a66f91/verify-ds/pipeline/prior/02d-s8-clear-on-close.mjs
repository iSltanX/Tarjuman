// S8 بسيناريو شائع: «امسح التاريخ عند إغلاق Firefox» يفرغ سجل التنزيلات، فيبدأ العدّاد من 1 في الجلسة التالية.
import { TJ_ROOT as T } from '../../../verify/_root.mjs';
const { savedPath } = await import(`${T}/src/core/save/index.js`);
const { createStore } = await import(`${T}/src/core/store/index.js`);
const { createMemoryArea } = await import(`${T}/test/helpers/chrome-storage.js`);
// نموذج DownloadMap (ext-downloads.js:333–419): currentId=0 لكل جلسة، lazyInit يرقّم getAll بالترتيب، ثم كل تنزيل جديد ++currentId
const session = (history) => { let cur = 0; const byId = new Map(); history.forEach((d) => byId.set(++cur, d)); return { add: (d) => { const id = ++cur; byId.set(id, d); return id; }, downloads: { search: async ({ id }) => (byId.has(id) ? [byId.get(id)] : []) } }; };
const dl = (p) => ({ state: 'complete', exists: true, filename: p });
const area = createMemoryArea({ unlimited: true });
const store = createStore({ area });
const s1 = session([]);
s1.add(dl('/Users/u/Downloads/report.pdf'));
await store.setLastSave(s1.add(dl('/Users/u/Downloads/AAAAAAAAAAA.en.manual.normal.srt')));
console.log('الجلسة 1 «آخر ملف»:', await savedPath((await store.getLastSave()).downloadId, { downloads: s1.downloads }));
// إغلاق مع مسح التاريخ، ثم جلسة جديدة بتنزيلين عاديين قبل فتح إعدادات ترجمان
const s2 = session([]);
s2.add(dl('/Users/u/Downloads/medical-results.pdf'));
s2.add(dl('/Users/u/Downloads/passport-scan.jpg'));
console.log('الجلسة 2 «آخر ملف»:', await savedPath((await store.getLastSave()).downloadId, { downloads: s2.downloads }));
