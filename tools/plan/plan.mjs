#!/usr/bin/env node
// أداة خطة ترجمان: فحص، ومزامنة، وتوليد، وخادم اللوحة، وبطاقات المراحل للمهارتين، وتحديث كتل الحالة.
// بلا اعتماديات خارجية. التشغيل: node tools/plan/plan.mjs <أمر> … (وفي جلسات Claude Code: command node …).
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  STATUS, WAVE_STATUS, OUTCOMES, RESULTS, PHASE_LABEL, readText, atomicWrite, readBlock, writeBlock, nowIso, matches,
} from './lib/util.mjs';
import {
  toplevel, worktrees, currentBranch, isMainCheckout, statusPorcelain, refs, diffNames, blobId, logTouching, git, revCount,
  mergeConflicts,
} from './lib/git.mjs';
import {
  fsReader, loadPlan, indexPlan, phaseDoc, waveDoc, baseTagOf, integrationOf, evidenceOf,
} from './lib/load.mjs';
import { validatePlan, validateDocs, validatePhaseDoc, validateStatusBlock, validateWaveDoc } from './lib/validate.mjs';
import { applyRender } from './lib/render.mjs';
import { deriveState } from './lib/state.mjs';
import { serve } from './lib/serve.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = toplevel(process.cwd()) || path.resolve(here, '../..');

function parseArgs(argv) {
  const pos = [];
  const flags = {};
  const kv = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const k = a.slice(2);
      const v = argv[i + 1] && !argv[i + 1].startsWith('--') && !argv[i + 1].includes('=') ? argv[++i] : true;
      flags[k] = v;
    } else if (/^[a-zA-Z]+=/.test(a)) {
      const j = a.indexOf('=');
      kv.push([a.slice(0, j), a.slice(j + 1)]);
    } else {
      pos.push(a);
    }
  }
  return { pos, flags, kv };
}

function die(msg, code = 2) {
  console.error(msg);
  process.exit(code);
}

function printProblems(list) {
  const errors = list.filter((p) => p.level === 'error');
  const warns = list.filter((p) => p.level !== 'error');
  for (const p of errors) console.log(`✗ خطأ: ${p.text}${p.where ? `  [${p.where}]` : ''}`);
  for (const p of warns) console.log(`⚠ تنبيه: ${p.text}${p.where ? `  [${p.where}]` : ''}`);
  return { errors: errors.length, warns: warns.length };
}

const dedupe = (list) => {
  const seen = new Set();
  return list.filter((p) => (seen.has(p.text) ? false : (seen.add(p.text), true)));
};

const normId = (s) => String(s || '').trim().toUpperCase();

// العدّ بالعربية: ملف واحد، ملفان، 3–10 ملفات، 11 فأكثر ملفًا.
const filesCount = (n) => (n === 1 ? 'ملف واحد' : n === 2 ? 'ملفين' : n >= 3 && n <= 10 ? `${n} ملفات` : `${n} ملفًا`);

// ---------------------------------------------------------------- check

function cmdCheck({ flags }) {
  const read = fsReader(ROOT);
  const { plan, reqs } = loadPlan(read);
  const { phaseById } = indexPlan(plan);
  const branch = currentBranch(ROOT);
  let problems = [];
  if (flags.phase) {
    const ph = phaseById[normId(flags.phase)];
    if (!ph) die(`لا مرحلة بالمعرّف ${flags.phase}`);
    problems.push(...validatePhaseDoc(plan, ph, read(phaseDoc(plan, ph)), phaseDoc(plan, ph)));
    // نقطة التفرّع عن main (ثلاث نقاط)، لا وسم الأساس: لا تُحسب على المرحلة التزامات دخلت main بعده.
    const base = plan.project.mainBranch;
    const committed = diffNames(ROOT, `${base}...HEAD`);
    const pending = statusPorcelain(ROOT).split('\n').filter(Boolean).map((l) => l.slice(3).replace(/^"|"$/g, '').split(' -> ').pop());
    const files = [...new Set([...committed, ...pending])];
    const allowed = [...(ph.owns || []), ...(ph.fixScope || []), phaseDoc(plan, ph), evidenceOf(plan, ph) + '/**'];
    const block = readBlock(read(phaseDoc(plan, ph)), 'tj-status');
    const requested = (block.ok ? block.data.sharedRequests : []).map((r) => r.file);
    for (const f of files) {
      if (allowed.some((p) => matches(f, p))) continue;
      const other = plan.phases.find((p) => p.id !== ph.id && f === phaseDoc(plan, p));
      if (other) problems.push({ level: 'error', text: `فرعك يعدّل ملف مرحلة أخرى: ${f}`, where: f });
      else if (requested.some((r) => matches(f, r) || f === r)) problems.push({ level: 'warn', text: `ملف خارج الملكية بطلب مسجّل: ${f}`, where: f });
      else problems.push({ level: 'error', text: `ملف خارج ملكية ${ph.id} بلا طلب في sharedRequests: ${f}`, where: f });
    }
    if (pending.length) problems.push({ level: 'warn', text: `تغييرات غير ملتزمة: ${pending.length} ملف.` });
    console.log(`فحص المرحلة ${ph.id} — ${ROOT} (${branch || 'رأس منفصل'})`);
  } else {
    problems.push(...validatePlan(plan, reqs), ...validateDocs(plan, read));
    const stale = applyRender(ROOT, plan, reqs, { write: false });
    if (stale.length) problems.push({ level: 'error', text: `أجزاء مولّدة قديمة: ${stale.join('، ')} — شغّل npm run plan:render`, where: '' });
    try {
      const st = deriveState(ROOT, { mode: 'check' });
      problems.push(...st.problems.filter((p) => !p.text.startsWith('أجزاء مولّدة قديمة في main')));
    } catch (e) {
      problems.push({ level: 'error', text: `تعذّر اشتقاق الحالة من Git: ${e.message}` });
    }
    console.log(`فحص الخطة — ${ROOT} (${branch || 'بلا فرع'})`);
  }
  const { errors, warns } = printProblems(dedupe(problems));
  console.log(errors ? `النتيجة: ${errors} خطأ و${warns} تنبيه.` : `النتيجة: سليمة، لا أخطاء${warns ? ` (${warns} تنبيه)` : ''}.`);
  process.exit(errors ? 1 : 0);
}

// ---------------------------------------------------------------- sync / render / serve

function mainRoot() {
  return worktrees(ROOT)[0]?.path || ROOT;
}

function cmdSync({ flags }) {
  const st = deriveState(ROOT, { mode: 'snapshot' });
  const out = flags.out ? path.resolve(flags.out) : path.join(st.source.root, 'dashboard/data/state.js');
  atomicWrite(out, `window.TJ_STATE = ${JSON.stringify(st)};\n`);
  const c = st.counts;
  const errors = st.problems.filter((p) => p.level === 'error').length;
  console.log(`كُتبت لقطة الحالة: ${out}`);
  console.log(`وقت التوليد ${st.generatedAt} · مدمجة ومتحققة ${c.verified} · قيد الدمج ${c.integrating} · جاهزة للدمج ${c.ready} · جارية ${c.in_progress} · متعطلة ${c.blocked} · متاحة ${c.available} · مخططة ${c.waiting}`);
  if (st.next) console.log(`الخطوة التالية: ${st.next.text}`);
  if (errors) console.log(`تنبيه: ${errors} خطأ في الخطة أو الحالة؛ شغّل npm run plan:check للتفاصيل.`);
}

function cmdRender() {
  const { plan, reqs } = loadPlan(fsReader(ROOT));
  const b = currentBranch(ROOT);
  if (b && b !== plan.project.mainBranch && !b.startsWith(integrationOf(plan, ''))) {
    console.log(`تنبيه: التوليد يخص main أو فرع التكامل، وأنت على ${b}. جلسات المراحل لا تولّد.`);
  }
  const changed = applyRender(ROOT, plan, reqs, { write: true });
  console.log(changed.length ? `وُلّد: ${changed.join('، ')}` : 'لا تغيير: كل الأجزاء المولّدة حديثة.');
}

function cmdServe({ flags }) {
  const port = Number(flags.port || process.env.TJ_PORT || 4317);
  serve(mainRoot(), { port });
}

// ---------------------------------------------------------------- brief / prompt / discover

function locationOf() {
  return {
    top: ROOT,
    branch: currentBranch(ROOT),
    main: isMainCheckout(ROOT),
    dirty: statusPorcelain(ROOT).trim().length > 0,
  };
}

function phaseAction(st, p, loc) {
  const root = st.source.root;
  const abs = path.join(root, p.expectedWorktree);
  if (p.state === 'verified') return 'لا عمل: المرحلة مدمجة ومتحققة.';
  if (p.state === 'integrating') return 'لا عمل: المرحلة قيد الدمج عند المنسّق.';
  if (p.state === 'ready') return 'مسلّمة وجاهزة للدمج. لا تعمل إلا بطلب صريح من سلطان لإصلاح محدد.';
  if (p.state === 'waiting') return `لا تبدأ: ${p.waitingReasons.join(' ')}`;
  if (p.worktree) {
    return loc.top === p.worktree
      ? 'أنت في worktree المرحلة: تابع من نقطة الاستئناف.'
      : `ادخل worktree المرحلة بأداة EnterWorktree بالمسار ${p.worktree}، ثم تابع من نقطة الاستئناف.`;
  }
  if (p.branch && refs(root).heads[p.branch]) {
    return `للفرع ${p.branch} لا worktree: git worktree add ${p.expectedWorktree} ${p.branch} ثم EnterWorktree بالمسار ${abs}.`;
  }
  if (loc.main && loc.branch === st.source.mainBranch) {
    return `ابدأ: git worktree add ${p.expectedWorktree} -b ${p.expectedBranch} ${st.source.mainBranch} ثم EnterWorktree بالمسار ${abs}.`;
  }
  if (!loc.main) {
    const ahead = revCount(loc.top, `${st.source.mainBranch}..HEAD`);
    if (!loc.dirty && ahead === 0) return `أنت في worktree فارغ أنشأه التطبيق: git switch -c ${p.expectedBranch} ${st.source.mainBranch} ثم تابع.`;
    return 'توقّف: هذا الـworktree فيه تغييرات أو التزامات لعمل آخر. اطلب من سلطان جلسة جديدة.';
  }
  return `توقّف: النسخة الرئيسية ليست على ${st.source.mainBranch} (${loc.branch || 'رأس منفصل'}).`;
}

function cmdBrief({ pos }) {
  const id = normId(pos[0]);
  if (!id) die('الاستعمال: brief <P1…P9 | W1…W5>');
  const st = deriveState(ROOT, { mode: 'brief' });
  const loc = locationOf();
  const where = `${loc.main ? 'النسخة الرئيسية' : 'worktree'} ${loc.top} على ${loc.branch || 'رأس منفصل'}${loc.dirty ? ' (فيه تغييرات غير ملتزمة)' : ''}`;
  if (id.startsWith('W')) {
    const w = st.waves.find((x) => x.id === id);
    if (!w) die(`لا موجة بالمعرّف ${pos[0]}. المعرّفات: ${st.waves.map((x) => x.id).join('، ')}`);
    console.log(`بطاقة الموجة ${w.id} — ${w.title}`);
    console.log(`- الحالة: ${w.label}${w.reasons.length ? ` — ${w.reasons.join(' ')}` : ''}`);
    console.log(`- وسم الأساس: ${w.baseTag.name} ${w.baseTag.exists ? `(${w.baseTag.commit})` : '(غير موجود)'} · التالي: ${w.nextBaseTag || 'لا شيء'}`);
    console.log(`- المراحل بترتيب الدمج: ${w.phases.map((x) => `${x} (${st.phases.find((p) => p.id === x).label})`).join(' ← ')}`);
    console.log(`- البوابة: ${w.gate.commands.join(' ثم ')}${w.gate.live ? ` · الدخان الحي: ${w.gate.live}` : ''}`);
    if (w.decidesGate) {
      const g = st.gates.find((x) => x.id === w.decidesGate);
      console.log(`- تحسم ${g.id}: ${g.label}${g.outcomeLabel ? ` · نتيجة ${g.phase}: ${g.outcomeLabel}` : ''}`);
    }
    console.log(`- الأمر: ${w.command} · ${w.commandEnabled ? w.commandLabel : `غير متاح: ${w.whyNot}`}`);
    console.log(`- مكان هذه الجلسة: ${where}`);
    return;
  }
  const p = st.phases.find((x) => x.id === id);
  if (!p) die(`لا مرحلة بالمعرّف ${pos[0]}. المعرّفات: ${st.phases.map((x) => x.id).join('، ')}`);
  const w = st.waves.find((x) => x.id === p.wave);
  const dep = (d) => `${d} (${st.phases.find((x) => x.id === d).label})`;
  console.log(`بطاقة المرحلة ${p.id} — ${p.title}`);
  console.log(`- الحالة: ${p.label} (${p.sourceLabel})${p.updated ? ` · آخر تحديث ${p.updated}` : ''}`);
  console.log(`- الموجة: ${w.id} — ${w.label} · وسم الأساس ${w.baseTag.name} ${w.baseTag.exists ? `(${w.baseTag.commit})` : '(غير موجود)'}`);
  console.log(`- تعتمد على: ${p.dependsOn.length ? p.dependsOn.map(dep).join('، ') : '—'} · البوابات: ${p.requiresGates.length ? p.requiresGates.map((g) => `${g} (${st.gates.find((x) => x.id === g).label})`).join('، ') : '—'}`);
  console.log(`- بالتوازي مع: ${p.parallelWith.length ? p.parallelWith.join('، ') : '—'}`);
  console.log(`- الفرع المتوقع: ${p.expectedBranch} · الفرع المسجّل: ${p.branch || '—'} · worktree: ${p.worktree || '—'}`);
  console.log(`- النموذج المقترح: ${p.model} · الجهد ${p.effort} — ${p.whyModel}`);
  console.log(`- اختبار حي: ${p.live ? 'نعم' : 'لا'}${p.needsUser.length ? ` · يحتاج من سلطان: ${p.needsUser.join(' · ')}` : ''}`);
  console.log(`- نقطة الاستئناف: ${p.resume || '—'}`);
  if (p.blocker) console.log(`- سبب التعطل: ${p.blocker}`);
  console.log(`- ملف المرحلة: ${p.doc} · الأدلة: ${p.evidenceDir}/`);
  console.log(`- مكان هذه الجلسة: ${where}`);
  console.log(`- الإجراء: ${phaseAction(st, p, loc)}`);
  const errs = st.problems.filter((x) => x.level === 'error');
  if (errs.length) console.log(`- أخطاء في الخطة أو الحالة: ${errs.length} — شغّل command node tools/plan/plan.mjs check`);
}

function cmdPrompt({ pos }) {
  const id = normId(pos[0]);
  const st = deriveState(ROOT, { mode: 'prompt' });
  const item = id.startsWith('W') ? st.waves.find((x) => x.id === id) : st.phases.find((x) => x.id === id);
  if (!item) die('الاستعمال: prompt <P1…P9 | W1…W5>');
  console.log(item.prompt);
}

function cmdDiscover({ pos }) {
  const id = normId(pos[0]);
  const st = deriveState(ROOT, { mode: 'discover' });
  const w = st.waves.find((x) => x.id === id);
  if (!w) die('الاستعمال: discover <W1…W5>');
  console.log(`اكتشاف الموجة ${w.id} — ${w.title} · ${w.label}`);
  console.log(`وسم الأساس: ${w.baseTag.name} ${w.baseTag.exists ? `(${w.baseTag.commit})` : '(غير موجود!)'} · فرع التكامل: ${w.integration ? w.integration.branch : 'لم يُنشأ'}`);
  const blockers = [];
  w.phases.forEach((pid, i) => {
    const p = st.phases.find((x) => x.id === pid);
    const pass = p.acceptance.filter((a) => a.result === 'pass').length;
    const requested = p.sharedRequests.map((r) => r.file);
    const uncovered = p.outOfScope.filter((f) => !requested.some((r) => matches(f, r) || f === r));
    console.log(`${i + 1}. ${p.id} — ${p.title}`);
    console.log(`   الحالة: ${p.label} (${p.sourceLabel}) · الفرع: ${p.branch || '—'} · worktree: ${p.worktree || '—'}${p.dirty ? ' · تغييرات غير ملتزمة!' : ''}`);
    console.log(`   آخر التزام: ${p.last ? `${p.last.hash} ${p.last.subject}` : '—'} · متقدم على main بـ${p.ahead ?? '—'}`);
    console.log(`   التقرير: ${p.reportWritten ? 'مكتوب' : 'غير مكتوب'} · الفحوص المسجلة: ${p.checks.length} · القبول: ${pass} من ${p.acceptance.length} ناجح${p.isGate ? ` · النتيجة: ${p.outcomeLabel || 'غير مسجلة'}` : ''}`);
    console.log(`   خارج الملكية: ${p.outOfScope.length ? p.outOfScope.join('، ') : 'لا شيء'}${uncovered.length ? ` (بلا طلب: ${uncovered.join('، ')})` : ''}`);
    if (p.sharedRequests.length) console.log(`   طلبات ملفات مشتركة: ${p.sharedRequests.map((r) => `${r.file}: ${r.change}${r.applied ? ' (مطبّق في الفرع)' : ''}`).join(' · ')}`);
    if (!['ready', 'integrating', 'verified'].includes(p.state)) blockers.push(`${p.id} ${p.label}`);
    else if (!p.reportWritten) blockers.push(`${p.id} بلا تقرير تسليم`);
    if (p.dirty) blockers.push(`${p.id} فيها تغييرات غير ملتزمة`);
    if (uncovered.length) blockers.push(`${p.id} تمسّ ملفات خارج ملكيتها بلا طلب`);
  });
  console.log(`أوامر البوابة: ${w.gate.commands.join(' ثم ')}${w.gate.live ? ` · الدخان الحي: ${w.gate.live}` : ''}`);
  const errs = st.problems.filter((p) => p.level === 'error');
  if (errs.length) {
    console.log('أخطاء الخطة أو الحالة:');
    printProblems(errs);
    blockers.push(`${errs.length} خطأ في الخطة أو الحالة`);
  }
  if (blockers.length) {
    console.log(`الحكم: غير جاهزة للدمج — ${blockers.join('؛ ')}.`);
    process.exit(1);
  }
  console.log('الحكم: جاهزة للدمج بالترتيب أعلاه.');
}

// ---------------------------------------------------------------- verify-merge

const CONFLICT = /تعارض|conflict/i;
const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// يذكر النصُّ المسارَ كاملًا لا جزءًا من مسار أطول.
const mentions = (text, f) => new RegExp(`(?<![\\w./-])${escRe(f)}(?![\\w/-]|\\.\\w)`).test(text);

// حقائق التزام دمج المرحلة: أبواه، وملفات التعارض عند إعادة دمجهما، وأسطر رسالته من أول سطر يذكر التعارض.
function mergeFacts(rev) {
  const line = git(ROOT, ['rev-list', '--parents', '-n', '1', `${rev}^{commit}`], { allowFail: true });
  const [sha, ours, theirs, ...more] = (line || '').split(' ');
  if (!theirs || more.length) return null;
  const msg = git(ROOT, ['log', '-1', '--format=%B', sha]).split('\n');
  const from = msg.findIndex((l) => CONFLICT.test(l));
  return { sha, short: sha.slice(0, 7), ours, theirs, conflicts: mergeConflicts(ROOT, ours, theirs), noted: from < 0 ? [] : msg.slice(from) };
}

// حلّ تعارض مسجّل داخل التزام الدمج نفسه، بشرطين معًا: آلي — إعادة دمج أبويه تُظهر في الملف تعارضًا فعليًا،
// ونسخة الفرع هي التي دُمجت؛ ومسجّل — رسالة الدمج تذكره في سطر التعارض أو بعده، أو سطر في سجل الموجة يذكره
// مع التزام الدمج. لا يكفي git diff-tree --cc: الحلّ المطابق لأحد الأبوين حرفيًا (W3) لا يظهر فيه.
function conflictFix(m, x, f, waveLines) {
  if (!m) return null;
  const inLog = waveLines.some((l) => CONFLICT.test(l) && mentions(l, f) && (l.match(/\b[0-9a-f]{7,40}\b/g) || []).some((h) => m.sha.startsWith(h)));
  const where = [m.noted.some((l) => mentions(l, f)) && 'رسالة الدمج', inLog && 'سجل الموجة'].filter(Boolean).join(' و');
  const conflicted = !!m.conflicts?.includes(f);
  if (!conflicted && !where) return null;
  if (!m.conflicts) return { ok: false, why: 'تعذّر التحقق من التعارض بإعادة الدمج (git merge-tree --write-tree يحتاج Git 2.38 فأحدث)' };
  if (!conflicted) return { ok: false, why: `مذكور حلًّا لتعارض في ${where}، لكن إعادة دمج ${m.short} لا تُظهر فيه تعارضًا` };
  if (blobId(ROOT, m.theirs, f) !== blobId(ROOT, x.branch, f)) return { ok: false, why: `فرع المرحلة غيّره بعد دمجه في ${m.short}` };
  if (!where) return { ok: false, why: `إعادة دمج ${m.short} تُظهر فيه تعارضًا، لكن حلّه غير مسجّل: اذكره في رسالة الدمج تحت سطر «تعارض في …»، أو بسطر «تعارض» في سجل الموجة يذكر ${m.short}` };
  return { ok: true, why: `إعادة الدمج تُظهر فيه تعارضًا فعليًا، وحلّه مسجّل في ${where}` };
}

function cmdVerifyMerge({ pos }) {
  const id = normId(pos[0]);
  const read = fsReader(ROOT);
  const { plan } = loadPlan(read);
  const { waveById, phaseById } = indexPlan(plan);
  const w = waveById[id];
  if (!w) die('الاستعمال: verify-merge <W1…W5>');
  const b = currentBranch(ROOT);
  if (b !== integrationOf(plan, w.id)) console.log(`تنبيه: الفحص يخص فرع التكامل ${integrationOf(plan, w.id)}، وأنت على ${b}.`);
  const R = refs(ROOT);
  const base = baseTagOf(plan, w.id);
  if (!R.tags[base]) die(`وسم الأساس ${base} غير موجود.`);
  const info = w.phases.map((pid) => {
    const ph = phaseById[pid];
    const blk = readBlock(read(phaseDoc(plan, ph)), 'tj-status');
    const branch = blk.ok ? blk.data.branch : null;
    let merge = blk.ok ? blk.data.mergeCommit : null;
    if (!merge) merge = git(ROOT, ['log', '--merges', '--format=%h', '-1', `--grep=دمج ${pid}`, 'HEAD'], { allowFail: true }) || null;
    const files = branch && R.heads[branch] ? diffNames(ROOT, `${plan.project.mainBranch}...${branch}`) : [];
    return { pid, branch, merge, files, known: !!(branch && R.heads[branch]) };
  });
  const waveLines = (read(waveDoc(plan, w)) || '').split('\n');
  const facts = new Map();
  const factsOf = (rev) => (facts.has(rev) ? facts.get(rev) : facts.set(rev, mergeFacts(rev)).get(rev));
  let errors = 0;
  info.forEach((x, i) => {
    if (!x.known) {
      console.log(`✗ ${x.pid}: لا فرع مسجّل أو موجود (${x.branch || '—'}).`);
      errors++;
      return;
    }
    let same = 0;
    for (const f of x.files) {
      if (blobId(ROOT, x.branch, f) === blobId(ROOT, 'HEAD', f)) {
        same++;
        continue;
      }
      const later = info.slice(i + 1).filter((y) => y.files.includes(f)).map((y) => y.pid);
      if (later.length) {
        console.log(`• ${x.pid}: ${f} يختلف لأن ${later.join('، ')} دُمجت بعدها وعدّلته.`);
        continue;
      }
      const after = x.merge ? logTouching(ROOT, `${x.merge}..HEAD`, f) : [];
      if (after.length) {
        console.log(`• ${x.pid}: ${f} عُدّل بعد دمجها في ${after.map((c) => `${c.hash} «${c.subject}»`).join('، ')}.`);
        continue;
      }
      const fix = x.merge ? conflictFix(factsOf(x.merge), x, f, waveLines) : null;
      if (fix?.ok) {
        console.log(`• ${x.pid}: ${f} حُلّ تعارضه في التزام دمجها ${factsOf(x.merge).short}: ${fix.why}.`);
        continue;
      }
      console.log(`✗ ${x.pid}: تغيير سقط في ${f} — لا يطابق رأس التكامل ولا يُنسب إلى دمج لاحق أو التزام مسجّل أو حل تعارض مسجّل.${fix ? ` ${fix.why}.` : ''}`);
      errors++;
    }
    console.log(`✓ ${x.pid}: ${same} من ${filesCount(x.files.length)} مطابقة لرأس التكامل حرفيًا.`);
  });
  console.log(errors ? `النتيجة: ${errors} مشكلة — لا تتابع قبل حلها.` : 'النتيجة: لا تغيير سقط.');
  process.exit(errors ? 1 : 0);
}

// ---------------------------------------------------------------- set / wave-set

const nul = (v) => (v === 'null' || v === '' ? null : v);

function cmdSet({ pos, kv }) {
  const read = fsReader(ROOT);
  const { plan } = loadPlan(read);
  const { phaseById } = indexPlan(plan);
  const ph = phaseById[normId(pos[0])];
  if (!ph || !kv.length) die('الاستعمال: set <P…> key=value …  (status branch resume blocker outcome commit mergeCommit check ac evidence request)');
  const rel = phaseDoc(plan, ph);
  const file = path.join(ROOT, rel);
  const md = readText(file);
  const blk = readBlock(md, 'tj-status');
  if (!blk.ok) die(`${ph.id}: ${blk.error}`);
  const d = blk.data;
  const branch = currentBranch(ROOT) || '';
  const coordinatorPlace = branch === plan.project.mainBranch || branch.startsWith(integrationOf(plan, ''));
  for (const [k, raw] of kv) {
    const v = nul(raw);
    switch (k) {
      case 'status':
        if (!STATUS.includes(v)) die(`حالة غير معروفة: ${raw}. المسموح: ${STATUS.join('، ')}`);
        if (['integrating', 'verified'].includes(v) && !coordinatorPlace) die(`الحالة «${PHASE_LABEL[v]}» يكتبها المنسّق على main أو فرع التكامل فقط.`);
        d.status = v;
        if (v !== 'blocked' && !kv.some(([x]) => x === 'blocker')) d.blocker = null;
        break;
      case 'branch': case 'resume': case 'commit': case 'mergeCommit': case 'blocker':
        d[k] = v;
        break;
      case 'outcome':
        if (v != null && !OUTCOMES.includes(v)) die(`نتيجة غير معروفة: ${raw}. المسموح: ${OUTCOMES.join('، ')}`);
        d.outcome = v;
        break;
      case 'check': {
        const [cmd, result, note = ''] = raw.split('|');
        if (!cmd || !RESULTS.includes(result)) die('الصيغة: check="الأمر|pass|ملاحظة"');
        d.checks.push({ cmd, result, at: nowIso(), note });
        break;
      }
      case 'ac': {
        const [acId, result, ev = '', note = ''] = raw.split('|');
        if (!ph.acceptance.some((a) => a.id === acId)) die(`معيار غير موجود في ${ph.id}: ${acId}`);
        if (!RESULTS.includes(result)) die(`نتيجة غير معروفة: ${result}. المسموح: ${RESULTS.join('، ')}`);
        d.acceptance[acId] = { result, evidence: ev ? ev.split(';').map((s) => s.trim()).filter(Boolean) : [], note };
        break;
      }
      case 'evidence': {
        const [label, p] = raw.split('|');
        if (!label || !p) die('الصيغة: evidence="الوصف|المسار"');
        d.evidence.push({ label, path: p });
        break;
      }
      case 'request': {
        const [f, change, why = '', applied = 'false'] = raw.split('|');
        if (!f || !change) die('الصيغة: request="الملف|التغيير|السبب|true أو false"');
        d.sharedRequests.push({ file: f, change, why, applied: applied === 'true' });
        break;
      }
      default:
        die(`مفتاح غير معروف: ${k}`);
    }
  }
  d.updated = nowIso();
  const errs = validateStatusBlock(plan, ph, { ok: true, data: d }, rel).filter((p) => p.level === 'error');
  if (errs.length) {
    printProblems(errs);
    die('لم يُكتب شيء. صحّح القيم وأعد الأمر.', 1);
  }
  atomicWrite(file, writeBlock(md, 'tj-status', d));
  console.log(`حُدّثت حالة ${ph.id} في ${rel}: ${PHASE_LABEL[d.status] || d.status}${d.resume ? ` · الاستئناف: ${d.resume}` : ''}`);
}

function cmdWaveSet({ pos, kv }) {
  const read = fsReader(ROOT);
  const { plan } = loadPlan(read);
  const { waveById } = indexPlan(plan);
  const w = waveById[normId(pos[0])];
  if (!w || !kv.length) die('الاستعمال: wave-set <W…> key=value …  (status integrationBranch gate gateCheck note merged decision decisionState)');
  const rel = waveDoc(plan, w);
  const file = path.join(ROOT, rel);
  const md = readText(file);
  const blk = readBlock(md, 'tj-wave');
  if (!blk.ok) die(`${w.id}: ${blk.error}`);
  const d = blk.data;
  const branch = currentBranch(ROOT) || '';
  if (branch !== plan.project.mainBranch && !branch.startsWith(integrationOf(plan, ''))) die('سجل الموجة يكتبه المنسّق على main أو فرع التكامل فقط.');
  let decisionText = null;
  let decisionState = null;
  for (const [k, raw] of kv) {
    const v = nul(raw);
    switch (k) {
      case 'status':
        if (!WAVE_STATUS.includes(v)) die(`حالة موجة غير معروفة: ${raw}. المسموح: ${WAVE_STATUS.join('، ')}`);
        d.status = v;
        break;
      case 'integrationBranch':
        d.integrationBranch = v;
        break;
      case 'gate':
        if (!['pass', 'fail'].includes(v)) die('gate=pass أو gate=fail');
        d.gate.result = v;
        d.gate.at = nowIso();
        break;
      case 'gateCheck': {
        const [cmd, result, note = ''] = raw.split('|');
        if (!cmd || !RESULTS.includes(result)) die('الصيغة: gateCheck="الأمر|pass|ملاحظة"');
        d.gate.checks.push({ cmd, result, at: nowIso(), note });
        break;
      }
      case 'note':
        d.notes.push(`${nowIso()} — ${raw}`);
        break;
      case 'merged': {
        const [phase, commit] = raw.split('|');
        d.merged.push({ phase, mergeCommit: commit || null, at: nowIso() });
        break;
      }
      case 'decision':
        decisionText = raw;
        break;
      case 'decisionState':
        if (!['open', 'closed'].includes(v)) die('decisionState=open أو closed');
        decisionState = v;
        break;
      default:
        die(`مفتاح غير معروف: ${k}`);
    }
  }
  if (decisionText != null || decisionState != null) {
    if (!w.gate.decision) die(`الموجة ${w.id} لا تحسم بوابة.`);
    if (!decisionText || !decisionState) die('القرار يحتاج decision="نص سلطان" وdecisionState=open|closed معًا.');
    d.decision = { gate: w.gate.decision, state: decisionState, text: decisionText, by: 'سلطان', at: nowIso() };
  }
  d.updated = nowIso();
  const out = writeBlock(md, 'tj-wave', d);
  const errs = validateWaveDoc(plan, w, out, rel).filter((p) => p.level === 'error');
  if (errs.length) {
    printProblems(errs);
    die('لم يُكتب شيء.', 1);
  }
  atomicWrite(file, out);
  console.log(`حُدّث سجل ${w.id}: الحالة ${d.status}${d.decision ? ` · قرار ${d.decision.gate}: ${d.decision.state}` : ''}`);
}

// ---------------------------------------------------------------- main

const HELP = `أداة خطة ترجمان
  check [--phase P3]      فحص الخطة والوثائق والحالة (أو فرع مرحلة وملكيته)
  sync [--out ملف]        كتابة لقطة الحالة للوحة في dashboard/data/state.js
  render                  توليد الأجزاء المشتقة من plan.json (على main)
  serve [--port 4317]     تشغيل اللوحة بتحديث تلقائي على http://127.0.0.1:4317
  brief <P3|W3>           بطاقة مرحلة أو موجة للمهارتين
  prompt <P3|W3>          البرومبت الكامل البديل
  discover <W3>           اكتشاف فروع الموجة وتقاريرها وجاهزيتها (للمنسّق)
  verify-merge <W3>       فحص «لا تغيير سقط» على فرع التكامل
  set <P3> k=v …          تحديث كتلة حالة المرحلة
  wave-set <W3> k=v …     تحديث سجل الموجة (المنسّق)`;

const [cmd, ...rest] = process.argv.slice(2);
const args = parseArgs(rest);
const table = {
  check: cmdCheck, sync: cmdSync, render: cmdRender, serve: cmdServe, brief: cmdBrief, prompt: cmdPrompt,
  discover: cmdDiscover, 'verify-merge': cmdVerifyMerge, set: cmdSet, 'wave-set': cmdWaveSet,
};
if (!cmd || cmd === 'help' || cmd === '--help' || !table[cmd]) {
  console.log(HELP);
  process.exit(cmd && !table[cmd] && cmd !== 'help' && cmd !== '--help' ? 2 : 0);
}
try {
  table[cmd](args);
} catch (e) {
  die(`خطأ: ${e.message}`, 1);
}
