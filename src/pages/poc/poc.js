// صفحة الفحص المؤقتة: تسأل سكربت المحتوى في كل تبويب يوتيوب عن لقطته وتعرضها، وتنزّل SRT عبر Blob
// دون إذن downloads. البناء بـtextContent فقط.

const INVARIANT_NAMES = {
  words: 'تطابق الكلمات', noOverlap: 'لا تداخل', noEmpty: 'لا مقاطع فارغة',
  monotonic: 'رتابة البدايات', bounds: 'الحدود', reparse: 'إعادة التحليل',
};

/** @param {string} tag @param {object} [props] @param {...(Node|string)} children */
function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === 'class') node.className = v;
    else if (k === 'text') node.textContent = v;
    else if (k.startsWith('data-')) node.setAttribute(k, v);
    else node[k] = v;
  }
  for (const c of children) node.append(c);
  return node;
}

function ms(v) {
  if (!Number.isFinite(v)) return '—';
  const s = Math.floor(v / 1000);
  return `${Math.floor(s / 3600)}:${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

function download(name, text) {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/x-subrip;charset=utf-8' }));
  const a = el('a', { href: url, download: name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

async function collect() {
  const tabs = await chrome.tabs.query({});
  const out = [];
  for (const tab of tabs) {
    try {
      const snap = await chrome.tabs.sendMessage(tab.id, { type: 'tj:poc-snapshot' });
      if (snap) out.push({ tabId: tab.id, active: tab.active, snap });
    } catch {
      // تبويب بلا سكربت ترجمان.
    }
  }
  return out;
}

function renderAccepted(snap) {
  if (snap.accepted.length === 0) return el('p', { class: 'empty', text: 'لا التقاط مقبول للفيديو الحالي بعد.' });
  const table = el('table', {},
    el('tr', {}, ...['المسار', 'الحجم', 'المقاطع', 'الاكتمال', 'الثوابت', ''].map((h) => el('th', { text: h }))));
  for (const a of snap.accepted) {
    const inv = el('ul', { class: 'inv' });
    for (const r of a.invariants || []) {
      inv.append(el('li', { class: r.ok ? 'ok' : 'bad', text: `${r.ok ? '✓' : '✗'} ${INVARIANT_NAMES[r.key] || r.key}: ${r.detail}` }));
    }
    if (!a.invariants) inv.append(el('li', { class: 'bad', text: `${a.code}: ${a.message}` }));
    for (const w of a.warnings) inv.append(el('li', { class: 'warn', text: `⚠ ${w.message}` }));
    const name = `${a.videoId}.${a.lang}.${a.trackKind}.srt`;
    const action = a.ok
      ? el('button', { type: 'button', text: 'تنزيل SRT', 'data-testid': 'download', 'data-file': name, onclick: () => download(name, a.srt) })
      : el('span', { class: 'bad', text: 'التصدير موقوف' });
    table.append(el('tr', {},
      el('td', {}, el('span', { class: 'ltr', text: `${a.lang} · ${a.trackKind} · ${a.format} · ${a.transport}` })),
      el('td', { class: 'ltr', text: String(a.bodyLength) }),
      el('td', { class: 'ltr', text: String(a.report.cueCount ?? '—') }),
      el('td', { class: 'ltr', text: a.report.completeness == null ? '—' : `${Math.round(a.report.completeness * 100)}%` }),
      el('td', {}, inv),
      el('td', {}, action)));
  }
  return table;
}

function renderRejected(snap) {
  if (snap.rejected.length === 0) return el('p', { class: 'empty', text: 'لا التقاط مرفوض.' });
  const table = el('table', {}, el('tr', {}, ...['السبب', 'التفاصيل', 'الطلب'].map((h) => el('th', { text: h }))));
  for (const r of snap.rejected.slice().reverse()) {
    table.append(el('tr', {},
      el('td', {}, el('div', { class: 'bad', text: r.message }), el('span', { class: 'ltr', text: r.code })),
      el('td', { text: r.detail }),
      el('td', {}, el('span', { class: 'ltr', text: `v=${r.videoId ?? '—'} · ${r.lang ?? '—'} · ${r.trackKind} · ${r.format}${r.hasTlang ? ' · tlang' : ''}` }))));
  }
  return table;
}

async function render() {
  const root = document.getElementById('tabs');
  root.replaceChildren(el('p', { class: 'empty', text: 'جارٍ السؤال…' }));
  const results = await collect();
  root.replaceChildren();
  if (results.length === 0) {
    root.append(el('p', { class: 'empty', text: 'لا تبويب يوتيوب فيه ترجمان. افتح فيديو ثم حدّث.' }));
    return;
  }
  results.sort((a, b) => Number(b.active) - Number(a.active));
  for (const { tabId, snap } of results) {
    root.append(el('section', { class: 'tab', 'data-tab': String(tabId) },
      el('h2', {}, 'الفيديو الحالي: ', el('span', { class: 'ltr', text: snap.currentVideoId ?? '—' }),
        ` · المدة ${ms(snap.durationMs)} · تنقلات ${snap.navigations}`),
      el('h2', { text: 'المقبول' }), renderAccepted(snap),
      el('h2', { text: 'المرفوض' }), renderRejected(snap)));
  }
}

document.getElementById('refresh').addEventListener('click', render);
render();
