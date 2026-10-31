// اشتقاق الحالة الحية للخطة من Git قراءةً فقط: main المثبّت، وكل فرع محلي، وكل worktree (بما لم يُلتزم)،
// وفرع التكامل. لا تُستنتج حالة من مرور الوقت ولا من صياغة تقرير. الناتج كائن واحد تعرضه اللوحة كما هو.
import path from 'node:path';
import crypto from 'node:crypto';
import {
  PHASE_LABEL, WAVE_LABEL, GATE_LABEL, OUTCOME_LABEL, RESULT_LABEL, SOURCE_LABEL,
  readText, readBlock, nowIso, matches, sections,
} from './util.mjs';
import {
  toplevel, worktrees, refs, hasHead, isAncestor, revCount, lastCommit, diffNames, statusPorcelain, currentBranch,
} from './git.mjs';
import {
  fsReader, gitReader, loadPlan, indexPlan, phaseDoc, waveDoc, branchOf, worktreeOf, baseTagOf, integrationOf,
  evidenceOf, phaseCommand, waveCommand, parallelOf, nextWaveId, RUNBOOK,
} from './load.mjs';
import { validatePlan, validateDocs, validateStatusBlock } from './validate.mjs';
import { applyRender } from './render.mjs';
import { runbookParts, phaseSections, phasePrompt, wavePrompt } from './prompts.mjs';

const REPORT_MARK = (id) => `### تقرير التسليم — ${id}`;

export function deriveState(startDir, { mode = 'snapshot' } = {}) {
  const problems = [];
  const problem = (level, text, where = '') => problems.push({ level, text, where });

  const top = toplevel(startDir);
  const wts = top ? worktrees(top) : [];
  const root = wts[0]?.path || top || startDir;
  const isGit = !!top && hasHead(root);
  const R = isGit ? refs(root) : { heads: {}, tags: {} };

  // الخطة تُقرأ من main المثبّت، فلا يغيّرها ما في worktree جلسة.
  let read;
  let planSource;
  if (isGit && R.heads.main) {
    read = gitReader(root, 'main');
    planSource = 'main';
  } else {
    read = fsReader(root);
    planSource = 'fs';
    problem('warn', isGit ? 'لا يوجد فرع main؛ تُقرأ الخطة من الملفات مباشرة.' : 'المجلد ليس مستودع Git ملتزمًا بعد؛ تُقرأ الخطة من الملفات مباشرة.');
  }
  const { plan, reqs } = loadPlan(read);
  const { phaseById, waveById, gateById } = indexPlan(plan);
  const mainBranch = plan.project.mainBranch || 'main';

  problems.push(...validatePlan(plan, reqs), ...validateDocs(plan, read));
  if (planSource === 'main') {
    const stale = staleGenerated(root, plan, reqs);
    if (stale.length) problem('warn', `أجزاء مولّدة قديمة في main: ${stale.join('، ')}. شغّل npm run plan:render على main ثم التزم.`);
  }

  const runbook = runbookParts(read(RUNBOOK));
  const reqById = Object.fromEntries(reqs.requirements.map((r) => [r.id, r]));

  // ---------- السجلات في main ----------
  const mainMd = {};
  const mainBlock = {};
  for (const ph of plan.phases) {
    mainMd[ph.id] = read(phaseDoc(plan, ph));
    mainBlock[ph.id] = readBlock(mainMd[ph.id], 'tj-status');
  }
  const mainWave = {};
  for (const w of plan.waves) mainWave[w.id] = readBlock(read(waveDoc(plan, w)), 'tj-wave');

  // ---------- الفروع والـworktrees ----------
  const intPrefix = integrationOf(plan, '');
  const wtByBranch = {};
  for (const wt of wts) if (wt.branch && wt.branch !== mainBranch) wtByBranch[wt.branch] = wt;
  const branches = Object.keys(R.heads).filter((b) => b !== mainBranch);
  const claims = Object.fromEntries(plan.phases.map((p) => [p.id, []]));
  const history = [];

  for (const b of branches.filter((x) => !x.startsWith(intPrefix))) {
    const wt = wtByBranch[b] || null;
    const ids = new Set();
    for (const f of diffNames(root, `${mainBranch}...${b}`, plan.conventions.phaseDocs)) {
      const m = path.basename(f).match(/^(P\d+)-/);
      if (m && phaseById[m[1]]) ids.add(m[1]);
    }
    const byName = b.match(/^tj\/(P\d+)-/);
    if (byName && phaseById[byName[1]]) ids.add(byName[1]);
    if (wt) {
      for (const ph of plan.phases) {
        const md = readText(path.join(wt.path, phaseDoc(plan, ph)));
        const blk = readBlock(md, 'tj-status');
        if (blk.ok && mainBlock[ph.id].ok && JSON.stringify(blk.data) !== JSON.stringify(mainBlock[ph.id].data)) ids.add(ph.id);
      }
    }
    if (!ids.size) continue;
    const merged = isAncestor(root, b, mainBranch);
    const ahead = revCount(root, `${mainBranch}..${b}`) || 0;
    for (const id of ids) {
      const ph = phaseById[id];
      const doc = phaseDoc(plan, ph);
      if (merged && ahead === 0 && mainBlock[id].ok && mainBlock[id].data.status === 'verified') {
        history.push({ phase: id, branch: b, worktree: wt?.path || null });
        continue;
      }
      const md = wt ? readText(path.join(wt.path, doc)) : gitReader(root, b)(doc);
      claims[id].push({
        branch: b,
        worktree: wt?.path || null,
        source: wt ? 'worktree' : 'branch',
        md,
        block: readBlock(md, 'tj-status'),
        ahead,
        merged,
        last: lastCommit(root, b),
        dirty: wt ? statusPorcelain(wt.path).trim().length > 0 : false,
      });
    }
  }

  // ---------- فرع التكامل لكل موجة ----------
  const integ = {};
  for (const w of plan.waves) {
    const ib = integrationOf(plan, w.id);
    if (!R.heads[ib]) continue;
    const wt = wtByBranch[ib] || null;
    const rd = wt ? fsReader(wt.path) : gitReader(root, ib);
    const blocks = {};
    const mds = {};
    for (const id of w.phases) {
      mds[id] = rd(phaseDoc(plan, phaseById[id]));
      blocks[id] = readBlock(mds[id], 'tj-status');
    }
    integ[w.id] = { branch: ib, worktree: wt?.path || null, blocks, mds, wave: readBlock(rd(waveDoc(plan, w)), 'tj-wave'), last: lastCommit(root, ib) };
  }

  // ---------- السجل الفعّال لكل مرحلة ----------
  const eff = {};
  for (const ph of plan.phases) {
    const mb = mainBlock[ph.id];
    const ig = integ[ph.wave];
    let rec = { source: planSource === 'main' ? 'main' : 'fs', block: mb, md: mainMd[ph.id], branch: null, worktree: null };
    if (mb.ok && mb.data.status === 'verified') {
      // مدمجة ومتحققة في main: لا يعلو عليها شيء.
    } else if (ig && ig.blocks[ph.id]?.ok && ['integrating', 'verified', 'blocked'].includes(ig.blocks[ph.id].data.status)) {
      rec = { source: 'integration', block: ig.blocks[ph.id], md: ig.mds[ph.id], branch: ig.branch, worktree: ig.worktree, last: ig.last };
    } else if (claims[ph.id].length) {
      const list = [...claims[ph.id]].sort((a, b) => (a.source === 'worktree' ? -1 : 0) - (b.source === 'worktree' ? -1 : 0) || String(b.last?.at).localeCompare(String(a.last?.at)));
      if (list.length > 1) problem('error', `المرحلة ${ph.id} لها أكثر من فرع: ${list.map((c) => c.branch).join('، ')}. أبقِ فرعًا واحدًا.`, phaseDoc(plan, ph));
      rec = list[0];
      if (rec.block.ok && ['integrating', 'verified'].includes(rec.block.data.status)) {
        problem('error', `الفرع ${rec.branch} يسجّل لـ${ph.id} حالة «${PHASE_LABEL[rec.block.data.status]}» ولا يكتبها إلا المنسّق.`, rec.branch);
      }
      if (rec.block.ok) {
        for (const p of validateStatusBlock(plan, ph, rec.block, `${rec.branch}:${phaseDoc(plan, ph)}`)) problems.push(p);
      }
    }
    if (rec.source === 'main' && mb.ok && ['in_progress', 'ready', 'integrating'].includes(mb.data.status)) {
      problem('warn', `main يسجّل لـ${ph.id} حالة «${PHASE_LABEL[mb.data.status]}»؛ الحالة الجارية تعيش في فرع المرحلة.`, phaseDoc(plan, ph));
    }
    eff[ph.id] = rec;
  }

  // ---------- الموجات والبوابات ----------
  const waveRec = (w) => (integ[w.id]?.wave?.ok ? integ[w.id].wave : mainWave[w.id]);
  const status = (id) => (eff[id].block.ok ? eff[id].block.data.status : 'blocked');

  const gates = {};
  for (const g of plan.gates || []) {
    const wr = waveRec(waveById[g.wave]);
    const decision = wr.ok ? wr.data.decision : null;
    const ph = eff[g.phase];
    const outcome = ph.block.ok ? ph.block.data.outcome : null;
    let st = 'pending';
    if (wr.ok && wr.data.status === 'verified' && status(g.phase) === 'verified') {
      if (decision?.state) st = decision.state === 'open' ? 'open' : 'closed';
      else if (outcome === 'success') st = 'open';
      else st = 'awaiting';
    }
    gates[g.id] = {
      id: g.id, title: g.title, wave: g.wave, phase: g.phase, state: st, label: GATE_LABEL[st],
      outcome, outcomeLabel: outcome ? OUTCOME_LABEL[outcome] : null, decision: decision || null,
      opensWhen: g.opensWhen, otherwise: g.otherwise, options: g.options || [],
    };
  }

  const tagInfo = (w) => {
    const t = baseTagOf(plan, w.id);
    return { name: t, commit: R.tags[t] ? R.tags[t].slice(0, 9) : null, exists: !!R.tags[t] };
  };

  // ---------- المراحل ----------
  const phases = [];
  const phaseState = {};
  for (const w of plan.waves) {
    for (const id of w.phases) {
      const ph = phaseById[id];
      const rec = eff[id];
      const blk = rec.block.ok ? rec.block.data : null;
      const stored = blk ? blk.status : 'blocked';
      const reasons = [];
      if (stored === 'planned') {
        const tag = tagInfo(w);
        if (!tag.exists) {
          const prev = plan.waves[plan.waves.indexOf(w) - 1];
          reasons.push(`الموجة ${w.id} لم تُفتح بعد؛ تُفتح بالوسم ${tag.name}${prev ? ` بعد التحقق من ${prev.id}` : ''}.`);
        }
        for (const d of ph.dependsOn || []) {
          if (phaseState[d] !== 'verified') reasons.push(`تنتظر دمج ${d} والتحقق منها (الآن: ${PHASE_LABEL[phaseState[d]] || '—'}).`);
        }
        for (const g of ph.requiresGates || []) {
          if (gates[g]?.state !== 'open') reasons.push(`تنتظر البوابة ${g}: ${gates[g]?.label || 'غير معروفة'}.`);
        }
      }
      const state = stored === 'planned' ? (reasons.length ? 'waiting' : 'available') : stored;
      phaseState[id] = state;

      const sec = phaseSections(rec.md || mainMd[id]);
      const acc = (ph.acceptance || []).map((a) => {
        const r = blk?.acceptance?.[a.id] || null;
        const result = r?.result || 'pending';
        return { ...a, result, resultLabel: RESULT_LABEL[result] || result, evidence: r?.evidence || [], note: r?.note || '' };
      });
      const reportWritten = String(rec.md || '').includes(REPORT_MARK(id));
      let outOfScope = [];
      if (rec.branch && rec.source !== 'integration') {
        // الفرق بثلاث نقاط من main يعزل عمل الفرع عن أي التزام دخل main بعد تفرّعه.
        const base = mainBranch;
        const allowed = [...(ph.owns || []), ...(ph.fixScope || []), phaseDoc(plan, ph), evidenceOf(plan, ph) + '/**'];
        outOfScope = diffNames(root, `${base}...${rec.branch}`).filter((f) => !allowed.some((p) => matches(f, p)));
      }
      const label = PHASE_LABEL[state];
      const sourceLabel = SOURCE_LABEL[rec.source] || rec.source;
      const cmd = phaseCommand(plan, ph);
      let commandLabel = 'ابدأ';
      let commandEnabled = true;
      let whyNot = '';
      if (state === 'in_progress' || state === 'blocked') commandLabel = 'استأنف';
      else if (state === 'ready') { commandLabel = 'أصلح بعد التسليم'; whyNot = 'جاهزة للدمج؛ لا تُستأنف إلا لإصلاح محدد تطلبه.'; }
      else if (state === 'integrating') { commandEnabled = false; whyNot = 'قيد الدمج عند المنسّق.'; }
      else if (state === 'verified') { commandEnabled = false; whyNot = 'مدمجة ومتحققة.'; }
      else if (state === 'waiting') { commandEnabled = false; whyNot = reasons.join(' '); }

      const view = {
        id, title: ph.title, slug: ph.slug, wave: w.id, waveTitle: w.title, order: w.phases.indexOf(id) + 1,
        size: ph.size, effort: ph.effort, estimate: ph.estimate, model: ph.model, whyModel: ph.whyModel,
        live: !!ph.live, isGate: !!ph.outcome, needsUser: ph.needsUser || [], owns: ph.owns || [], fixScope: ph.fixScope || [],
        doc: phaseDoc(plan, ph), evidenceDir: evidenceOf(plan, ph), expectedBranch: branchOf(plan, ph), expectedWorktree: worktreeOf(plan, ph),
        requirements: ph.requirements || [], dependsOn: ph.dependsOn || [], parallelWith: parallelOf(plan, ph), requiresGates: ph.requiresGates || [],
        state, label, stored, source: rec.source, sourceLabel,
        branch: rec.branch || blk?.branch || null, worktree: rec.worktree || null,
        ahead: rec.ahead ?? null, dirty: !!rec.dirty, last: rec.last || null,
        updated: blk?.updated || null, resume: blk?.resume || '', blocker: blk?.blocker || null,
        outcome: blk?.outcome || null, outcomeLabel: blk?.outcome ? OUTCOME_LABEL[blk.outcome] : null,
        commit: blk?.commit || null, mergeCommit: blk?.mergeCommit || null,
        checks: blk?.checks || [], checksPlanned: ph.checks || [], acceptance: acc, evidence: blk?.evidence || [], sharedRequests: blk?.sharedRequests || [],
        reportWritten, outOfScope, waitingReasons: reasons, statusError: rec.block.ok ? null : rec.block.error,
        sections: sec,
        command: cmd, commandLabel, commandEnabled, whyNot,
      };
      view.prompt = phasePrompt({ plan, root, runbook, ph, wave: w, state: view, sectionsText: sec });
      phases.push(view);
    }
  }
  const pv = Object.fromEntries(phases.map((p) => [p.id, p]));

  // ---------- عرض الموجات ----------
  const waves = plan.waves.map((w, i) => {
    const wr = waveRec(w);
    const data = wr.ok ? wr.data : null;
    const tag = tagInfo(w);
    const list = w.phases.map((id) => pv[id]);
    let state;
    if (data?.status === 'verified' && list.every((p) => p.state === 'verified')) state = 'verified';
    else if (integ[w.id]) state = data?.status === 'blocked' ? 'blocked' : 'merging';
    else if (data?.status === 'blocked') state = 'blocked';
    else if (tag.exists) state = 'open';
    else state = 'waiting';
    const reasons = [];
    const prev = plan.waves[i - 1];
    if (state === 'waiting' && prev) {
      const g = (plan.gates || []).find((x) => x.wave === prev.id);
      if (g && gates[g.id].state !== 'open' && pv[g.phase].state === 'verified') reasons.push(`تنتظر قرار البوابة ${g.id}: ${gates[g.id].label}.`);
      else reasons.push(`تُفتح بعد التحقق من ${prev.id}.`);
    }
    const pending = list.filter((p) => !['ready', 'integrating', 'verified'].includes(p.state));
    const gateId = w.gate.decision || null;
    let commandEnabled = false;
    let commandLabel = 'ادمج الموجة';
    let whyNot = '';
    if (state === 'merging' || state === 'blocked') { commandEnabled = true; commandLabel = 'استأنف الدمج'; }
    else if (state === 'open' && !pending.length) commandEnabled = true;
    else if (state === 'open') whyNot = `تنتظر تسليم: ${pending.map((p) => `${p.id} (${p.label})`).join('، ')}.`;
    else if (state === 'verified' && gateId && gates[gateId]?.state === 'awaiting') { commandEnabled = true; commandLabel = `قرّر البوابة ${gateId}`; }
    else if (state === 'verified') whyNot = 'مغلقة ومتحققة.';
    else whyNot = reasons.join(' ');
    const view = {
      id: w.id, title: w.title, why: w.why, phases: w.phases, parallel: w.phases.length > 1, state, label: WAVE_LABEL[state],
      reasons, baseTag: tag, nextBaseTag: nextWaveId(plan, w.id) ? baseTagOf(plan, nextWaveId(plan, w.id)) : null,
      integration: integ[w.id] ? { branch: integ[w.id].branch, last: integ[w.id].last } : null,
      gate: w.gate, decidesGate: gateId, coordinatorModel: w.coordinatorModel, whyModel: w.whyModel,
      record: data, command: waveCommand(plan, w.id), commandLabel, commandEnabled, whyNot,
    };
    view.prompt = wavePrompt({ plan, root, runbook, wave: w, state: view, gate: gateId ? gateById[gateId] : null });
    return view;
  });
  const wv = Object.fromEntries(waves.map((w) => [w.id, w]));
  const current = waves.find((w) => w.state !== 'verified') || null;

  // ---------- الخطوة التالية ----------
  const next = nextStep({ waves, wv, pv, gates, current });

  // ---------- العدّ والمتطلبات ----------
  const counts = { verified: 0, integrating: 0, ready: 0, in_progress: 0, blocked: 0, available: 0, waiting: 0 };
  for (const p of phases) counts[p.state] = (counts[p.state] || 0) + 1;

  const requirements = reqs.requirements.map((r) => {
    const links = [];
    for (const p of phases) for (const a of p.acceptance) if (a.req.includes(r.id)) links.push({ phase: p.id, ac: a.id, result: a.result, verified: p.state === 'verified' });
    let st = 'planned';
    if (links.length && links.every((l) => l.verified && l.result === 'pass')) st = 'verified';
    else if (links.some((l) => l.verified && l.result === 'pass')) st = 'partial';
    else if (links.some((l) => l.result === 'pass')) st = 'delivered';
    const labels = { verified: 'متحقق', partial: 'متحقق جزئيًا', delivered: 'مُثبت في فرع غير مدمج', planned: 'لم يُثبت' };
    return { ...r, groupTitle: reqs.groups.find((g) => g.id === r.group)?.title || r.group, phases: [...new Set(links.map((l) => l.phase))], acceptance: links, state: st, label: labels[st] };
  });

  // تنبيهات git إضافية
  for (const p of phases) {
    if (p.outOfScope.length) problem('warn', `فرع ${p.id} يمسّ ملفات خارج ملكيته: ${p.outOfScope.slice(0, 8).join('، ')}${p.outOfScope.length > 8 ? '…' : ''}. يلزم طلب مسجّل في sharedRequests.`, p.branch || '');
    if (p.statusError) problem('error', `${p.id}: ${p.statusError}`, p.doc);
  }
  for (const w of waves) {
    if (w.state === 'open' && !w.baseTag.exists) problem('error', `الموجة ${w.id} مفتوحة بلا وسم أساس.`);
  }

  const mainLast = isGit && R.heads.main ? lastCommit(root, mainBranch) : null;
  const state = {
    schema: 1,
    mode,
    generatedAt: nowIso(),
    generatedAtMs: Date.now(),
    source: {
      root, planSource, mainBranch, main: mainLast, isGit,
      checkout: isGit ? { branch: currentBranch(root), dirty: statusPorcelain(root).trim().length > 0 } : null,
      worktrees: wts.slice(1).map((w) => ({ path: w.path, branch: w.branch, detached: w.detached })),
      history,
    },
    project: { name: plan.project.name, baseline: plan.project.baseline },
    counts, total: phases.length,
    current: current ? { wave: current.id, title: current.title, state: current.state, label: current.label } : null,
    next,
    gates: Object.values(gates),
    waves, phases, requirements,
    groups: reqs.groups,
    problems,
    commands: {
      dashboard: 'npm run dashboard',
      sync: 'npm run plan:sync',
      check: 'npm run plan:check',
      render: 'npm run plan:render',
    },
  };
  state.key = crypto.createHash('sha1').update(JSON.stringify({ ...state, generatedAt: 0, generatedAtMs: 0 })).digest('hex').slice(0, 16);
  return state;
}

// title وhint للعرض المختصر في اللوحة، وtext الوصف الكامل (يطبعه sync). ref مرحلة يُقرأ تقريرها إن لزم.
function nextStep({ waves, wv, pv, gates, current }) {
  const action = (kind, item, primary = true) => ({
    kind, id: item.id, title: item.title, label: kind === 'phase' ? `${item.commandLabel} ${item.id}` : `${item.commandLabel}`,
    command: item.command, model: kind === 'phase' ? item.model : item.coordinatorModel, primary,
  });
  const COORD = 'افتح جلسة Claude Code جديدة في النسخة الرئيسية (بلا worktree)، واختر النموذج المقترح، والصق الأمر.';
  for (const g of Object.values(gates)) {
    if (g.state === 'awaiting') {
      const w = wv[g.wave];
      return {
        tone: 'decision',
        title: `قرّر البوابة ${g.id}: نتيجة ${g.phase} «${g.outcomeLabel || 'غير مسجلة'}»`,
        hint: `اقرأ تقرير ${g.phase} ثم ${COORD} وأعطِ المنسّق قرارك.`,
        ref: g.phase,
        text: `نتيجة ${g.phase} «${g.outcomeLabel || 'غير مسجلة'}». اقرأ تقريرها وقرّر البوابة ${g.id}: افتح جلسة جديدة في النسخة الرئيسية (بلا worktree) بالنموذج ${w.coordinatorModel}، والصق \`${w.command}\`، ثم أعطه قرارك.`,
        actions: [action('wave', w)],
      };
    }
    if (g.state === 'closed') {
      return {
        tone: 'blocked',
        title: `البوابة ${g.id} مغلقة بقرارك`,
        hint: `«${g.decision?.text || ''}». لا موجة تُفتح بعدها حتى تقرر غير ذلك.`,
        text: `أُغلقت البوابة ${g.id} بقرارك: «${g.decision?.text || ''}». لا موجة تُفتح بعدها حتى تقرر غير ذلك.`,
        actions: [],
      };
    }
  }
  if (!current) return { tone: 'done', title: 'اكتملت الخطة', hint: 'كل الموجات مغلقة ومتحققة.', text: 'اكتملت الخطة: كل الموجات مغلقة ومتحققة.', actions: [] };
  const w = current;
  if (w.state === 'merging') {
    return {
      tone: 'active',
      title: `أكمل دمج ${w.id} — ${w.title}`,
      hint: `الدمج جارٍ في فرع التكامل. أكمل جلسة المنسّق، أو ${COORD}`,
      text: `الموجة ${w.id} قيد الدمج في فرع التكامل \`${w.integration.branch}\`. أكمل جلسة المنسّق، أو افتح جلسة جديدة في النسخة الرئيسية والصق \`${w.command}\` للاستئناف.`,
      actions: [action('wave', w)],
    };
  }
  if (w.state === 'blocked') {
    const notes = (w.record?.notes || []).slice(-1)[0];
    return {
      tone: 'blocked',
      title: `بوابة ${w.id} متعطلة`,
      hint: `${notes ? `${notes}. ` : ''}عالج السبب في جلسة المرحلة المذكورة، ثم استأنف المنسّق.`,
      text: `بوابة ${w.id} متعطلة${notes ? `: ${notes}` : ''}. عالج سببها في جلسة المرحلة المذكورة، ثم استأنف المنسّق بـ\`${w.command}\`.`,
      actions: [action('wave', w)],
    };
  }
  if (w.state === 'waiting') return { tone: 'waiting', title: `الموجة ${w.id} لم تُفتح بعد`, hint: w.reasons.join(' '), text: `الموجة ${w.id} لم تُفتح بعد. ${w.reasons.join(' ')}`, actions: [] };

  const list = w.phases.map((id) => pv[id]);
  if (list.every((p) => p.state === 'ready')) {
    return {
      tone: 'merge',
      title: `ادمج الموجة ${w.id} — ${w.title}`,
      hint: `كل مراحلها سُلّمت. ${COORD}`,
      text: `كل مراحل ${w.id} جاهزة للدمج. افتح جلسة جديدة في النسخة الرئيسية (بلا worktree) بالنموذج ${w.coordinatorModel}، والصق \`${w.command}\`.`,
      actions: [action('wave', w)],
    };
  }
  const avail = list.filter((p) => p.state === 'available');
  const active = list.filter((p) => p.state === 'in_progress');
  const blocked = list.filter((p) => p.state === 'blocked');
  const ready = list.filter((p) => p.state === 'ready');
  const parts = [];
  if (avail.length === 1) parts.push(`ابدأ ${avail[0].id} — ${avail[0].title}: افتح جلسة جديدة في Claude Code، واختر النموذج ${avail[0].model}، والصق \`${avail[0].command}\`.`);
  else if (avail.length > 1) parts.push(`ابدأ بالتوازي، كل مرحلة في جلسة مستقلة: ${avail.map((p) => `${p.id} (${p.model})`).join('، ')}.`);
  if (active.length) parts.push(`جارية: ${active.map((p) => `${p.id}${p.resume ? ` — ${p.resume}` : ''}`).join('؛ ')}.`);
  if (blocked.length) parts.push(`متعطلة: ${blocked.map((p) => `${p.id} — ${p.blocker || 'بلا سبب مسجّل'}`).join('؛ ')}.`);
  if (ready.length) parts.push(`سُلّمت وتنتظر بقية الموجة: ${ready.map((p) => p.id).join('، ')}.`);
  const actions = [...avail.map((p) => action('phase', p)), ...blocked.map((p) => action('phase', p, false)), ...active.map((p) => action('phase', p, false))];
  let title;
  let hint;
  if (avail.length === 1 && !active.length && !blocked.length) {
    title = `ابدأ ${avail[0].id} — ${avail[0].title}`;
    hint = 'افتح جلسة Claude Code جديدة في مجلد المشروع، واختر النموذج المقترح، والصق الأمر. الجلسة تطلب إذنك قبل أي اختبار حي.';
  } else if (avail.length > 1) {
    title = `ابدأ مراحل ${w.id} بالتوازي`;
    hint = 'كل مرحلة في جلسة Claude Code مستقلة بنموذجها المقترح. ملفاتها لا تتقاطع.';
  } else if (blocked.length) {
    title = blocked.length === 1 ? `${blocked[0].id} متعطلة` : `مراحل متعطلة في ${w.id}`;
    hint = `${blocked.map((p) => `${p.id}: ${p.blocker || 'بلا سبب مسجّل'}`).join('؛ ')}. عالج السبب ثم استأنف جلستها بالأمر.`;
  } else if (active.length) {
    title = active.length === 1 ? `${active[0].id} جارية — ${active[0].title}` : `مراحل جارية في ${w.id}`;
    hint = active.length === 1 ? `نقطة الاستئناف: ${active[0].resume || '—'}` : 'كل مرحلة تعمل في جلستها؛ الأمر يستأنف أيًّا منها في جلسة جديدة إن انقطعت.';
  } else {
    title = `بانتظار بقية مراحل ${w.id}`;
    hint = parts.join(' ');
  }
  return { tone: blocked.length ? 'blocked' : avail.length ? 'start' : 'active', title, hint, text: parts.join(' '), actions };
}

function staleGenerated(root, plan, reqs) {
  // يقارن الأجزاء المولّدة في نسخة main المثبّتة بما يولّده plan.json الحالي في main، دون كتابة.
  // التوليد يقرأ من مجلد؛ لذا يُقارن فقط حين تكون النسخة الرئيسية على main ونظيفة.
  const b = currentBranch(root);
  if (b !== (plan.project.mainBranch || 'main')) return [];
  if (statusPorcelain(root).trim()) return [];
  return applyRender(root, plan, reqs, { write: false });
}

export function phaseSectionText(md, name) {
  return sections(md || '')[name] || '';
}
