/* لوحة خطة ترجمان.
   مصدرها الوحيد data/state.js (window.TJ_STATE): يولّده tools/plan/plan.mjs من Git قراءةً فقط —
   مباشرة عند كل قراءة مع «npm run dashboard»، أو لقطةً بـ«npm run plan:sync». الصفحة لا تستنتج حالة بنفسها،
   ولا تخزّن شيئًا (لا localStorage)، ولا تنفّذ شيئًا: أزرار النسخ تضع النص في الحافظة فقط. */
(function () {
  'use strict';

  var POLL_LIVE = 5000;
  var POLL_SNAPSHOT = 20000;
  var STALE_MS = 20000;
  var STATE_ORDER = ['verified', 'integrating', 'ready', 'in_progress', 'blocked', 'available', 'waiting'];
  var STATE_LABEL = {
    verified: 'مدمجة ومتحققة', integrating: 'قيد الدمج', ready: 'جاهزة للدمج', in_progress: 'جارية',
    blocked: 'متعطلة', available: 'متاحة للبدء', waiting: 'مخططة',
  };
  var STATE_GROUP = {
    verified: 'في main بعد البوابة', integrating: 'في فرع التكامل', ready: 'سُلّمت ولم تُدمج',
    in_progress: 'في فرعها', blocked: 'بسبب مكتوب', available: 'يمكن بدؤها الآن', waiting: 'لم يحن دورها',
  };
  var WAVE_CLASS = { waiting: 'waiting', open: 'open', merging: 'merging', blocked: 'blocked', verified: 'verified' };
  var ICON = {
    copy: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a2 2 0 0 1 2-2h9"/></svg>',
    chev: '<svg class="chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>',
    check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m5 12 5 5 9-10"/></svg>',
  };

  var S = null;
  var byId = {};
  var waveById = {};
  var lastOk = 0;
  var failed = false;
  var polling = false;
  var timer = null;
  var copyMap = new Map();
  var ui = { open: new Set(), q: '', states: new Set(), wave: '' };

  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function norm(s) {
    return String(s || '').toLowerCase().normalize('NFKD')
      .replace(/[ً-ٰٟـ]/g, '').replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي');
  }
  function trunc(s, n) { s = String(s || ''); return s.length > n ? s.slice(0, n - 1) + '…' : s; }
  function countReq(n) {
    if (n === 0) return 'لا متطلبات';
    if (n === 1) return 'متطلب واحد';
    if (n === 2) return 'متطلبان';
    return n + (n <= 10 ? ' متطلبات' : ' متطلبًا');
  }
  var fmtDate = new Intl.DateTimeFormat('ar-u-ca-gregory-nu-latn', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  var fmtClock = new Intl.DateTimeFormat('ar-u-ca-gregory-nu-latn', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  function when(ms) { try { return fmtDate.format(new Date(ms)); } catch (e) { return String(ms); } }
  function clock(ms) { try { return fmtClock.format(new Date(ms)); } catch (e) { return ''; } }
  function pill(cls, label) { return '<span class="pill st-' + esc(cls) + '"><span class="pill__dot" aria-hidden="true"></span>' + esc(label) + '</span>'; }

  // ---------- Markdown آمن ومحدود: يهرّب كل شيء ثم يضيف وسومًا معروفة فقط ----------
  function resolveLink(href, base) {
    if (/^https?:\/\//i.test(href)) return { href: href, ext: true };
    if (/^[a-z]+:/i.test(href) || href.charAt(0) === '#') return null;
    var parts = (base + href).split('/');
    var out = [];
    parts.forEach(function (p) { if (p === '..') out.pop(); else if (p && p !== '.') out.push(p); });
    return { href: '../' + out.join('/') + (/\/$/.test(href) ? '/' : ''), ext: false };
  }
  function inline(s, base) {
    s = String(s == null ? '' : s);
    base = base || '';
    var re = /`([^`]+)`|\*\*(.+?)\*\*|\[([^\]]+)\]\(([^)\s]+)\)/g;
    var out = '';
    var last = 0;
    var m;
    while ((m = re.exec(s))) {
      out += esc(s.slice(last, m.index));
      if (m[1] != null) out += '<code>' + esc(m[1]) + '</code>';
      else if (m[2] != null) out += '<strong>' + inline(m[2], base) + '</strong>';
      else {
        var r = resolveLink(m[4], base);
        out += r ? '<a href="' + esc(r.href) + '"' + (r.ext ? ' target="_blank" rel="noopener noreferrer"' : '') + '>' + inline(m[3], base) + '</a>' : inline(m[3], base);
      }
      last = re.lastIndex;
    }
    return out + esc(s.slice(last));
  }
  function mdTable(rows, base) {
    function cells(r) {
      return r.trim().replace(/^\|/, '').replace(/\|$/, '').split(/(?<!\\)\|/).map(function (c) { return c.trim().replace(/\\\|/g, '|'); });
    }
    var head = cells(rows[0]);
    var body = rows.slice(1).filter(function (r) { return !/^\s*\|?\s*:?-{2,}/.test(r); }).map(cells);
    return '<div class="tbl-wrap"><table><thead><tr>' + head.map(function (h) { return '<th>' + inline(h, base) + '</th>'; }).join('') +
      '</tr></thead><tbody>' + body.map(function (r) { return '<tr>' + r.map(function (c) { return '<td>' + inline(c, base) + '</td>'; }).join('') + '</tr>'; }).join('') + '</tbody></table></div>';
  }
  function md(text, base) {
    var lines = String(text || '').replace(/\r/g, '').split('\n');
    var html = '';
    var para = [];
    var i = 0;
    function flush() { if (para.length) { html += '<p>' + inline(para.join(' '), base) + '</p>'; para = []; } }
    var ITEM = /^\s*([-*]|\d+\.)\s+/;
    while (i < lines.length) {
      var line = lines[i];
      if (/^```/.test(line)) {
        flush();
        var buf = [];
        i++;
        while (i < lines.length && !/^```/.test(lines[i])) buf.push(lines[i++]);
        i++;
        html += '<pre>' + esc(buf.join('\n')) + '</pre>';
      } else if (/^\s*\|/.test(line)) {
        flush();
        var rows = [];
        while (i < lines.length && /^\s*\|/.test(lines[i])) rows.push(lines[i++]);
        html += mdTable(rows, base);
      } else if (ITEM.test(line)) {
        flush();
        var ordered = /^\s*\d+\./.test(line);
        var items = [];
        while (i < lines.length && (ITEM.test(lines[i]) || (/^\s{2,}\S/.test(lines[i]) && items.length))) {
          var l = lines[i];
          if (ITEM.test(l)) items.push({ nest: /^\s{2,}/.test(l), text: l.replace(ITEM, '') });
          else items[items.length - 1].text += ' ' + l.trim();
          i++;
        }
        html += (ordered ? '<ol>' : '<ul>') + items.map(function (it) { return '<li' + (it.nest ? ' class="nest"' : '') + '>' + inline(it.text, base) + '</li>'; }).join('') + (ordered ? '</ol>' : '</ul>');
      } else if (/^>\s?/.test(line)) {
        flush();
        var q = [];
        while (i < lines.length && /^>\s?/.test(lines[i])) q.push(lines[i++].replace(/^>\s?/, ''));
        html += '<blockquote>' + inline(q.join(' '), base) + '</blockquote>';
      } else if (/^#{3,6}\s/.test(line)) {
        flush();
        html += '<h5>' + inline(line.replace(/^#+\s/, ''), base) + '</h5>';
        i++;
      } else if (!line.trim()) {
        flush();
        i++;
      } else {
        para.push(line.trim());
        i++;
      }
    }
    flush();
    return html;
  }

  // ---------- أزرار النسخ ----------
  function reg(text, title) {
    var key = 'k' + (copyMap.size + 1);
    copyMap.set(key, { text: text, title: title });
    return key;
  }
  function copyBtn(text, label, o) {
    o = o || {};
    var key = reg(text, o.title || label);
    var cls = 'btn' + (o.primary ? ' btn--primary' : '') + (o.small ? ' btn--sm' : '');
    return '<button type="button" class="' + cls + '" data-copy="' + key + '"' + (o.disabled ? ' disabled aria-disabled="true"' : '') +
      (o.why ? ' title="' + esc(o.why) + '"' : '') + ' aria-label="' + esc(label + (o.show ? ': ' + text : '')) + '">' + ICON.copy +
      '<span class="btn__label">' + esc(label) + '</span>' + (o.show ? '<bdi class="btn__cmd">' + esc(text) + '</bdi>' : '') + '</button>';
  }
  function viewBtn(text, title) {
    return '<button type="button" class="btn btn--sm btn--ghost" data-view="' + reg(text, title) + '">عرض البرومبت</button>';
  }

  // ---------- الأجزاء ----------
  function freshHtml() {
    if (!S) return '<span class="fresh is-stale"><span class="fresh__dot" aria-hidden="true"></span>لا حالة بعد</span>';
    if (S.mode === 'live') {
      var stale = failed || Date.now() - lastOk > STALE_MS;
      return '<span class="fresh' + (stale ? ' is-stale' : '') + '" id="fresh" title="الحالة تُشتق من Git عند كل قراءة">' +
        '<span class="fresh__dot" aria-hidden="true"></span>' + (stale ? 'انقطعت القراءة · المعروض من ' + esc(clock(S.generatedAtMs)) : 'مباشر · آخر قراءة ' + esc(clock(lastOk))) + '</span>';
    }
    return '<span class="fresh is-snapshot" id="fresh" title="لقطة مولّدة. للتحديث التلقائي شغّل npm run dashboard"><span class="fresh__dot" aria-hidden="true"></span>لقطة · ' + esc(when(S.generatedAtMs)) + '</span>';
  }
  function renderFresh() { $('fresh-slot').innerHTML = freshHtml(); }

  function renderAlerts() {
    var errs = S.problems.filter(function (p) { return p.level === 'error'; });
    var warns = S.problems.filter(function (p) { return p.level !== 'error'; });
    var item = function (p) { return '<li>' + esc(p.text) + (p.where ? ' <span class="muted small">[' + esc(p.where) + ']</span>' : '') + '</li>'; };
    var h = '';
    if (errs.length) h += '<div class="alert alert--error" role="alert"><strong>أخطاء في الخطة أو الحالة (' + errs.length + ')</strong><ul>' + errs.map(item).join('') + '</ul><span class="small">التفاصيل: <code>npm run plan:check</code></span></div>';
    if (warns.length) {
      h += '<div class="alert"><details' + (warns.length <= 2 ? ' open' : '') + '><summary><strong>تنبيهات (' + warns.length + ')</strong></summary><ul>' + warns.map(item).join('') + '</ul></details></div>';
    }
    $('alerts').innerHTML = h;
  }

  function renderNow() {
    var c = S.counts;
    var cur = S.current;
    var n = S.next || { tone: 'waiting', text: '', actions: [] };
    var h = '<div class="card now">';
    h += '<div class="now__bar"><span class="eyebrow">' + (cur ? 'الموجة الحالية' : 'الخطة') + '</span><span class="small muted">خط الأساس ' + esc(S.project.baseline) +
      (S.source.main ? ' · main عند <code>' + esc(S.source.main.hash) + '</code> «' + esc(trunc(S.source.main.subject, 60)) + '»' : ' · لا التزامات بعد') + '</span></div>';
    if (cur) h += '<div class="now__head"><span class="wbadge">' + esc(cur.wave) + '</span><h2 class="now__title">' + esc(cur.title) + '</h2>' + pill(WAVE_CLASS[cur.state], cur.label) + '</div>';
    h += '<div class="next st-' + esc(n.tone) + '"><span class="eyebrow">الخطوة التالية</span><p class="next__text">' + inline(n.text) + '</p>';
    if (n.actions && n.actions.length) {
      h += '<div class="actions">' + n.actions.map(function (a) {
        var item = a.kind === 'phase' ? byId[a.id] : waveById[a.id];
        var lab = a.kind === 'phase' ? 'انسخ أمر ' + a.id : 'انسخ أمر المنسّق';
        return '<span class="next__opt">' + copyBtn(a.command, lab, { primary: a.primary, show: true, title: a.label }) +
          copyBtn(item.prompt, 'البرومبت الكامل', { small: true, title: 'البرومبت الكامل — ' + a.id }) +
          '<span class="next__model">النموذج المقترح: ' + esc(a.model) + '</span></span>';
      }).join('') + '</div>';
    }
    h += '</div>';
    h += '<div class="tiles" role="group" aria-label="عدد مراحل المنتج حسب الحالة، اضغط للتصفية">' + STATE_ORDER.map(function (st) {
      return '<button type="button" class="tile st-' + st + '" data-tile="' + st + '" aria-pressed="' + ui.states.has(st) + '"><span class="tile__n">' + (c[st] || 0) +
        '</span><span class="tile__l">' + STATE_LABEL[st] + '</span><span class="tile__g">' + STATE_GROUP[st] + '</span></button>';
    }).join('') + '</div>';
    var reqV = S.requirements.filter(function (r) { return r.state === 'verified'; }).length;
    var closed = S.waves.filter(function (w) { return w.state === 'verified'; }).length;
    var maxPar = Math.max.apply(null, S.waves.map(function (w) { return w.phases.length; }));
    h += '<div class="facts"><span>مراحل المنتج: <b>' + S.total + '</b></span><span>الموجات: <b>' + S.waves.length + '</b> · المغلقة: <b>' + closed + '</b></span><span>أقصى توازٍ: <b>' + maxPar +
      '</b></span><span>المتطلبات المتحققة: <b>' + reqV + '</b> من <b>' + S.requirements.length + '</b></span><span class="muted">«جاهزة للدمج» تسليم لا دمج، ولا تُحسب مرحلة منجزة قبل تحقق موجتها.</span></div>';
    if (S.gates.length) {
      h += '<div class="gates">' + S.gates.map(function (g) {
        return '<div class="gate"><strong>البوابة ' + esc(g.id) + ' — ' + esc(g.title) + '</strong>' + pill(g.state, g.label) +
          '<span class="small muted">' + esc(g.state === 'awaiting' ? g.otherwise : g.opensWhen) + '</span>' +
          (g.decision ? '<span class="small">قرارك: «' + esc(g.decision.text) + '»</span>' : '') + '</div>';
      }).join('') + '</div>';
    }
    var waiting = S.phases.filter(function (p) { return p.state === 'waiting'; });
    if (waiting.length) {
      h += '<details class="waitlist"><summary>لماذا تنتظر ' + waiting.length + ' مراحل؟</summary><ul>' + waiting.map(function (p) {
        return '<li><a href="#phase-' + p.id + '">' + p.id + '</a> — ' + esc(p.title) + ': ' + esc(p.waitingReasons.join(' ')) + '</li>';
      }).join('') + '</ul></details>';
    }
    h += '</div>';
    $('now').innerHTML = h;
  }

  function renderToolbar() {
    $('state-chips').innerHTML = STATE_ORDER.map(function (st) {
      return '<button type="button" class="fchip st-' + st + '" data-fstate="' + st + '" aria-pressed="' + ui.states.has(st) + '"><span class="pill__dot" aria-hidden="true"></span>' +
        STATE_LABEL[st] + ' <span class="num">' + (S.counts[st] || 0) + '</span></button>';
    }).join('');
    var sel = $('wave-filter');
    sel.innerHTML = '<option value="">كل الموجات</option>' + S.waves.map(function (w) {
      return '<option value="' + w.id + '"' + (ui.wave === w.id ? ' selected' : '') + '>' + w.id + ' — ' + esc(w.title) + '</option>';
    }).join('');
    $('q').value = ui.q;
  }

  function renderGraph() {
    var colW = 180, nodeW = 156, nodeH = 54, gapY = 14, top = 58, pad = 12;
    var W = S.waves.length * colW + pad * 2;
    var maxN = Math.max.apply(null, S.waves.map(function (w) { return w.phases.length; }));
    var inner = maxN * nodeH + (maxN - 1) * gapY;
    var H = top + inner + 22;
    var pos = {};
    S.waves.forEach(function (w, i) {
      var right = W - pad - i * colW;
      var cx = right - colW / 2;
      var n = w.phases.length;
      var hh = n * nodeH + (n - 1) * gapY;
      var y0 = top + (inner - hh) / 2;
      w.phases.forEach(function (id, j) { pos[id] = { x: cx - nodeW / 2, y: y0 + j * (nodeH + gapY), cx: cx }; });
    });
    var s = '<svg viewBox="0 0 ' + W + ' ' + H + '" style="direction:rtl;max-width:' + W + 'px" role="img" aria-label="مخطط اعتماديات المراحل التسع في خمس موجات، من اليمين إلى اليسار">';
    s += '<defs><marker id="arr-met" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" style="fill:var(--verified)"/></marker>' +
      '<marker id="arr-pending" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" style="fill:var(--border-strong)"/></marker></defs>';
    S.waves.forEach(function (w, i) {
      var right = W - pad - i * colW;
      var cx = right - colW / 2;
      if (i > 0) s += '<line class="g-sep" x1="' + right + '" y1="8" x2="' + right + '" y2="' + (H - 6) + '"/>';
      s += '<text class="g-col" x="' + cx + '" y="22" text-anchor="middle">' + esc(w.id) + ' — ' + esc(trunc(w.title, 17)) + '</text>';
      s += '<text class="g-col g-col-state st-' + WAVE_CLASS[w.state] + '" x="' + cx + '" y="40" text-anchor="middle" style="fill:var(--c)">' + esc(w.label) + ' · ' + (w.parallel ? w.phases.length + ' بالتوازي' : 'منفردة') + '</text>';
    });
    S.phases.forEach(function (p) {
      p.dependsOn.forEach(function (d) {
        var a = pos[d];
        var b = pos[p.id];
        if (!a || !b) return;
        var sx = a.x, sy = a.y + nodeH / 2, ex = b.x + nodeW, ey = b.y + nodeH / 2;
        var met = byId[d] && byId[d].state === 'verified';
        var dx = Math.max(26, (sx - ex) / 2);
        s += '<path class="g-edge ' + (met ? 'is-met' : 'is-pending') + '" d="M' + sx + ',' + sy + ' C' + (sx - dx) + ',' + sy + ' ' + (ex + dx) + ',' + ey + ' ' + ex + ',' + ey + '" marker-end="url(#' + (met ? 'arr-met' : 'arr-pending') + ')"/>';
        var g = S.gates.filter(function (x) { return x.phase === d && p.requiresGates.indexOf(x.id) >= 0; })[0];
        if (g) {
          var mx = (sx + ex) / 2, my = (sy + ey) / 2;
          s += '<g class="g-gate st-' + g.state + '"><polygon points="' + mx + ',' + (my - 13) + ' ' + (mx + 16) + ',' + my + ' ' + mx + ',' + (my + 13) + ' ' + (mx - 16) + ',' + my + '"/>' +
            '<text x="' + mx + '" y="' + (my + 4) + '" text-anchor="middle">' + esc(g.id) + '</text><title>البوابة ' + esc(g.id) + ': ' + esc(g.label) + '</title></g>';
        }
      });
    });
    S.phases.forEach(function (p) {
      var q = pos[p.id];
      if (!q) return;
      s += '<a class="g-node st-' + p.state + '" href="#phase-' + p.id + '" data-node="' + p.id + '" aria-label="' + esc(p.id + ' — ' + p.title + ': ' + p.label) + '">' +
        '<rect x="' + q.x + '" y="' + q.y + '" width="' + nodeW + '" height="' + nodeH + '" rx="11"/>' +
        '<text x="' + q.cx + '" y="' + (q.y + 22) + '" text-anchor="middle"><tspan class="g-id">' + esc(p.id) + '</tspan><tspan class="g-title"> · ' + esc(p.label) + '</tspan></text>' +
        '<text class="g-title" x="' + q.cx + '" y="' + (q.y + 41) + '" text-anchor="middle">' + esc(trunc(p.title, 21)) + '</text>' +
        '<title>' + esc(p.id + ' — ' + p.title + ' (' + p.label + ')') + '</title></a>';
    });
    s += '</svg>';
    var legend = '<div class="legend">' + STATE_ORDER.map(function (st) { return pill(st, STATE_LABEL[st]); }).join('') +
      '<span>◆ بوابة قرار</span></div>';
    $('graph').innerHTML = s + legend;
  }

  function depChip(d) {
    var p = byId[d];
    if (!p) return '<span class="chip">' + esc(d) + '</span>';
    return '<a class="chip st-' + p.state + '" href="#phase-' + d + '" title="' + esc(p.title + ': ' + p.label) + '"><span class="pill__dot" aria-hidden="true"></span>' + esc(d) + '</a>';
  }

  function searchText(p) {
    return [p.id, p.title, p.wave, p.waveTitle, p.label, p.model, p.sections.goal, p.requirements.join(' '), p.owns.join(' '),
      p.acceptance.map(function (a) { return a.id + ' ' + a.text; }).join(' ')].join(' ');
  }

  function phaseRow(p) {
    var open = ui.open.has(p.id);
    var deps = p.dependsOn.map(depChip).join(' ');
    var startable = p.state === 'available';
    var h = '<article class="phase st-' + p.state + '" id="phase-' + p.id + '" data-phase="' + p.id + '" data-state="' + p.state + '" data-wave="' + p.wave + '" data-text="' + esc(searchText(p)) + '">';
    h += '<div class="phase__row"><div class="phase__main">';
    h += '<div class="phase__line"><span class="pid">' + p.id + '</span><h3 class="phase__title">' + esc(p.title) + '</h3>' + pill(p.state, p.label) +
      (p.isGate ? '<span class="chip">مرحلة بوابة</span>' : '') + (p.live ? '<span class="chip">اختبار حي</span>' : '') + '</div>';
    h += '<div class="phase__sub"><span>تعتمد على: ' + (deps || '—') + '</span><span>بالتوازي مع: <b>' + esc(p.parallelWith.join('، ') || '—') + '</b></span>' +
      '<span>النموذج المقترح: <b>' + esc(p.model) + '</b> · الجهد ' + esc(p.effort) + '</span><span>' + esc(p.size) + ' · ' + esc(p.estimate) + '</span></div>';
    if (p.state === 'waiting' && p.waitingReasons.length) {
      h += '<div class="phase__resume muted">بانتظار: ' + esc(p.waitingReasons[0]) + (p.waitingReasons.length > 1 ? ' (+' + (p.waitingReasons.length - 1) + ')' : '') + '</div>';
    } else if (p.resume) {
      h += '<div class="phase__resume">نقطة الاستئناف: ' + inline(p.resume) + '</div>';
    }
    if (p.blocker) h += '<div class="phase__resume" style="color:var(--blocked)">سبب التعطل: ' + esc(p.blocker) + '</div>';
    h += '</div><div class="phase__acts">';
    h += copyBtn(p.command, p.commandEnabled ? 'انسخ الأمر' : 'الأمر غير متاح الآن', { primary: startable, show: true, disabled: !p.commandEnabled, why: p.whyNot, title: 'أمر ' + p.id });
    h += copyBtn(p.prompt, 'انسخ البرومبت الكامل', { title: 'البرومبت الكامل — ' + p.id });
    h += '<button type="button" class="btn btn--ghost" data-toggle="' + p.id + '" aria-expanded="' + open + '" aria-controls="panel-' + p.id + '">التفاصيل ' + ICON.chev + '</button>';
    h += '</div></div>';
    h += '<div class="panel" id="panel-' + p.id + '"' + (open ? '' : ' hidden') + '>' + (open ? phasePanel(p) : '') + '</div>';
    return h + '</article>';
  }

  function kv(rows) {
    return '<dl class="kv">' + rows.filter(function (r) { return r && r[1]; }).map(function (r) { return '<dt>' + esc(r[0]) + '</dt><dd>' + r[1] + '</dd>'; }).join('') + '</dl>';
  }

  function phasePanel(p) {
    var base = p.doc.replace(/[^/]+$/, '');
    var s = p.sections;
    var acc = '<div class="tbl-wrap"><table><thead><tr><th>المعيار</th><th>النص</th><th>المتطلبات</th><th>التحقق</th><th>النتيجة</th></tr></thead><tbody>' +
      p.acceptance.map(function (a) {
        var ev = (a.evidence || []).map(function (e) { return '<a href="' + esc(resolveLink(e, '').href) + '">' + esc(e) + '</a>'; }).join('، ');
        return '<tr><td class="mono">' + esc(a.id) + '</td><td>' + esc(a.text) + '</td><td>' + a.req.map(function (r) { return '<a class="chip" href="#req-' + r + '">' + r + '</a>'; }).join(' ') +
          '</td><td>' + esc(a.verify) + '</td><td>' + pill(a.result, a.resultLabel) + (ev ? '<div class="small">' + ev + '</div>' : '') + (a.note ? '<div class="small muted">' + esc(a.note) + '</div>' : '') + '</td></tr>';
      }).join('') + '</tbody></table></div>';

    var left = '<div>';
    left += '<div class="box"><h4>الهدف</h4>' + md(s.goal, base) + '</div>';
    left += '<div class="box"><h4>معايير القبول</h4>' + acc + '</div>';
    left += '<div class="box"><details open><summary>النطاق</summary><h5>داخل النطاق</h5>' + md(s.scopeIn, base) + '<h5>خارج النطاق</h5>' + md(s.scopeOut, base) + '</details></div>';
    left += '<div class="box"><details><summary>المهام</summary>' + md(s.tasks, base) + '</details></div>';
    left += '<div class="box"><details><summary>المخاطر</summary>' + md(s.risks, base) + '</details></div>';
    left += '<div class="box"><details><summary>الاعتماديات والمخرجات (من ملف المرحلة)</summary>' + md(s.deps, base) + md(s.outputs, base) + '</details></div>';
    left += '<div class="box"><h4>تقرير التسليم</h4>' + (p.reportWritten ? md(s.report, base) : '<p class="muted">لم يُكتب بعد. يُكتب عند التسليم في ملف المرحلة، ويظهر هنا من فرعها قبل الدمج.</p>') + '</div>';
    left += '<div class="box"><details><summary>سجل التنفيذ</summary>' + md(s.log, base) + '</details></div>';
    left += '</div>';

    var right = '<div>';
    right += '<div class="box"><h4>الحالة الآن</h4>' + kv([
      ['الحالة', pill(p.state, p.label)],
      ['المصدر', esc(p.sourceLabel)],
      ['الفرع', p.branch ? '<code>' + esc(p.branch) + '</code>' : '<span class="muted">لم يُنشأ — المتوقع <code>' + esc(p.expectedBranch) + '</code></span>'],
      ['مجلد العمل', p.worktree ? '<code>' + esc(p.worktree) + '</code>' + (p.dirty ? ' <span class="pill st-integrating">تغييرات غير ملتزمة</span>' : '') : '<span class="muted">لم يُنشأ — المتوقع <code>' + esc(p.expectedWorktree) + '</code></span>'],
      ['آخر التزام', p.last ? '<code>' + esc(p.last.hash) + '</code> ' + esc(p.last.subject) : ''],
      ['متقدم على main', p.ahead != null && p.branch ? '<span class="num">' + p.ahead + '</span> التزام' : ''],
      ['آخر تحديث', esc(p.updated || '')],
      ['نقطة الاستئناف', inline(p.resume)],
      ['سبب التعطل', p.blocker ? esc(p.blocker) : ''],
      ['النتيجة', p.isGate ? (p.outcomeLabel ? pill(p.outcome === 'success' ? 'pass' : p.outcome === 'fail' ? 'fail' : 'partial', p.outcomeLabel) : '<span class="muted">لم تُسجّل</span>') : ''],
      ['التزام العمل', p.commit ? '<code>' + esc(p.commit) + '</code>' : ''],
      ['التزام الدمج', p.mergeCommit ? '<code>' + esc(p.mergeCommit) + '</code>' : ''],
    ]) + '</div>';
    if (p.waitingReasons.length) right += '<div class="box"><h4>لماذا ليست متاحة</h4><ul class="reasons">' + p.waitingReasons.map(function (r) { return '<li>' + esc(r) + '</li>'; }).join('') + '</ul></div>';
    right += '<div class="box"><h4>الأوامر</h4><div class="actions">' +
      copyBtn(p.command, 'انسخ الأمر', { primary: p.state === 'available', show: true, disabled: !p.commandEnabled, why: p.whyNot, title: 'أمر ' + p.id }) +
      copyBtn(p.prompt, 'انسخ البرومبت الكامل', { title: 'البرومبت الكامل — ' + p.id }) + viewBtn(p.prompt, 'البرومبت الكامل — ' + p.id) + '</div>' +
      (!p.commandEnabled && p.whyNot ? '<p class="whynot" style="margin-top:6px">' + esc(p.whyNot) + '</p>' : '') +
      '<p class="small muted" style="margin-top:8px">الصق الأمر في جلسة Claude Code جديدة في مجلد المشروع واختر النموذج المقترح (' + esc(p.model) + '). الجلسة تتولى الفرع والـworktree.</p>' +
      '<div class="actions small"><a href="' + esc(resolveLink(p.doc, '').href) + '">ملف المرحلة</a><a href="' + esc(resolveLink(p.evidenceDir + '/', '').href) + '">مجلد الأدلة</a></div></div>';
    if (p.needsUser.length) right += '<div class="box"><h4>يحتاج منك</h4><ul>' + p.needsUser.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul></div>';
    right += '<div class="box"><h4>الفحوص والأدلة المسجلة</h4>' + (p.checks.length ? '<ul class="plain">' + p.checks.map(function (c) {
      return '<li>' + pill(c.result, c.result === 'pass' ? 'ناجح' : c.result === 'fail' ? 'فاشل' : c.result) + ' <code>' + esc(c.cmd) + '</code>' + (c.note ? ' <span class="muted small">' + esc(c.note) + '</span>' : '') + '</li>';
    }).join('') + '</ul>' : '<p class="muted">لا فحوص مسجلة بعد.</p>') +
      (p.evidence.length ? '<ul class="plain">' + p.evidence.map(function (e) { return '<li><a href="' + esc(resolveLink(e.path, '').href) + '">' + esc(e.label) + '</a></li>'; }).join('') + '</ul>' : '') +
      '<p class="small muted">الفحوص عند التسليم: ' + (p.checksPlanned || []).map(function (c) { return '<code>' + esc(c) + '</code>'; }).join(' ثم ') + '</p></div>';
    right += '<div class="box"><h4>الملفات التي تملكها</h4><ul class="files">' + p.owns.map(function (f) { return '<li><code>' + esc(f) + '</code></li>'; }).join('') + '</ul>' +
      (p.fixScope.length ? '<p class="small" style="margin-top:6px">إصلاحات تكامل موثّقة فقط في: ' + p.fixScope.map(function (f) { return '<code>' + esc(f) + '</code>'; }).join('، ') + '</p>' : '') +
      '<p class="small muted" style="margin-top:6px">ومعها ملفها ومجلد أدلتها. داخل الموجة لا تتقاطع ملكيتان.</p></div>';
    if (p.outOfScope.length || p.sharedRequests.length) {
      right += '<div class="box"><h4>ملفات مشتركة وخارج الملكية</h4>' +
        (p.outOfScope.length ? '<p class="small" style="color:var(--warn)">يمسّ الفرع: ' + p.outOfScope.map(function (f) { return '<code>' + esc(f) + '</code>'; }).join('، ') + '</p>' : '') +
        (p.sharedRequests.length ? '<ul>' + p.sharedRequests.map(function (r) { return '<li><code>' + esc(r.file) + '</code>: ' + esc(r.change) + (r.why ? ' — ' + esc(r.why) : '') + (r.applied ? ' (مطبّق في الفرع)' : '') + '</li>'; }).join('') + '</ul>' : '') + '</div>';
    }
    right += '<div class="box"><h4>المتطلبات</h4><div class="actions">' + p.requirements.map(function (r) { return '<a class="chip" href="#req-' + r + '">' + r + '</a>'; }).join('') + '</div></div>';
    right += '</div>';
    return '<div class="panel__grid">' + left + right + '</div>';
  }

  function waveCard(w) {
    var isCur = S.current && S.current.wave === w.id;
    var gate = w.decidesGate ? S.gates.filter(function (g) { return g.id === w.decidesGate; })[0] : null;
    var h = '<section class="card wave' + (isCur ? ' is-current' : '') + '" id="wave-' + w.id + '" data-wave="' + w.id + '" aria-labelledby="wt-' + w.id + '">';
    h += '<div class="wave__head"><div class="wave__top"><span class="wbadge' + (isCur ? '' : ' wbadge--muted') + '">' + w.id + '</span><h3 class="wave__title" id="wt-' + w.id + '">' + esc(w.title) + '</h3>' +
      pill(WAVE_CLASS[w.state], w.label) + '<span class="chip">' + (w.parallel ? w.phases.length + ' بالتوازي' : 'منفردة') + '</span>' +
      (gate ? pill(gate.state, 'تحسم ' + gate.id + ': ' + gate.label) : '') + '</div>';
    h += '<p class="wave__why">' + esc(w.why) + '</p>';
    h += '<div class="wave__meta"><span>ترتيب الدمج: <span class="order">' + w.phases.map(function (id) { return depChip(id); }).join('<span class="sep">←</span>') + '</span></span>' +
      '<span>وسم الأساس: <code>' + esc(w.baseTag.name) + '</code> ' + (w.baseTag.exists ? '<span class="muted num">(' + esc(w.baseTag.commit) + ')</span>' : '<span class="muted">لم يوضع بعد</span>') + '</span>' +
      '<span>البوابة: ' + w.gate.commands.map(function (c) { return '<code>' + esc(c) + '</code>'; }).join(' ثم ') + '</span>' +
      (w.gate.live ? '<span>الدخان الحي: ' + esc(w.gate.live) + '</span>' : '') +
      (w.integration ? '<span>فرع التكامل: <code>' + esc(w.integration.branch) + '</code></span>' : '') +
      (w.reasons.length ? '<span class="muted">' + esc(w.reasons.join(' ')) + '</span>' : '') + '</div></div>';
    h += '<div class="coord"><span class="coord__label">منسّق الموجة</span>' +
      copyBtn(w.command, w.commandEnabled ? w.commandLabel : 'أمر المنسّق غير متاح بعد', { primary: w.commandEnabled, show: true, disabled: !w.commandEnabled, why: w.whyNot, title: 'أمر منسّق ' + w.id }) +
      copyBtn(w.prompt, 'انسخ برومبت المنسّق', { title: 'برومبت منسّق ' + w.id }) + viewBtn(w.prompt, 'برومبت منسّق ' + w.id) +
      '<span class="muted small">النموذج المقترح: ' + esc(w.coordinatorModel) + ' · جلسة في النسخة الرئيسية بلا worktree</span>' +
      (!w.commandEnabled && w.whyNot ? '<span class="whynot">' + esc(w.whyNot) + '</span>' : '') + '</div>';
    h += '<div class="phases">' + w.phases.map(function (id) { return phaseRow(byId[id]); }).join('') + '</div>';
    return h + '</section>';
  }

  function renderWaves() { $('waves').innerHTML = S.waves.map(waveCard).join(''); }

  function renderReqs() {
    var h = '<div class="card reqs"><div class="tbl-wrap" style="border:0"><table><thead><tr><th>المعرّف</th><th>المتطلب</th><th>المجموعة</th><th>المراحل</th><th>معايير القبول</th><th>الحالة</th></tr></thead><tbody>';
    var cls = { verified: 'verified', partial: 'partial', delivered: 'delivered', planned: 'planned' };
    h += S.requirements.map(function (r) {
      var text = [r.id, r.text, r.groupTitle, r.phases.join(' '), r.acceptance.map(function (a) { return a.ac; }).join(' ')].join(' ');
      return '<tr id="req-' + r.id + '" data-req="' + r.id + '" data-text="' + esc(text) + '"><td class="mono">' + r.id + '</td><td>' + esc(r.text) +
        (r.source ? '<div class="small muted">' + esc(r.source) + '</div>' : '') + '</td><td>' + esc(r.groupTitle) + '</td><td>' + r.phases.map(depChip).join(' ') +
        '</td><td class="small">' + r.acceptance.map(function (a) { return '<a href="#phase-' + a.phase + '" title="' + esc(a.result) + '">' + esc(a.ac) + '</a>'; }).join('، ') +
        '</td><td>' + pill(cls[r.state], r.label) + '</td></tr>';
    }).join('');
    h += '</tbody></table></div></div>';
    $('reqs').innerHTML = h;
  }

  function cmdRow(cmd, what) {
    return '<div class="cmd-row"><span>' + what + '</span>' + copyBtn(cmd, 'انسخ', { small: true, show: true, title: cmd }) + '</div>';
  }

  function renderGuide() {
    var live = S.mode === 'live';
    var h = '<ol class="steps">' +
      '<li><b>افتح اللوحة:</b> مع <code>npm run dashboard</code> تتحدّث الحالة تلقائيًا كل بضع ثوانٍ من Git مباشرة، بما في ذلك فروع المراحل وworktrees الجلسات غير المدمجة. ودون الخادم تعرض <code>dashboard/index.html</code> آخر لقطة ووقتها، وتحتاج <code>npm run plan:sync</code> ثم تحديث الصفحة.' +
      (live ? ' <span class="pill st-verified">أنت الآن على الوضع المباشر</span>' : ' <span class="pill st-waiting">أنت الآن على لقطة</span>') + '</li>' +
      '<li><b>ابدأ مرحلة:</b> افتح جلسة Claude Code جديدة في مجلد المشروع، واختر النموذج المقترح، والصق أمر المرحلة (أو برومبتها الكامل إن لم تُحمَّل المهارات). الجلسة تنشئ worktree وفرعًا خاصين بها، وتنفّذ نطاقها وحده، وتفحصه، وتسلّمه، وتتوقف.</li>' +
      '<li><b>المراحل المتوازية:</b> كل مرحلة متاحة في موجة واحدة لها جلستها المستقلة؛ ملكياتها لا تتقاطع.</li>' +
      '<li><b>بعد التسليم:</b> افتح جلسة في النسخة الرئيسية بلا worktree والصق أمر المنسّق. يكتشف الفروع والتقارير بنفسه، ويدمج بالترتيب في فرع تكامل، ويفحص «لا تغيير سقط» والبوابة، ثم يقدّم main ويفتح الموجة التالية.</li>' +
      '<li><b>لا تكتب</b> أسماء فروع ولا أوامر Git، ولا تنقل تقارير بيدك. ولا شيء يُدفع أو يُنشر دون طلبك.</li>' +
      '</ol>';
    h += '<div class="cmds">' + cmdRow(S.commands.dashboard, 'تشغيل اللوحة بتحديث تلقائي على http://127.0.0.1:4317') +
      cmdRow(S.commands.sync, 'لقطة حالة لهذه الصفحة دون خادم') + cmdRow(S.commands.check, 'فحص الخطة والوثائق والحالة') + '</div>';
    h += '<p class="small muted" style="margin-top:10px">الأزرار تنسخ النص فقط ولا تنفّذ شيئًا على جهازك. وإن منع المتصفح الحافظة يظهر النص محددًا في نافذة لتنسخه بـ⌘C. الحالات تُكتب في ملفات المراحل والموجات وحدها، ولا تُحفظ في المتصفح.</p>';
    $('guide-body').innerHTML = h;
  }

  function renderFoot() {
    var src = S.source;
    $('foot').innerHTML = '<span>المصدر: Git في <code>' + esc(src.root) + '</code></span><span>الخطة من ' + (src.planSource === 'main' ? 'main المثبّت' : 'الملفات مباشرة') + '</span>' +
      '<span>' + (S.mode === 'live' ? 'وضع مباشر' : 'لقطة') + ' · وُلّدت ' + esc(when(S.generatedAtMs)) + '</span><span>worktrees الجلسات: ' + src.worktrees.length + '</span><span class="num">key ' + esc(S.key) + '</span>';
  }

  function renderEmpty(msg) {
    copyMap.clear();
    $('now').innerHTML = '<div class="card empty"><h2>لا توجد حالة لعرضها بعد</h2><p>' + esc(msg || 'لم يُعثر على data/state.js.') + '</p>' +
      '<div class="cmds" style="max-width:640px;margin:12px auto 0">' + cmdRow('npm run dashboard', 'شغّل اللوحة بتحديث تلقائي، ثم افتح http://127.0.0.1:4317') + cmdRow('npm run plan:sync', 'أو ولّد لقطة ثم حدّث هذه الصفحة') + '</div></div>';
    ['graph', 'waves', 'reqs', 'guide-body', 'alerts'].forEach(function (id) { $(id).innerHTML = ''; });
    renderFresh();
  }

  function index() {
    byId = {};
    waveById = {};
    S.phases.forEach(function (p) { byId[p.id] = p; });
    S.waves.forEach(function (w) { waveById[w.id] = w; });
  }

  function render() {
    if (S.fatal) return renderEmpty('تعذّر اشتقاق الحالة: ' + S.fatal);
    copyMap.clear();
    index();
    renderFresh();
    renderAlerts();
    renderNow();
    renderToolbar();
    renderGraph();
    renderWaves();
    renderReqs();
    renderGuide();
    renderFoot();
    applyFilters();
  }

  // ---------- التصفية والروابط ----------
  function applyFilters() {
    var q = norm(ui.q.trim());
    var active = !!(q || ui.states.size || ui.wave);
    var shown = 0;
    var total = 0;
    var match = {};
    document.querySelectorAll('.phase').forEach(function (el) {
      total++;
      var ok = (!ui.states.size || ui.states.has(el.dataset.state)) && (!ui.wave || el.dataset.wave === ui.wave) && (!q || norm(el.dataset.text).indexOf(q) >= 0);
      el.classList.toggle('is-hidden', !ok);
      match[el.dataset.phase] = ok;
      if (ok) shown++;
    });
    document.querySelectorAll('.wave').forEach(function (card) {
      var any = !!card.querySelector('.phase:not(.is-hidden)');
      card.hidden = (!!ui.wave && card.dataset.wave !== ui.wave) || (!any && active);
    });
    var rshown = 0;
    document.querySelectorAll('tr[data-req]').forEach(function (tr) {
      var ok = !q || norm(tr.dataset.text).indexOf(q) >= 0;
      tr.hidden = !ok;
      if (ok) rshown++;
    });
    document.querySelectorAll('.g-node').forEach(function (n) { n.style.opacity = active && !match[n.dataset.node] ? '0.28' : ''; });
    document.querySelectorAll('[data-tile]').forEach(function (t) { t.setAttribute('aria-pressed', String(ui.states.has(t.dataset.tile))); });
    document.querySelectorAll('[data-fstate]').forEach(function (t) { t.setAttribute('aria-pressed', String(ui.states.has(t.dataset.fstate))); });
    $('filter-note').textContent = active ? 'يُعرض ' + shown + ' من ' + total + ' مراحل · ' + countReq(rshown) : '';
  }

  function flash(el) {
    el.classList.remove('is-flash');
    void el.offsetWidth;
    el.classList.add('is-flash');
  }

  function openPhase(id, scroll) {
    var p = byId[id];
    var el = $('phase-' + id);
    if (!p || !el) return;
    ui.open.add(id);
    el.classList.remove('is-hidden');
    var card = el.closest('.wave');
    if (card) card.hidden = false;
    var panel = $('panel-' + id);
    panel.innerHTML = phasePanel(p);
    panel.hidden = false;
    el.querySelector('[data-toggle]').setAttribute('aria-expanded', 'true');
    if (scroll) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      flash(el);
    }
  }

  function onHash() {
    if (!S || S.fatal) return;
    var h = decodeURIComponent(location.hash.slice(1));
    var m;
    if ((m = h.match(/^phase-(P\d+)$/))) openPhase(m[1], true);
    else if ((m = h.match(/^wave-(W\d+)$/)) && $('wave-' + m[1])) { $('wave-' + m[1]).hidden = false; $('wave-' + m[1]).scrollIntoView({ behavior: 'smooth', block: 'start' }); }
    else if ((m = h.match(/^req-(R\d+)$/)) && $('req-' + m[1])) { var tr = $('req-' + m[1]); tr.hidden = false; tr.scrollIntoView({ behavior: 'smooth', block: 'center' }); flash(tr); }
  }

  function toggleState(st) {
    if (ui.states.has(st)) ui.states.delete(st); else ui.states.add(st);
    applyFilters();
  }

  // ---------- النسخ ----------
  var dlg = $('dlg');
  function announce(msg) {
    var el = $('announce');
    el.textContent = '';
    setTimeout(function () { el.textContent = msg; }, 30);
  }
  function markCopied(btn) {
    if (!btn) return;
    if (!btn.dataset.html) btn.dataset.html = btn.innerHTML;
    btn.innerHTML = ICON.check + '<span class="btn__label">نُسخ</span>';
    btn.classList.add('is-copied');
    clearTimeout(btn._t);
    btn._t = setTimeout(function () { btn.innerHTML = btn.dataset.html; delete btn.dataset.html; btn.classList.remove('is-copied'); }, 1600);
  }
  function openDialog(title, text, note, warn) {
    $('dlg-title').textContent = title || 'النص';
    $('dlg-note').textContent = note || 'راجع النص ثم انسخه. لا ينفّذ هذا الزر شيئًا.';
    $('dlg-note').classList.toggle('is-warn', !!warn);
    var ta = $('dlg-text');
    ta.value = text;
    if (!dlg.open) dlg.showModal();
    ta.focus();
    ta.select();
    ta.scrollTop = 0;
  }
  function copyText(text, btn, title) {
    function finish(method) {
      document.documentElement.setAttribute('data-last-copy', method);
      document.documentElement.setAttribute('data-last-copy-length', String(text.length));
      if (method !== 'manual') {
        markCopied(btn);
        announce('نُسخ إلى الحافظة: ' + (text.length > 80 ? text.slice(0, 78) + '…' : text));
      } else {
        openDialog(title, text, 'تعذّر النسخ التلقائي لأن المتصفح منع الوصول إلى الحافظة. النص محدد أدناه: اضغط ⌘C (أو Ctrl+C) ثم أغلق.', true);
      }
    }
    function legacy() {
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.cssText = 'position:fixed;top:0;left:0;width:1px;height:1px;opacity:0;pointer-events:none';
      (dlg.open ? dlg : document.body).appendChild(ta);
      ta.select();
      var ok = false;
      try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
      ta.remove();
      finish(ok ? 'execCommand' : 'manual');
    }
    if (navigator.clipboard && navigator.clipboard.writeText && window.isSecureContext) {
      navigator.clipboard.writeText(text).then(function () { finish('clipboard'); }, legacy);
    } else {
      legacy();
    }
  }

  document.addEventListener('click', function (e) {
    var b = e.target.closest('[data-copy]');
    if (b) {
      e.preventDefault();
      if (b.disabled) return;
      var it = copyMap.get(b.dataset.copy);
      if (it) copyText(it.text, b, it.title);
      return;
    }
    var v = e.target.closest('[data-view]');
    if (v) {
      var iv = copyMap.get(v.dataset.view);
      if (iv) openDialog(iv.title, iv.text, '');
      return;
    }
    var t = e.target.closest('[data-toggle]');
    if (t) {
      var id = t.dataset.toggle;
      if (ui.open.has(id)) {
        ui.open.delete(id);
        $('panel-' + id).hidden = true;
        t.setAttribute('aria-expanded', 'false');
      } else {
        openPhase(id, false);
      }
      return;
    }
    var tile = e.target.closest('[data-tile]');
    if (tile) { toggleState(tile.dataset.tile); return; }
    var chip = e.target.closest('[data-fstate]');
    if (chip) { toggleState(chip.dataset.fstate); return; }
    if (e.target.closest('[data-close]')) dlg.close();
  });
  $('dlg-copy').addEventListener('click', function () { copyText($('dlg-text').value, $('dlg-copy'), $('dlg-title').textContent); });
  $('dlg-select').addEventListener('click', function () { var ta = $('dlg-text'); ta.focus(); ta.select(); });
  $('q').addEventListener('input', function (e) { ui.q = e.target.value; applyFilters(); });
  $('wave-filter').addEventListener('change', function (e) { ui.wave = e.target.value; applyFilters(); });
  $('reset-filters').addEventListener('click', function () { ui.q = ''; ui.states.clear(); ui.wave = ''; $('q').value = ''; $('wave-filter').value = ''; applyFilters(); });
  window.addEventListener('hashchange', onHash);

  // ---------- التحميل والتحديث ----------
  function load(cb) {
    var prev = window.TJ_STATE;
    window.TJ_STATE = undefined;
    var s = document.createElement('script');
    var done = false;
    function end(ok) {
      if (done) return;
      done = true;
      if (s.parentNode) s.parentNode.removeChild(s);
      var st = window.TJ_STATE;
      window.TJ_STATE = prev;
      cb(ok && st && st.schema === 1 ? st : null);
    }
    s.src = 'data/state.js?t=' + Date.now();
    s.onload = function () { end(true); };
    s.onerror = function () { end(false); };
    setTimeout(function () { end(false); }, 10000);
    document.head.appendChild(s);
  }
  function schedule() {
    clearTimeout(timer);
    timer = setTimeout(function () { if (!document.hidden) poll(); else schedule(); }, S && S.mode === 'live' ? POLL_LIVE : POLL_SNAPSHOT);
  }
  function poll(first) {
    if (polling) return;
    polling = true;
    load(function (st) {
      polling = false;
      if (!st) {
        failed = true;
        if (!S) renderEmpty(location.protocol === 'file:' ? 'لم تُولَّد لقطة بعد في dashboard/data/state.js.' : 'تعذّرت قراءة الحالة من الخادم.');
        else renderFresh();
        schedule();
        return;
      }
      failed = false;
      lastOk = Date.now();
      var changed = !S || st.key !== S.key || st.mode !== S.mode;
      S = st;
      if (changed) render(); else renderFresh();
      if (first) onHash();
      schedule();
    });
  }
  document.addEventListener('visibilitychange', function () { if (!document.hidden) poll(); });
  setInterval(function () { if (S) renderFresh(); }, 5000);
  poll(true);
})();
