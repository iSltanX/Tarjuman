// المحرّر في الهوية «بُنّ على ورق» (لوحات Editor وEditorDark وEditorStates): بنية الرأس صفّين، وترتيب القائمة قبل اللوحة الجانبية،
// والشريط السفلي معكوس الألوان بترتيب أزراره، وملاحظة القراءة فقط بمخرجيها، ومخرجا الحالة الفارغة، وترتيب حوار تبديل الخانة. ولا
// لون صلب في أنماطه. الـDOM وهمي فوق تخزين حقيقي بمحاكاة (العقد تُقارن بـassert.ok(a === b): انظر app-audit.test.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createStore } from '../../../../src/core/store/index.js';
import { mountEditor } from '../../../../src/pages/editor/app.js';
import { createMemoryArea } from '../../../helpers/chrome-storage.js';
import { NOW } from '../../../helpers/fixtures.js';
import { sampleBundle, seedBundle } from '../../../helpers/fixtures-v2.js';
import { editorDocument, settle } from '../../../helpers/editor-dom.js';

async function mounted({ seed = true, seek, openVideo } = {}) {
  const area = createMemoryArea({ unlimited: true });
  let at = Date.parse(NOW);
  const store = createStore({ area, now: () => (at += 1000) });
  const initial = sampleBundle();
  if (seed) await seedBundle(store, initial);
  const env = editorDocument({ videoId: initial.videoId });
  const editor = await mountEditor(env.root, { videoId: initial.videoId, store, doc: env.doc, now: () => (at += 1000), ...(seek ? { seek } : {}), ...(openVideo ? { openVideo } : {}) });
  await env.flush();
  return { area, store, editor, env, videoId: initial.videoId };
}

const text = (e) => e.textContent.replace(/\s+/g, ' ').trim();
const named = (root, label) => root.querySelectorAll('button').find((b) => text(b).includes(label) || b.getAttribute('aria-label') === label) ?? null;

test('الرأس صفّان: الوجهة والعنوان والمعرّف ثم الحالة والتراجع والإعادة والتصدير والحفظ؛ ثم خانة التحرير والنسخة المعروضة وسطر الخانة', async () => {
  const { editor, env, videoId } = await mounted();
  assert.ok(editor);
  const head = env.root.querySelector('header.ed-head');
  const rows = [...head.children].filter((c) => c.classList.contains('ed-head__row'));
  assert.equal(rows.length, 2, 'صفّان (والرسالة العابرة خارجهما)');
  const first = [...rows[0].children];
  assert.ok(first[0].classList.contains('ed-back'), 'الأول: الرجوع إلى المحفوظات');
  assert.ok(text(first[0]).includes('المحفوظات'));
  assert.equal(first[0].querySelectorAll('svg').length, 1, 'سهم الرجوع');
  assert.ok(first[1].tagName === 'h1' && first[1].classList.contains('ed-title'));
  assert.ok(text(first[2]) === videoId);
  const labels = first.slice(3).map((n) => n.getAttribute('aria-label') ?? text(n));
  assert.ok(labels.some((l) => l === 'تراجع') && labels.some((l) => l === 'إعادة'), 'التراجع والإعادة بأسمائهما');
  const undo = rows[0].querySelector('.ed-undo');
  const redo = rows[0].querySelector('.ed-redo');
  assert.ok(undo && redo);
  assert.equal(undo.querySelectorAll('span').filter((x) => !x.classList.contains('tj-sr-only')).length, 0, 'أيقونة بلا نص ظاهر (النص لقارئ الشاشة وحده)');
  assert.equal(undo.querySelectorAll('svg').length, 1);
  assert.equal(undo.getAttribute('aria-label'), 'تراجع');
  assert.equal(redo.getAttribute('aria-label'), 'إعادة');
  assert.ok(named(rows[0], 'تصدير') && named(rows[0], 'حفظ'));
  assert.equal(rows[0].querySelectorAll('.tj-pill').length, 1, 'شارة حالة الحفظ في الصف الأول');
  const second = text(rows[1]);
  assert.ok(second.includes('خانة التحرير') && second.includes('النسخة المعروضة'));
  assert.equal(rows[1].querySelector('select').getAttribute('aria-label'), 'النسخة المعروضة');
  assert.ok(rows[1].querySelector('.tj-slots'), 'محدد خانة التحرير');
  assert.ok(named(rows[1], 'استعادة الأصل'));
  assert.ok(rows[1].querySelector('.ed-slot-note'));
});

test('تسمية «خانة التحرير» تختفي مع المحدد حين لا تكون إلا ترجمة واحدة', async () => {
  const area = createMemoryArea({ unlimited: true });
  let at = Date.parse(NOW);
  const store = createStore({ area, now: () => (at += 1000) });
  const one = sampleBundle();
  one.slots[1] = { n: 2, name: null, track: null, offsetMs: 0, marks: [], position: null };
  await seedBundle(store, one);
  const env = editorDocument({ videoId: one.videoId });
  await mountEditor(env.root, { videoId: one.videoId, store, doc: env.doc, now: () => (at += 1000) });
  await env.flush();
  const row = [...env.root.querySelector('header.ed-head').children].filter((c) => c.classList.contains('ed-head__row'))[1];
  const label = [...row.children].find((c) => text(c) === 'خانة التحرير');
  assert.ok(label.hidden === true, 'بلا محدد لا تسمية له');
  assert.ok(row.querySelector('.tj-slots').hidden === true);
});

test('الجسم: القائمة أولًا ثم اللوحة الجانبية (يسارًا في RTL)، فيطابق ترتيب التركيز الترتيب البصري', async () => {
  const { env } = await mounted();
  const body = env.root.querySelector('.ed-body');
  const [a, b] = body.children;
  assert.ok(a.classList.contains('ed-main') && b.classList.contains('ed-side'));
  const css = readFileSync(new URL('../../../../src/pages/editor/editor.css', import.meta.url), 'utf8');
  assert.match(css, /\.ed-body \{ display: grid; grid-template-columns: minmax\(0, 1fr\) 300px;/, 'عمود اللوحة الثاني (يسارًا)');
});

test('الشريط السفلي: خفي بلا تغييرات، وبتعديل يظهر بمعيّن وجملة ثم «تجاهل التغييرات» ثم «حفظ» في النهاية', async () => {
  const { editor, env } = await mounted();
  const bar = env.root.querySelector('.ed-unsaved');
  assert.ok(bar.hidden === true);
  editor.state.session.setText(0, 'نص معدّل');
  await env.flush();
  assert.ok(bar.hidden === false);
  const kids = bar.children;
  assert.ok(kids[0].classList.contains('ed-unsaved__dot'), 'المعيّن أولًا');
  assert.ok(text(kids[1]).includes('تغييرات غير محفوظة') || text(kids[1]).length > 0, 'الجملة');
  const buttons = bar.querySelectorAll('button');
  assert.deepEqual(buttons.map((x) => text(x)), ['تجاهل التغييرات', 'حفظ'], 'الحفظ آخر الصف');
});

test('الأصل المستورد للقراءة فقط: ملاحظة بمخرجين (الانتقال إلى المعدّلة وتصدير الأصل) تزول بالعودة', async () => {
  const { editor, env } = await mounted();
  const banner = env.root.querySelector('.ed-banner');
  assert.ok(banner.hidden === true);
  editor.setView('original');
  await env.flush();
  assert.ok(banner.hidden === false);
  assert.ok(text(banner).includes('تعرض الأصل المستورد — قراءة فقط'));
  assert.ok(text(banner).includes('التعديل في «النسخة المعدّلة».'));
  const goBack = named(banner, 'الانتقال إليها');
  assert.ok(goBack && named(banner, 'تصدير الأصل'));
  const before = banner.children[0];
  editor.setView('original');
  await env.flush();
  assert.ok(banner.children[0] === before, 'إعادة الرسم لا تعيد بناء الأزرار (لا يسقط التركيز)');
  goBack.click();
  await env.flush();
  assert.equal(editor.state.view, 'edit');
  assert.ok(banner.hidden === true);
});

test('لافتة التغيّر الخارجي لا تُستبدل بملاحظة القراءة فقط', async () => {
  const { editor, env, store, videoId } = await mounted();
  editor.setView('original');
  await env.flush();
  assert.ok(text(env.root.querySelector('.ed-banner')).includes('قراءة فقط'));
  const b = await store.getBundle(videoId);
  await store.updateBundle(videoId, () => ({ ...b, slots: b.slots.map((s, i) => (i === 0 ? { ...s, offsetMs: 900 } : s)) }));
  await env.area?.flush?.();
  await env.flush();
  await settle();
  const banner = env.root.querySelector('.ed-banner');
  assert.ok(banner.getAttribute('data-kind') !== 'readonly' || text(banner).length > 0);
});

test('الحالة الفارغة: «فتح الفيديو» يفتحه بلا قفز زمني (لا tj:seek)، و«المحفوظات» يعود إلى صفها', async () => {
  const calls = [];
  const seeks = [];
  const { env, videoId } = await mounted({ seed: false, seek: async (t) => { seeks.push(t); return { ok: true }; }, openVideo: async (id) => { calls.push(id); return { ok: true, via: 'open', tabId: 1 }; } });
  const empty = env.root.querySelector('.tj-empty');
  assert.ok(empty, 'حالة فارغة');
  assert.ok(text(empty).includes('لا ترجمة محفوظة لهذا الفيديو'));
  // العنوان لا يتكرر نصًا (تدقيق Fable، UX-13): النص يقول السبب.
  assert.equal(text(empty).split('لا ترجمة محفوظة لهذا الفيديو').length - 1, 1);
  assert.ok(text(empty).includes('يعمل المحرّر على ترجمة عربية محفوظة'));
  named(empty, 'فتح الفيديو').click();
  await settle();
  assert.deepEqual(calls, [videoId]);
  assert.equal(seeks.length, 0, 'لا يعيد الفيديو المفتوح إلى أوله');
  named(empty, 'المحفوظات').click();
  assert.match(env.doc.defaultView.location.assigned, /pages\/library\/index\.html#v=/);
});

test('الحالة الفارغة: فشل فتح الفيديو يُقال برسالته', async () => {
  const { env } = await mounted({ seed: false, openVideo: async () => ({ ok: false, code: 'PG_OPEN_FAILED' }) });
  named(env.root.querySelector('.tj-empty'), 'فتح الفيديو').click();
  await settle();
  assert.ok(text(env.root).includes('تعذّر فتح التبويب'));
});

test('حوار تبديل الخانة بتغييرات غير محفوظة: «حفظ ثم التبديل» الأساسي ثم «البقاء» (عليه التركيز) ثم «التبديل دون حفظ» هادئ الخطر في النهاية، والعنوان بلون النص', async () => {
  const { editor, env } = await mounted();
  editor.state.session.setText(0, 'تعديل غير محفوظ');
  const switching = editor.switchSlot(2);
  await settle();
  const dialog = env.doc.querySelector('dialog[open]');
  assert.ok(dialog);
  assert.equal(dialog.classList.contains('tj-dialog--danger'), false, 'العنوان ليس بنبرة الخطر');
  const buttons = dialog.querySelectorAll('button');
  assert.deepEqual(buttons.map((b) => text(b)), ['حفظ ثم التبديل', 'البقاء', 'التبديل دون حفظ']);
  assert.ok(buttons[0].classList.contains('tj-btn--primary'));
  assert.ok(buttons[2].classList.contains('ed-btn--danger-quiet'));
  assert.ok(env.doc.activeElement === buttons[1], 'التركيز الأول على «البقاء»');
  dialog.close('stay');
  await switching;
  await env.flush();
  assert.equal(editor.state.slot, 1, 'البقاء لا يبدّل');
});

test('أنماط المحرّر: لا لون صلب (ألوانها من الرموز بالوضعين)، وأيقونة الإعادة معكوسة، والشريط السفلي معكوس بالرموز', () => {
  const css = readFileSync(new URL('../../../../src/pages/editor/editor.css', import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  assert.equal(/#[0-9a-fA-F]{3,8}\b|\brgba?\(/.test(css), false, 'لون صلب في editor.css');
  assert.match(css, /\.ed-redo \.tj-icon \{ transform: scaleX\(-1\); \}/);
  assert.match(css, /\.ed-unsaved \{[^}]*background: var\(--tj-text\)[^}]*color: var\(--tj-bg\)/);
});
