// القائمة الافتراضية (R38): تُرسم الصفوف المرئية وحدها. ارتفاع كل صف محسوب من بياناته لا مقيس من DOM
// (أسطر النص بين 2 و4، وسطر رسالة إن كانت فيه مشكلة)، فالتخطيط حساب نقي بمجاميع تراكمية وبحث ثنائي،
// والصف يأخذ ارتفاعه صراحة في CSS فلا يختلف ما يُرسم عمّا حُسب.

export const ROW = Object.freeze({ pad: 16, line: 24, fieldChrome: 18, minLines: 2, maxLines: 4, message: 22, missing: 44 });

/**
 * ارتفاع صف مقطع أو صف «ناقص في الترجمة».
 * @param {{ type: 'cue' | 'missing', lines?: number, message?: boolean }} r
 */
export function rowHeight({ type, lines = 1, message = false }) {
  if (type === 'missing') return ROW.missing;
  const n = Math.min(ROW.maxLines, Math.max(ROW.minLines, lines));
  return ROW.pad + n * ROW.line + ROW.fieldChrome + (message ? ROW.message : 0);
}

/** عدد أسطر النص كما يُكتب (بين 2 و4 في الحقل، وما زاد يُمرَّر داخله). @param {string} text */
export const textLines = (text) => Math.min(ROW.maxLines, Math.max(ROW.minLines, text.split('\n').length));

/** أسطر سطر واحد ملتفًّا بالكلمات في عرض معلوم (الفراغ عند موضع الالتفاف لا يُحسب). */
function wrapCount(line, measure, width) {
  if (!line || measure(line) <= width) return 1;
  let n = 1;
  let cur = 0;
  let space = 0;
  for (const tok of line.split(/(\s+)/)) {
    if (!tok) continue;
    if (/^\s+$/.test(tok)) {
      space = measure(tok);
      continue;
    }
    const w = measure(tok);
    if (cur > 0 && cur + space + w > width) {
      n++;
      cur = 0;
    } else if (cur > 0) cur += space;
    space = 0;
    if (w > width) {
      const extra = Math.ceil(w / width) - 1;
      n += extra;
      cur = w - extra * width;
    } else cur += w;
  }
  return n;
}

/**
 * الأسطر المرئية لنص في حقل بعرض محتوى معلوم: كل سطر بفاصله وما يلتف منه بالكلمات (measure عرض نص بالبكسل)، بين 2 و4.
 * كان الارتفاع بعدد فواصل الأسطر وحده، فسطران طويلان في عمود ضيق يُخفى نصفهما (تدقيق 7a66f91، I08). بلا قياس: textLines.
 * @param {string} text @param {((s: string) => number) | null} measure @param {number} width
 */
export function wrappedLines(text, measure, width) {
  if (!measure || !(width > 0)) return textLines(text);
  let n = 0;
  for (const line of text.split('\n')) {
    n += wrapCount(line, measure, width);
    if (n >= ROW.maxLines) return ROW.maxLines;
  }
  return Math.min(ROW.maxLines, Math.max(ROW.minLines, n));
}

/** تخطيط صفوف بارتفاعات معروفة: الموضع، والصف عند موضع، والمدى المرئي. */
export class RowLayout {
  /** @param {ArrayLike<number>} heights */
  constructor(heights) {
    this.heights = Float64Array.from(heights);
    this.offsets = new Float64Array(this.heights.length + 1);
    this.stale = true;
  }

  get count() {
    return this.heights.length;
  }

  /** @param {number} i @param {number} h */
  setHeight(i, h) {
    if (this.heights[i] === h) return false;
    this.heights[i] = h;
    this.stale = true;
    return true;
  }

  build() {
    if (!this.stale) return;
    let y = 0;
    for (let i = 0; i < this.heights.length; i++) {
      this.offsets[i] = y;
      y += this.heights[i];
    }
    this.offsets[this.heights.length] = y;
    this.stale = false;
  }

  get total() {
    this.build();
    return this.offsets[this.heights.length];
  }

  /** @param {number} i */
  offsetOf(i) {
    this.build();
    return this.offsets[i];
  }

  /** الصف الذي يقع فيه الموضع y. @param {number} y */
  indexAt(y) {
    this.build();
    const n = this.heights.length;
    if (!n) return -1;
    let lo = 0;
    let hi = n - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (this.offsets[mid] <= y) lo = mid;
      else hi = mid - 1;
    }
    return lo;
  }

  /**
   * الصفوف المرئية [start, end) مع هامش قبلها وبعدها.
   * @param {number} scrollTop @param {number} viewport @param {number} [overscan]
   */
  range(scrollTop, viewport, overscan = 6) {
    if (!this.heights.length) return [0, 0];
    const first = this.indexAt(Math.max(0, scrollTop));
    const last = this.indexAt(Math.max(0, scrollTop + viewport - 1));
    return [Math.max(0, first - overscan), Math.min(this.heights.length, last + 1 + overscan)];
  }
}

/**
 * قائمة افتراضية فوق حاوية تمرير. الصف المركَّز لا يُزال وإن خرج من المدى، فلا يضيع ما يكتبه المستخدم. والصفوف في الـDOM
 * بترتيبها (يُدرج الجديد قبل أول صف بعده)، فيتبع Tab وقارئ الشاشة الترتيب البصري بعد التمرير للخلف، وكل صف بموضعه من الكل
 * (aria-posinset وaria-setsize؛ تدقيق 7a66f91، U20).
 * @param {{
 *   doc: Document, scroller: HTMLElement, layout: RowLayout,
 *   create: (row: number) => HTMLElement, update: (el: HTMLElement, row: number, force: boolean) => void,
 *   onRange?: (start: number, end: number) => void, overscan?: number
 * }} o
 */
export function createVirtualList({ doc, scroller, layout, create, update, onRange, overscan = 6 }) {
  const win = doc.defaultView;
  const spacer = doc.createElement('div');
  spacer.className = 'ed-list__spacer';
  scroller.append(spacer);
  /** @type {Map<number, HTMLElement>} */
  const shown = new Map();
  let frame = 0;
  let range = [0, 0];

  const place = (el, row) => {
    el.style.top = `${layout.offsetOf(row)}px`;
    el.style.height = `${layout.heights[row]}px`;
    el.setAttribute('aria-posinset', String(row + 1));
    el.setAttribute('aria-setsize', String(layout.count));
  };
  /** أول صف مرسوم بعد row (ليُدرج قبله)، أو null. */
  const nextShown = (row) => {
    let best = null;
    for (const r of shown.keys()) if (r > row && (best === null || r < best)) best = r;
    return best === null ? null : shown.get(best);
  };

  function render() {
    frame = 0;
    spacer.style.height = `${layout.total}px`;
    const [start, end] = layout.range(scroller.scrollTop, scroller.clientHeight || 600, overscan);
    range = [start, end];
    const active = doc.activeElement;
    for (const [row, el] of shown) {
      if (row >= start && row < end) continue;
      if (active && el.contains(active)) continue;
      el.remove();
      shown.delete(row);
    }
    for (let row = start; row < end; row++) {
      let el = shown.get(row);
      if (!el) {
        el = create(row);
        spacer.insertBefore(el, nextShown(row));
        shown.set(row, el);
      }
      place(el, row);
    }
    for (const [row, el] of shown) if (row < start || row >= end) place(el, row);
    onRange?.(start, end);
  }

  const schedule = () => {
    if (!frame) frame = win.requestAnimationFrame(render);
  };
  scroller.addEventListener('scroll', schedule, { passive: true });
  win.addEventListener('resize', schedule);

  return {
    render,
    schedule,
    get range() {
      return range;
    },
    get layout() {
      return layout;
    },
    /** صفوف أخرى (إعادة فتح أو نسخة أخرى): يُزال المرسوم كله ويُرسم من التخطيط الجديد. @param {RowLayout} next */
    reset(next) {
      layout = next;
      for (const el of shown.values()) el.remove();
      shown.clear();
      render();
    },
    /** الصف إن كان مرسومًا. @param {number} row */
    elementOf: (row) => shown.get(row) ?? null,
    /** يحدّث صفوفًا مرسومة (أو كلها)، ويعيد التموضع إن تغيّر ارتفاع. @param {number[] | null} rows @param {boolean} [force] */
    refresh(rows, force = false) {
      const list = rows === null ? [...shown.keys()] : rows.filter((r) => shown.has(r));
      for (const row of list) update(shown.get(row), row, force);
      render();
    },
    /** يمرّر حتى يظهر الصف ويعيده مرسومًا. @param {number} row */
    reveal(row) {
      const top = layout.offsetOf(row);
      const h = layout.heights[row];
      const view = scroller.clientHeight || 600;
      if (top < scroller.scrollTop || top + h > scroller.scrollTop + view) scroller.scrollTop = Math.max(0, top - view / 3);
      render();
      return shown.get(row) ?? null;
    },
  };
}
