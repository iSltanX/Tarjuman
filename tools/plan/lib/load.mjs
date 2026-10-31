// تحميل الخطة من مصدر: ملفات مجلد، أو مرجع Git (مثل main) دون لمس الشجرة.
import path from 'node:path';
import { readText, fill } from './util.mjs';
import { show } from './git.mjs';

export const fsReader = (root) => (rel) => readText(path.join(root, rel));
export const gitReader = (root, ref) => (rel) => show(root, ref, rel);

export function loadPlan(read) {
  const planText = read('plan/plan.json');
  if (planText == null) throw new Error('plan/plan.json غير موجود');
  let plan;
  try {
    plan = JSON.parse(planText);
  } catch (e) {
    throw new Error(`plan/plan.json ليس JSON صالحًا: ${e.message}`);
  }
  const reqText = read('plan/requirements.json');
  let reqs = { groups: [], requirements: [] };
  if (reqText != null) {
    try {
      reqs = JSON.parse(reqText);
    } catch (e) {
      throw new Error(`plan/requirements.json ليس JSON صالحًا: ${e.message}`);
    }
  }
  return { plan, reqs };
}

export function indexPlan(plan) {
  const phaseById = Object.fromEntries(plan.phases.map((p) => [p.id, p]));
  const waveById = Object.fromEntries(plan.waves.map((w) => [w.id, w]));
  const waveIndex = Object.fromEntries(plan.waves.map((w, i) => [w.id, i]));
  const gateById = Object.fromEntries((plan.gates || []).map((g) => [g.id, g]));
  return { phaseById, waveById, waveIndex, gateById };
}

export const phaseDoc = (plan, ph) => `${plan.conventions.phaseDocs}/${ph.id}-${ph.slug}.md`;
export const waveDoc = (plan, w) => `${plan.conventions.waveDocs}/${w.id}.md`;
export const branchOf = (plan, ph) => fill(plan.conventions.branch, ph);
export const worktreeOf = (plan, ph) => fill(plan.conventions.worktree, ph);
export const baseTagOf = (plan, waveId) => fill(plan.conventions.baseTag, { wave: waveId });
export const integrationOf = (plan, waveId) => fill(plan.conventions.integrationBranch, { wave: waveId });
export const evidenceOf = (plan, ph) => fill(plan.conventions.evidence, ph);
export const phaseCommand = (plan, ph) => fill(plan.conventions.phaseCommand, ph);
export const waveCommand = (plan, waveId) => fill(plan.conventions.waveCommand, { wave: waveId });
export const RUNBOOK = 'docs/delivery/runbook.md';
export const WAVES_DOC = 'docs/delivery/waves.md';
export const REQ_MAP = 'docs/requirements-map.md';

export function nextWaveId(plan, waveId) {
  const i = plan.waves.findIndex((w) => w.id === waveId);
  return i >= 0 && i + 1 < plan.waves.length ? plan.waves[i + 1].id : null;
}

export function parallelOf(plan, ph) {
  const w = plan.waves.find((x) => x.id === ph.wave);
  return w ? w.phases.filter((id) => id !== ph.id) : [];
}
