#!/usr/bin/env node
// فحص ساكن للمحددات والنصوص التي تطابقها السكربتات الحية القديمة الموصى بها في docs/maintenance.md، مقابل src الحالية.
// يقرأ الملفات نصًّا فقط (لا استيراد لأي ملف من test/e2e/live/** أو test/live/**). ناتجه قائمة مرشّحات «غير موجودة حرفيًا في
// src»، تُراجع يدويًا: قد يُركَّب الصنف أو النص في src بقالب فيظهر هنا زيفًا.
//   command node docs/Audit-V2/evidence/unified/repro/A7-docs-tooling/scan-live-selectors.mjs
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../../..');
const SCRIPTS = [
  'test/e2e/live/hand.mjs', 'test/e2e/live/lib.mjs', 'test/e2e/live/list.mjs',
  'test/e2e/live/v2/hand.mjs', 'test/e2e/live/v2/journey.mjs', 'test/e2e/live/v2/ui.mjs', 'test/e2e/live/v2/lib.mjs', 'test/e2e/live/v2/ask.mjs',
];

async function walk(dir) {
  const out = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...(await walk(p)));
    else if (/\.(js|css|html)$/.test(e.name)) out.push(p);
  }
  return out;
}
const srcFiles = await walk(path.join(ROOT, 'src'));
const corpus = (await Promise.all(srcFiles.map((f) => readFile(f, 'utf8')))).join('\n');
const norm = (s) => s.replace(/\s+/g, ' ');
const corpusN = norm(corpus);

const EXT = new Set(['json', 'html', 'srt', 'mjs', 'js', 'md', 'png', 'txt', 'zip', 'css', 'woff2', 'com', 'plist', 'app', 'exe', 'srv3', 'jpg', 'webp', 'svg', 'log']);
const YT = /^(ytp-|ytd-|html5-|movie_player$|ad-showing$|ad-interrupting$|video-stream$|secondary$|below$|primary$|columns$|player$|player-container)/;
const wordIn = (tok) => new RegExp(`(^|[^\\w-])${tok.replace(/[-]/g, '\\-')}($|[^\\w-])`).test(corpus);

const report = { scripts: {}, summary: {} };
let missingSel = 0;
let missingText = 0;
for (const f of SCRIPTS) {
  const text = await readFile(path.join(ROOT, f), 'utf8');
  const lines = text.split('\n');
  const sel = new Map();
  const txt = new Map();
  lines.forEach((line, i) => {
    if (/^\s*(\/\/|\*|\/\*)/.test(line)) return;
    const lits = [...line.matchAll(/'([^'\n]*)'|"([^"\n]*)"|`([^`\n]*)`/g)].map((m) => m[1] ?? m[2] ?? m[3]);
    for (const lit of lits) {
      // محددات: صنف/معرّف/سمة data- داخل نص يشبه CSS، لا مسار ملف ولا رابط.
      if (/[.#[]/.test(lit) && !/^(https?:|chrome-extension:|moz-extension:|file:)/.test(lit)) {
        for (const m of lit.matchAll(/(?:^|[\s>+~,(:\]a-z*])\.([a-zA-Z_][\w-]*)/g)) {
          const t = m[1];
          if (EXT.has(t) || /\//.test(lit) && EXT.has(t)) continue;
          if (/^\w+\.\w+$/.test(lit) && !/^[a-z]+\.[a-z-]+$/.test(lit)) continue;
          const k = `.${t}`;
          if (!sel.has(k)) sel.set(k, []);
          sel.get(k).push(i + 1);
        }
        for (const m of lit.matchAll(/(?:^|[\s>+~,(:a-z\]]|html)#([a-zA-Z_][\w-]*)/g)) {
          const k = `#${m[1]}`;
          if (!sel.has(k)) sel.set(k, []);
          sel.get(k).push(i + 1);
        }
        for (const m of lit.matchAll(/\[(data-[\w-]+)(?:="?([^"\]]*)"?)?\]/g)) {
          const k = `[${m[1]}${m[2] && !m[2].includes('${') ? `="${m[2]}"` : ''}]`;
          if (!sel.has(k)) sel.set(k, []);
          sel.get(k).push(i + 1);
        }
      }
    }
    // نصوص عربية في سياق مطابقة.
    for (const m of line.matchAll(/(byText|openMenuOf|rowMenu|clickItem|edMenu|edClick|probe|includes|startsWith|find)\(([^\n]*)/g)) {
      for (const a of m[2].matchAll(/'([^'\n]*[؀-ۿ][^'\n]*)'/g)) {
        const t = a[1];
        if (!txt.has(t)) txt.set(t, []);
        txt.get(t).push(i + 1);
      }
    }
  });
  const selOut = [];
  for (const [k, at] of sel) {
    const name = k.replace(/^[.#]|\[|\]/g, '');
    let found;
    let note = null;
    if (k.startsWith('[')) {
      const [attr, val] = name.split('=');
      const ds = attr.replace(/^data-/, '').replace(/-([a-z])/g, (_, c) => c.toUpperCase());
      const attrHit = corpus.includes(attr) || new RegExp(`dataset\\.${ds}\\b|['"]${attr}['"]`).test(corpus);
      const valHit = val ? corpus.includes(val.replace(/"/g, '')) : true;
      found = attrHit && valHit;
      if (!attrHit) note = 'السمة غير موجودة';
      else if (!valHit) note = 'القيمة غير موجودة';
    } else if (YT.test(name)) {
      found = true;
      note = 'يوتيوب';
    } else {
      found = wordIn(name);
    }
    if (!found) missingSel++;
    selOut.push({ sel: k, lines: at.slice(0, 6), found, note });
  }
  const txtOut = [];
  for (const [t, at] of txt) {
    const found = corpusN.includes(norm(t));
    if (!found) missingText++;
    txtOut.push({ text: t, lines: at.slice(0, 6), found });
  }
  report.scripts[f] = { selectorsMissing: selOut.filter((x) => !x.found), selectorsChecked: selOut.length, textsMissing: txtOut.filter((x) => !x.found), textsChecked: txtOut.length };
}
report.summary = { missingSel, missingText };
console.log(JSON.stringify(report, null, 1));
