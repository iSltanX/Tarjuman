// تحديث القائمة في مكانها: البناء الجديد يُطابَق عقدةً بعقدة مع المعروض (الوسم ومعرّف التركيز data-fid)، فتُنقل
// السمات والنصوص والقيم إلى العقد الموجودة ولا تُستبدل إلا المختلفة بنيةً. فلا تتبدل العقدة تحت المؤشر بين mousedown
// وclick (حدث change عند فقد التركيز يغيّر الحالة قبل النقر)، ولا يضيع التركيز ولا ما يُكتب. أفعال العقد لا تعتمد على
// إغلاق متغير: قيمتها من معرّفها، والتعطيل يُقرأ من السمة عند النقر.

const KEY_ATTRS = ['data-fid', 'class', 'type'];
/** مفتاح المطابقة: الوسم ومعرّف التركيز والصنف والنوع. */
const same = (a, b) => a.tagName === b.tagName && KEY_ATTRS.every((k) => a.getAttribute(k) === b.getAttribute(k));
/** أقصى ما يُبحث عنه أمامًا عن نظير عقدة (القوائم صغيرة وترتيبها ثابت غالبًا). */
const LOOKAHEAD = 8;

/** ينقل سمات العقدة الجديدة وقيمتها إلى القائمة، ويزيل ما لم يعد فيها. @param {Element} from @param {Element} to */
function patchAttrs(from, to) {
  for (const name of from.getAttributeNames()) if (!to.hasAttribute(name)) from.removeAttribute(name);
  for (const name of to.getAttributeNames()) {
    const v = to.getAttribute(name);
    if (from.getAttribute(name) !== v) from.setAttribute(name, v);
  }
  if ('value' in to && from.value !== to.value) from.value = to.value;
  if ('checked' in to && from.checked !== to.checked) from.checked = to.checked;
}

/**
 * يجعل أبناء parent مطابقين لـnext بمطابقة جشعة بالمفتاح: النظير الموجود يُحدَّث في مكانه، وما بينهما مما لا نظير له
 * يُزال، والجديد بلا نظير يُدرج. يعيد عدد العقد المُدرجة (للاختبار).
 * @param {Element} parent @param {Element[]} next
 */
export function morphChildren(parent, next) {
  let inserted = 0;
  const current = [...parent.children];
  let j = 0;
  for (const n of next) {
    let k = -1;
    for (let i = j; i < Math.min(current.length, j + LOOKAHEAD); i++) {
      if (same(current[i], n)) {
        k = i;
        break;
      }
    }
    if (k === -1) {
      if (j < current.length) parent.insertBefore(n, current[j]);
      else parent.appendChild(n);
      inserted++;
      continue;
    }
    for (const extra of current.slice(j, k)) extra.remove();
    const old = current[k];
    j = k + 1;
    patchAttrs(old, n);
    if (n.children.length) inserted += morphChildren(old, [...n.children]);
    else if (old.children.length || old.textContent !== n.textContent) old.textContent = n.textContent;
  }
  for (const extra of current.slice(j)) extra.remove();
  return inserted;
}
