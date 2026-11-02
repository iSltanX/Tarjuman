/* لوحة خطة ترجمان.
   مصدرها الوحيد data/state.js (window.TJ_STATE): يولّده tools/plan/plan.mjs من Git قراءةً فقط —
   مباشرة عند كل قراءة مع «npm run dashboard»، أو لقطةً بـ«npm run plan:sync». الصفحة لا تستنتج حالة بنفسها،
   ولا تخزّن شيئًا (لا localStorage)، ولا تنفّذ شيئًا: أزرار النسخ تضع النص في الحافظة فقط.
   العرض مختصر عمدًا: الخطوة التالية وأمرها أولًا، والموجة الحالية مفتوحة، وكل تفصيل آخر عند الطلب. */
(function () {
  'use strict';

  var POLL_LIVE = 5000;
  var POLL_SNAPSHOT = 20000;
  var STALE_MS = 20000;
  var TABS = ['plan', 'deps', 'reqs', 'guide'];
  var STATE_ORDER = ['available', 'in_progress', 'blocked', 'ready', 'integrating', 'verified', 'waiting'];
  var STATE_LABEL = {
    verified: 'مدمجة ومتحققة', integrating: 'قيد الدمج', ready: 'جاهزة للدمج', in_progress: 'جارية',
    blocked: 'متعطلة', available: 'متاحة للبدء', waiting: 'مخططة',
  };
  var STATE_MEANING = {
    waiting: 'لم يحن دورها: موجتها لم تُفتح أو اعتمادياتها لم تتحقق.',
    available: 'يمكن بدؤها الآن في جلسة جديدة.',
    in_progress: 'جلستها تعمل في فرعها وworktree خاص.',
    blocked: 'توقفت بسبب مكتوب وما يلزم لحله.',
    ready: 'سُلّمت بتقرير وأدلة. تسليم لا دمج.',
    integrating: 'دُمجت في فرع التكامل، وبوابة الموجة لم تكتمل.',
    verified: 'في main بعد نجاح بوابة موجتها. وحدها تُحسب منجزة.',
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
  var hueOf = {};
  var lastOk = 0;
  var failed = false;
  var polling = false;
  var timer = null;
  var copyMap = new Map();
  var ui = { tab: 'plan', open: new Set(), expanded: new Set(), autoWave: null, q: '', state: '', wave: '', rq: '' };

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
  function arCount(n, one, two, few, many) {
    if (n === 0) return 'لا ' + few;
    if (n === 1) return one;
    if (n === 2) return two;
    return n + ' ' + (n <= 10 ? few : many);
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
    var out = [];
    (base + href).split('/').forEach(function (p) { if (p === '..') out.pop(); else if (p && p !== '.') out.push(p); });
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
    var ITEM = /^\s*([-*]|\d+\.)\s+/;
    function flush() { if (para.length) { html += '<p>' + inline(para.join(' '), base) + '</p>'; para = []; } }
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
    var cls = 'btn' + (o.primary ? ' btn--primary' : '') + (o.small ? ' btn--sm' : '') + (o.big ? ' btn--big' : '');
    return '<button type="button" class="' + cls + '" data-copy="' + key + '" aria-label="' + esc(label + (o.show ? ': ' + text : '')) + '">' + ICON.copy +
      '<span class="btn__label">' + esc(label) + '</span>' + (o.show ? '<bdi class="btn__cmd">' + esc(text) + '</bdi>' : '') + '</button>';
  }
  function viewBtn(text, title) {
    return '<button type="button" class="btn btn--sm btn--ghost" data-view="' + reg(text, title) + '">عرض البرومبت</button>';
  }

  // ---------- الأجزاء المشتركة ----------
  function freshHtml() {
    if (!S) return '<span class="fresh is-stale"><span class="fresh__dot" aria-hidden="true"></span>لا حالة بعد</span>';
    if (S.mode === 'live') {
      var stale = failed || Date.now() - lastOk > STALE_MS;
      return '<span class="fresh' + (stale ? ' is-stale' : '') + '" title="الحالة تُشتق من Git عند كل قراءة"><span class="fresh__dot" aria-hidden="true"></span>' +
        (stale ? 'انقطعت القراءة · المعروض من ' + esc(clock(S.generatedAtMs)) : 'مباشر · ' + esc(clock(lastOk))) + '</span>';
    }
    return '<span class="fresh is-snapshot" title="لقطة مولّدة. للتحديث التلقائي شغّل npm run dashboard"><span class="fresh__dot" aria-hidden="true"></span>لقطة · ' + esc(when(S.generatedAtMs)) + '</span>';
  }
  function renderFresh() { $('fresh-slot').innerHTML = freshHtml(); }

  function renderAlerts() {
    var errs = S.problems.filter(function (p) { return p.level === 'error'; });
    var warns = S.problems.filter(function (p) { return p.level !== 'error'; });
    var item = function (p) { return '<li>' + esc(p.text) + (p.where ? ' <span class="muted small">[' + esc(p.where) + ']</span>' : '') + '</li>'; };
    var h = '';
    if (errs.length) h += '<div class="alert alert--error" role="alert"><strong>أخطاء في الخطة أو الحالة (' + errs.length + ')</strong><ul>' + errs.map(item).join('') + '</ul></div>';
    if (warns.length) h += '<div class="alert"><details><summary><strong>تنبيهات (' + warns.length + ')</strong></summary><ul>' + warns.map(item).join('') + '</ul></details></div>';
    $('alerts').innerHTML = h;
  }

  // ---------- تبويب الخطة ----------
  function renderHero() {
    var n = S.next || { tone: 'waiting', title: '', hint: '', actions: [] };
    var acts = n.actions || [];
    var h = '<section class="hero st-' + esc(n.tone) + '" aria-labelledby="hero-title">';
    h += '<div class="hero__eyebrow">الخطوة التالية</div>';
    h += '<h2 class="hero__title" id="hero-title">' + inline(n.title || n.text) + '</h2>';
    if (n.hint) h += '<p class="hero__hint">' + inline(n.hint) + '</p>';
    if (acts.length === 1) {
      var a = acts[0];
      h += '<div class="hero__actions">' + copyBtn(a.command, 'انسخ الأمر', { primary: true, big: true, show: true, title: a.label }) +
        '<span class="hero__model">النموذج المقترح: <b>' + esc(a.model) + '</b></span>' +
        (n.ref ? '<a class="btn btn--ghost" href="#phase-' + esc(n.ref) + '">اقرأ تقرير ' + esc(n.ref) + '</a>' : '') + '</div>';
    } else if (acts.length > 1) {
      h += '<ul class="hero__list">' + acts.map(function (x) {
        var p = byId[x.id];
        return '<li class="' + (p ? 'hue-' + hueOf[p.wave] : '') + '"><span class="hero__item"><span class="pid">' + esc(x.id) + '</span> ' + esc(x.title || '') + '</span>' +
          (p && p.state !== 'available' ? pill(p.state, p.label) : '') + '<span class="hero__model">' + esc(x.model) + '</span>' +
          copyBtn(x.command, 'انسخ الأمر', { primary: x.primary, show: true, title: x.label }) + '</li>';
      }).join('') + '</ul>';
    }
    var cur = S.current;
    if (cur) {
      h += '<div class="hero__where hue-' + hueOf[cur.wave] + '"><span class="wdot" aria-hidden="true"></span>الموجة الحالية: <b>' + esc(cur.wave) + ' — ' + esc(cur.title) + '</b>' + pill(WAVE_CLASS[cur.state], cur.label) + '</div>';
    }
    h += '</section>';
    $('hero').innerHTML = h;
  }

  function renderProgress() {
    var c = S.counts;
    var parts = ['<span><b>' + c.verified + '</b> من ' + S.total + (S.total > 10 ? ' مرحلة' : ' مراحل') + ' مدمجة ومتحققة</span>'];
    if (c.ready) parts.push('<span><b>' + c.ready + '</b> جاهزة للدمج</span>');
    if (c.integrating) parts.push('<span><b>' + c.integrating + '</b> قيد الدمج</span>');
    if (c.in_progress) parts.push('<span><b>' + c.in_progress + '</b> جارية</span>');
    if (c.blocked) parts.push('<span class="is-bad"><b>' + c.blocked + '</b> متعطلة</span>');
    if (!c.ready && !c.integrating && !c.in_progress && !c.blocked) parts.push('<span class="muted">لا شيء جارٍ أو متعطل الآن</span>');
    var h = '<div class="progress">' + parts.join('') + '</div>';
    S.gates.forEach(function (g) {
      if (g.state === 'awaiting' || g.state === 'closed') {
        h += '<div class="gate-note">' + pill(g.state, 'البوابة ' + g.id + ': ' + g.label) + '<span>' + esc(g.state === 'awaiting' ? g.otherwise : '«' + (g.decision ? g.decision.text : '') + '»') + '</span></div>';
      }
    });
    $('progress').innerHTML = h;
  }

  function renderFilterControls() {
    $('state-filter').innerHTML = '<option value="">كل الحالات</option>' + STATE_ORDER.map(function (st) {
      return '<option value="' + st + '"' + (ui.state === st ? ' selected' : '') + '>' + STATE_LABEL[st] + ' (' + (S.counts[st] || 0) + ')</option>';
    }).join('');
    $('wave-filter').innerHTML = '<option value="">كل الموجات</option>' + S.waves.map(function (w) {
      return '<option value="' + w.id + '"' + (ui.wave === w.id ? ' selected' : '') + '>' + w.id + ' — ' + esc(w.title) + '</option>';
    }).join('');
    $('q').value = ui.q;
  }

  function searchText(p) {
    return [p.id, p.title, p.wave, p.waveTitle, p.label, p.model, p.sections.goal, p.requirements.join(' '), p.owns.join(' '),
      p.acceptance.map(function (a) { return a.id + ' ' + a.text; }).join(' ')].join(' ');
  }

  function phaseCard(p) {
    var open = ui.open.has(p.id);
    var h = '<article class="phase" id="phase-' + p.id + '" data-phase="' + p.id + '" data-state="' + p.state + '" data-wave="' + p.wave + '" data-text="' + esc(searchText(p)) + '">';
    h += '<div class="phase__row"><span class="pid">' + p.id + '</span><span class="phase__title">' + esc(p.title) + '</span>' + pill(p.state, p.label) +
      '<span class="phase__model" title="النموذج المقترح">' + esc(p.model) + '</span><span class="phase__acts">';
    // في البطاقة المختصرة يظهر الأمر لما يُبدأ أو يُستأنف فقط؛ المسلّمة تُستأنف لإصلاح محدد من «التفاصيل».
    if (p.commandEnabled && p.state !== 'ready') h += copyBtn(p.command, 'انسخ الأمر', { primary: p.state === 'available', small: true, show: true, title: 'أمر ' + p.id });
    h += '<button type="button" class="btn btn--sm btn--ghost" data-toggle="' + p.id + '" aria-expanded="' + open + '" aria-controls="panel-' + p.id + '">التفاصيل ' + ICON.chev + '</button>';
    h += '</span></div>';
    if (p.state === 'blocked' && p.blocker) h += '<div class="phase__note is-bad">' + esc(p.blocker) + '</div>';
    else if (p.state === 'in_progress' && p.resume) h += '<div class="phase__note">' + inline(p.resume) + '</div>';
    h += '<div class="panel" id="panel-' + p.id + '"' + (open ? '' : ' hidden') + '>' + (open ? phasePanel(p) : '') + '</div>';
    return h + '</article>';
  }

  function kv(rows) {
    return '<dl class="kv">' + rows.filter(function (r) { return r && r[1]; }).map(function (r) { return '<dt>' + esc(r[0]) + '</dt><dd>' + r[1] + '</dd>'; }).join('') + '</dl>';
  }
  function depChip(d) {
    var p = byId[d];
    if (!p) return '<span class="chip">' + esc(d) + '</span>';
    return '<a class="chip st-' + p.state + '" href="#phase-' + d + '" title="' + esc(p.title + ': ' + p.label) + '"><span class="pill__dot" aria-hidden="true"></span>' + esc(d) + '</a>';
  }

  function phasePanel(p) {
    var base = p.doc.replace(/[^/]+$/, '');
    var s = p.sections;
    var bar = '<div class="panel__bar">' + (p.commandEnabled ? copyBtn(p.command, 'انسخ الأمر', { show: true, title: 'أمر ' + p.id }) : '') +
      copyBtn(p.prompt, 'انسخ البرومبت الكامل', { title: 'البرومبت الكامل — ' + p.id }) + viewBtn(p.prompt, 'البرومبت الكامل — ' + p.id) +
      '<a class="btn btn--sm btn--ghost" href="' + esc(resolveLink(p.doc, '').href) + '">ملف المرحلة</a>' +
      (!p.commandEnabled && p.whyNot ? '<span class="small muted">' + esc(p.whyNot) + '</span>' : '') + '</div>';

    var acc = '<div class="tbl-wrap"><table><thead><tr><th>المعيار</th><th>النص</th><th>المتطلبات</th><th>التحقق</th><th>النتيجة</th></tr></thead><tbody>' +
      p.acceptance.map(function (a) {
        var ev = (a.evidence || []).map(function (e) { return '<a href="' + esc(resolveLink(e, '').href) + '">' + esc(e) + '</a>'; }).join('، ');
        return '<tr><td class="mono">' + esc(a.id) + '</td><td>' + esc(a.text) + '</td><td>' + a.req.map(function (r) { return '<a href="#req-' + r + '">' + r + '</a>'; }).join(' · ') +
          '</td><td>' + esc(a.verify) + '</td><td>' + pill(a.result, a.resultLabel) + (ev ? '<div class="small">' + ev + '</div>' : '') + (a.note ? '<div class="small muted">' + esc(a.note) + '</div>' : '') + '</td></tr>';
      }).join('') + '</tbody></table></div>';

    var left = '<div>';
    left += '<div class="box"><h4>الهدف</h4>' + md(s.goal, base) + '</div>';
    left += '<div class="box"><h4>معايير القبول</h4>' + acc + '</div>';
    left += '<div class="box"><details><summary>النطاق</summary><h5>داخل النطاق</h5>' + md(s.scopeIn, base) + '<h5>خارج النطاق</h5>' + md(s.scopeOut, base) + '</details></div>';
    left += '<div class="box"><details><summary>المهام</summary>' + md(s.tasks, base) + '</details></div>';
    left += '<div class="box"><details><summary>المخاطر</summary>' + md(s.risks, base) + '</details></div>';
    left += '<div class="box"><details' + (p.reportWritten ? ' open' : '') + '><summary>تقرير التسليم</summary>' + (p.reportWritten ? md(s.report, base) : '<p class="muted">لم يُكتب بعد. يظهر هنا من فرع المرحلة بمجرد كتابته، قبل الدمج.</p>') + '</details></div>';
    left += '<div class="box"><details><summary>سجل التنفيذ</summary>' + md(s.log, base) + '</details></div>';
    left += '</div>';

    var right = '<div>';
    right += '<div class="box"><h4>الحالة الآن</h4>' + kv([
      ['الحالة', pill(p.state, p.label)],
      ['المصدر', esc(p.sourceLabel)],
      ['نقطة الاستئناف', inline(p.resume)],
      ['سبب التعطل', p.blocker ? esc(p.blocker) : ''],
      ['النتيجة', p.isGate ? (p.outcomeLabel ? pill(p.outcome === 'success' ? 'pass' : p.outcome === 'fail' ? 'fail' : 'partial', p.outcomeLabel) : '<span class="muted">لم تُسجّل</span>') : ''],
      ['آخر تحديث', esc(p.updated || '')],
    ]) + '</div>';
    if (p.waitingReasons.length) right += '<div class="box"><h4>لماذا ليست متاحة</h4><ul class="reasons">' + p.waitingReasons.map(function (r) { return '<li>' + esc(r) + '</li>'; }).join('') + '</ul></div>';
    right += '<div class="box"><h4>الاعتماديات والتوازي</h4>' + kv([
      ['تعتمد على', p.dependsOn.length ? p.dependsOn.map(depChip).join(' ') : '—'],
      ['بالتوازي مع', esc(p.parallelWith.join('، ') || '—')],
      ['البوابات', esc(p.requiresGates.join('، ') || '—')],
      ['الحجم', esc(p.size)],
      ['النموذج', esc(p.model + ' · الجهد ' + p.effort + ' — ' + p.whyModel)],
      ['اختبار حي', p.live ? 'نعم' : 'لا'],
    ]) + '</div>';
    if (p.needsUser.length) right += '<div class="box"><h4>يحتاج منك</h4><ul>' + p.needsUser.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul></div>';
    right += '<div class="box"><h4>الفرع والأساس</h4>' + kv([
      ['الفرع', p.branch ? '<code>' + esc(p.branch) + '</code>' : '<span class="muted">لم يُنشأ — المتوقع <code>' + esc(p.expectedBranch) + '</code></span>'],
      ['مجلد العمل', p.worktree ? '<code>' + esc(p.worktree) + '</code>' + (p.dirty ? ' ' + pill('integrating', 'تغييرات غير ملتزمة') : '') : '<span class="muted">لم يُنشأ — المتوقع <code>' + esc(p.expectedWorktree) + '</code></span>'],
      ['وسم الأساس', '<code>' + esc(waveById[p.wave].baseTag.name) + '</code>'],
      ['آخر التزام', p.last ? '<code>' + esc(p.last.hash) + '</code> ' + esc(p.last.subject) : ''],
      ['متقدم على main', p.ahead != null && p.branch ? '<span class="num">' + p.ahead + '</span>' : ''],
      ['التزام العمل', p.commit ? '<code>' + esc(p.commit) + '</code>' : ''],
      ['التزام الدمج', p.mergeCommit ? '<code>' + esc(p.mergeCommit) + '</code>' : ''],
    ]) + '</div>';
    right += '<div class="box"><h4>الفحوص والأدلة</h4><p class="small">عند التسليم: ' + (p.checksPlanned || []).map(function (c) { return '<code>' + esc(c) + '</code>'; }).join(' ثم ') + '</p>' +
      (p.checks.length ? '<ul class="plain">' + p.checks.map(function (c) { return '<li>' + pill(c.result, c.result === 'pass' ? 'ناجح' : c.result === 'fail' ? 'فاشل' : c.result) + ' <code>' + esc(c.cmd) + '</code>' + (c.note ? ' <span class="muted small">' + esc(c.note) + '</span>' : '') + '</li>'; }).join('') + '</ul>' : '<p class="muted small">لا فحوص مسجلة بعد.</p>') +
      (p.evidence.length ? '<ul class="plain">' + p.evidence.map(function (e) { return '<li><a href="' + esc(resolveLink(e.path, '').href) + '">' + esc(e.label) + '</a></li>'; }).join('') + '</ul>' : '') +
      '<a class="small" href="' + esc(resolveLink(p.evidenceDir + '/', '').href) + '">مجلد الأدلة</a></div>';
    right += '<div class="box"><details><summary>الملفات التي تملكها</summary><ul class="files">' + p.owns.map(function (f) { return '<li><code>' + esc(f) + '</code></li>'; }).join('') + '</ul>' +
      (p.fixScope.length ? '<p class="small">إصلاحات تكامل موثّقة فقط في: ' + p.fixScope.map(function (f) { return '<code>' + esc(f) + '</code>'; }).join('، ') + '</p>' : '') + '</details></div>';
    if (p.outOfScope.length || p.sharedRequests.length) {
      right += '<div class="box"><h4>ملفات مشتركة وخارج الملكية</h4>' +
        (p.outOfScope.length ? '<p class="small" style="color:var(--warn)">يمسّ الفرع: ' + p.outOfScope.map(function (f) { return '<code>' + esc(f) + '</code>'; }).join('، ') + '</p>' : '') +
        (p.sharedRequests.length ? '<ul>' + p.sharedRequests.map(function (r) { return '<li><code>' + esc(r.file) + '</code>: ' + esc(r.change) + (r.applied ? ' (مطبّق في الفرع)' : '') + '</li>'; }).join('') + '</ul>' : '') + '</div>';
    }
    right += '<div class="box"><h4>المتطلبات</h4><div class="actions">' + p.requirements.map(function (r) { return '<a class="chip" href="#req-' + r + '">' + r + '</a>'; }).join('') + '</div></div>';
    right += '</div>';
    return bar + '<div class="panel__grid">' + left + right + '</div>';
  }

  function waveSection(w) {
    var isCur = S.current && S.current.wave === w.id;
    var open = ui.expanded.has(w.id);
    var h = '<section class="wave hue-' + hueOf[w.id] + (isCur ? ' is-current' : '') + '" id="wave-' + w.id + '" data-wave="' + w.id + '">';
    h += '<div class="wave__head"><button type="button" class="wave__toggle" data-wtoggle="' + w.id + '" aria-expanded="' + open + '" aria-controls="wbody-' + w.id + '">' +
      '<span class="wbadge">' + w.id + '</span><span class="wave__title">' + esc(w.title) + '</span>' + pill(WAVE_CLASS[w.state], w.label) +
      '<span class="wave__count">' + arCount(w.phases.length, 'مرحلة واحدة', 'مرحلتان', 'مراحل', 'مرحلة') + '</span>' + (isCur ? '<span class="wave__now">الحالية</span>' : '') + ICON.chev + '</button>';
    if (w.commandEnabled) h += copyBtn(w.command, w.commandLabel, { primary: true, small: true, show: true, title: 'أمر منسّق ' + w.id });
    h += '</div>';
    h += '<div class="wave__body" id="wbody-' + w.id + '"' + (open ? '' : ' hidden') + '>';
    h += w.phases.map(function (id) { return phaseCard(byId[id]); }).join('');
    h += '<details class="wave__more"><summary>تفاصيل الموجة: لماذا معًا، وترتيب الدمج، والبوابة، والمنسّق</summary>' + kv([
      ['لماذا معًا', esc(w.why)],
      ['ترتيب الدمج', w.phases.map(depChip).join(' ← ')],
      ['التوازي', w.parallel ? arCount(w.phases.length, 'مرحلة', 'مرحلتان', 'مراحل', 'مرحلة') + ' معًا، كلٌّ في worktree وفرع مستقلين' : 'منفردة'],
      ['أوامر البوابة', w.gate.commands.map(function (c) { return '<code>' + esc(c) + '</code>'; }).join(' ثم ')],
      ['الدخان الحي', esc(w.gate.live || '—')],
      ['وسم الأساس', '<code>' + esc(w.baseTag.name) + '</code> ' + (w.baseTag.exists ? '<span class="muted num">(' + esc(w.baseTag.commit) + ')</span>' : '<span class="muted">لم يوضع بعد</span>')],
      ['فرع التكامل', w.integration ? '<code>' + esc(w.integration.branch) + '</code>' : ''],
      ['تحسم البوابة', w.decidesGate ? esc(w.decidesGate) : ''],
      ['لماذا تنتظر', w.reasons.length ? esc(w.reasons.join(' ')) : ''],
      ['المنسّق', '<div class="actions">' + (w.commandEnabled ? '' : '<span class="small muted">' + esc(w.whyNot) + '</span>') +
        copyBtn(w.prompt, 'انسخ برومبت المنسّق', { small: true, title: 'برومبت منسّق ' + w.id }) + viewBtn(w.prompt, 'برومبت منسّق ' + w.id) + '</div>' +
        '<span class="small muted">الأمر <code>' + esc(w.command) + '</code> في جلسة بالنسخة الرئيسية بلا worktree · النموذج المقترح ' + esc(w.coordinatorModel) + '</span>'],
    ]) + '</details>';
    h += '</div></section>';
    return h;
  }

  function renderWaves() { $('waves').innerHTML = S.waves.map(waveSection).join(''); }

  // ---------- تبويب الاعتماديات ----------
  function renderGraph() {
    var colW = 180, nodeW = 156, nodeH = 54, gapY = 14, top = 60, pad = 12;
    var W = S.waves.length * colW + pad * 2;
    var maxN = Math.max.apply(null, S.waves.map(function (w) { return w.phases.length; }));
    var inner = maxN * nodeH + (maxN - 1) * gapY;
    var H = top + inner + 22;
    var pos = {};
    var s = '<svg viewBox="0 0 ' + W + ' ' + H + '" style="direction:rtl;max-width:' + W + 'px" role="img" aria-label="مخطط اعتماديات المراحل في الموجات، من اليمين إلى اليسار">';
    s += '<defs><marker id="arr-met" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" style="fill:var(--verified)"/></marker>' +
      '<marker id="arr-pending" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" style="fill:var(--border-strong)"/></marker></defs>';
    S.waves.forEach(function (w, i) {
      var right = W - pad - i * colW;
      var cx = right - colW / 2;
      var n = w.phases.length;
      var hh = n * nodeH + (n - 1) * gapY;
      var y0 = top + (inner - hh) / 2;
      w.phases.forEach(function (id, j) { pos[id] = { x: cx - nodeW / 2, y: y0 + j * (nodeH + gapY), cx: cx }; });
      s += '<g class="hue-' + hueOf[w.id] + '"><rect class="g-colbg" x="' + (right - colW + 4) + '" y="4" width="' + (colW - 8) + '" height="' + (H - 8) + '" rx="12"/>' +
        '<text class="g-col" x="' + cx + '" y="26" text-anchor="middle">' + esc(w.id) + ' — ' + esc(trunc(w.title, 17)) + '</text>' +
        '<text class="g-col g-col-state" x="' + cx + '" y="44" text-anchor="middle">' + esc(w.label) + ' · ' + (w.parallel ? w.phases.length + ' بالتوازي' : 'منفردة') + '</text></g>';
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
      s += '<a class="g-node st-' + p.state + '" href="#phase-' + p.id + '" aria-label="' + esc(p.id + ' — ' + p.title + ': ' + p.label) + '">' +
        '<rect x="' + q.x + '" y="' + q.y + '" width="' + nodeW + '" height="' + nodeH + '" rx="11"/>' +
        '<text x="' + q.cx + '" y="' + (q.y + 22) + '" text-anchor="middle"><tspan class="g-id">' + esc(p.id) + '</tspan><tspan class="g-title"> · ' + esc(p.label) + '</tspan></text>' +
        '<text class="g-title" x="' + q.cx + '" y="' + (q.y + 41) + '" text-anchor="middle">' + esc(trunc(p.title, 21)) + '</text>' +
        '<title>' + esc(p.id + ' — ' + p.title + ' (' + p.label + ')') + '</title></a>';
    });
    s += '</svg>';
    var legend = '<div class="legend">' + ['available', 'in_progress', 'blocked', 'ready', 'integrating', 'verified', 'waiting'].map(function (st) { return pill(st, STATE_LABEL[st]); }).join('') + '<span>◆ بوابة قرار</span></div>';
    $('graph-box').innerHTML = s + legend;
  }

  // ---------- تبويب المتطلبات ----------
  function renderReqs() {
    var cls = { verified: 'verified', partial: 'partial', delivered: 'delivered', planned: 'planned' };
    var h = '<div class="card reqs"><div class="tbl-wrap" style="border:0"><table><thead><tr><th>المعرّف</th><th>المتطلب</th><th>المراحل</th><th>معايير القبول</th><th>الحالة</th></tr></thead><tbody>';
    h += S.requirements.map(function (r) {
      var text = [r.id, r.text, r.groupTitle, r.phases.join(' '), r.acceptance.map(function (a) { return a.ac; }).join(' ')].join(' ');
      return '<tr id="req-' + r.id + '" data-req="' + r.id + '" data-text="' + esc(text) + '"><td class="mono">' + r.id + '</td><td>' + esc(r.text) +
        '<div class="small muted">' + esc(r.groupTitle) + (r.source ? ' · ' + esc(r.source) : '') + '</div></td><td>' + r.phases.map(depChip).join(' ') +
        '</td><td class="small">' + r.acceptance.map(function (a) { return '<a href="#phase-' + a.phase + '">' + esc(a.ac) + '</a>'; }).join('، ') +
        '</td><td>' + pill(cls[r.state], r.label) + '</td></tr>';
    }).join('');
    h += '</tbody></table></div></div>';
    $('reqs-box').innerHTML = h;
    $('rq').value = ui.rq;
  }

  // ---------- تبويب طريقة العمل ----------
  function cmdRow(cmd, what) {
    return '<div class="cmd-row"><span>' + what + '</span>' + copyBtn(cmd, 'انسخ', { small: true, show: true, title: cmd }) + '</div>';
  }
  function renderGuide() {
    var live = S.mode === 'live';
    var h = '<div class="card guide"><h3>الدورة</h3><ol class="steps">' +
      '<li><b>ابدأ مرحلة:</b> افتح جلسة Claude Code جديدة في مجلد المشروع، واختر النموذج المقترح، والصق أمر المرحلة (أو برومبتها الكامل من «التفاصيل» إن لم تُحمَّل المهارات). الجلسة تنشئ worktree وفرعًا خاصين، وتنفّذ نطاقها وحده، وتفحصه، وتسلّمه، وتتوقف.</li>' +
      '<li><b>المراحل المتوازية:</b> لكل مرحلة متاحة في الموجة نفسها جلستها المستقلة؛ ملفاتها لا تتقاطع.</li>' +
      '<li><b>بعد التسليم:</b> افتح جلسة في النسخة الرئيسية بلا worktree والصق أمر المنسّق. يكتشف الفروع والتقارير بنفسه، ويدمج بالترتيب في فرع تكامل، ويفحص «لا تغيير سقط» والبوابة، ثم يقدّم main ويفتح الموجة التالية.</li>' +
      '<li><b>لا تكتب</b> أسماء فروع ولا أوامر Git، ولا تنقل تقارير بيدك. والعمل المكتمل يُدفع تلقائيًا إلى مستودعك الخاص على GitHub (فرع المرحلة بعد كل مهمة، و<code>main</code> بعد بوابة الموجة)، ولا يُنشر شيء نشرًا عامًا دون طلبك.</li></ol></div>';
    h += '<div class="card guide"><h3>التحديث</h3><p>' + (live ? pill('verified', 'أنت على الوضع المباشر') : pill('waiting', 'أنت على لقطة')) + '</p>' +
      '<p>مع <code>npm run dashboard</code> تتحدّث الحالة تلقائيًا كل بضع ثوانٍ من Git مباشرة، بما في ذلك فروع المراحل وworktrees الجلسات غير المدمجة. ودون الخادم يعرض <code>dashboard/index.html</code> آخر لقطة ووقتها، وتحتاج <code>npm run plan:sync</code> ثم تحديث الصفحة.</p>' +
      '<div class="cmds">' + cmdRow(S.commands.dashboard, 'تشغيل اللوحة بتحديث تلقائي على http://127.0.0.1:4317') + cmdRow(S.commands.sync, 'لقطة حالة دون خادم') + cmdRow(S.commands.check, 'فحص الخطة والوثائق والحالة') + '</div>' +
      '<p class="small muted" style="margin-top:10px">الأزرار تنسخ النص فقط ولا تنفّذ شيئًا على جهازك. وإن منع المتصفح الحافظة يظهر النص محددًا لتنسخه بـ⌘C. الحالات تُكتب في ملفات المراحل والموجات وحدها، ولا تُحفظ في المتصفح.</p></div>';
    h += '<div class="card guide"><h3>معنى الحالات</h3><div class="states">' + ['waiting', 'available', 'in_progress', 'blocked', 'ready', 'integrating', 'verified'].map(function (st) {
      return pill(st, STATE_LABEL[st]) + '<span>' + esc(STATE_MEANING[st]) + '</span>';
    }).join('') + '</div></div>';
    if (S.gates.length) {
      h += '<div class="card guide"><h3>البوابات</h3>' + S.gates.map(function (g) {
        return '<p>' + pill(g.state, g.id + ': ' + g.label) + ' <b>' + esc(g.title) + '</b></p><p class="small">تُفتح عندما: ' + esc(g.opensWhen) + '</p><p class="small">وإلا: ' + esc(g.otherwise) + '</p>' +
          '<ul class="small">' + g.options.map(function (o) { return '<li>' + esc(o) + '</li>'; }).join('') + '</ul>' + (g.decision ? '<p class="small">قرارك: «' + esc(g.decision.text) + '»</p>' : '');
      }).join('') + '</div>';
    }
    var src = S.source;
    h += '<div class="card guide"><h3>المصدر</h3>' + kv([
      ['المستودع', '<code>' + esc(src.root) + '</code>'],
      ['الخطة', src.planSource === 'main' ? 'من main المثبّت' : 'من الملفات مباشرة'],
      ['آخر التزام في main', src.main ? '<code>' + esc(src.main.hash) + '</code> ' + esc(src.main.subject) : '—'],
      ['worktrees الجلسات', String(src.worktrees.length)],
      ['وقت التوليد', esc(when(S.generatedAtMs)) + (S.mode === 'live' ? ' (مباشر)' : ' (لقطة)')],
    ]) + '</div>';
    $('guide-box').innerHTML = h;
  }

  function renderFoot() {
    $('foot').innerHTML = '<span>ترجمان · خط الأساس ' + esc(S.project.baseline) + '</span><span>' + (S.mode === 'live' ? 'مباشر من Git' : 'لقطة') + ' · ' + esc(when(S.generatedAtMs)) + '</span>' +
      (S.source.main ? '<span>main عند <code>' + esc(S.source.main.hash) + '</code></span>' : '');
  }

  function renderEmpty(msg) {
    copyMap.clear();
    $('hero').innerHTML = '<div class="card empty"><h2>لا توجد حالة لعرضها بعد</h2><p>' + esc(msg || 'لم يُعثر على data/state.js.') + '</p>' +
      '<div class="cmds" style="max-width:640px;margin:12px auto 0">' + cmdRow('npm run dashboard', 'شغّل اللوحة بتحديث تلقائي، ثم افتح http://127.0.0.1:4317') + cmdRow('npm run plan:sync', 'أو ولّد لقطة ثم حدّث هذه الصفحة') + '</div></div>';
    ['progress', 'waves', 'graph-box', 'reqs-box', 'guide-box', 'alerts'].forEach(function (id) { $(id).innerHTML = ''; });
    renderFresh();
  }

  function index() {
    byId = {};
    waveById = {};
    hueOf = {};
    S.waves.forEach(function (w, i) { waveById[w.id] = w; hueOf[w.id] = (i % 5) + 1; });
    S.phases.forEach(function (p) { byId[p.id] = p; });
    var cur = S.current && S.current.wave;
    if (cur && ui.autoWave !== cur) { ui.expanded.add(cur); ui.autoWave = cur; }
  }

  function render() {
    if (S.fatal) return renderEmpty('تعذّر اشتقاق الحالة: ' + S.fatal);
    copyMap.clear();
    index();
    renderFresh();
    renderAlerts();
    renderHero();
    renderProgress();
    renderFilterControls();
    renderWaves();
    renderGraph();
    renderReqs();
    renderGuide();
    renderFoot();
    applyFilters();
    applyReqFilter();
  }

  // ---------- التصفية ----------
  function applyFilters() {
    var q = norm(ui.q.trim());
    var active = !!(q || ui.state || ui.wave);
    var shown = 0;
    document.querySelectorAll('.phase').forEach(function (el) {
      var ok = (!ui.state || el.dataset.state === ui.state) && (!ui.wave || el.dataset.wave === ui.wave) && (!q || norm(el.dataset.text).indexOf(q) >= 0);
      el.classList.toggle('is-hidden', !ok);
      if (ok) shown++;
    });
    document.querySelectorAll('.wave').forEach(function (sec) {
      var id = sec.dataset.wave;
      var any = !!sec.querySelector('.phase:not(.is-hidden)');
      sec.hidden = active && !any;
      var open = active ? any : ui.expanded.has(id);
      sec.querySelector('.wave__body').hidden = !open;
      sec.querySelector('[data-wtoggle]').setAttribute('aria-expanded', String(open));
    });
    $('reset-filters').hidden = !active;
    $('filter-note').textContent = active ? 'يُعرض ' + arCount(shown, 'مرحلة واحدة', 'مرحلتان', 'مراحل', 'مرحلة') + ' من ' + S.total : '';
  }
  function applyReqFilter() {
    var q = norm(ui.rq.trim());
    document.querySelectorAll('tr[data-req]').forEach(function (tr) { tr.hidden = !!q && norm(tr.dataset.text).indexOf(q) < 0; });
  }

  // ---------- التبويبات والروابط ----------
  function showTab(name) {
    if (TABS.indexOf(name) < 0) name = 'plan';
    ui.tab = name;
    TABS.forEach(function (t) {
      $('view-' + t).hidden = t !== name;
      $('tab-' + t).setAttribute('aria-selected', String(t === name));
    });
  }
  function flash(el) { el.classList.remove('is-flash'); void el.offsetWidth; el.classList.add('is-flash'); }
  function openWave(id) {
    ui.expanded.add(id);
    var sec = $('wave-' + id);
    if (!sec) return;
    sec.hidden = false;
    sec.querySelector('.wave__body').hidden = false;
    sec.querySelector('[data-wtoggle]').setAttribute('aria-expanded', 'true');
  }
  function openPhase(id, scroll) {
    var p = byId[id];
    var el = $('phase-' + id);
    if (!p || !el) return;
    showTab('plan');
    openWave(p.wave);
    ui.open.add(id);
    el.classList.remove('is-hidden');
    var panel = $('panel-' + id);
    panel.innerHTML = phasePanel(p);
    panel.hidden = false;
    el.querySelector('[data-toggle]').setAttribute('aria-expanded', 'true');
    if (scroll) { el.scrollIntoView({ behavior: 'smooth', block: 'start' }); flash(el); }
  }
  function onHash() {
    if (!S || S.fatal) return;
    var h = decodeURIComponent(location.hash.slice(1)) || 'plan';
    var m;
    if ((m = h.match(/^phase-(P\d+)$/))) openPhase(m[1], true);
    else if ((m = h.match(/^wave-(W\d+)$/))) { showTab('plan'); openWave(m[1]); if ($('wave-' + m[1])) $('wave-' + m[1]).scrollIntoView({ behavior: 'smooth', block: 'start' }); }
    else if ((m = h.match(/^req-(R\d+)$/))) {
      showTab('reqs');
      ui.rq = '';
      $('rq').value = '';
      applyReqFilter();
      var tr = $('req-' + m[1]);
      if (tr) { tr.scrollIntoView({ behavior: 'smooth', block: 'center' }); flash(tr); }
    } else { showTab(h); window.scrollTo(0, 0); }
  }

  // ---------- النسخ ----------
  var dlg = $('dlg');
  function announce(msg) { var el = $('announce'); el.textContent = ''; setTimeout(function () { el.textContent = msg; }, 30); }
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
      if (method !== 'manual') { markCopied(btn); announce('نُسخ إلى الحافظة: ' + (text.length > 80 ? text.slice(0, 78) + '…' : text)); }
      else openDialog(title, text, 'تعذّر النسخ التلقائي لأن المتصفح منع الوصول إلى الحافظة. النص محدد أدناه: اضغط ⌘C (أو Ctrl+C) ثم أغلق.', true);
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
    if (navigator.clipboard && navigator.clipboard.writeText && window.isSecureContext) navigator.clipboard.writeText(text).then(function () { finish('clipboard'); }, legacy);
    else legacy();
  }

  document.addEventListener('click', function (e) {
    var b = e.target.closest('[data-copy]');
    if (b) {
      e.preventDefault();
      var it = copyMap.get(b.dataset.copy);
      if (it) copyText(it.text, b, it.title);
      return;
    }
    var v = e.target.closest('[data-view]');
    if (v) { var iv = copyMap.get(v.dataset.view); if (iv) openDialog(iv.title, iv.text, ''); return; }
    var t = e.target.closest('[data-toggle]');
    if (t) {
      var id = t.dataset.toggle;
      if (ui.open.has(id)) { ui.open.delete(id); $('panel-' + id).hidden = true; t.setAttribute('aria-expanded', 'false'); }
      else openPhase(id, false);
      return;
    }
    var wt = e.target.closest('[data-wtoggle]');
    if (wt) {
      var wid = wt.dataset.wtoggle;
      var body = $('wbody-' + wid);
      var nowOpen = body.hidden;
      body.hidden = !nowOpen;
      wt.setAttribute('aria-expanded', String(nowOpen));
      if (nowOpen) ui.expanded.add(wid); else ui.expanded.delete(wid);
      return;
    }
    if (e.target.closest('[data-close]')) dlg.close();
  });
  $('dlg-copy').addEventListener('click', function () { copyText($('dlg-text').value, $('dlg-copy'), $('dlg-title').textContent); });
  $('dlg-select').addEventListener('click', function () { var ta = $('dlg-text'); ta.focus(); ta.select(); });
  $('q').addEventListener('input', function (e) { ui.q = e.target.value; applyFilters(); });
  $('state-filter').addEventListener('change', function (e) { ui.state = e.target.value; applyFilters(); });
  $('wave-filter').addEventListener('change', function (e) { ui.wave = e.target.value; applyFilters(); });
  $('rq').addEventListener('input', function (e) { ui.rq = e.target.value; applyReqFilter(); });
  $('reset-filters').addEventListener('click', function () {
    ui.q = ''; ui.state = ''; ui.wave = '';
    $('q').value = ''; $('state-filter').value = ''; $('wave-filter').value = '';
    applyFilters();
  });
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
  showTab((location.hash.slice(1).match(/^(plan|deps|reqs|guide)$/) || [])[1] || 'plan');
  poll(true);
})();
