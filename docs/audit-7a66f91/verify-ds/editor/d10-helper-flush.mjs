// T-03: مساعد test/helpers/editor-dom.js. (١) HTMLInputElement وHTMLTextAreaElement = FakeElement (U71).
// (٢) flush() ينفّذ الإطارات والمؤقتات معًا ويُسقط مهلة setTimeout. (٣) هل حالة «قبل مهلة البحث 120ms» قابلة للاختبار به؟
import { ROOT, log, mounted, FakeElement, editorDocument } from './harness.mjs';

// (١) بالمساعد كما هو (types:false): ⌘Z في حقل البحث type=search
{
  const env = editorDocument({ videoId: 'AAAAAAAAAAA' });
  const w = env.doc.defaultView;
  log('[١] HTMLInputElement === FakeElement؟', w.HTMLInputElement === FakeElement, '| HTMLTextAreaElement === FakeElement؟', w.HTMLTextAreaElement === FakeElement,
    '| FakeElement له type؟', Object.getOwnPropertyDescriptor(FakeElement.prototype, 'type') !== undefined);
  const div = env.doc.createElement('div');
  log('[١] أي عنصر (div) instanceof HTMLInputElement؟', div instanceof w.HTMLInputElement, '⇒ حارس typing في app.js:1842 صحيح دائمًا');
}
{
  // ملاحظة: types:false يجب أن يسبق أي browserLikeTypes في العملية نفسها (الخاصية type على النموذج تبقى بعده).
  const m = await mounted({ types: false });
  const s = m.editor.state.session;
  s.setText(0, `${s.cueAt(0).text} تعديل`);
  const searchIn = m.env.root.querySelector('.ed-search__input');
  const e = m.key(searchIn, { code: 'KeyZ' });
  log('[١] بالمساعد كما هو: ⌘Z في حقل البحث يتراجع؟', m.editor.state.session.cueAt(0).text.endsWith('تعديل') ? 'لا' : 'نعم', '| defaultPrevented =', e.defaultPrevented, '⇒ U17 لا يظهر في اختبار وحدة بهذا المساعد');
  const body = m.key(m.env.doc.body, { code: 'KeyZ' });
  log('[١] ⌘Z وهدفه body: يتراجع؟', m.editor.state.session.cueAt(0).text.endsWith('تعديل') ? 'لا' : 'نعم', '| defaultPrevented =', body.defaultPrevented, '⇒ حتى المسار السليم لا يُختبر');
}

// (٢) flush يُسقط المهلة ويخلط الإطار بالمؤقت
{
  const env = editorDocument({ videoId: 'AAAAAAAAAAA' });
  const w = env.doc.defaultView;
  const order = [];
  w.setTimeout(() => order.push('مؤقت 6000ms'), 6000);
  w.setTimeout(() => order.push('مؤقت 120ms'), 120);
  w.requestAnimationFrame(() => order.push('إطار'));
  w.setTimeout(() => order.push('مؤقت 250ms'), 250);
  log('[٢] معلّق قبل flush:', env.pending());
  await env.flush(1);
  log('[٢] بعد flush(1) واحد نُفّذ بترتيب الجدولة لا المهلة:', order.join(' ← '), '| معلّق:', env.pending());
  log('[٢] ولا واجهة لتنفيذ الإطارات وحدها: مفاتيح env =', Object.keys(env).join(', '));
}

// (٣) حالة «قبل المؤقّت» قابلة للاختبار بترك flush، كما في d02 (المسار ٢): عدد المعلّق بعد التراجع
{
  const m = await mounted();
  const [searchIn] = m.env.root.querySelectorAll('.ed-search__input');
  searchIn.value = 'أولى';
  searchIn.dispatchEvent({ type: 'input' });
  log('[٣] بعد كتابة الاستعلام وقبل flush: معلّق =', m.env.pending(), '| عدّاد النتائج =', JSON.stringify(m.env.root.querySelector('.ed-search__count').textContent), '(البحث لم يجرِ بعد)');
  await m.env.flush();
  log('[٣] بعد flush: العدّاد =', JSON.stringify(m.env.root.querySelector('.ed-search__count').textContent));
}
void ROOT;
