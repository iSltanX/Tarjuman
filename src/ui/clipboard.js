// الكتابة في الحافظة بضغطة المستخدم (تحقق Gemini، B1). النص الجاهز يُكتب بـwriteText كما كان. والنص الذي يُجمع غير متزامن (تقرير
// التشخيص) لا يُنتظر قبل استدعاء الحافظة: Chromium يرفض writeText إن غادر التركيزُ الصفحةَ أثناء الجمع («Document is not focused»)،
// فتُستدعى الحافظة لحظة النقرة بـClipboardItem يحمل وعد النص، ويكتمل حين يكتمل (ثبت حيًا في Chrome مع نقل التركيز). وحيث لا
// ClipboardItem أو clipboard.write، أو رفض المتصفح العنصر بوعده، يُكتب النص بـwriteText بعد اكتماله احتياطًا. والشيفرة واحدة في
// Chromium وFirefox (لا تفرّق بينهما). لا قراءة للحافظة هنا (code-rules: clipboard-read).

/**
 * @param {string | Promise<string>} text النص، أو وعده إن كان يُجمع. يُستدعى في معالج النقرة قبل أي await.
 * @param {{ clipboard?: Pick<Clipboard, 'write' | 'writeText'>, Item?: typeof ClipboardItem }} [env]
 * @returns {Promise<void>} يُرفض إن تعذّر الجمع نفسه أو الكتابة بالطريقتين
 */
export function copyText(text, { clipboard = globalThis.navigator?.clipboard, Item = globalThis.ClipboardItem } = {}) {
  if (typeof text === 'string') return attempt(() => clipboard.writeText(text));
  const ready = Promise.resolve(text).then(String);
  if (typeof Item !== 'function' || typeof clipboard?.write !== 'function') return ready.then((s) => clipboard.writeText(s));
  const blob = ready.then((s) => new Blob([s], { type: 'text/plain' }));
  // رفض الجمع يصل إلى المتصفح عبر العنصر وإلى المستدعي عبر ready أدناه، فلا يبقى وعدًا مرفوضًا بلا معالج.
  blob.catch(() => {});
  return attempt(() => clipboard.write([new Item({ 'text/plain': blob })]))
    // تعذّر الجمع يبقى فشلًا (await ready يرميه)؛ ورفض المتصفح للعنصر نفسه يجرّب writeText بالنص المكتمل.
    .catch(async () => clipboard.writeText(await ready));
}

/** استدعاء قد يرمي متزامنًا (واجهة غائبة) يصير وعدًا مرفوضًا. @param {() => unknown} fn @returns {Promise<void>} */
function attempt(fn) {
  try {
    return Promise.resolve(fn()).then(() => {});
  } catch (err) {
    return Promise.reject(err);
  }
}
