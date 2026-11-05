// STO-11: «مسح كل البيانات» — area.clear() ينجح ثم تفشل كتابة meta في ready() (تعذّر عابر)، عبر صفحة الإعدادات كاملة.
import { IDS, createMemoryArea, createStore, errors, markText, mountSettings, NOW, out, sampleBundle, section, seedBundle, settle, textOf } from './_h.mjs';

const { messageFor } = errors;
const base = createMemoryArea({ unlimited: true });
let breakMeta = false;
const area = { ...base, async set(items) { if (breakMeta && Object.hasOwn(items, 'meta')) { breakMeta = false; throw new Error('synthetic metadata write failure'); } return base.set(items); }, flush: base.flush };
let t = Date.parse(NOW);
const store = createStore({ area, now: () => (t += 1000) });
await seedBundle(store, sampleBundle({ videoId: IDS[0] }));
await store.setSettings({ offsetStepMs: 1000 });
const m = await mountSettings({ store, area });
const checked = () => [...m.root.descendants()].filter((e) => e.tagName === 'input' && e.getAttribute('type') === 'radio' && e.checked).map((e) => `${e.getAttribute('name')}=${e.getAttribute('value')}`);
const before = { keys: (await base.getKeys()).length, checkedRadiosInUi: checked() };
const clearBtn = [...m.root.descendants()].find((e) => e.tagName === 'button' && e.textContent.includes('مسح كل البيانات'));
m.answers.push((o) => { o.content.querySelector('input').value = 'امسح'; });
breakMeta = true;
clearBtn.click();
await settle(15);
const marks = markText(section(m, 'التخزين'));
const keysAfter = await base.getKeys();
// هل تعرض الصفحة الخطوة القديمة؟ (لا syncAll في مسار الخطأ): نقرأ زر الخطوة المختار في الواجهة.
const radios = [...m.root.descendants()].filter((e) => e.tagName === 'input' && e.getAttribute('type') === 'radio' && e.checked).map((e) => `${e.getAttribute('name')}=${e.getAttribute('value')}`);
out('clear-then-meta-failure', {
  before, keysAfter, marks,
  shownUnexpected: marks.some((x) => x.includes(messageFor('TJ_UNEXPECTED'))),
  shownClearDone: marks.some((x) => x.includes(messageFor('PG_CLEAR_DONE'))),
  checkedRadiosInUi: radios,
  storedStepNow: (await store.getSettings()).offsetStepMs,
  keysAfterNextRead: (await base.getKeys()),
});
