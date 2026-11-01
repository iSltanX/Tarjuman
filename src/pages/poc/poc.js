// صفحة الفحص المؤقتة: تسأل سكربت المحتوى في كل تبويب يوتيوب عن لقطته وتعرضها، وتنزّل SRT عبر Blob
// دون إذن downloads، وتصدّر نتائج الإثبات ملفًا منقّى. البناء بـtextContent فقط.
import { findSecrets } from '../../core/diagnostics/sanitize.js';

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

async function collect(includeBody = false) {
  const tabs = await chrome.tabs.query({});
  const out = [];
  for (const tab of tabs) {
    try {
      // مهلة لكل تبويب: تبويب مستعاد لم يُحمَّل أو قيد التحميل لا يعلّق الصفحة كلها.
      const snap = await Promise.race([
        chrome.tabs.sendMessage(tab.id, { type: 'tj:poc-snapshot', includeBody }),
        new Promise((resolve) => setTimeout(() => resolve(null), 3000)),
      ]);
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

/** يصدّر نتائج الإثبات (اللقطات وسجل الجلسة وSRT والعينات الخام) ملفًا واحدًا بعد التأكد من خلوه من الأسرار. */
async function exportResults(label = null) {
  const status = document.getElementById('export-status');
  status.textContent = 'جارٍ التجهيز…';
  const tabs = await collect(true);
  const data = {
    schema: 1,
    label,
    exportedAt: new Date().toISOString(),
    browser: {
      isBrave: typeof navigator.brave !== 'undefined',
      userAgent: navigator.userAgent,
      brands: navigator.userAgentData ? navigator.userAgentData.brands.map((b) => `${b.brand} ${b.version}`) : null,
      webdriverExtensionPage: navigator.webdriver === true,
    },
    // مخزن الإضافة: يُتوقع فارغًا في P1 (لا تخزين دائم ولا رموز).
    storage: {
      local: Object.keys(await chrome.storage.local.get(null)),
      session: Object.keys(await chrome.storage.session.get(null)),
    },
    tabs,
  };
  const text = `${JSON.stringify(data, null, 2)}\n`;
  const leaks = findSecrets(text);
  if (leaks.length) {
    status.textContent = `أوقفنا التصدير: ${leaks.length} نمط حساس (${[...new Set(leaks.map((l) => l.type))].join('، ')}).`;
    status.className = 'bad';
    return null;
  }
  const stamp = data.exportedAt.replace(/[:.]/g, '-').slice(0, 19);
  download(`tarjuman-p1-${data.browser.isBrave ? 'brave' : 'chrome'}-${label ? `${label}-` : ''}${stamp}.json`, text);
  status.textContent = `صُدّر ملف النتائج (${tabs.length} تبويب).`;
  status.className = 'ok';
  return tabs;
}

document.getElementById('refresh').addEventListener('click', render);
document.getElementById('export').addEventListener('click', () => exportResults());
render();

// تصدير تلقائي للإثبات عند فتح الصفحة بالرابط ‎#export=<اسم>‎ (من سطر الأوامر في جلسة غير مؤتمتة)، ثم إغلاق
// تبويبها. ومع ‎&srt‎ يُنزَّل SRT كل مسار مقبول عبر Blob، ومع ‎&close‎ تُغلق تبويبات يوتيوب التي أجابت.
const auto = /^#export=([A-Za-z0-9_-]{1,40})((?:&(?:close|srt))*)$/.exec(location.hash);
if (auto) {
  const flags = auto[2].split('&').filter(Boolean);
  setTimeout(async () => {
    const tabs = await exportResults(auto[1]);
    const answered = flags.includes('close') && tabs ? tabs.map((t) => t.tabId) : [];
    if (flags.includes('srt') && tabs) {
      for (const { snap } of tabs) {
        for (const a of snap.accepted) if (a.ok) download(`${auto[1]}-${a.videoId}.${a.lang}.${a.trackKind}.srt`, a.srt);
      }
    }
    setTimeout(async () => {
      const tab = await chrome.tabs.getCurrent();
      const ids = [...answered, ...(tab ? [tab.id] : [])];
      if (ids.length) chrome.tabs.remove(ids);
    }, 3000);
  }, 1500);
}
