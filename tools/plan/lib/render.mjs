// توليد الأجزاء المشتقة من plan.json في الوثائق: بطاقات المراحل، وجداول الموجات والملكية، وخريطة المتطلبات.
// يُشغَّل على main (أو فرع التكامل) بالأمر npm run plan:render. والفحص يقارن الناتج بالموجود.
import path from 'node:path';
import { getGen, setGen, hasGen, readText, atomicWrite } from './util.mjs';
import {
  indexPlan, phaseDoc, waveDoc, branchOf, worktreeOf, baseTagOf, phaseCommand, waveCommand,
  evidenceOf, parallelOf, WAVES_DOC, REQ_MAP,
} from './load.mjs';

const code = (s) => '`' + s + '`';
const cell = (s) => String(s ?? '').replace(/\|/g, '\\|').replace(/\n+/g, ' ');
const dash = (list) => (list && list.length ? list.join(' · ') : '—');
const table = (head, rows) =>
  [`| ${head.join(' | ')} |`, `| ${head.map(() => '---').join(' | ')} |`, ...rows.map((r) => `| ${r.map(cell).join(' | ')} |`)].join('\n');

export function renderPhaseMeta(plan, ph) {
  const { waveById, gateById } = indexPlan(plan);
  const w = waveById[ph.wave];
  const order = w.phases.indexOf(ph.id) + 1;
  const gates = (ph.requiresGates || []).map((g) => `${g} (${gateById[g]?.title || ''})`);
  const rows = [
    ['الموجة', `${w.id} — ${w.title} · ترتيب الدمج ${order} من ${w.phases.length} · وسم الأساس ${code(baseTagOf(plan, w.id))}`],
    ['تعتمد على', dash(ph.dependsOn)],
    ['البوابات المطلوبة', dash(gates)],
    ['تعمل بالتوازي مع', dash(parallelOf(plan, ph))],
    ['النموذج المقترح', `${ph.model} · الجهد ${ph.effort} — ${ph.whyModel}`],
    ['الحجم والتقدير', `${ph.size} · ${ph.estimate}`],
    ['الفرع ومجلد العمل', `${code(branchOf(plan, ph))} · ${code(worktreeOf(plan, ph))}`],
    ['الأمر', `${code(phaseCommand(plan, ph))} في جلسة جديدة`],
    ['اختبار حي', ph.live ? 'نعم — يتبع «الاختبارات الحية» في دليل التشغيل' : 'لا'],
    ['المتطلبات', dash(ph.requirements)],
  ];
  if (ph.outcome) rows.push(['مرحلة بوابة', 'نعم — تسجّل outcome: نجاح أو جزئي أو فشل']);
  let out = table(['البند', 'القيمة'], rows);
  if (ph.needsUser?.length) out += '\n\n**يحتاج من سلطان:**\n\n' + ph.needsUser.map((x) => `- ${x}`).join('\n');
  return out;
}

export function renderPhaseOwns(plan, ph) {
  const lines = (ph.owns || []).map((p) => `- ${code(p)}`);
  lines.push(`- ودائمًا: ملف المرحلة ${code(phaseDoc(plan, ph))} ومجلد الأدلة ${code(evidenceOf(plan, ph) + '/')}`);
  let out = '**تملك هذه المرحلة (ولا تعدّل غيرها إلا بمسار الاستثناء):**\n\n' + lines.join('\n');
  if (ph.fixScope?.length) {
    out += `\n\n**إصلاحات تكامل موثّقة فقط في:** ${ph.fixScope.map(code).join('، ')} — كل إصلاح بالتزام مستقل وسبب مكتوب في التقرير.`;
  }
  return out;
}

export function renderPhaseAcceptance(plan, ph) {
  return table(
    ['المعيار', 'النص', 'المتطلبات', 'التحقق'],
    (ph.acceptance || []).map((a) => [a.id, a.text, a.req.join(' · '), a.verify]),
  );
}

export function renderWaveBlock(plan, w) {
  const { phaseById, gateById } = indexPlan(plan);
  const rows = w.phases.map((id, i) => {
    const ph = phaseById[id];
    return [String(i + 1), `${ph.id} — ${ph.title}`, dash(ph.dependsOn), ph.model, code(phaseCommand(plan, ph))];
  });
  let out = table(['الترتيب', 'المرحلة', 'تعتمد على', 'النموذج المقترح', 'الأمر'], rows);
  out += `\n\n- **التوازي:** ${w.phases.length > 1 ? `${w.phases.length} مراحل معًا، كلٌّ في worktree وفرع مستقلين` : 'منفردة'}`;
  out += `\n- **أوامر البوابة:** ${w.gate.commands.map(code).join(' ثم ')}`;
  if (w.gate.live) out += `\n- **الدخان الحي:** ${w.gate.live}`;
  if (w.gate.decision) out += `\n- **تحسم البوابة:** ${w.gate.decision} — ${gateById[w.gate.decision]?.title || ''}`;
  out += `\n- **المنسّق:** ${code(waveCommand(plan, w.id))} في النسخة الرئيسية بلا worktree · النموذج ${w.coordinatorModel} — ${w.whyModel}`;
  return out;
}

export function renderWavesTable(plan) {
  const { phaseById } = indexPlan(plan);
  const rows = plan.waves.map((w) => {
    const deps = [...new Set(w.phases.flatMap((id) => phaseById[id].dependsOn || []))].filter((d) => !w.phases.includes(d));
    return [
      `${w.id} — ${w.title}`,
      w.phases.join(' ← '),
      w.phases.length > 1 ? `${w.phases.length} معًا` : 'منفردة',
      dash(deps),
      w.gate.commands.join(' · ') + (w.gate.decision ? ` · تحسم ${w.gate.decision}` : ''),
      w.why,
    ];
  });
  return table(['الموجة', 'ترتيب الدمج', 'التوازي', 'تعتمد على', 'البوابة', 'لماذا معًا'], rows);
}

export function renderOwnership(plan) {
  const { phaseById } = indexPlan(plan);
  return plan.waves
    .map((w) => {
      const rows = w.phases.map((id) => {
        const ph = phaseById[id];
        const owns = (ph.owns || []).map(code).join('، ');
        return [`${ph.id} — ${ph.title}`, owns + (ph.fixScope?.length ? ` · إصلاحات موثّقة في ${ph.fixScope.map(code).join('، ')}` : '')];
      });
      return `**${w.id} — ${w.title}**\n\n` + table(['المرحلة', 'تملك'], rows);
    })
    .join('\n\n');
}

export function renderShared(plan) {
  return table(
    ['الملف', 'تملكه في موجتها', 'القاعدة'],
    (plan.shared || []).map((s) => [code(s.path), s.phaseOwners?.length ? s.phaseOwners.join(' · ') : 'المنسّق وحده', s.rule]),
  );
}

export function renderRequirementsMap(plan, reqs) {
  const byReq = {};
  for (const ph of plan.phases) {
    for (const ac of ph.acceptance || []) {
      for (const r of ac.req) (byReq[r] ||= []).push({ ph, ac });
    }
  }
  const acCount = plan.phases.reduce((n, p) => n + (p.acceptance || []).length, 0);
  const parts = [
    '# خريطة المتطلبات والمراحل ومعايير القبول',
    '',
    '> **مولّد** من [`plan/plan.json`](../plan/plan.json) و[`plan/requirements.json`](../plan/requirements.json) بالأمر `npm run plan:render`. لا تعدّله بيدك. النتيجة الحية لكل معيار (لم يُثبت، ناجح، مدمج ومتحقق) في [اللوحة](../dashboard/index.html) وكتل `tj-status`، لا هنا. قرارات النطاق في [مواصفة المنتج](product-spec.md).',
    '',
    `**الخلاصة:** ${reqs.requirements.length} متطلبًا · ${acCount} معيار قبول · ${plan.phases.length} مراحل في ${plan.waves.length} موجات. كل متطلب مرتبط بمعيار قبول واحد على الأقل، ويفرض ذلك \`npm run plan:check\`.`,
    '',
    '## المتطلبات حسب المجموعة',
  ];
  for (const g of reqs.groups) {
    const list = reqs.requirements.filter((r) => r.group === g.id);
    if (!list.length) continue;
    parts.push('', `### ${g.title}`, '');
    parts.push(
      table(
        ['المتطلب', 'النص', 'المصدر', 'المراحل', 'معايير القبول'],
        list.map((r) => {
          const links = byReq[r.id] || [];
          return [r.id, r.text, r.source || '—', dash([...new Set(links.map((x) => x.ph.id))]), dash(links.map((x) => x.ac.id))];
        }),
      ),
    );
  }
  parts.push('', '## معايير القبول حسب المرحلة');
  for (const ph of plan.phases) {
    parts.push('', `### ${ph.id} — ${ph.title} (${ph.wave})`, '');
    parts.push(renderPhaseAcceptance(plan, ph));
  }
  parts.push('', '## طرق التحقق', '');
  parts.push(
    table(
      ['الطريقة', 'المعنى'],
      [
        ['حي', 'في Brave ثم Chrome على يوتيوب الحقيقي، بالبروتوكول الحي في دليل التشغيل.'],
        ['آلي', 'اختبار في المستودع يُشغَّل بأوامر الفحص.'],
        ['آلي + حي', 'كلاهما.'],
        ['بصري', 'لقطات محفوظة في مجلد أدلة المرحلة.'],
        ['مراجعة', 'وثيقة أو تقرير يُراجع المنسّق اكتماله.'],
      ],
    ),
  );
  return parts.join('\n') + '\n';
}

// يطبّق التوليد على مجلد. write=false يعيد قائمة الملفات القديمة دون كتابة.
export function applyRender(root, plan, reqs, { write = true } = {}) {
  const changed = [];
  const update = (rel, fn) => {
    const file = path.join(root, rel);
    const before = readText(file);
    if (before == null) return;
    const after = fn(before);
    if (after !== before) {
      changed.push(rel);
      if (write) atomicWrite(file, after);
    }
  };
  const gen = (md, name, content) => (hasGen(md, name) && getGen(md, name) !== content.trim() ? setGen(md, name, content) : md);

  for (const ph of plan.phases) {
    update(phaseDoc(plan, ph), (md) => {
      let out = gen(md, 'meta', renderPhaseMeta(plan, ph));
      out = gen(out, 'owns', renderPhaseOwns(plan, ph));
      out = gen(out, 'acceptance', renderPhaseAcceptance(plan, ph));
      return out;
    });
  }
  for (const w of plan.waves) update(waveDoc(plan, w), (md) => gen(md, 'wave', renderWaveBlock(plan, w)));
  update(WAVES_DOC, (md) => {
    let out = gen(md, 'waves-table', renderWavesTable(plan));
    out = gen(out, 'ownership', renderOwnership(plan));
    out = gen(out, 'shared', renderShared(plan));
    return out;
  });
  const mapFile = path.join(root, REQ_MAP);
  const map = renderRequirementsMap(plan, reqs);
  if (readText(mapFile) !== map) {
    changed.push(REQ_MAP);
    if (write) atomicWrite(mapFile, map);
  }
  return changed;
}
