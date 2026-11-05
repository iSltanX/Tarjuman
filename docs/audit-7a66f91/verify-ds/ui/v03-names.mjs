// تحقق مستقل: DS-TJ-42 (أسماء مفاتيح الإعدادات)، وDS-TJ-50 (سبب التعطيل في اسم الزر ووصفه، جزء ui/components.js)، وDS-T-04
// (الـDOM الوهمي). حساب الاسم هنا تقريب لقواعد accname 1.2 (aria-labelledby ثم aria-label ثم label[for] أو المحيط ثم المحتوى بلا
// aria-hidden)، وهو يكفي لهذه البنى؛ أما إدراج المسافات بين العناصر فسلوك متصفح لا يُحسم هنا.
import { imp, log } from './common.mjs';

const { createStore } = await imp('src/core/store/index.js');
const { createSettings } = await imp('src/pages/settings/view.js');
const { button } = await imp('src/ui/components.js');
const { createMemoryArea } = await imp('test/helpers/chrome-storage.js');
const { newDocument, settle } = await imp('test/unit/pages/library/fake-dom.js');

const contentText = (el) => {
  if (el.nodeType === 3) return el.textContent;
  if (el.getAttribute?.('aria-hidden') === 'true') return '';
  if (el.tagName === 'input') return '';
  return (el.childNodes ?? []).map(contentText).join('');
};
function nameOf(doc, el) {
  const lb = el.getAttribute('aria-labelledby');
  if (lb) return lb.split(/\s+/).map((id) => doc.getElementById(id)).filter(Boolean).map(contentText).join(' ').trim();
  const al = el.getAttribute('aria-label');
  if (al) return al.trim();
  if (el.tagName === 'input') {
    const id = el.getAttribute('id');
    let label = id ? doc.documentElement.querySelectorAll('label').find((l) => l.getAttribute('for') === id) : null;
    for (let n = el.parentNode; !label && n; n = n.parentNode) if (n.tagName === 'label') label = n;
    return label ? contentText(label).replace(/\s+/g, ' ').trim() : '';
  }
  return contentText(el).replace(/\s+/g, ' ').trim();
}

log('== DS-TJ-42 ==');
{
  const area = createMemoryArea({ unlimited: true });
  const store = createStore({ area });
  const doc = newDocument();
  const s = createSettings({ store, version: '1.1.0', doc, clipboardWrite: async () => {}, diagnosticsText: async () => '{}', setTimer: () => 0, clearTimer: () => {} });
  doc.body.append(s.root);
  await s.load();
  await settle(5);
  const switches = [...s.root.descendants()].filter((e) => e.getAttribute?.('role') === 'switch');
  for (const sw of switches) {
    let row = sw.parentNode;
    while (row && !row.classList?.contains('st-row')) row = row.parentNode;
    const rowLabel = row?.querySelector('.st-row__label .tj-label');
    const hint = row?.querySelector('.st-row__hint');
    const refs = [sw.getAttribute('aria-labelledby'), sw.getAttribute('aria-describedby')].filter(Boolean).join(' ');
    log(`«${nameOf(doc, sw)}» | صفّه «${rowLabel?.textContent ?? '—'}»${hint ? ` (شرح «${hint.textContent}»)` : ''} | تسمية الصف ${rowLabel?.tagName} id=${rowLabel?.getAttribute('id') ?? 'لا'} | labelledby/describedby: ${refs || 'لا شيء'}`);
  }
}

log('\n== DS-TJ-50 (ui/components.js) ==');
{
  const doc = newDocument();
  const b = button({ label: 'تحرير الترجمة', size: 'lg', variant: 'primary', disabledReason: 'جارٍ قراءة ترجمة الفيديو…', doc });
  doc.body.append(b);
  const descId = b.getAttribute('aria-describedby');
  const kids = [...b.children].map((c) => `${c.tagName}${c.className ? `.${c.className}` : ''}«${c.textContent}»`);
  log(`أبناء الزر: ${kids.join(' + ')} | الاسم من المحتوى (بلا فاصل مفروض): «${nameOf(doc, b)}» | aria-describedby → «${doc.getElementById(descId)?.textContent}» | title=«${b.title}» | aria-disabled=${b.getAttribute('aria-disabled')}`);
  const ic = button({ label: 'تحرير: فيديو', iconOnly: true, icon: 'edit', size: 'sm', title: 'تحرير الترجمة', disabledReason: 'لا ترجمة عربية.', doc });
  doc.body.append(ic);
  log(`زر أيقونة (iconOnly): aria-label=«${ic.getAttribute('aria-label')}» ⇒ الاسم «${nameOf(doc, ic)}» (السبب خارج الاسم) | الوصف «${doc.getElementById(ic.getAttribute('aria-describedby'))?.textContent}»`);
}

log('\n== DS-T-04 ==');
{
  const doc = newDocument();
  const host = doc.createElement('div');
  const btn = doc.createElement('button');
  host.append(btn);
  doc.body.append(host);
  btn.focus();
  host.replaceChildren();
  log(`fake-dom (المحفوظات): بعد فصل العقدة المركّزة activeElement هو body؟ ${doc.activeElement === doc.body} | هو العقدة المفصولة؟ ${doc.activeElement === btn}`);
  let threw = null;
  try { host.querySelector(':scope > .x'); } catch (e) { threw = e.message; }
  log(`  :scope في fake-dom الأساسي: ${threw ? `يرمي «${threw}»` : 'مدعوم'}`);
  const { editorDocument } = await imp('test/helpers/editor-dom.js');
  const ed = editorDocument({ videoId: 'AAAAAAAAAAA' });
  const d2 = ed.doc ?? ed.document ?? ed;
  const h2 = d2.createElement('div'); const c2 = d2.createElement('span'); c2.className = 'x'; h2.append(c2);
  let r2 = null;
  try { r2 = h2.querySelector(':scope > .x') === c2; } catch (e) { r2 = `يرمي ${e.message}`; }
  const b2 = d2.createElement('button'); d2.body.append(b2); b2.focus(); b2.remove();
  log(`  editor-dom: :scope > .x يعمل؟ ${r2} | بعد إزالة المركّز activeElement=body؟ ${d2.activeElement === d2.body}`);
  const P = await imp('test/unit/player/overlay/fake-dom.js');
  const env = P.createFakeEnv({ href: 'https://www.youtube.com/watch?v=AAAAAAAAAAA' });
  const b3 = env.doc.createElement('button'); env.doc.body.appendChild(b3); b3.focus(); b3.remove();
  log(`  fake-dom المشغّل: بعد إزالة المركّز document.activeElement=body؟ ${env.doc.activeElement === env.doc.body}`);
}
