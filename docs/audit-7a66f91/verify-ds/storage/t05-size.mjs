// T-05: محاكاة التخزين (test/helpers/chrome-storage.js:9) تقيس الحجم بطول JSON بوحدات UTF-16. مقارنة بالبايتات (UTF-8) لحزمة
// عربية مخزنة، ولملف بنص عربي خالص. ولا يُدّعى هنا سلوك Chrome؛ الفرق بين المقياسين وحده.
import { load, out } from './common.mjs';
const { createStore } = await load('src/core/store/index.js');
const { createMemoryArea } = await load('test/helpers/chrome-storage.js');
const { makeCues } = await load('test/helpers/fixtures.js');
const { sampleBundle, seedBundle } = await load('test/helpers/fixtures-v2.js');
const ID = 'AAAAAAAAAAA';
const area = createMemoryArea({ unlimited: true });
const store = createStore({ area });
const b = sampleBundle({ videoId: ID, third: true });
for (const s of b.slots) if (s.track) { s.track.original = makeCues(800, { text: (i) => `هذا نص عربي تجريبي طويل نسبيًا للمقطع رقم ${i}` }); s.track.current = null; s.track.editedAt = null; s.marks = []; s.position = null; }
b.record.arabic = structuredClone(b.slots[0].track);
await seedBundle(store, b);
const dump = area.dump();
const mock = await area.getBytesInUse(null);
const utf8 = Object.entries(dump).reduce((n, [k, v]) => n + Buffer.byteLength(k) + Buffer.byteLength(JSON.stringify(v)), 0);
const pure = 'ترجمة'.repeat(1000);
out('T-05', { mockBytesInUse: mock, utf8Bytes: utf8, ratio: +(utf8 / mock).toFixed(3), pureArabicString: { mock: JSON.stringify(pure).length, utf8: Buffer.byteLength(JSON.stringify(pure)) } });
