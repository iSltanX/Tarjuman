// DOM أدنى ينمذج اختيار <option> في select مفرد وفق مواصفة HTML (التدقيق الموحد V2، U-029)؛ لأن test/unit/player/overlay/fake-dom.js
// لا ينمذج الاختيار. القواعد:
//   - option.value من سمة value؛ وselect.value أول خيار مختار؛ وضبط select.value يجعل أول خيار بالقيمة مختارًا وdirty.
//   - إضافة سمة selected: إن لم يكن الخيار dirty صار مختارًا (والبقية لا). إزالتها: إن لم يكن dirty لم يعد مختارًا.
//   - إدراج خيار مختار يُلغي اختيار البقية؛ وبعد كل إدراج أو إزالة تُشغَّل «خوارزمية ضبط الاختيار»: بلا مختار ← أول خيار
//     غير معطّل؛ وأكثر من مختار ← آخرها بترتيب الشجرة.
//   - تغيير الخيار برمجيًا لا يطلق حدث change.
// الاستعمال: const { doc, El, find } = createSelectDom(); ثم builder(doc) من menus.js.

export function createSelectDom() {
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
    addEventListener(t, fn) {
      if (!this._listeners.has(t)) this._listeners.set(t, []);
      this._listeners.get(t).push(fn);
    }
    dispatch(t) { for (const fn of this._listeners.get(t) ?? []) fn({ type: t, target: this }); }
    focus() {}
    selectHost() {
      let n = this;
      while (n) {
        if (n.tagName === 'SELECT') return n;
        n = n.parentNode;
      }
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
    constructor() {
      super('option');
      this.sel = false;
      this.dirty = false;
    }
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
      if (hit) {
        hit.sel = true;
        hit.dirty = true;
      }
    }
    selectedOption() { return this.options().find((o) => o.sel) ?? null; }
    /** اختيار المستخدم: يطلق change. */
    choose(code) {
      const pick = this.options().find((o) => o.value === code);
      for (const o of this.options()) o.sel = false;
      pick.sel = true;
      pick.dirty = true;
      this.dispatch('change');
    }
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
    const opts = node.tagName === 'OPTION' ? [node] : node.tagName === 'OPTGROUP' ? node.children.filter((c) => c.tagName === 'OPTION') : [];
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
  const find = (root, pred) => {
    if (pred(root)) return root;
    for (const c of root.children) {
      const f = find(c, pred);
      if (f) return f;
    }
    return null;
  };
  return { doc, El, find };
}
