// البرومبت الكامل البديل للمهارتين. نص الدور وصيغ التقارير تُقرأ من دليل التشغيل نفسه، فلا يوجد نصّان يتباعدان.
import { sections, subsections, stripGen, RUNBOOK_SECTIONS } from './util.mjs';
import {
  phaseDoc, branchOf, worktreeOf, baseTagOf, integrationOf, phaseCommand, waveCommand, evidenceOf,
  parallelOf, nextWaveId,
} from './load.mjs';

const sub = (text, vars) =>
  String(text || '').replace(/‹(\w+)›/g, (m, k) => (vars[k] == null ? m : String(vars[k])));
const or = (s, fallback = '—') => (s && String(s).trim() ? String(s).trim() : fallback);

export function runbookParts(runbookMd) {
  const sec = sections(runbookMd || '');
  const pick = (name) => or(sec[name], `(القسم «${name}» غير موجود في دليل التشغيل)`);
  return {
    phaseRole: pick(RUNBOOK_SECTIONS.phaseRole),
    waveRole: pick(RUNBOOK_SECTIONS.waveRole),
    phaseReport: pick(RUNBOOK_SECTIONS.phaseReport),
    waveReport: pick(RUNBOOK_SECTIONS.waveReport),
    live: pick(RUNBOOK_SECTIONS.live),
    save: pick(RUNBOOK_SECTIONS.save),
  };
}

export function phaseSections(md) {
  const sec = sections(md || '');
  const scope = subsections(sec['النطاق'] || '');
  const clean = (s) => or(stripGen(s));
  return {
    goal: clean(sec['الهدف']),
    why: clean(sec['لماذا الآن']),
    scopeIn: clean(scope['داخل النطاق']),
    scopeOut: clean(scope['خارج النطاق']),
    tasks: clean(sec['المهام']),
    deps: clean(sec['الاعتماديات']),
    outputs: clean(sec['الملفات والمخرجات المتوقعة']),
    tests: clean(sec['معايير القبول والاختبارات']),
    risks: clean(sec['المخاطر']),
    log: clean(sec['سجل التنفيذ']),
    report: clean(sec['تقرير التسليم']),
  };
}

export function phasePrompt({ plan, root, runbook, ph, wave, state, sectionsText }) {
  const s = sectionsText;
  const vars = { ID: ph.id, WAVE: ph.wave, BRANCH: branchOf(plan, ph) };
  const acceptance = (ph.acceptance || []).map((a) => `- ${a.id} [${a.verify}] (${a.req.join('، ')}): ${a.text}`).join('\n');
  const owns = [...(ph.owns || []).map((p) => `- ${p}`), `- ${phaseDoc(plan, ph)} و${evidenceOf(plan, ph)}/`].join('\n');
  const live = ph.live
    ? `نعم. قبل فتح أي متصفح أرسل لسلطان رسالة «الاختبارات الحية» وانتظر موافقته.${ph.needsUser?.length ? ' يحتاج منه: ' + ph.needsUser.join(' · ') : ''}`
    : 'لا يلزم اختبار حي في هذه المرحلة.';
  return [
    `أنت في مستودع ترجمان المحلي: ${root}`,
    `اقرأ قبل أي عمل: CLAUDE.md، ثم docs/delivery/runbook.md (دورك وقواعده كاملة)، ثم ملف المرحلة ${phaseDoc(plan, ph)}، ثم ما يحيل إليه من docs/product-spec.md وdocs/contracts/. كل ما تكتبه لسلطان بالعربية.`,
    '',
    `المهمة: ${ph.id} — ${ph.title}`,
    `الموجة: ${wave.id} — ${wave.title} · وسم الأساس: ${baseTagOf(plan, wave.id)} · الفرع: ${branchOf(plan, ph)} · مجلد العمل: ${worktreeOf(plan, ph)}`,
    `النموذج المقترح: ${ph.model} (${ph.whyModel}) · الجهد: ${ph.effort} · الحجم: ${ph.size}`,
    `تعتمد على: ${or((ph.dependsOn || []).join('، '))} · بالتوازي مع: ${or(parallelOf(plan, ph).join('، '))} · البوابات المطلوبة: ${or((ph.requiresGates || []).join('، '))}`,
    `الحالة الآن: ${state.label} (${state.sourceLabel}) · نقطة الاستئناف: ${or(state.resume)}`,
    `الأمر المكافئ: ${phaseCommand(plan, ph)}`,
    `الاختبار الحي: ${live}`,
    '',
    'الهدف:',
    s.goal,
    '',
    'داخل النطاق:',
    s.scopeIn,
    '',
    'خارج النطاق:',
    s.scopeOut,
    '',
    'المهام:',
    s.tasks,
    '',
    'الملفات التي تملكها هذه المرحلة (لا تعدّل غيرها إلا بمسار الاستثناء):',
    owns,
    '',
    'معايير القبول (كل معيار يُثبت بدليل ويُسجَّل في كتلة tj-status):',
    acceptance,
    '',
    `الفحوص عند التسليم: ${(ph.checks || []).join(' ثم ')}`,
    '',
    'المخاطر:',
    s.risks,
    '',
    'الدور — نفّذه خطوة خطوة:',
    sub(runbook.phaseRole, vars),
    '',
    'الحفظ والدفع:',
    sub(runbook.save, vars),
    '',
    'الاختبارات الحية:',
    runbook.live,
    '',
    'صيغة تقرير التسليم:',
    sub(runbook.phaseReport, vars),
    '',
    'لا تبدأ مرحلة أخرى، ولا تدمج، ولا تدفع غير فرع مرحلتك. عند التسليم ادفع الفرع، واطبع التقرير بالعربية مع نتيجة الدفع، وتوقّف.',
  ].join('\n');
}

export function wavePrompt({ plan, root, runbook, wave, state, gate }) {
  const next = nextWaveId(plan, wave.id);
  const vars = { WAVE: wave.id, NEXT: next || 'لا شيء (الموجة الأخيرة)' };
  const phases = wave.phases
    .map((id, i) => {
      const ph = plan.phases.find((p) => p.id === id);
      return `${i + 1}. ${ph.id} — ${ph.title} (الفرع المتوقع ${branchOf(plan, ph)}؛ يُكتشف من سجلات الحالة لا من الاسم)`;
    })
    .join('\n');
  const gateLines = gate
    ? [
        '',
        `البوابة ${gate.id} — ${gate.title}:`,
        `- تُفتح عندما: ${gate.opensWhen}`,
        `- وإلا: ${gate.otherwise}`,
        '- خيارات القرار التي تعرضها على سلطان:',
        ...(gate.options || []).map((o) => `  - ${o}`),
      ]
    : [];
  return [
    `أنت في مستودع ترجمان المحلي: ${root}، في النسخة الرئيسية بلا worktree، على main.`,
    `اقرأ قبل أي عمل: CLAUDE.md، ثم docs/delivery/runbook.md (دور «منسّق الموجة» وقواعد الملكية والتقارير)، ثم docs/waves/${wave.id}.md، وdocs/delivery/waves.md. كل ما تكتبه لسلطان بالعربية.`,
    '',
    `المهمة: دمج الموجة ${wave.id} — ${wave.title} وفحصها، ثم فتح ${vars.NEXT}.`,
    `فرع التكامل: ${integrationOf(plan, wave.id)} · وسم الأساس: ${baseTagOf(plan, wave.id)} · وسم التالية: ${next ? baseTagOf(plan, next) : 'لا وسم بعد الأخيرة'}`,
    'المراحل بترتيب الدمج:',
    phases,
    `لماذا معًا: ${wave.why}`,
    `أوامر البوابة: ${wave.gate.commands.join(' ثم ')}`,
    `الدخان الحي: ${or(wave.gate.live, 'لا يلزم')}`,
    ...gateLines,
    `النموذج المقترح: ${wave.coordinatorModel} (${wave.whyModel})`,
    `الحالة الآن: ${state.label}${state.reasons?.length ? ' — ' + state.reasons.join('؛ ') : ''}`,
    `الأمر المكافئ: ${waveCommand(plan, wave.id)}`,
    '',
    'الدور — نفّذه خطوة خطوة:',
    sub(runbook.waveRole, vars),
    '',
    'الحفظ والدفع:',
    sub(runbook.save, vars),
    '',
    'الاختبارات الحية (للدخان الحي):',
    runbook.live,
    '',
    'صيغة تقرير الموجة:',
    sub(runbook.waveReport, vars),
    '',
    'لا تدفع main ولا وسمًا قبل نجاح البوابة، ولا تنشر شيئًا نشرًا عامًا. اطبع التقرير بالعربية مع نتيجة الدفع وتوقّف.',
  ].join('\n');
}
