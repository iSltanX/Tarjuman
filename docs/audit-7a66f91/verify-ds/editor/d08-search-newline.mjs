// TJ-15 (DeepSeek ED-006): استعلام بمسافة يطابق فاصل السطر، والاستبدال يدمج السطرين. بمثال DeepSeek نفسه، ثم عبر المعاينة في المحرّر.
import { ROOT, log, mounted, buttonNamed, openDialogEl, textOf, sampleBundle } from './harness.mjs';

const { searchCues, planReplace } = await import(`${ROOT}/src/core/edit/search.js`);
const text = 'أول السطر\nثاني السطر';
const cues = [{ n: 1, startMs: 0, endMs: 2000, text }];
const ms = searchCues(cues, 'السطر ثاني');
log('مطابقات «السطر ثاني»:', JSON.stringify(ms.map((x) => text.slice(x.start, x.end))));
log('بعد الاستبدال بالنص نفسه:', JSON.stringify(planReplace(cues, ms, 'السطر ثاني').changes[0]?.after));

const b = sampleBundle();
const t = b.slots[0].track;
t.current = t.current.map((c, i) => (i === 0 ? { ...c, text } : c));
b.record.arabic = structuredClone(t);
const m = await mounted({ bundle: b });
const [searchIn, replaceIn] = m.env.root.querySelectorAll('.ed-search__input');
searchIn.value = 'السطر ثاني';
searchIn.dispatchEvent({ type: 'input' });
await m.env.flush();
buttonNamed(m.env.root, 'استبدال').click();
replaceIn.value = 'السطر ثاني';
await m.env.flush();
buttonNamed(m.env.root, 'معاينة استبدال الكل…').click();
await m.env.flush(1);
const d = openDialogEl(m.env);
log('المعاينة: المحذوف', JSON.stringify(textOf(d.querySelector('del'))), '| المُدرَج', JSON.stringify(textOf(d.querySelector('ins'))), '| يظهر فاصل السطر؟', d.querySelector('del').textContent.includes('\n'));
log('سطر الخطة:', JSON.stringify(textOf(d.querySelectorAll('p.tj-caption')[0])));
d.close('apply');
await m.env.flush();
log('النص بعد التطبيق:', JSON.stringify(m.editor.state.session.cueAt(0).text), '| عدد الأسطر', m.editor.state.session.cueAt(0).text.split('\n').length);
