// A4 — التحقق من Gemini F-05: منتقي «لغة الترجمة» في قائمة المشغّل بعد morph.
// DOM المشروع الوهمي (test/unit/player/overlay/fake-dom.js) لا ينمذج اختيار <option> (selectedness/dirtiness)، فلا يصلح
// للحكم هنا. فهذا البرنامج يبني DOM أدنى يطبّق قواعد مواصفة HTML للعنصر select المفرد (display size 1):
//   - option.value من سمة value؛ وselect.value أول خيار مختار؛ وضبط select.value يجعل أول خيار بالقيمة مختارًا وdirty.
//   - إضافة سمة selected: إن لم يكن الخيار dirty صار مختارًا (والبقية لا). إزالتها: إن لم يكن dirty لم يعد مختارًا.
//   - إدراج خيار مختار يُلغي اختيار البقية؛ وبعد كل إدراج أو إزالة تُشغَّل «خوارزمية ضبط الاختيار»: بلا مختار ← أول خيار
//     غير معطّل؛ وأكثر من مختار ← آخرها بترتيب الشجرة.
//   - تغيير الخيار برمجيًا لا يطلق حدث change (يُطلق عند تفاعل المستخدم وحده).
// ثم يشغّل displayMenu وconfirmMenu وmorphChildren الحقيقية من المصدر بتسلسل الرسم الذي يحدث في session.js.
// الاستعمال: command node gemini-f05-select-morph.mjs <جذر الشيفرة>
const R = process.argv[2];
if (!R) throw new Error('مرّر جذر الشيفرة');
const imp = (p) => import(`${R}/${p}`);
const { builder, displayMenu, confirmMenu } = await imp('src/player/controls/menus.js');
const { morphChildren } = await imp('src/player/controls/morph.js');
const { knownLanguages } = await imp('src/core/lang/index.js');

// ———— DOM أدنى بقواعد select/option ————
class El {
  constructor(tag) {
    this.tagName = tag.toUpperCase();
    this.children = [];
    this.parentNode = null;
    this._attrs = new Map();
    this._text = '';
    this._listeners = new Map();
  }
  get className() { return this.getAttribute('class') ?? ''; }
  set className(v) { this.setAttribute('class', String(v)); }
  get textContent() { return this._text + this.children.map((c) => c.textContent).join(''); }
  set textContent(v) {
    const sel = this.selectHost();
    for (const c of this.children) c.parentNode = null;
    this.children = [];
    this._text = String(v);
    if (sel) settle(sel);
  }
  getAttribute(k) { return this._attrs.has(k) ? this._attrs.get(k) : null; }
  hasAttribute(k) { return this._attrs.has(k); }
  getAttributeNames() { return [...this._attrs.keys()]; }
  setAttribute(k, v) { this._attrs.set(k, String(v)); }
  removeAttribute(k) { this._attrs.delete(k); }
  addEventListener(t, fn) { if (!this._listeners.has(t)) this._listeners.set(t, []); this._listeners.get(t).push(fn); }
  dispatch(t) { for (const fn of this._listeners.get(t) ?? []) fn({ type: t, target: this }); }
  focus() {}
  selectHost() {
    let n = this;
    while (n) { if (n.tagName === 'SELECT') return n; n = n.parentNode; }
    return null;
  }
  _detach() {
    const p = this.parentNode;
    if (!p) return null;
    const host = p.selectHost();
    p.children.splice(p.children.indexOf(this), 1);
    this.parentNode = null;
    return host;
  }
  remove() {
    const host = this._detach();
    if (host) settle(host);
  }
  insertBefore(n, ref) {
    const old = n._detach();
    if (old) settle(old);
    const i = ref ? this.children.indexOf(ref) : this.children.length;
    this.children.splice(i < 0 ? this.children.length : i, 0, n);
    n.parentNode = this;
    const host = this.selectHost();
    if (host) inserted(host, n);
    return n;
  }
  appendChild(n) { return this.insertBefore(n, null); }
  replaceChildren(...nodes) {
    for (const c of [...this.children]) c.remove();
    for (const n of nodes) this.appendChild(n);
  }
}
class Option extends El {
  constructor() { super('option'); this.sel = false; this.dirty = false; }
  get value() { return this.hasAttribute('value') ? this.getAttribute('value') : this.textContent.trim(); }
  set value(v) { this.setAttribute('value', v); }
  setAttribute(k, v) {
    const had = this.hasAttribute(k);
    super.setAttribute(k, v);
    if (k === 'selected' && !had && !this.dirty) setSel(this, true);
  }
  removeAttribute(k) {
    const had = this.hasAttribute(k);
    super.removeAttribute(k);
    if (k === 'selected' && had && !this.dirty) setSel(this, false);
  }
}
class Select extends El {
  constructor() { super('select'); }
  options() {
    const out = [];
    for (const c of this.children) {
      if (c.tagName === 'OPTION') out.push(c);
      else if (c.tagName === 'OPTGROUP') for (const o of c.children) if (o.tagName === 'OPTION') out.push(o);
    }
    return out;
  }
  get value() { return this.options().find((o) => o.sel)?.value ?? ''; }
  set value(v) {
    const opts = this.options();
    for (const o of opts) o.sel = false;
    const hit = opts.find((o) => o.value === String(v));
    if (hit) { hit.sel = true; hit.dirty = true; }
  }
  selectedOption() { return this.options().find((o) => o.sel) ?? null; }
}
class Input extends El {
  get value() { return this.getAttribute('value') ?? ''; }
  set value(v) { this.setAttribute('value', v); }
}
function setSel(opt, on) {
  opt.sel = on;
  const host = opt.selectHost();
  if (!host) return;
  if (on) for (const o of host.options()) if (o !== opt) o.sel = false;
  settle(host);
}
function inserted(host, node) {
  const opts = node.tagName === 'OPTION' ? [node] : node.tagName === 'OPTGROUP' ? node.children.filter((c) => c.tagName === 'OPTION') : node === host ? [] : [];
  const chosen = opts.filter((o) => o.sel).at(-1);
  if (chosen) for (const o of host.options()) if (o !== chosen) o.sel = false;
  settle(host);
}
/** خوارزمية ضبط الاختيار (select مفرد بحجم عرض 1). */
function settle(host) {
  const opts = host.options();
  const on = opts.filter((o) => o.sel);
  if (!on.length) {
    const first = opts.find((o) => !o.hasAttribute('disabled') && !(o.parentNode?.tagName === 'OPTGROUP' && o.parentNode.hasAttribute('disabled')));
    if (first) first.sel = true;
  } else if (on.length > 1) {
    for (const o of on.slice(0, -1)) o.sel = false;
  }
}
const doc = {
  createElement: (t) => (t === 'select' ? new Select() : t === 'option' ? new Option() : t === 'input' || t === 'button' ? new Input(t) : new El(t)),
  createElementNS: (_ns, t) => new El(t),
};

// ———— أدوات ————
const h = builder(doc);
const find = (root, pred) => {
  if (pred(root)) return root;
  for (const c of root.children) { const f = find(c, pred); if (f) return f; }
  return null;
};
const out = [];
const log = (k, actual, expected) => out.push(`${k}\n  الفعلي:   ${JSON.stringify(actual)}\n  المتوقع:  ${JSON.stringify(expected)}\n  ${JSON.stringify(actual) === JSON.stringify(expected) ? 'مطابق' : 'مختلف'}`);
const note = (s) => out.push(`# ${s}`);
const view = (sel) => {
  const o = sel.selectedOption();
  return { value: sel.value, shown: o ? o.textContent : null, group: o?.parentNode?.tagName === 'OPTGROUP' ? o.parentNode.getAttribute('label') : null };
};
const slots = [{ n: 1, filled: true, active: true, name: null, edited: false, cueCount: 5 }, { n: 2, filled: false, active: false, name: null, edited: false, cueCount: 0 }, { n: 3, filled: false, active: false, name: null, edited: false, cueCount: 0 }];
const dmodel = ({ lang, switching = false, targets = [] }) => ({
  fileName: 'talk.srt', count: 5, edited: false, comparison: null, notes: [], slots, switching, uploadLabel: 'رفع', warnings: [], mode: 'ar',
  dualAvailable: false, originalLang: null, busy: false, error: null, ad: false,
  // كما في session.js:265: [a.lang, ...pairTargets(s)]
  lang, langSuggested: [lang, ...targets].filter(Boolean),
});
const order = knownLanguages().map((l) => l.code);
const neighbors = (code) => ({ prev: order[order.indexOf(code) - 1], next: order[order.indexOf(code) + 1] });

/** قائمة عرض مفتوحة، ثم اختيار المستخدم code من «كل اللغات»، ثم تسلسل الرسم كما في setSlotLang (session.js:773–791). */
function interactive({ from, to, targets }) {
  const acts = [];
  const act = (name, value) => acts.push([name, value]);
  const menu = new El('div');
  menu.replaceChildren(...displayMenu(h, act, dmodel({ lang: from, targets })));
  const sel = () => find(menu, (n) => n.tagName === 'SELECT');
  const steps = { R0: view(sel()) };
  const pick = sel().options().find((o) => o.value === to);
  const pickGroup = pick.parentNode.getAttribute('label');
  for (const o of sel().options()) o.sel = false;
  pick.sel = true;
  pick.dirty = true;
  sel().dispatch('change');
  steps.pick = view(sel());
  // R1: render() قبل الحفظ (switching=true، والحالة ما زالت باللغة القديمة)
  morphChildren(menu, displayMenu(h, act, dmodel({ lang: from, targets, switching: true })));
  steps.R1 = view(sel());
  // R2: changed() في المتحكم يرسم (controller.subscribe(render)) واللغة الجديدة، وswitching ما زال true
  morphChildren(menu, displayMenu(h, act, dmodel({ lang: to, targets, switching: true })));
  steps.R2 = view(sel());
  // R3: بعد await controller.setSlotLang: switching=false ثم render()
  morphChildren(menu, displayMenu(h, act, dmodel({ lang: to, targets })));
  steps.R3 = view(sel());
  return { pickGroup, steps, acts };
}

/** القائمة مفتوحة واللغة تتغيّر من سياق آخر (المحفوظات أو الإعدادات في تبويب آخر): رسم واحد باللغة الجديدة. */
function external({ from, to, targets }) {
  const acts = [];
  const act = (name, value) => acts.push([name, value]);
  const menu = new El('div');
  menu.replaceChildren(...displayMenu(h, act, dmodel({ lang: from, targets })));
  const sel = () => find(menu, (n) => n.tagName === 'SELECT');
  const before = view(sel());
  morphChildren(menu, displayMenu(h, act, dmodel({ lang: to, targets })));
  const after = view(sel());
  // أي رسم لاحق (تغيّر version أو حالة) يصحّحه
  morphChildren(menu, displayMenu(h, act, { ...dmodel({ lang: to, targets }), warnings: ['x'] }));
  return { before, after, nextRender: view(sel()), acts };
}

note(`ترتيب «كل اللغات» (knownLanguages) حول de: ${JSON.stringify(neighbors('de'))}`);

note('S1) اختيار تفاعلي: اللغة ar و«إلى»=ar (المقترحة [ar])، يختار المستخدم de من «كل اللغات»');
{
  const r = interactive({ from: 'ar', to: 'de', targets: ['ar'] });
  out.push(`  مجموعة الخيار المختار: ${r.pickGroup}`);
  log('S1-R1 القيمة المعروضة أثناء الحفظ (الحالة لم تتغير بعد)', r.steps.R1.value, 'de');
  log('S1-R2 القيمة المعروضة بعد رسم changed() (ما زال switching)', r.steps.R2.value, 'de');
  log('S1-R3 القيمة المعروضة النهائية بعد switching=false', r.steps.R3.value, 'de');
  log('S1 أحداث change المطلقة (act) طوال التسلسل', r.acts, [['slotLang', 'de']]);
}
note('S1b) اختيار تفاعلي من «غير محددة» بلا مقترحات (المقترحة [])، إلى de');
{
  const r = interactive({ from: null, to: 'de', targets: [] });
  log('S1b-R1', r.steps.R1.value, 'de');
  log('S1b-R2', r.steps.R2.value, 'de');
  log('S1b-R3 النهائية', r.steps.R3.value, 'de');
  log('S1b أحداث change', r.acts, [['slotLang', 'de']]);
}
note('S1c) اختيار تفاعلي: ar بلا «إلى» محفوظة (المقترحة [ar] ← [de])، إلى ja');
{
  const r = interactive({ from: 'ar', to: 'ja', targets: [] });
  log('S1c-R2', r.steps.R2.value, 'ja');
  log('S1c-R3 النهائية', r.steps.R3.value, 'ja');
}
note('S2) تغيير خارجي والقائمة مفتوحة: ar ← de برسم واحد (switching=false)');
{
  const r = external({ from: 'ar', to: 'de', targets: ['ar'] });
  log('S2 القيمة قبل', r.before.value, 'ar');
  log('S2 القيمة المعروضة بعد الرسم الوحيد', r.after.value, 'de');
  log('S2 بعد أي رسم لاحق', r.nextRender.value, 'de');
  log('S2 أحداث change', r.acts, []);
}
note('S2b) تغيير خارجي: غير محددة ← de بلا مقترحات');
{
  const r = external({ from: null, to: 'de', targets: [] });
  log('S2b بعد الرسم الوحيد', r.after.value, 'de');
}
note('S3) ضابط: «لغة الملف» في تأكيد الرفع (المقترحة [fileLang, ...pairTargets] لا تشمل p.lang، session.js:303)');
{
  const acts = [];
  const act = (name, value) => acts.push([name, value]);
  const cm = (lang) => ({ fileName: 'talk.srt', count: 5, comparison: null, warnings: [], hint: null, slots, target: 2, filled: false, edits: 0, keepAvailable: false, keep: false, conflicts: 0, offsetNote: false, previousFrom: null, busy: false, error: null, lang, langSuggested: ['ar'] });
  const menu = new El('div');
  menu.replaceChildren(...confirmMenu(h, act, cm('ar')));
  const sel = () => find(menu, (n) => n.tagName === 'SELECT');
  const pick = sel().options().find((o) => o.value === 'de');
  for (const o of sel().options()) o.sel = false;
  pick.sel = true; pick.dirty = true;
  sel().dispatch('change');
  // act('uploadLang') يضبط pending.lang ثم render (session.js:716)
  morphChildren(menu, confirmMenu(h, act, cm('de')));
  log('S3 القيمة المعروضة بعد الرسم', sel().value, 'de');
}
console.log(out.join('\n'));
