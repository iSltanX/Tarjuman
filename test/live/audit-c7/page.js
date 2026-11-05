// صفحة زرع لاختبار C7 الحي (تدقيق 7a66f91، صفحات الإضافة والنسخ الاحتياطي): تُجمَّع وتُحقن في بناء مؤقت (tests/c7.html)، فتكتب
// عبر التخزين الحقيقي للإضافة (createStore()، والكتابة عبر العامل الخلفي)، وتحاكي تحديثًا من تبويب آخر، وتبني نسخة احتياطية
// لاختبار المنتقي، وترسم نافذة الأيقونة في أسوأ حالاتها بأنماطها الحقيقية (tests/c7.html?popup) للقياس. لا شبكة ولا يوتيوب.
import { createBackup } from '../../../src/core/backup/index.js';
import { createStore } from '../../../src/core/store/index.js';
import { button, el } from '../../../src/ui/components.js';
import { guideList, statusCard } from '../../../src/pages/popup/view.js';
import { NOW, videoRecord } from '../../helpers/fixtures.js';
import { samplePrefs, sampleBundle, seedBundle } from '../../helpers/fixtures-v2.js';

const store = createStore();
export const IDS = { A: 'C7aaaaaaaaa', B: 'C7bbbbbbbbb', C: 'C7ccccccccc' };

/** النافذة في أسوأ حالة (I09): عنوان بسطرين، ورفض التقاط بسطرين، وتعطل أدوات بسبب، وصف «الزر مخفي»، وبلا ترجمة، وخطوات. */
function popupWorst() {
  document.body.className = 'tj-popup';
  const app = el('main', { attrs: { id: 'app' } });
  const title = 'محاضرة طويلة العنوان جدًا عن تعلّم الآلة والنماذج اللغوية الكبيرة وكيف تُدرَّب وتُقيَّم في التطبيقات الحقيقية';
  const card = statusCard(
    { kind: 'no-subtitle', title, englishLine: 'المسار الإنجليزي: غير ملتقط', englishKind: null, englishReady: false, saved: true },
    { tone: 'danger', text: 'تعذّر ربط الأدوات بالمشغّل — أعد تحميل الصفحة', reason: 'تغيّرت بنية مشغّل يوتيوب فلم يُعثر على شريط الأدوات. أعد تحميل الصفحة، وإن تكرر فانسخ تشخيص الصفحة.' },
    { tone: 'warning', text: 'هذا المسار مترجم آليًا من لغة أخرى، فلا يُلتقط أصلًا للترجمة. اختر المسار الإنجليزي الأصلي من إعدادات يوتيوب.' },
  );
  const entry = el('div', { className: 'tj-popup__entry', attrs: { role: 'group' }, children: [el('span', { className: 'tj-popup__entry-text', text: 'زر النص المتزامن مخفي من الشريط' }), button({ label: 'إظهاره', size: 'sm', variant: 'ghost' })] });
  const actions = el('div', { className: 'tj-popup__actions', children: [button({ label: 'نسخ تعليمات الترجمة', icon: 'copy', size: 'lg', variant: 'primary', className: 'tj-popup__primary' })] });
  const steps = el('div', { className: 'tj-popup__guide', children: [guideList([{ n: 1, text: 'نزّل الأصل من زر التنزيل وانسخ التعليمات', state: 'now' }, { n: 2, text: 'ترجمها بنموذجك المفضّل', state: 'pending' }, { n: 3, text: 'ارفع العربية من زر الترجمة في الشريط', state: 'pending' }])] });
  const diag = el('div', { className: 'tj-popup__diag-host', children: [el('p', { className: 'tj-popup__diag-row', children: [el('button', { className: 'tj-popup__diag', text: 'نسخ تشخيص الصفحة', attrs: { type: 'button' } })] })] });
  const main = el('div', { className: 'tj-popup__main', children: [el('span', { className: 'tj-popup__eyebrow', text: 'الفيديو الحالي' }), card, el('div', { className: 'tj-popup__entry-host', children: [entry] }), actions, steps, diag] });
  const nav = el('nav', { className: 'tj-popup__nav', attrs: { 'aria-label': 'صفحات ترجمان' }, children: [el('button', { className: 'tj-popup__nav-item', text: 'المحفوظات' }), el('button', { className: 'tj-popup__nav-item', text: 'الإعدادات' })] });
  app.append(el('header', { className: 'tj-popup__head', children: [el('h1', { className: 'tj-sr-only', text: 'ترجمان' }), el('span', { text: 'ترجمان' })] }), main, nav);
  document.body.replaceChildren(app);
}

window.__c7 = {
  ready: true,
  IDS,
  /** مكتبة: A بثلاث ترجمات وسابقة، وB وC سجلّان، وextra سجلات إضافية لـ«عرض المزيد»، وقاموس، وأدوات اللوحة مفعّلة. */
  async seed({ extra = 0, settingsShot = false } = {}) {
    // الإضافية أولًا فتكون الأقدم: A وB وC في أعلى المحفوظات (الترتيب «آخر تعديل»)، والإضافية بعد الخمسين لـ«عرض المزيد».
    for (let i = 0; i < extra; i++) {
      const id = `C7x${String(i).padStart(8, '0')}`;
      await store.updateVideo(id, () => ({ ...videoRecord({ videoId: id }), title: `فيديو إضافي ${i + 1}` }));
    }
    await store.updateVideo(IDS.C, () => ({ ...videoRecord({ videoId: IDS.C }), title: 'فيديو C7 الثالث' }));
    await store.updateVideo(IDS.B, () => ({ ...videoRecord({ videoId: IDS.B }), title: 'فيديو C7 الثاني' }));
    const a = sampleBundle({ videoId: IDS.A, third: true });
    await seedBundle(store, { ...a, record: { ...a.record, title: 'محاضرة C7 — ثلاث ترجمات' } });
    // بلا صور: المعرّفات مصطنعة، ولا طلب إلى i.ytimg.com في الاختبار.
    if (settingsShot) await store.setPrefs({ ui: { panelOpen: true, panelEntry: true } });
    else await store.setPrefs({ ...samplePrefs(), ui: { thumbnails: false } });
    return (await store.listIndex()).length;
  },
  /** تحديث من «تبويب آخر»: كتابة في سجل فيديو آخر تعيد بناء المحفوظات بعد 200 م.ث. */
  async touch(id = IDS.B) {
    await store.updateVideo(id, (r) => ({ ...r, title: `${r.title}·` }));
    return true;
  },
  async backupText() {
    return (await createBackup({ store, appVersion: 'c7-live' })).text;
  },
  /** زر معطّل بسبب، لقراءة اسمه ووصفه من شجرة الوصول (U91). */
  disabledButton() {
    const b = button({ label: 'حفظ', disabledReason: 'لا تغييرات للحفظ.' });
    b.id = 'c7-disabled';
    document.body.append(b);
    return true;
  },
  popupWorst,
  NOW,
};
if (/c7-popup\.html$/.test(location.pathname)) popupWorst();
