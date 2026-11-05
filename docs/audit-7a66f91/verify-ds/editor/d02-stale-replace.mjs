// TJ-03 (DeepSeek ED-001): مطابقات بحث قديمة تُطبَّق على نص تغيّر.
// المسار ١: «معاينة استبدال الكل…» مفتوحة، ثم حفظ خارجي والمحرّر نظيف (إعادة فتح صامتة)، ثم «استبدال N».
// المسار ٢: تغيّر المقاطع (تراجع بالزر، أو ⌘Z في حقل البحث، أو كتابة في نص مقطع) ثم «استبدال هنا» قبل مؤقّت إعادة البحث (120ms).
// المحرّر الحقيقي مركّبًا (harness.mjs) بأنواع حقول كالمتصفح. لا متصفح.
import { ROOT, log, mounted, buttonNamed, openDialogEl, sampleBundle } from './harness.mjs';

const { saveSlot } = await import(`${ROOT}/src/pages/editor/persist.js`);

function withTexts(texts) {
  const b = sampleBundle();
  const t = b.slots[0].track;
  t.current = t.current.map((c, i) => ({ ...c, text: texts[i] ?? c.text }));
  b.record.arabic = structuredClone(t);
  return b;
}

async function searchFor(m, query, replacement) {
  const [searchIn, replaceIn] = m.env.root.querySelectorAll('.ed-search__input');
  searchIn.value = query;
  searchIn.dispatchEvent({ type: 'input' });
  await m.env.flush();
  buttonNamed(m.env.root, 'استبدال').click();
  replaceIn.value = replacement;
  replaceIn.dispatchEvent({ type: 'input' });
  await m.env.flush();
  return { searchIn, replaceIn };
}
const texts = (s) => Array.from({ length: s.count }, (_, i) => s.cueAt(i).text);
const hereBtn = (m) => m.env.root.querySelector('.ed-search__replace').querySelectorAll('button')[0];

// ---- المسار ١: سيناريو DeepSeek الحي نفسه (15-replace.json s1) ----
{
  const m = await mounted({ bundle: withTexts(['عفوًا؟', 'عفوًا يا سيدي؟', 'عفوًا؟', 'أوه، بربّك.', 'ألديك لحظة يا سيدي؟']) });
  await searchFor(m, 'عفوًا', 'معذرة');
  const before = m.editor.state.session;
  buttonNamed(m.env.root, 'معاينة استبدال الكل…').click();
  await m.env.flush(1);
  const dlg = openDialogEl(m.env);
  const other = await m.store.getBundle(m.videoId);
  const cues = other.slots[0].track.current.map((c, i) => (i === 0 ? { ...c, text: 'حسنًا، عفوًا؟' } : c));
  await saveSlot(m.store, m.videoId, other, 1, { cues, offsetChanged: false, offsetMs: other.slots[0].offsetMs });
  await m.env.flush(6);
  log('[١] الحوار ما زال مفتوحًا:', Boolean(openDialogEl(m.env)), '| جلسة جديدة (إعادة فتح صامتة):', m.editor.state.session !== before, '| المقطع 1 الآن:', m.editor.state.session.cueAt(0).text);
  dlg.close('apply');
  await m.env.flush(4);
  const s = m.editor.state.session;
  log('[١] بعد «استبدال 3»: المقطع 1 =', JSON.stringify(s.cueAt(0).text), '(المتوقع «حسنًا، معذرة؟») | 2 =', JSON.stringify(s.cueAt(1).text), '| 3 =', JSON.stringify(s.cueAt(2).text));
  log('[١] رسالة النتيجة:', JSON.stringify(m.editor.state.result?.text), '| dirty =', s.dirty);
}

// ---- المسار ٢-أ: «استبدال هنا» ثم زر «تراجع» (واجهة) ثم «استبدال هنا» قبل المؤقّت ----
async function path2(label, changeFn) {
  const m = await mounted({ bundle: withTexts(['السلام أولًا ثم السلام ثانيًا']) });
  await searchFor(m, 'السلام', 'سلم');
  hereBtn(m).click();
  await m.env.flush(); // إطار الرسم: زر «تراجع» يصير مفعّلًا
  log(`[٢-${label}] بعد «استبدال هنا» الأول:`, JSON.stringify(m.editor.state.session.cueAt(0).text), '| المطابقات:', JSON.stringify(m.editor.state.session && m.env.root.querySelector('.ed-search__count').textContent));
  await changeFn(m);
  log(`[٢-${label}] بعد التغيير: النص =`, JSON.stringify(m.editor.state.session.cueAt(0).text), '| مؤقّتات/إطارات معلّقة =', m.env.pending());
  const btn = hereBtn(m);
  log(`[٢-${label}] زر «استبدال هنا» مفعّل؟`, btn.getAttribute('aria-disabled') !== 'true');
  btn.click(); // قبل flush: مؤقّت إعادة البحث (120ms) لم يمضِ
  const after = m.editor.state.session.cueAt(0).text;
  log(`[٢-${label}] بعد «استبدال هنا» قبل المؤقّت:`, JSON.stringify(after), '| النتيجة:', JSON.stringify(m.editor.state.result?.text));
  return after;
}
await path2('أ زر التراجع', async (m) => { buttonNamed(m.env.root, 'تراجع').click(); });
await path2('ب ⌘Z في حقل البحث (U17)', async (m) => {
  const searchIn = m.env.root.querySelector('.ed-search__input');
  searchIn.focus();
  const e = m.key(searchIn, { code: 'KeyZ' });
  log('   ⌘Z في type=search: defaultPrevented =', e.defaultPrevented);
});
await path2('ج كتابة في نص المقطع', async (m) => {
  const ta = m.field(0, 'text');
  ta.focus();
  ta.value = `و${ta.value}`;
  ta.dispatchEvent({ type: 'input' });
});

// ---- ضابط: الشيء نفسه بعد مضي المؤقّت (flush) يستبدل في الموضع الصحيح ----
{
  const m = await mounted({ bundle: withTexts(['السلام أولًا ثم السلام ثانيًا']) });
  await searchFor(m, 'السلام', 'سلم');
  hereBtn(m).click();
  await m.env.flush();
  buttonNamed(m.env.root, 'تراجع').click();
  await m.env.flush(); // المؤقّت يمضي
  hereBtn(m).click();
  log('[ضابط] بعد مضي المؤقّت:', JSON.stringify(m.editor.state.session.cueAt(0).text));
}
