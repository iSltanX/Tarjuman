#!/usr/bin/env node
// إشعارات الأطراف الثالثة لترجمان (جولة النشر T4، docs/store-release.md): يولّد THIRD_PARTY_NOTICES.txt في جذر المستودع من مصادره
// الحرفية في ترجمان نفسه، لا من نص يُكتب بيد: رخص الخطوط المضمّنة في src/ui/fonts (بقائمتي subtitle-fonts.js وui-fonts.js)،
// وترخيص Lucide المنسوخ حرفيًا في src/ui/lucide-LICENSE.txt لأيقونات الواجهة، وترخيص esbuild لدوالّه المساعدة التي يدرجها في
// الحزمة، وأدوات البناء والفحص بإصداراتها في package-lock.json. ولا يضيف ترخيصًا لترجمان نفسه (ذلك في LICENSE).
// ويُنسخ الملف إلى جذر كل حزمة (scripts/build.mjs)، ويتحقق التدقيق من وجوده وتغطيته (scripts/release/audit.mjs).
//   node scripts/release/notices.mjs [--check]   (--check يفشل إن اختلف الملف المتتبَّع عمّا يولّده)
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SUBTITLE_FONT_LIST } from '../../src/ui/subtitle-fonts.js';
import { UI_FONT_LIST } from '../../src/ui/ui-fonts.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const NOTICES_FILE = 'THIRD_PARTY_NOTICES.txt';
export const LUCIDE_LICENSE = 'src/ui/lucide-LICENSE.txt';
const OFL_MARK = 'This Font Software is licensed under the SIL Open Font License, Version 1.1.';

/** اسم كل خط ودوره في ترجمان، بمعرّفه في القائمتين؛ وخط بلا صف هنا يُفشل التوليد فلا يُشحن خط بلا نسبة. */
const FONT_META = Object.freeze({
  almarai: { name: 'Almarai', role: 'default subtitle font over the video, and the interface body text' },
  'noto-sans-arabic': { name: 'Noto Sans Arabic', role: 'subtitle font over the video' },
  tajawal: { name: 'Tajawal', role: 'subtitle font over the video' },
  markazi: { name: 'Markazi Text', role: 'subtitle font over the video' },
  cairo: { name: 'Cairo', role: 'interface headings' },
});

/**
 * أيقونات الواجهة من Lucide، بمقارنة مساراتها بأصول Lucide في مستودعه (lucide-icons/lucide، الفرع main والوسوم 0.200.0
 * و0.300.0 و0.400.0، في 2026-11-04؛ الدليل docs/evidence/T4). اسم ترجمان ← اسم Lucide. «unchanged»: الشكل نفسه (وإن كُتب الخط
 * أو المضلّع مسارًا)، و«adapted»: مأخوذة ومعدّلة. وما لم يُعثر له على مقابل في Lucide في ORIGINAL_ICONS.
 */
export const LUCIDE_ICONS = Object.freeze({
  'src/ui/icons.js': Object.freeze({
    unchanged: {
      info: 'info', warning: 'triangle-alert', success: 'circle-check-big', danger: 'circle-x', library: 'library',
      settings: 'settings-2', external: 'external-link', edit: 'pencil', replace: 'refresh-cw', download: 'download',
      upload: 'upload', chevron: 'chevron-down', copy: 'copy', check: 'check', more: 'ellipsis', search: 'search',
      restore: 'rotate-ccw', clipboard: 'clipboard', alert: 'circle-alert', x: 'x', play: 'play', video: 'video',
      folder: 'folder', clock: 'clock', shield: 'shield', activity: 'activity', plus: 'plus',
    },
    adapted: { editor: 'file-text', trash: 'trash-2', type: 'type', sliders: 'sliders-vertical', 'hard-drive': 'hard-drive', list: 'list', captions: 'captions' },
  }),
  'src/player/panel/dom.js': Object.freeze({ unchanged: { minus: 'minus', 'eye-off': 'eye-off', 'arrow-up': 'arrow-up', 'arrow-down': 'arrow-down' }, adapted: {} }),
  'src/pages/editor/icons.js': Object.freeze({ unchanged: { arrow: 'arrow-right' }, adapted: { split: 'scissors' } }),
  'src/pages/popup/icons.js': Object.freeze({ unchanged: {}, adapted: { 'eye-off': 'eye-off' } }),
  'src/player/controls/glyphs.js': Object.freeze({ unchanged: {}, adapted: { flag: 'flag' } }),
});
/** أيقونات رُسمت لترجمان: لا مقابل لها في Lucide بالمقارنة نفسها. */
export const ORIGINAL_ICONS = Object.freeze({
  'src/ui/icons.js': ['screen', 'layers'],
  'src/pages/editor/icons.js': ['flag', 'merge'],
  'src/player/controls/icons.js': ['download', 'upload', 'panel', 'minus', 'plus'],
});

const rule = (title) => `\n${'='.repeat(78)}\n${title}\n${'='.repeat(78)}\n`;
const read = (rel) => readFileSync(path.join(ROOT, rel), 'utf8').replace(/\r\n/g, '\n').trimEnd();

/** الخطوط المشحونة بملف رخصة واحد لكل خط (المراعي يخدم الترجمة والواجهة بملفيه نفسيهما). */
export function shippedFonts() {
  const byLicense = new Map();
  for (const f of [...SUBTITLE_FONT_LIST, ...UI_FONT_LIST]) {
    if (!FONT_META[f.id]) throw new Error(`خط بلا نسبة في notices.mjs: ${f.id}`);
    const entry = byLicense.get(f.license) ?? { id: f.id, ...FONT_META[f.id], license: f.license, files: new Set() };
    for (const file of Object.values(f.files)) entry.files.add(file);
    byLicense.set(f.license, entry);
  }
  return [...byLicense.values()].map((e) => ({ ...e, files: [...e.files].sort() }));
}

/** ما في package-lock.json لاعتمادية تطوير، وترخيصها من حزمتها المثبتة. */
function tool(name) {
  const lock = JSON.parse(read('package-lock.json'));
  const entry = lock.packages[`node_modules/${name}`];
  if (!entry) throw new Error(`${name} غائب عن package-lock.json`);
  const meta = JSON.parse(read(`node_modules/${name}/package.json`));
  const repo = String(meta.homepage ?? meta.repository?.url ?? '').replace(/^git\+/, '').replace(/\.git$/, '');
  return { name, version: entry.version, license: meta.license, repo };
}

export function generate() {
  const out = [];
  const pkg = JSON.parse(read('package.json'));
  out.push('THIRD-PARTY NOTICES — Tarjuman (ترجمان)');
  out.push('');
  out.push('Tarjuman is a browser extension by Sultan (BySultan) — https://bysltan.com');
  out.push('This file lists the third-party works that Tarjuman includes, with their copyright holders and licenses.');
  out.push("They are not the work of the Tarjuman author and keep their own licenses. Tarjuman's own code, text, design");
  out.push('and logo are not offered under any of these licenses; see LICENSE in the source.');
  out.push('Generated by scripts/release/notices.mjs from the license files in the Tarjuman repository and package-lock.json.');

  out.push(rule('PART 1 — Included in the extension package'));
  out.push('1.1 Fonts. Each font is bundled unmodified, and its own license file ships next to it in the package.');
  let oflBody = null;
  for (const font of shippedFonts()) {
    const text = read(`src/${font.license}`);
    const at = text.indexOf(OFL_MARK);
    if (at < 0) throw new Error(`${font.license}: ليس نص SIL OFL 1.1`);
    oflBody ??= text.slice(at);
    out.push('');
    out.push(`* ${font.name} — ${font.files.join(', ')} — used as: ${font.role}`);
    out.push(`  ${text.slice(0, at).trim().split('\n').join('\n  ')}`);
    out.push(`  License: SIL Open Font License 1.1 (full text below; the font's own copy ships as ${font.license}).`);
  }
  out.push('');
  out.push('SIL Open Font License, Version 1.1 — full text:');
  out.push('');
  out.push(oflBody);

  out.push('');
  out.push('1.2 Icons — Lucide (ISC License), including icons that Lucide derives from Feather (MIT License).');
  out.push('Most interface icons are taken from Lucide (https://lucide.dev), some unchanged and some adapted. Tarjuman name ← Lucide name:');
  for (const [file, { unchanged, adapted }] of Object.entries(LUCIDE_ICONS)) {
    const list = (o) => Object.entries(o).map(([ours, theirs]) => (ours === theirs ? ours : `${ours} ← ${theirs}`)).join(', ');
    out.push('');
    out.push(`  ${file}`);
    if (Object.keys(unchanged).length) out.push(`    unchanged: ${list(unchanged)}`);
    if (Object.keys(adapted).length) out.push(`    adapted:   ${list(adapted)}`);
  }
  out.push('');
  out.push('Drawn for Tarjuman (no Lucide counterpart found by the comparison): ' +Object.entries(ORIGINAL_ICONS).map(([file, names]) => `${names.join(', ')} in ${file}`).join('; ') + '.');
  out.push('');
  out.push(`Lucide license, as published in the Lucide repository (copied verbatim to ${LUCIDE_LICENSE}):`);
  out.push('');
  out.push(read(LUCIDE_LICENSE));

  const esbuild = tool('esbuild');
  out.push('');
  out.push(`1.3 Bundler helpers — esbuild ${esbuild.version} (${esbuild.license}) — ${esbuild.repo}`);
  out.push('The bundled scripts are produced by esbuild, which inserts small helper functions of its own into them');
  out.push('(such as __defProp and __export). esbuild itself is not shipped.');
  out.push('');
  out.push(read('node_modules/esbuild/LICENSE.md'));

  out.push('');
  out.push('1.4 Nothing else: Tarjuman ships no third-party runtime library, no remote code and no machine-learning model.');
  out.push('Translation into Arabic is done by the user, outside the extension, with a service of their own choosing.');

  out.push(rule('PART 2 — Build and test tools (not included in the extension package)'));
  out.push('Used to build and check Tarjuman from source, and listed for attribution. Versions are the ones locked in');
  out.push('package-lock.json. npm installs them and their dependencies; Tarjuman does not distribute them.');
  out.push('');
  for (const name of Object.keys(pkg.devDependencies ?? {}).sort()) {
    const t = tool(name);
    out.push(`* ${t.name} ${t.version} — ${t.license} — ${t.repo}`);
  }
  return `${out.join('\n')}\n`;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const file = path.join(ROOT, NOTICES_FILE);
  const text = generate();
  if (process.argv.includes('--check')) {
    const current = existsSync(file) ? readFileSync(file, 'utf8') : '';
    if (current !== text) {
      console.error(`${NOTICES_FILE} لا يطابق ما يولّده scripts/release/notices.mjs؛ شغّله بلا --check`);
      process.exit(1);
    }
    console.log(`${NOTICES_FILE} مطابق`);
  } else {
    writeFileSync(file, text);
    console.log(`كُتب ${NOTICES_FILE} (${Buffer.byteLength(text)} بايت)`);
  }
}
