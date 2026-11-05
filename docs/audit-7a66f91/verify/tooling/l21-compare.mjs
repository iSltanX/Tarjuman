// يقارن بصمات الملفات داخل الحزم بين تشغيلين لـstore.mjs (من ملفي -store.json)
import { readFileSync } from 'node:fs';
const [a, b] = process.argv.slice(2).map((p) => JSON.parse(readFileSync(p, 'utf8')));
for (const store of ['chrome', 'edge', 'firefox']) {
  const fa = JSON.stringify(a.packages[store].files), fb = JSON.stringify(b.packages[store].files);
  console.log(store, 'zip-equal:', a.packages[store].sha256 === b.packages[store].sha256, 'files-equal:', fa === fb, 'files:', a.packages[store].files.length);
}
console.log('node:', a.node, 'vs', b.node, '| source bytes', a.source.bytes, 'vs', b.source.bytes);
