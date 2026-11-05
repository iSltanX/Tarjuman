// تحقق مستقل (DS-TJ-07 وDS-TJ-08 وDS-TJ-47 وDS-TJ-44 جزء المشغّل واللوحة وDS-S4) فوق الوحدات الحقيقية والـDOM الوهمي
// للمشروع وحزامي المشغّل واللوحة. لا متصفح ولا شبكة. المقارنة بالهوية (a === b) لا بـassert على العقد.
import { T, imp, log } from './common.mjs';

const H = await imp('test/unit/player/controls/harness.js');
const P = await imp('test/unit/player/panel/harness.js');
const { UNDO_MS: CT_UNDO_MS, TOAST_MS: CT_TOAST_MS } = await imp('src/player/controls/session.js');
const { UNDO_MS: PN_UNDO_MS } = await imp('src/player/panel/session.js');
const { mergePrefs } = await imp('src/core/model/prefs.js');
const { readFileSync } = await import('node:fs');

const walk = (root, fn) => { for (const c of root.children ?? []) { fn(c); walk(c, fn); } };
const roleOf = (el) => el.getAttribute?.('role') ?? ({ button: 'button', h1: 'heading', h2: 'heading', h3: 'heading', input: el.getAttribute?.('type') === 'checkbox' ? 'checkbox' : 'textbox' }[el.tagName] ?? null);
const ALLOWED = new Set(['menuitem', 'menuitemradio', 'menuitemcheckbox', 'group', 'separator', 'none', 'presentation']);

function rolesIn(menu) {
  const m = new Map();
  walk(menu, (el) => { const r = roleOf(el); if (r) m.set(r, (m.get(r) ?? 0) + 1); });
  return [...m.entries()];
}

// ---- DS-TJ-07: دور القائمتين ومحتواهما والأسهم ----
log('== DS-TJ-07 ==');
{
  const page = H.mountPage({ state: H.makeState({ captured: [H.trackInfo()] }) });
  H.click(page.ui.btn('download'), 0); // لوحة المفاتيح
  const menu = page.ui.menu();
  const roles = rolesIn(menu);
  log(`تحميل الأصل: role=${menu.getAttribute('role')} | aria-haspopup على الزر=${page.ui.btn('download').getAttribute('aria-haspopup')} | الأدوار: ${roles.map(([r, n]) => `${r}×${n}`).join('، ')} | غير مسموح تحت menu: ${roles.filter(([r]) => !ALLOWED.has(r)).map(([r]) => r).join('، ') || 'لا شيء'}`);
  const lroot = page.ui.layerHost().shadowRoot;
  const first = lroot.activeElement;
  H.key(first, 'ArrowDown');
  log(`  التركيز الأول: ${first?.tagName}[data-fid=${first?.getAttribute('data-fid')}] | بعد ArrowDown: ${lroot.activeElement === first ? 'لم يتحرك' : lroot.activeElement?.getAttribute('data-fid')}`);
  H.key(lroot.activeElement, 'End');
  log(`  بعد End: ${lroot.activeElement === first ? 'لم يتحرك' : lroot.activeElement?.getAttribute('data-fid')}`);
}
{
  const v2 = H.withSlots([H.slotTrack(), H.slotTrack({ fileName: 'b.ar.srt' })], { active: 1 });
  const page = H.mountPage({ state: H.makeState({ ...v2, english: { lang: 'en', cues: H.AR_CUES } }) });
  H.click(page.ui.btn('upload'), 0);
  const menu = page.ui.menu();
  const roles = rolesIn(menu);
  log(`الترجمة (العرض): role=${menu.getAttribute('role')} | aria-haspopup=${page.ui.btn('upload').getAttribute('aria-haspopup')} | الأدوار: ${roles.map(([r, n]) => `${r}×${n}`).join('، ')}`);
}
{
  const src = readFileSync(`${T}/src/player/controls/session.js`, 'utf8').split('\n');
  const i = src.findIndex((l) => l.startsWith('const ROLE ='));
  const g = readFileSync(`${T}/src/player/controls/group.js`, 'utf8').split('\n');
  const j = g.findIndex((l) => l.startsWith('const MENU_KINDS'));
  log(`session.js:${i + 1}: ${src[i].trim()} | group.js:${j + 1}: ${g[j].trim()}`);
}

// ---- DS-TJ-08: lang ----
log('\n== DS-TJ-08 ==');
{
  const page = H.mountPage({ state: H.makeState({ captured: [H.trackInfo()], arabic: H.arabic() }) });
  page.env.doc.documentElement.setAttribute('lang', 'en');
  H.click(page.ui.btn('download'), 0);
  for (const [name, root] of [['الشريط', page.ui.groupHost().shadowRoot], ['الطبقة', page.ui.layerHost().shadowRoot]]) {
    let n = 0; let withLang = 0;
    walk(root, (el) => { n++; if (el.hasAttribute?.('lang')) withLang++; });
    log(`${name}: ${withLang} من ${n} عنصرًا بسمة lang | المضيف lang=${(name === 'الشريط' ? page.ui.groupHost() : page.ui.layerHost()).getAttribute('lang')}`);
  }
}
{
  const page = P.watchPage({ state: P.makeState({ english: P.english(), prefs: mergePrefs(P.makeState().prefs, { ui: { panelOpen: true, panelDual: true } }) }) });
  page.mount();
  await P.settle();
  const v = P.ui(page);
  let n = 0; let withLang = 0;
  walk(v.root, (el) => { n++; if (el.hasAttribute?.('lang')) withLang++; });
  const ar = v.root.querySelector('.ar'); const en = v.root.querySelector('.en');
  log(`اللوحة: ${withLang} من ${n} | .root dir=${v.q('.root')?.getAttribute('dir')} lang=${v.q('.root')?.getAttribute('lang')} | .ar «${ar?.textContent}» lang=${ar?.getAttribute('lang')} | .en «${en?.textContent}» lang=${en?.getAttribute('lang')}`);
}

// ---- DS-TJ-47: التلميح ----
log('\n== DS-TJ-47 ==');
{
  const page = H.mountPage({ state: H.makeState({ captured: [H.trackInfo()], arabic: H.arabic() }) });
  const btn = page.ui.btn('download');
  btn.dispatchEvent({ type: 'pointerenter' });
  const shown = page.ui.tip();
  H.key(btn, 'Escape');
  const afterEsc = page.ui.tip();
  btn.dispatchEvent({ type: 'pointerleave' });
  const afterLeave = page.ui.tip();
  btn.dispatchEvent({ type: 'focus' });
  H.key(btn, 'Escape');
  const afterFocusEsc = page.ui.tip();
  const css = readFileSync(`${T}/src/player/controls/styles.js`, 'utf8').split('\n');
  const k = css.findIndex((l) => l.startsWith('.tip {'));
  log(`مرور: «${shown}» | Esc والمؤشر فوق الزر: ${afterEsc ? 'باقٍ' : 'أُخفي'} | مغادرة الزر: ${afterLeave ? 'باقٍ' : 'أُخفي'} | تركيز ثم Esc: ${afterFocusEsc ? 'باقٍ' : 'أُخفي'}`);
  log(`  styles.js:${k + 1} pointer-events:none في .tip؟ ${/pointer-events:\s*none/.test(css[k])}`);
}

// ---- DS-S4: محطات Tab في اللوحة ----
log('\n== DS-S4 ==');
{
  const page = P.watchPage({ state: P.makeState({ arabic: { cues: P.arCues(300), edited: false, fileName: 'x.ar.srt', comparison: null } }) });
  page.mount();
  await P.settle();
  const v = P.ui(page);
  const rows = v.rows();
  const tabbable = rows.map((r) => r.querySelector('button')).filter((b) => b && b.getAttribute('tabindex') !== '-1').length;
  log(`صفوف=${rows.length} | أزرار زمن قابلة لـTab=${tabbable} | اسم أول زر=«${rows[0]?.querySelector('button')?.getAttribute('aria-label')}»`);
}

// ---- DS-TJ-44 (المشغّل): استبدال صناديق الرسائل يُسقط تركيز «تراجع» ----
log('\n== DS-TJ-44 / المشغّل ==');
{
  const three = () => H.withSlots([H.slotTrack(), H.slotTrack({ fileName: 'b.srt' }), null], { offsets: [0, 1200, 0] });
  const page = H.mountPage({ state: H.makeState(three()) });
  H.click(page.ui.btn('upload'));
  H.click(page.ui.menu().querySelectorAll('button.slot')[1]);
  await H.settle();
  const lroot = page.ui.layerHost().shadowRoot;
  const act = lroot.querySelector('.toasts button.act');
  act.focus();
  const before = lroot.activeElement === act;
  // رسالة ثانية بلا صلة: إشعار من المتحكم (handleNotices ← addToast)، كما يصل إشعار تخزين أثناء ظهور رسالة التراجع
  page.controller.set({ notice: { code: 'ST_OFFSET_RESET', tone: 'info', at: 1 } });
  await H.settle();
  const toastsNow = page.ui.toasts().map((t) => t.text);
  const sameNode = lroot.querySelector('.toasts button.act') === act;
  log(`المهلة UNDO_MS=${CT_UNDO_MS} TOAST_MS=${CT_TOAST_MS} | «تراجع» مركّز قبل: ${before} | الرسائل بعد الإشعار: ${JSON.stringify(toastsNow)} | الزر نفسه باقٍ؟ ${sameNode} | التركيز في الطبقة الآن: ${lroot.activeElement ? lroot.activeElement.className : 'null (⇐ body في المتصفح)'} | الزر المركّز متصل؟ ${act.isConnected}`);
  // انقضاء المهلة دون إيقاف عند التركيز
  const act2 = lroot.querySelector('.toasts button.act');
  act2?.focus();
  page.env.win.advance(CT_UNDO_MS + 10);
  log(`  بعد ${CT_UNDO_MS} م.ث والتركيز على «تراجع»: الرسائل=${JSON.stringify(page.ui.toasts().map((t) => t.text))} | التركيز في الطبقة: ${lroot.activeElement ? 'باقٍ' : 'null (⇐ body)'} | الحاوية role=${lroot.querySelector('.toasts').getAttribute('role')} aria-live=${lroot.querySelector('.toasts').getAttribute('aria-live')}`);
  const ss = readFileSync(`${T}/src/player/controls/session.js`, 'utf8');
  log(`  مستمعو إيقاف عند التركيز أو المرور في session.js/layer.js؟ ${/focusin|mouseenter|pointerenter.*toast/.test(ss + readFileSync(`${T}/src/player/controls/layer.js`, 'utf8').split('renderToasts')[1].slice(0, 1500)) ? 'نعم' : 'لا'}`);
}

// ---- DS-TJ-44 (اللوحة): انقضاء رسالة «أُخفي الزر» يعيد التركيز إلى زر مخفي ----
log('\n== DS-TJ-44 / اللوحة ==');
{
  // الطرفان يتشاركان الصلة الافتراضية panelLink كما في الإنتاج (controls/index.js:110 وpanel/index.js:31).
  const ctl = H.mountPage({ state: H.makeState({ arabic: H.arabic() }) });
  const panelBtn = () => ctl.ui.btn('panel');
  const page = P.watchPage();
  page.mount();
  const v = P.ui(page);
  H.click(v.qa('.head .b')[0]);
  const hideItem = v.q('.menu [role="menuitem"]');
  hideItem.focus();
  H.click(hideItem);
  const undo = v.q('.act');
  const onUndo = page.doc.activeElement === v.host && v.root.activeElement === undo;
  // الشريط يقرأ التفضيل نفسه: زر اللوحة يُخفى
  ctl.controller.set({ prefs: mergePrefs(ctl.controller.getState().prefs, { ui: { panelEntry: false, panelOpen: false } }) });
  await H.settle();
  const hiddenAttr = panelBtn().hasAttribute('hidden');
  const css = readFileSync(`${T}/src/player/controls/styles.js`, 'utf8');
  page.env.win.advance(PN_UNDO_MS + 100);
  const focusedInCtl = ctl.env.doc._focused;
  log(`UNDO_MS=${PN_UNDO_MS} | بعد الإخفاء التركيز على «تراجع»: ${onUndo} | زر اللوحة في الشريط hidden=${hiddenAttr} و«.btn[hidden] { display: none; }» في الورقة؟ ${css.includes('.btn[hidden] { display: none; }')}`);
  log(`  بعد انقضاء المهلة: وضع اللوحة=${page.handle.peek().mode} | المضيف مخفي=${P.hidden(v.host)} | focusButton وجّه التركيز إلى زر الشريط؟ ${focusedInCtl === panelBtn()} | وذلك الزر hidden=${panelBtn().hasAttribute('hidden')} ⇒ في المتصفح لا يُركَّز عنصر display:none فيبقى التركيز على body`);
}
