// منتقي الملفات لصفحات الإضافة (المحفوظات والإعدادات): حقل input type=file مخفي **ملحق بالمستند** ما دام المنتقي مفتوحًا،
// ويُزال بعد الاختيار أو الإلغاء، كحقل المشغّل (player/controls/layer.js). كان الحقل يُنشأ ويُنقر دون إلحاق، فلا يمسكه إلا
// المنتقي نفسه: وثبت حيًا في Chrome أن جمع القمامة أثناء فتح المنتقي يُسقطه فيضيع الاختيار بلا رسالة (تدقيق 7a66f91، I03،
// test/live/audit-c7/run.mjs). يُستدعى داخل ضغطة المستخدم، ويعيد null عند الإلغاء.

/**
 * @param {{ doc?: Document, accept: string, multiple?: boolean }} o
 * @returns {Promise<File[] | null>}
 */
export function pickFiles({ doc = document, accept, multiple = false }) {
  return new Promise((resolve) => {
    const input = doc.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.multiple = multiple;
    input.hidden = true;
    input.tabIndex = -1;
    input.setAttribute('aria-hidden', 'true');
    input.setAttribute('data-tj-picker', '');
    let done = false;
    const finish = (files) => {
      if (done) return;
      done = true;
      input.remove();
      resolve(files);
    };
    input.addEventListener('change', () => finish(input.files && input.files.length ? Array.from(input.files) : null), { once: true });
    input.addEventListener('cancel', () => finish(null), { once: true });
    doc.body.append(input);
    input.click();
  });
}
