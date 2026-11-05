// ملاحظات FINDINGS.md غير المنقولة إلى التقرير: meta مشوّه (schema نصًا)، وST_SCHEMA_NEWER مع «مسح كل البيانات».
import { load, out, settle } from './common.mjs';
const { createStore } = await load('src/core/store/index.js');
const { createMemoryArea } = await load('test/helpers/chrome-storage.js');
const { NOW, videoRecord } = await load('test/helpers/fixtures.js');
{
  const area = createMemoryArea({ unlimited: true, initial: { meta: { schema: '2', createdAt: NOW }, 'video:AAAAAAAAAAA': videoRecord() } });
  const s = createStore({ area });
  const r = await settle(s.getVideo('AAAAAAAAAAA'));
  out('meta مشوّه (schema نصًا)', { read: r.ok ? 'ok' : r.code, metaAfter: area.dump().meta });
}
{
  const area = createMemoryArea({ unlimited: true, initial: { meta: { schema: 2, createdAt: NOW, migratedAt: null }, 'video:AAAAAAAAAAA': { future: true } } });
  const s = createStore({ area });
  const w = await settle(s.updateVideo('AAAAAAAAAAA', () => videoRecord()));
  const c = await settle(s.clearAll());
  out('ST_SCHEMA_NEWER ثم clearAll', { write: w.ok ? 'ok' : w.code, clearAll: c.ok ? 'ok' : c.code, metaAfter: area.dump().meta, keys: Object.keys(area.dump()) });
}
