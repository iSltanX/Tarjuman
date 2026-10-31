// أدوات مشتركة لأدوات الخطة: الملفات، والوقت، والكتل المضمّنة في Markdown، وأنماط الملكية.
import fs from 'node:fs';
import path from 'node:path';

export const STATUS = ['planned', 'in_progress', 'blocked', 'ready', 'integrating', 'verified'];
export const WAVE_STATUS = ['waiting', 'merging', 'blocked', 'verified'];
export const OUTCOMES = ['success', 'partial', 'fail'];
export const RESULTS = ['pass', 'fail', 'partial', 'pending', 'n/a'];
export const VERIFY = ['حي', 'آلي', 'آلي + حي', 'بصري', 'مراجعة'];

export const PHASE_LABEL = {
  waiting: 'مخططة',
  available: 'متاحة للبدء',
  in_progress: 'جارية',
  blocked: 'متعطلة',
  ready: 'جاهزة للدمج',
  integrating: 'قيد الدمج',
  verified: 'مدمجة ومتحققة',
};
export const WAVE_LABEL = {
  waiting: 'لم تُفتح',
  open: 'مفتوحة',
  merging: 'قيد الدمج',
  blocked: 'متعطلة',
  verified: 'مغلقة ومتحققة',
};
export const GATE_LABEL = {
  pending: 'لم يحن',
  open: 'مفتوحة',
  awaiting: 'بانتظار قرار سلطان',
  closed: 'مغلقة بقرار سلطان',
};
export const OUTCOME_LABEL = { success: 'نجاح', partial: 'جزئي', fail: 'فشل' };
export const RESULT_LABEL = { pass: 'ناجح', fail: 'فاشل', partial: 'جزئي', pending: 'لم يُثبت', 'n/a': 'لا ينطبق' };
export const SOURCE_LABEL = {
  main: 'من main',
  integration: 'من فرع التكامل',
  worktree: 'من worktree الجلسة (حي، قد يكون غير ملتزم)',
  branch: 'من رأس فرع المرحلة',
  fs: 'من الملفات مباشرة',
};

export const REQUIRED_SECTIONS = [
  'الهدف',
  'النطاق',
  'المهام',
  'الاعتماديات',
  'الملفات والمخرجات المتوقعة',
  'معايير القبول والاختبارات',
  'المخاطر',
  'الحالة ونقطة الاستئناف',
  'سجل التنفيذ',
  'تقرير التسليم',
];
export const RUNBOOK_SECTIONS = {
  phaseRole: 'دور: جلسة مرحلة',
  waveRole: 'دور: منسّق الموجة',
  phaseReport: 'تقرير التسليم',
  waveReport: 'تقرير الموجة',
  live: 'الاختبارات الحية وما يحتاجه سلطان',
};

export function readText(file) {
  try {
    return fs.readFileSync(file, 'utf8');
  } catch {
    return null;
  }
}

export function atomicWrite(file, content) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = path.join(path.dirname(file), `.${path.basename(file)}.${process.pid}.${Date.now()}.tmp`);
  fs.writeFileSync(tmp, content);
  fs.renameSync(tmp, file);
}

const pad = (n) => String(n).padStart(2, '0');

export function nowIso(d = new Date()) {
  const off = -d.getTimezoneOffset();
  const sign = off >= 0 ? '+' : '-';
  const ao = Math.abs(off);
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T` +
    `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}${sign}${pad(Math.floor(ao / 60))}:${pad(ao % 60)}`
  );
}

// يستبدل {key} بقيمها، ويترك المجهول كما هو.
export function fill(template, vars) {
  return String(template).replace(/\{(\w+)\}/g, (m, k) => (vars[k] == null ? m : String(vars[k])));
}

// ---------- كتل JSON المضمّنة: ```json tj-status ... ``` ----------

const fenceRe = (kind) => new RegExp('```json ' + kind + '\\n([\\s\\S]*?)\\n```');

export function readBlock(md, kind) {
  if (md == null) return { ok: false, error: 'الملف غير موجود' };
  const m = md.match(fenceRe(kind));
  if (!m) return { ok: false, error: `لا توجد كتلة ${kind}` };
  try {
    return { ok: true, data: JSON.parse(m[1]) };
  } catch (e) {
    return { ok: false, error: `كتلة ${kind} ليست JSON صالحًا: ${e.message}` };
  }
}

export function writeBlock(md, kind, data) {
  const re = fenceRe(kind);
  if (!re.test(md)) throw new Error(`لا توجد كتلة ${kind} في الملف`);
  return md.replace(re, () => '```json ' + kind + '\n' + JSON.stringify(data, null, 2) + '\n```');
}

// ---------- الكتل المولّدة: <!-- tj:gen:name:start --> ... <!-- tj:gen:name:end --> ----------

const genRe = (name) => new RegExp(`(<!-- tj:gen:${name}:start -->)([\\s\\S]*?)(<!-- tj:gen:${name}:end -->)`);

export function hasGen(md, name) {
  return genRe(name).test(md);
}

export function getGen(md, name) {
  const m = md.match(genRe(name));
  return m ? m[2].trim() : null;
}

export function setGen(md, name, content) {
  return md.replace(genRe(name), (_, start, __, end) => `${start}\n${content.trim()}\n${end}`);
}

export function stripGen(text) {
  return String(text || '')
    .replace(/<!-- tj:gen:[\w-]+:start -->[\s\S]*?<!-- tj:gen:[\w-]+:end -->/g, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .trim();
}

// ---------- أقسام Markdown حسب العناوين، مع تجاهل ما داخل الأسوار ----------

function splitByHeading(md, marker) {
  const out = {};
  let cur = null;
  let buf = [];
  let fenced = false;
  for (const line of String(md || '').split('\n')) {
    if (/^```/.test(line)) fenced = !fenced;
    if (!fenced && line.startsWith(marker + ' ')) {
      if (cur !== null) out[cur] = buf.join('\n').trim();
      cur = line.slice(marker.length + 1).trim();
      buf = [];
      continue;
    }
    if (cur !== null) buf.push(line);
  }
  if (cur !== null) out[cur] = buf.join('\n').trim();
  return out;
}

export const sections = (md) => splitByHeading(md, '##');
export const subsections = (md) => splitByHeading(md, '###');

// ---------- أنماط الملكية: مسار ملف بعينه، أو مجلد ينتهي بـ/** ----------

export const isDirPattern = (p) => p.endsWith('/**');
export const patBase = (p) => (isDirPattern(p) ? p.slice(0, -3) : p);

export function validPattern(p) {
  if (typeof p !== 'string' || !p || p.startsWith('/') || p.includes('..') || p.includes('\\')) return false;
  if (!p.includes('*')) return true;
  return isDirPattern(p) && !patBase(p).includes('*');
}

export function matches(file, p) {
  if (isDirPattern(p)) {
    const b = patBase(p);
    return file === b || file.startsWith(b + '/');
  }
  return file === p;
}

// هل النمط a داخل النمط b؟
export function within(a, b) {
  if (isDirPattern(b)) {
    const bb = patBase(b);
    const ab = patBase(a);
    return ab === bb || ab.startsWith(bb + '/');
  }
  return !isDirPattern(a) && a === b;
}

export const overlap = (a, b) => within(a, b) || within(b, a);

export function uniq(list) {
  return [...new Set(list)];
}
