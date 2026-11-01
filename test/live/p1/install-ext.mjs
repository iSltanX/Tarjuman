#!/usr/bin/env node
// تثبيت الإضافة غير المعبأة مرة واحدة في ملف اختبار (بديل «Load unpacked» اليدوي حين يتجاهل المتصفح
// --load-extension). لا يزور أي موقع، ويُغلق المتصفح فورًا؛ الجلسات اللاحقة تُشغَّل عادية بلا أي علم تحكّم.
//   node test/live/p1/install-ext.mjs --browser chrome --profile chrome-manual --ext <مجلد>
import path from 'node:path';
import { launch, loadExtension } from '../harness/browser.mjs';

const argv = process.argv.slice(2);
const val = (k, d = null) => (argv.includes(`--${k}`) ? argv[argv.indexOf(`--${k}`) + 1] : d);
const b = await launch({ browser: val('browser', 'chrome'), profile: val('profile') });
try {
  console.log(b.version.product, JSON.stringify(await loadExtension(b.conn, path.resolve(val('ext')))));
} finally {
  await b.close();
}
