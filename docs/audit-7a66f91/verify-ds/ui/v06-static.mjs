// تحقق مستقل ساكن وحسابي: DS-TJ-41 (عرض الشريط العلوي من قيم CSS)، وDS-TJ-48 (الألوان القسرية)، وDS-TJ-51 (h1 النافذة)،
// وملاحظات FINDINGS غير المنقولة (CSS الميت، والروابط الخارجية، وlang في الصفحات، والمناطق الحية المتداخلة).
import { T, imp, log } from './common.mjs';
import { readFileSync, readdirSync, statSync } from 'node:fs';

const src = `${T}/src`;
const read = (p) => readFileSync(`${src}/${p}`, 'utf8');
const walk = (dir) => readdirSync(dir).flatMap((f) => { const p = `${dir}/${f}`; return statSync(p).isDirectory() ? walk(p) : [p]; });
const files = walk(src).filter((p) => /\.(js|css|html)$/.test(p));

log('== DS-TJ-41: الشريط العلوي عند ≤640 ==');
{
  const base = read('ui/base.css');
  const tokens = read('ui/tokens.css');
  const px = (name) => Number(new RegExp(`--tj-${name}:\\s*(\\d+)px`).exec(tokens)[1]);
  const { LOGO_RATIO } = await imp('src/ui/logo.js');
  const inner = /\.tj-topbar__inner \{([^}]*)\}/.exec(base)[1];
  const media = /@media \(max-width: 640px\) \{([\s\S]*?)\n\}/.exec(base)[1];
  const logoW = Math.round(24 * LOGO_RATIO); // components.js:221 height 24، logo.js:38
  const brand = logoW + 2 * 2; // base.css:60 padding 0 2px
  const pad = 2 * px('space-4'); // ≤640: padding 0 var(--tj-space-4)
  const gap = px('space-3'); // ≤640: gap var(--tj-space-3)
  const navMargin = px('space-3'); // base.css:61
  const navGap = px('space-1');
  const linkFixed = 10 * 2 + 16 + 6; // base.css:64 و:67
  const fixed = pad + brand + gap + navMargin + 2 * linkFixed + navGap;
  log(`.tj-topbar__inner: ${inner.trim()}`);
  log(`  flex-wrap؟ ${/flex-wrap/.test(inner + media)} | overflow؟ ${/overflow/.test(inner)} | min-width:0 على العناصر؟ ${/tj-topbar__(brand|nav|link)[^{]*\{[^}]*min-width:\s*0/.test(base)} | .tj-topbar__end مخفي ≤640؟ ${/tj-topbar__end \{ display: none/.test(media)}`);
  log(`  الثابت دون نصي الرابطين: حشو ${pad} + الشعار ${brand} (${logoW}+4) + فجوة ${gap} + هامش التنقل ${navMargin} + رابطان ${2 * linkFixed} + فجوة ${navGap} = ${fixed}px`);
  log(`  يفيض عن 320 متى زاد نصا «المحفوظات» و«الإعدادات» (700 14px) معًا على ${320 - fixed}px؛ وقياس DeepSeek الحي 362 يعني نصين بنحو ${362 - fixed}px`);
  log(`  تعليق base.css:7 يقرر: «التمرير الأفقي يُمنع بالتخطيط نفسه (min-width: 0 والالتفاف) لا بالقص» ⇐ الشريط يخالف ذلك`);
}

log('\n== DS-TJ-48 ==');
{
  const hits = files.filter((p) => /forced-colors|prefers-contrast|forced-color-adjust/.test(readFileSync(p, 'utf8')));
  log(`ملفات فيها forced-colors أو prefers-contrast: ${hits.length}`);
  const st = read('pages/settings/settings.css');
  const hasBorder = (body) => /(^|;)\s*(border|border-(?:top|right|bottom|left|block|inline|width|style|color))\s*:/.test(body) || /(^|;)\s*outline\s*:/.test(body);
  const track = /\.st-switch__track \{([^}]*)\}/.exec(st)[1];
  const thumb = /\.st-switch__track::after \{([^}]*)\}/.exec(st)[1];
  log(`  مسار المفتاح: border أو outline؟ ${hasBorder(track)} | الإبهام: border؟ ${hasBorder(thumb)} | المدخل opacity:0؟ ${/\.st-switch__input \{[^}]*opacity: 0/.test(st)}`);
  const pstyles = (await imp('src/player/panel/styles.js')).panelCss();
  const sw = /\.switch__track \{([^}]*)\}/.exec(pstyles)?.[1] ?? '';
  log(`  مفتاح اللوحة .switch__track border؟ ${hasBorder(sw)} | ${sw.trim().slice(0, 160)}`);
  const comp = read('ui/components.css');
  log(`  المقطّعة المختارة: ${/\.tj-seg__option input:checked \+ \.tj-seg__label \{[^}]*\}/.exec(comp)[0]}`);
}

log('\n== DS-TJ-51 ==');
{
  const html = read('pages/popup/index.html');
  const js = ['view.js', 'main.js', 'entry.js', 'status.js'].map((f) => read(`pages/popup/${f}`)).join('\n');
  const heads = [...js.matchAll(/el\('(h[1-6])'/g)].map((m) => m[1]);
  log(`index.html فيه <h1>؟ ${/<h1/.test(html)} | عناوين تبنيها شيفرة النافذة: ${heads.join('، ') || 'لا شيء'} | الصفحات الأخرى: المحفوظات h1؟ ${/el\('h1'/.test(read('pages/library/view.js'))}، الإعدادات h1؟ ${/el\('h1'/.test(read('pages/settings/view.js'))}`);
}

log('\n== FINDINGS «رابعًا» ==');
{
  const users = files.filter((p) => !p.endsWith('components.css') && /tj-tipwrap|['"\s.]tj-tip['"\s]/.test(readFileSync(p, 'utf8')));
  log(`(10) .tj-tip/.tj-tipwrap مستعمل خارج components.css؟ ${users.length ? users.map((p) => p.replace(src, '')).join('، ') : 'لا (CSS ميت)'}`);
  const about = read('pages/settings/about.js');
  log(`(8) روابط «حول»: target=_blank؟ ${/target: '_blank'/.test(about)} | نص «تبويب جديد» في الاسم؟ ${/تبويب جديد|نافذة جديدة/.test(about.replace(/^\/\/.*$/gm, ''))} | الأيقونة aria-hidden (components.js:22)`);
  const langAssign = files.filter((p) => p.includes('/pages/') && /['"]lang['"]\s*:|setAttribute\('lang'|\blang:\s*'en'/.test(readFileSync(p, 'utf8')));
  log(`(9) تعيين lang في src/pages: ${langAssign.length ? langAssign.map((p) => p.replace(src, '')).join('، ') : 'لا شيء'} | .ed-row__en dir=ltr (rows.js:85) و.st-gl__source dir=ltr (glossary.js:107) بلا lang`);
  const popupMain = read('pages/popup/main.js');
  log(`(4) النافذة: notice role=status يُدرج فيه alertBox (role=alert للخطر)؟ ${/className: 'tj-popup__notice', attrs: \{ role: 'status' \}/.test(popupMain) && /notice\.replaceChildren\(alertBox/.test(popupMain)} | المشغّل: .toasts role=status aria-live وفي كل رسالة role=alert/status (layer.js:39–40 و:253)`);
  const data = read('pages/settings/data.js');
  log(`(6) تقدم النسخ الاحتياطي role=status aria-live (data.js:48)؛ ويتحدث كل ${(await imp('src/core/backup/format.js')).BACKUP_LIMITS.batch} عنصرًا (create.js:42) لا كل عنصر | حاوية نتيجة الاستعادة بلا role ولا aria-live (data.js:93)؟ ${/restoreResult = el\('div', \{ className: 'st-data__result', doc \}\)/.test(data)}`);
}
