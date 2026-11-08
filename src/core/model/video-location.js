// معرّف الفيديو المعروض من عنوان صفحة يوتيوب: وحدة نقية بلا استيرادات، يستوردها عالم الصفحة (main-world/capture.js، يُجمَّع
// بـesbuild) والعالم المعزول (player/youtube-dom.js) فلا يختلف رأيهما في «الفيديو الحالي» (تدقيق V2، U-032).

const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;

/**
 * معرّف الفيديو المعروض من عنوان الصفحة: /watch?v= و/live/<id> (البث بعد انتهائه يُعامل كفيديو، والجاري
 * يرفضه الاستخراج برسالة). Shorts خارج النطاق فلا معرّف لها. المصدر الوحيد للحقيقة في «الفيديو الحالي».
 * @param {{ pathname: string, search: string }} loc
 * @returns {string | null}
 */
export function videoIdFromLocation(loc) {
  if (loc.pathname === '/watch') {
    const v = new URLSearchParams(loc.search).get('v');
    return v && VIDEO_ID.test(v) ? v : null;
  }
  const m = /^\/live\/([A-Za-z0-9_-]{11})(?:\/|$)/.exec(loc.pathname);
  return m ? m[1] : null;
}
