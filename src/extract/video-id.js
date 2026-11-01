// معرّف الفيديو المعروض من عنوان الصفحة. المصدر الوحيد للحقيقة في قرار «يخص الفيديو المعروض».

const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;

/**
 * @param {{ pathname: string, search: string }} loc
 * @returns {string | null}
 */
export function videoIdFromLocation(loc) {
  if (loc.pathname === '/watch') {
    const v = new URLSearchParams(loc.search).get('v');
    return v && VIDEO_ID.test(v) ? v : null;
  }
  const m = /^\/(?:shorts|live)\/([A-Za-z0-9_-]{11})(?:\/|$)/.exec(loc.pathname);
  return m ? m[1] : null;
}
