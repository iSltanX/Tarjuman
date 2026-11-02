// قواعد الخطة: البنية، والاعتماديات، والملكية، وتغطية المتطلبات، وسلامة ملفات المراحل والموجات.
// تُرجع مشكلات { level: 'error' | 'warn', text, where }. لا تكتب شيئًا.
import {
  STATUS, WAVE_STATUS, OUTCOMES, RESULTS, VERIFY, REQUIRED_SECTIONS, RUNBOOK_SECTIONS,
  readBlock, hasGen, sections, subsections, validPattern, within, overlap, patBase,
} from './util.mjs';
import { indexPlan, phaseDoc, waveDoc, RUNBOOK } from './load.mjs';

export function validatePlan(plan, reqs) {
  const out = [];
  const err = (text, where = 'plan/plan.json') => out.push({ level: 'error', text, where });
  const warn = (text, where = 'plan/plan.json') => out.push({ level: 'warn', text, where });

  for (const key of ['project', 'conventions', 'waves', 'phases']) if (!plan[key]) err(`حقل مفقود في الخطة: ${key}`);
  if (!plan.phases || !plan.waves) return out;
  const { phaseById, waveById, waveIndex, gateById } = indexPlan(plan);

  // المعرّفات
  const seen = new Set();
  for (const ph of plan.phases) {
    if (!/^P\d+$/.test(ph.id)) err(`معرّف مرحلة بصيغة غير صحيحة: ${ph.id}`);
    if (seen.has(ph.id)) err(`معرّف مرحلة مكرر: ${ph.id}`);
    seen.add(ph.id);
    if (!/^[a-z0-9-]+$/.test(ph.slug || '')) err(`اسم مختصر غير صالح للمرحلة ${ph.id}: ${ph.slug}`);
    for (const k of ['title', 'wave', 'model', 'whyModel', 'size']) if (!ph[k]) err(`المرحلة ${ph.id} بلا حقل ${k}`);
    // estimate باقٍ بقيمة «بلا تقدير زمني» لأن نسخ الأدوات القديمة في worktrees قائمة تشترطه حين تفحص main؛ ولا يُعرض.
    if (/يوم|أيام|أسبوع|أسابيع|ساعة|ساعات|شهر|أشهر/.test(ph.estimate || '')) err(`المرحلة ${ph.id} فيها تقدير زمني؛ الخطة بلا تقديرات بالأيام أو الأسابيع`);
  }
  const wseen = new Set();
  for (const w of plan.waves) {
    if (!/^W\d+$/.test(w.id)) err(`معرّف موجة بصيغة غير صحيحة: ${w.id}`);
    if (wseen.has(w.id)) err(`معرّف موجة مكرر: ${w.id}`);
    wseen.add(w.id);
    if (!w.phases?.length) err(`الموجة ${w.id} بلا مراحل`);
    if (!w.gate?.commands?.length) err(`الموجة ${w.id} بلا أوامر بوابة`);
    for (const id of w.phases || []) {
      const ph = phaseById[id];
      if (!ph) err(`الموجة ${w.id} تذكر مرحلة غير موجودة: ${id}`);
      else if (ph.wave !== w.id) err(`الموجة ${w.id} تذكر ${id} وموجتها ${ph.wave}`);
    }
    if (w.gate?.decision && !gateById[w.gate.decision]) err(`الموجة ${w.id} تحسم بوابة غير موجودة: ${w.gate.decision}`);
  }
  for (const ph of plan.phases) {
    const w = waveById[ph.wave];
    if (!w) err(`المرحلة ${ph.id} في موجة غير موجودة: ${ph.wave}`);
    else if (!w.phases.includes(ph.id)) err(`المرحلة ${ph.id} غير مذكورة في ترتيب دمج ${ph.wave}`);
  }

  // الاعتماديات: يجب أن تسبق موجتُها موجةَ المرحلة، فلا توازٍ مع اعتمادية ولا دورات
  for (const ph of plan.phases) {
    for (const d of ph.dependsOn || []) {
      const dep = phaseById[d];
      if (!dep) err(`${ph.id} تعتمد على مرحلة غير موجودة: ${d}`);
      else if (waveIndex[dep.wave] >= waveIndex[ph.wave]) err(`${ph.id} تعتمد على ${d} في الموجة نفسها أو بعدها؛ لا يُوازى عمل مع اعتماديته`);
    }
    for (const g of ph.requiresGates || []) if (!gateById[g]) err(`${ph.id} تشترط بوابة غير موجودة: ${g}`);
  }
  for (const g of plan.gates || []) {
    const ph = phaseById[g.phase];
    if (!ph) err(`البوابة ${g.id} تتبع مرحلة غير موجودة: ${g.phase}`);
    else if (ph.wave !== g.wave) err(`البوابة ${g.id}: المرحلة ${g.phase} ليست في ${g.wave}`);
    if (!waveById[g.wave]?.gate?.decision) warn(`البوابة ${g.id} لا تذكرها الموجة ${g.wave} في gate.decision`);
    const later = plan.phases.filter((p) => waveIndex[p.wave] > waveIndex[g.wave]);
    const guarded = later.filter((p) => (p.requiresGates || []).includes(g.id));
    if (!guarded.length) warn(`لا مرحلة بعد ${g.wave} تشترط البوابة ${g.id}`);
  }

  // المتطلبات ومعايير القبول
  const reqIds = new Set();
  const groups = new Set((reqs.groups || []).map((g) => g.id));
  for (const r of reqs.requirements || []) {
    if (reqIds.has(r.id)) err(`متطلب مكرر: ${r.id}`, 'plan/requirements.json');
    reqIds.add(r.id);
    if (!groups.has(r.group)) err(`المتطلب ${r.id} في مجموعة غير معرّفة: ${r.group}`, 'plan/requirements.json');
  }
  const covered = new Set();
  const acSeen = new Set();
  for (const ph of plan.phases) {
    if (!ph.acceptance?.length) err(`المرحلة ${ph.id} بلا معايير قبول`);
    const fromAc = new Set();
    for (const ac of ph.acceptance || []) {
      if (!ac.id?.startsWith(`${ph.id}-AC`)) err(`معيار قبول بمعرّف لا يبدأ بـ${ph.id}-AC: ${ac.id}`);
      if (acSeen.has(ac.id)) err(`معيار قبول مكرر: ${ac.id}`);
      acSeen.add(ac.id);
      if (!VERIFY.includes(ac.verify)) err(`طريقة تحقق غير معروفة في ${ac.id}: ${ac.verify}`);
      if (!ac.req?.length) err(`المعيار ${ac.id} لا يرتبط بأي متطلب`);
      for (const r of ac.req || []) {
        if (!reqIds.has(r)) err(`المعيار ${ac.id} يذكر متطلبًا غير موجود: ${r}`);
        covered.add(r);
        fromAc.add(r);
      }
    }
    for (const r of ph.requirements || []) {
      if (!reqIds.has(r)) err(`المرحلة ${ph.id} تذكر متطلبًا غير موجود: ${r}`);
      if (!fromAc.has(r)) warn(`المرحلة ${ph.id} تذكر ${r} ولا معيار قبول فيها يغطيه`);
    }
    for (const r of fromAc) if (!(ph.requirements || []).includes(r)) warn(`معايير ${ph.id} تغطي ${r} وهو غير مذكور في متطلباتها`);
  }
  for (const r of reqIds) if (!covered.has(r)) err(`المتطلب ${r} بلا معيار قبول في أي مرحلة`, 'plan/requirements.json');

  // الملكية
  for (const s of plan.shared || []) {
    if (!validPattern(s.path)) err(`نمط ملف مشترك غير صالح: ${s.path}`);
    for (const id of s.phaseOwners || []) if (!phaseById[id]) err(`الملف المشترك ${s.path} يذكر مرحلة غير موجودة: ${id}`);
  }
  for (const ph of plan.phases) {
    for (const p of [...(ph.owns || []), ...(ph.fixScope || [])]) if (!validPattern(p)) err(`نمط ملكية غير صالح في ${ph.id}: ${p}`);
    for (const p of ph.owns || []) {
      const containing = (plan.shared || [])
        .filter((s) => within(p, s.path))
        .sort((a, b) => patBase(b.path).length - patBase(a.path).length);
      const top = containing[0];
      if (top && !(top.phaseOwners || []).includes(ph.id)) {
        err(`${ph.id} تملك ${p} وهو ضمن الملف المشترك ${top.path} الذي لا يجوز لها امتلاكه`);
      }
      for (const s of plan.shared || []) {
        if (s === top || !within(s.path, p)) continue;
        if (!(s.phaseOwners || []).includes(ph.id)) err(`${ph.id} تملك ${p} وهو يشمل الملف المشترك ${s.path} الذي لا يجوز لها امتلاكه`);
      }
    }
  }
  for (const w of plan.waves) {
    const list = w.phases.map((id) => phaseById[id]).filter(Boolean);
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        for (const a of list[i].owns || []) {
          for (const b of list[j].owns || []) {
            if (overlap(a, b)) err(`تقاطع ملكية في ${w.id}: ${list[i].id} (${a}) و${list[j].id} (${b})`);
          }
        }
      }
    }
  }
  return out;
}

export function validatePhaseDoc(plan, ph, md, where) {
  const out = [];
  const err = (text) => out.push({ level: 'error', text, where });
  if (md == null) {
    err(`ملف المرحلة ${ph.id} غير موجود`);
    return out;
  }
  if (!md.startsWith(`# ${ph.id} — `)) err(`عنوان ملف ${ph.id} يجب أن يبدأ بـ«# ${ph.id} — »`);
  const sec = sections(md);
  for (const s of REQUIRED_SECTIONS) if (!(s in sec)) err(`ملف ${ph.id} بلا قسم «${s}»`);
  const scope = subsections(sec['النطاق'] || '');
  for (const s of ['داخل النطاق', 'خارج النطاق']) if (!(s in scope)) err(`قسم النطاق في ${ph.id} بلا «${s}»`);
  for (const g of ['meta', 'owns', 'acceptance']) if (!hasGen(md, g)) err(`ملف ${ph.id} بلا كتلة مولّدة tj:gen:${g}`);
  out.push(...validateStatusBlock(plan, ph, readBlock(md, 'tj-status'), where));
  return out;
}

export function validateStatusBlock(plan, ph, block, where) {
  const out = [];
  const err = (text) => out.push({ level: 'error', text, where });
  if (!block.ok) {
    err(`${ph.id}: ${block.error}`);
    return out;
  }
  const s = block.data;
  if (s.phase !== ph.id) err(`كتلة الحالة في ملف ${ph.id} تذكر مرحلة أخرى: ${s.phase}`);
  if (!STATUS.includes(s.status)) err(`${ph.id}: حالة غير معروفة «${s.status}»`);
  if (s.outcome != null && !OUTCOMES.includes(s.outcome)) err(`${ph.id}: نتيجة غير معروفة «${s.outcome}»`);
  if (s.outcome != null && !ph.outcome) err(`${ph.id}: النتيجة outcome لمراحل البوابات فقط`);
  if (typeof s.resume !== 'string' || !s.resume.trim()) err(`${ph.id}: نقطة الاستئناف resume فارغة`);
  if (s.status === 'blocked' && !s.blocker) err(`${ph.id}: متعطلة بلا سبب في blocker`);
  for (const k of ['checks', 'evidence', 'sharedRequests']) if (!Array.isArray(s[k])) err(`${ph.id}: الحقل ${k} يجب أن يكون قائمة`);
  if (s.acceptance == null || typeof s.acceptance !== 'object' || Array.isArray(s.acceptance)) {
    err(`${ph.id}: الحقل acceptance يجب أن يكون كائنًا`);
  } else {
    const ids = new Set((ph.acceptance || []).map((a) => a.id));
    for (const [k, v] of Object.entries(s.acceptance)) {
      if (!ids.has(k)) err(`${ph.id}: نتيجة لمعيار غير موجود ${k}`);
      if (!v || !RESULTS.includes(v.result)) err(`${ph.id}: نتيجة غير معروفة للمعيار ${k}`);
    }
  }
  if (['ready', 'integrating', 'verified'].includes(s.status)) {
    if (!s.commit) err(`${ph.id}: الحالة «${s.status}» تحتاج commit آخر التزام عمل`);
    const ids = (ph.acceptance || []).map((a) => a.id);
    const missing = ids.filter((id) => !s.acceptance?.[id]);
    if (missing.length) err(`${ph.id}: الحالة «${s.status}» ومعايير بلا نتيجة: ${missing.join('، ')}`);
    if (ph.outcome && !s.outcome) err(`${ph.id}: مرحلة بوابة سُلّمت بلا outcome`);
  }
  return out;
}

export function validateWaveDoc(plan, w, md, where) {
  const out = [];
  const err = (text) => out.push({ level: 'error', text, where });
  if (md == null) {
    err(`سجل الموجة ${w.id} غير موجود`);
    return out;
  }
  if (!hasGen(md, 'wave')) err(`سجل ${w.id} بلا كتلة مولّدة tj:gen:wave`);
  const b = readBlock(md, 'tj-wave');
  if (!b.ok) {
    err(`${w.id}: ${b.error}`);
    return out;
  }
  if (b.data.wave !== w.id) err(`كتلة سجل ${w.id} تذكر موجة أخرى: ${b.data.wave}`);
  if (!WAVE_STATUS.includes(b.data.status)) err(`${w.id}: حالة موجة غير معروفة «${b.data.status}»`);
  if (b.data.decision && !['open', 'closed'].includes(b.data.decision.state)) err(`${w.id}: حالة قرار البوابة يجب أن تكون open أو closed`);
  return out;
}

export function validateDocs(plan, read) {
  const out = [];
  for (const ph of plan.phases) out.push(...validatePhaseDoc(plan, ph, read(phaseDoc(plan, ph)), phaseDoc(plan, ph)));
  for (const w of plan.waves) out.push(...validateWaveDoc(plan, w, read(waveDoc(plan, w)), waveDoc(plan, w)));
  const rb = read(RUNBOOK);
  if (rb == null) out.push({ level: 'error', text: 'دليل التشغيل غير موجود', where: RUNBOOK });
  else {
    const sec = sections(rb);
    for (const name of Object.values(RUNBOOK_SECTIONS)) {
      if (!(name in sec)) out.push({ level: 'error', text: `دليل التشغيل بلا قسم «${name}» (تستعمله البرومبتات)`, where: RUNBOOK });
    }
  }
  return out;
}
