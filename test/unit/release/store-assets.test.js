// فحص مواد المتاجر (جولة النشر T6): الحقول المعلّمة تُقرأ من store/*.md وتُقاس بحدود T1، وPNG يُفك بلا اعتماديات، والصورة
// تُقاس بمقاسها وشفافيتها. والمواد المتتبَّعة نفسها تجتاز الفحص كاملًا.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deflateSync } from 'node:zlib';
import { AMO_TAGS, FIELD_RULES, checkField, checkImage, checkStore, decodePng, parseFields } from '../../../scripts/release/store-assets.mjs';

const MANIFEST = { name: 'ترجمان — ترجمتك فوق الفيديو', description: 'وصف قصير' };

/** PNG صغير RGBA بمرشّح 0 لكل سطر: fill(x, y) يعيد [r, g, b, a]. */
function png(w, h, fill, { rgb = false } = {}) {
  const ch = rgb ? 3 : 4;
  const raw = Buffer.alloc((w * ch + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * ch + 1)] = 0;
    for (let x = 0; x < w; x++) {
      const px = fill(x, y);
      for (let c = 0; c < ch; c++) raw[y * (w * ch + 1) + 1 + x * ch + c] = px[c];
    }
  }
  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    return Buffer.concat([len, Buffer.from(type, 'latin1'), data, Buffer.alloc(4)]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = rgb ? 2 : 6;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

test('parseFields: كل كتلة text بعد تعليق field تُقرأ بمعرّفها ونصها كما هو', () => {
  const md = 'مقدمة\n\n<!-- field: amo.slug -->\n```text\ntarjuman\n```\n\nنص\n<!-- field: amo.tags -->\n```text\nyoutube\n```\n';
  assert.deepEqual(parseFields(md), [{ id: 'amo.slug', text: 'tarjuman' }, { id: 'amo.tags', text: 'youtube' }]);
});

test('checkField: الطول بنقاط الترميز، والرابط الممنوع، ومطابقة البيان', () => {
  assert.deepEqual(checkField({ id: 'manifest.name', text: MANIFEST.name }, MANIFEST), []);
  assert.match(checkField({ id: 'manifest.name', text: 'ترجمان' }, MANIFEST).join(), /لا يطابق name/);
  const en = { en: { name: 'Tarjuman', description: 'Short' } };
  assert.deepEqual(checkField({ id: 'en.manifest.name', text: 'Tarjuman' }, MANIFEST, en), [], 'الحقل الإنجليزي يقارن ببيان لغته');
  assert.match(checkField({ id: 'en.manifest.name', text: MANIFEST.name }, MANIFEST, en).join(), /لا يطابق name/);
  assert.match(checkField({ id: 'en.chromium.description', text: `${'x '.repeat(130)}` }, MANIFEST, en).join(), /إسناد علامة يوتيوب/);
  assert.match(checkField({ id: 'amo.summary', text: 'انظر https://bysltan.com' }, MANIFEST).join(), /رابط/);
  assert.match(checkField({ id: 'amo.summary', text: 'أ'.repeat(251) }, MANIFEST).join(), /طوله 251 وحده 250/);
  assert.deepEqual(checkField({ id: 'amo.summary', text: 'أ'.repeat(250) }, MANIFEST), []);
});

test('checkField: الوصف بلا متصفح آخر وبإسناد العلامة وتكرار العلامة في حده', () => {
  const ok = `${'نص '.repeat(100)}\nYouTube علامة تجارية لشركة Google LLC.`;
  assert.deepEqual(checkField({ id: 'chromium.description', text: ok }, MANIFEST), []);
  assert.match(checkField({ id: 'chromium.description', text: `${ok}\nيعمل في Chrome.` }, MANIFEST).join(), /يذكر متصفحًا: Chrome/);
  assert.match(checkField({ id: 'chromium.description', text: ok.replace('YouTube علامة', 'علامة') }, MANIFEST).join(), /إسناد علامة يوتيوب/);
  assert.match(checkField({ id: 'chromium.description', text: `${ok}\n${'يوتيوب '.repeat(5)}` }, MANIFEST).join(), /«يوتيوب» 6 مرات/);
  assert.match(checkField({ id: 'chromium.description', text: 'قصير' }, MANIFEST).join(), /أدناه 250/);
  assert.match(checkField({ id: 'amo.summary', text: `نص${String.fromCodePoint(0x200f)}` }, MANIFEST).join(), /غير مرئي/);
});

test('checkField: كلمات Edge ووسوم AMO والرابط القصير', () => {
  assert.deepEqual(checkField({ id: 'edge.searchTerms', text: 'ترجمة يوتيوب\nملف SRT' }, MANIFEST), []);
  assert.match(checkField({ id: 'edge.searchTerms', text: Array.from({ length: 8 }, (_, i) => `كلمة ${i}`).join('\n') }, MANIFEST).join(), /8 سطرًا والحد 7/);
  assert.match(checkField({ id: 'edge.searchTerms', text: 'أ'.repeat(31) }, MANIFEST).join(), /أطول من 30/);
  assert.ok(AMO_TAGS.includes('youtube'));
  assert.match(checkField({ id: 'amo.tags', text: 'subtitles' }, MANIFEST).join(), /ليس من وسوم AMO/);
  assert.match(checkField({ id: 'amo.slug', text: 'Tarjuman_1' }, MANIFEST).join(), /الأحرف اللاتينية/);
  assert.match(checkField({ id: 'x.y', text: 'نص' }, MANIFEST).join(), /حقل غير معروف/);
  assert.ok(FIELD_RULES['reviewer.amo'].max === 3000);
});

test('decodePng: يفك RGBA وRGB بمقاسهما وقيم بكسلاتهما', () => {
  const a = decodePng(png(3, 2, (x, y) => [x * 10, y * 20, 7, x === 0 ? 0 : 255]));
  assert.equal(a.width, 3);
  assert.equal(a.height, 2);
  assert.equal(a.channels, 4);
  assert.deepEqual([...a.pixels.subarray(0, 4)], [0, 0, 7, 0]);
  assert.deepEqual([...a.pixels.subarray((1 * 3 + 2) * 4, (1 * 3 + 2) * 4 + 4)], [20, 20, 7, 255]);
  const b = decodePng(png(2, 2, () => [1, 2, 3], { rgb: true }));
  assert.equal(b.channels, 3);
  assert.throws(() => decodePng(Buffer.from('not a png at all')), /ليس PNG/);
});

test('checkImage: المقاس، والصورة الكاملة بلا شفافية، وأيقونة Chrome بحشو 16 شفاف', () => {
  const opaque = decodePng(png(8, 4, () => [9, 9, 9, 255]));
  assert.deepEqual(checkImage(opaque, { w: 8, h: 4, rule: 'opaque' }), []);
  assert.match(checkImage(opaque, { w: 8, h: 5, rule: 'opaque' }).join(), /مقاسه 8×4/);
  const corner = decodePng(png(8, 4, (x, y) => [9, 9, 9, x === 0 && y === 0 ? 0 : 255]));
  assert.match(checkImage(corner, { w: 8, h: 4, rule: 'opaque' }).join(), /بكسل شفاف عند 0,0/);
  const inside = (x, y) => x >= 16 && x < 112 && y >= 16 && y < 112;
  const icon = decodePng(png(128, 128, (x, y) => (inside(x, y) ? [107, 45, 94, 255] : [0, 0, 0, 0])));
  assert.deepEqual(checkImage(icon, { w: 128, h: 128, rule: 'padded16' }), []);
  const full = decodePng(png(128, 128, () => [107, 45, 94, 255]));
  assert.match(checkImage(full, { w: 128, h: 128, rule: 'padded16' }).join(), /الحشو غير شفاف/);
});

test('مواد store/ المتتبَّعة تجتاز الفحص كاملًا: كل حقل في حده وكل صورة بمقاسها', async () => {
  const { problems, summary } = await checkStore();
  assert.deepEqual(problems, []);
  assert.equal(summary.fields.length, Object.keys(FIELD_RULES).length);
});
