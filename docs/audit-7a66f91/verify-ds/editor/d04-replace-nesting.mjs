// TJ-11 (DeepSeek ED-007): «استبدال هنا» ببديل يحوي كلمة البحث بعد آخر مطابقة يعشّش في النص المُدرَج.
// سيناريو DeepSeek الحي (15-replace.json s2) على المحرّر مركّبًا، وضابط الحالة الوسطى التي يختبرها test/live/editor/v2.mjs:492.
import { log, mounted, buttonNamed, sampleBundle } from './harness.mjs';

function withTexts(texts) {
  const b = sampleBundle();
  const t = b.slots[0].track;
  t.current = t.current.map((c, i) => ({ ...c, text: texts[i] ?? c.text }));
  b.record.arabic = structuredClone(t);
  return b;
}
async function run(label, texts, query, replacement, clicks) {
  const m = await mounted({ bundle: withTexts(texts) });
  const [searchIn, replaceIn] = m.env.root.querySelectorAll('.ed-search__input');
  searchIn.value = query;
  searchIn.dispatchEvent({ type: 'input' });
  await m.env.flush();
  buttonNamed(m.env.root, 'استبدال').click();
  replaceIn.value = replacement;
  await m.env.flush();
  const here = () => m.env.root.querySelector('.ed-search__replace').querySelectorAll('button')[0];
  for (let k = 1; k <= clicks; k++) {
    here().click();
    await m.env.flush();
    const s = m.editor.state.session;
    const st = m.editor.state; // لا وصول مباشر لحالة البحث إلا بالعدّاد
    log(`[${label}] نقرة ${k}: العدّاد «${m.env.root.querySelector('.ed-search__count').textContent}» | المقاطع:`, JSON.stringify(Array.from({ length: s.count }, (_, i) => s.cueAt(i).text).filter((t) => t.includes(query))));
    void st;
  }
}
await run('DeepSeek s2', ['عفوًا؟', 'عفوًا يا سيدي؟', 'عفوًا؟', 'أوه، بربّك.', 'ألديك لحظة يا سيدي؟'], 'سيدي', 'سيدي الكريم', 4);
await run('مطابقة واحدة', ['قال: السلام عليكم'], 'السلام', 'التحية والسلام', 2);
await run('ضابط: مطابقات بعدها (الحالة الوسطى)', ['أ السلام', 'ب السلام', 'ج السلام'], 'السلام', 'السلام مكرر', 2);
