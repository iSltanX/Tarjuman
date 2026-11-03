#!/usr/bin/env node
// مقارنة أيقونات ترجمان بأصول Lucide (جولة النشر T4): يقرأ ملفات SVG من مستودع lucide-icons/lucide عبر gh (قراءة فقط، بذاكرة
// مؤقتة خارج المستودع)، ويطابق مسارات كل أيقونة في ترجمان بمسارات Lucide في الفرع main والوسوم 0.200.0 و0.300.0 و0.400.0، فيصنّفها:
// «مطابقة كاملة» أو «جزئية» أو «بلا مقابل». النتيجة في lucide-compare.txt، ومنها LUCIDE_ICONS وORIGINAL_ICONS في
// scripts/release/notices.mjs. المطابقة نصية للمسارات وحدها: الدوائر والمستطيلات والمضلّعات التي كتبها ترجمان مسارًا لا تُطابق،
// فصُنّف بعضها يدويًا بشكله (alert وplay وmore) في notices.mjs.
//   command node docs/evidence/T4/lucide-compare.mjs [--cache <مجلد>]
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const cacheArg = process.argv.indexOf('--cache');
const CACHE = cacheArg > -1 ? path.resolve(process.argv[cacheArg + 1]) : path.join(os.tmpdir(), 'tj-lucide-cache');
mkdirSync(CACHE, { recursive: true });

const FILES = ['src/ui/icons.js', 'src/pages/popup/icons.js', 'src/pages/editor/icons.js', 'src/player/panel/dom.js', 'src/player/controls/glyphs.js', 'src/player/controls/icons.js'];
const CANDIDATES = ['info', 'triangle-alert', 'alert-triangle', 'circle-check-big', 'check-circle', 'circle-x', 'x-circle', 'file-text', 'library', 'settings-2', 'monitor', 'tv', 'external-link', 'pencil', 'refresh-cw', 'download', 'upload', 'chevron-down', 'copy', 'check', 'ellipsis', 'more-horizontal', 'trash-2', 'search', 'rotate-ccw', 'clipboard', 'circle-alert', 'alert-circle', 'x', 'play', 'video', 'folder', 'clock', 'type', 'shield', 'sliders-vertical', 'sliders', 'captions', 'hard-drive', 'activity', 'list', 'layers', 'plus', 'eye-off', 'arrow-right', 'flag', 'merge', 'split', 'minus', 'arrow-up', 'arrow-down', 'scissors', 'git-merge', 'combine', 'file'];
const REFS = ['main', '0.400.0', '0.300.0', '0.200.0'];

function svg(name, ref) {
  const file = path.join(CACHE, `${ref}__${name}.svg`);
  if (existsSync(file)) return readFileSync(file, 'utf8');
  let text = '';
  try {
    text = execFileSync('gh', ['api', `repos/lucide-icons/lucide/contents/icons/${name}.svg?ref=${ref}`, '-H', 'Accept: application/vnd.github.raw'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  } catch { /* غير موجود في هذا المرجع */ }
  writeFileSync(file, text);
  return text;
}

const lucide = new Map();
for (const ref of REFS) for (const name of CANDIDATES) {
  const ds = [...svg(name, ref).matchAll(/\sd="([^"]+)"/g)].map((m) => m[1]);
  if (ds.length) lucide.set(`${name}@${ref}`, new Set(ds));
}

const lines = [];
let total = 0;
let matched = 0;
for (const rel of FILES) {
  const icons = [];
  let cur = null;
  for (const line of readFileSync(path.join(ROOT, rel), 'utf8').split('\n')) {
    const k = /^\s{2,4}'?([a-z][a-z-]*)'?: (?:\[|\(doc\))/.exec(line);
    if (k) { cur = { name: k[1], ds: [] }; icons.push(cur); }
    if (cur) for (const m of line.matchAll(/\bd: '([^']+)'/g)) cur.ds.push(m[1]);
  }
  lines.push(`== ${rel}`);
  for (const icon of icons.filter((i) => i.ds.length)) {
    let best = null;
    for (const [key, set] of lucide) {
      const hit = icon.ds.filter((d) => set.has(d)).length;
      if (hit && (!best || hit > best.hit || (hit === best.hit && set.size === icon.ds.length))) best = { key, hit, size: set.size };
    }
    const any = icon.ds.filter((d) => [...lucide.values()].some((s) => s.has(d))).length;
    total += icon.ds.length;
    matched += any;
    const tag = !best ? 'بلا مقابل' : best.hit === icon.ds.length && best.size === icon.ds.length ? 'مطابقة كاملة' : `جزئية ${best.hit}/${icon.ds.length}`;
    lines.push(`${icon.name.padEnd(12)} ${tag}${best ? ` ← ${best.key}` : ''}`);
  }
}
lines.push('', `المسارات المطابقة حرفيًا لمسار في Lucide: ${matched}/${total}`);
console.log(lines.join('\n'));
