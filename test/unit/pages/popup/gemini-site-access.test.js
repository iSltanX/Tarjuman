// تحقق Gemini، الجولة الثانية، B5-أ: إذن يوتيوب مسحوب (Firefox: سحب «الوصول إلى www.youtube.com»؛ Chromium: «الوصول إلى
// المواقع» عند النقر) فلا سكربت محتوى في الصفحة، والمتصفح لا يكشف عنوان التبويب. كانت النافذة تقول «افتح فيديو… أو أعد تحميل
// صفحته» فيعيد المستخدم التحميل بلا جدوى. الآن حين لا رد: permissions.contains لأصل يوتيوب، فإن كان false فحالة «siteOff» بنص
// TJ_SITE_ACCESS_OFF يدل على إعدادات الإضافة في المتصفح، بلا زر ولا طلب إذن. وإن كان الإذن قائمًا فالحالات كما كانت.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { messageFor } from '../../../../src/core/errors/index.js';
import { YOUTUBE_MATCHES } from '../../../../src/core/model/ids.js';
import { setLocale } from '../../../../src/i18n/index.js';
import { missText, queryPopupState } from '../../../../src/pages/popup/status.js';

const YT = 'https://www.youtube.com/*';
const ARABIC = /[؀-ۿ]/;

/** تبويب نشط وهمي بلا رد من سكربت المحتوى (أو برده)، وعنوانه إن كشفه المتصفح. */
const tabsWith = ({ url, answer, reject = true } = {}) => ({
  async query() { return [{ id: 7, ...(url === undefined ? {} : { url }) }]; },
  async sendMessage() {
    if (reject) throw new Error('Could not establish connection. Receiving end does not exist.');
    return answer;
  },
});
/** permissions وهمي يسجّل ما سُئل عنه. */
const permsWith = (granted) => {
  const asked = [];
  return {
    asked,
    async contains(p) {
      asked.push(p);
      if (granted instanceof Error) throw granted;
      return granted;
    },
  };
};
const reply = () => ({
  v: 1, ok: true, watch: true, videoId: 'iG9CE55wbtY', title: 't', loading: false, english: { captured: [], saved: [] }, arabic: null,
  view: { displayOffsetMs: 0, displayMode: 'ar' }, mounted: { overlay: 'mounted', controls: 'mounted' },
});

test('B5-أ: لا رد ولا عنوان والإذن مسحوب (contains=false) ← siteOff، والسؤال عن أصل يوتيوب وحده', async () => {
  const permissions = permsWith(false);
  assert.deepEqual(await queryPopupState({ tabs: tabsWith(), permissions }), { reply: null, miss: 'siteOff' });
  assert.deepEqual(permissions.asked, [{ origins: [YT] }]);
});

test('B5-أ: النمط الذي يُسأل عن إذنه هو نمط سكربتات المحتوى في البيان نفسه', () => {
  const manifest = JSON.parse(readFileSync(new URL('../../../../src/manifest.json', import.meta.url), 'utf8'));
  for (const cs of manifest.content_scripts) assert.deepEqual(cs.matches, [...YOUTUBE_MATCHES]);
  assert.deepEqual([...YOUTUBE_MATCHES], [YT]);
});

test('B5-أ: الإذن قائم (contains=true) ← الحالات القديمة كما هي (unknown وstale)', async () => {
  assert.deepEqual(await queryPopupState({ tabs: tabsWith(), permissions: permsWith(true) }), { reply: null, miss: 'unknown' });
  assert.deepEqual(await queryPopupState({ tabs: tabsWith({ url: 'https://www.youtube.com/watch?v=AAAAAAAAAAA' }), permissions: permsWith(true) }), { reply: null, miss: 'stale' });
  assert.deepEqual(await queryPopupState({ tabs: tabsWith({ answer: { v: 0, ok: true }, reject: false }), permissions: permsWith(true) }), { reply: null, miss: 'unknown' }, 'نسخة أقدم');
});

test('B5-أ: لا واجهة permissions، أو رفضت السؤال ← الحالات القديمة (لا ادعاء بلا دليل)', async () => {
  assert.deepEqual(await queryPopupState({ tabs: tabsWith(), permissions: undefined }), { reply: null, miss: 'unknown' });
  assert.deepEqual(await queryPopupState({ tabs: tabsWith(), permissions: permsWith(new Error('boom')) }), { reply: null, miss: 'unknown' });
  assert.deepEqual(await queryPopupState({ tabs: tabsWith(), permissions: { contains: () => new Promise(() => {}) }, timeoutMs: 20 }), { reply: null, miss: 'unknown' }, 'لا رد في المهلة');
});

test('B5-أ: رد صالح لا يُسأل معه عن الإذن، وتبويب ليس يوتيوب يبقى «افتح فيديو»', async () => {
  const withReply = permsWith(false);
  const ok = await queryPopupState({ tabs: tabsWith({ answer: reply(), reject: false }), permissions: withReply });
  assert.equal(ok.miss, null);
  assert.equal(ok.reply.videoId, 'iG9CE55wbtY');
  assert.deepEqual(withReply.asked, []);
  const elsewhere = permsWith(false);
  assert.deepEqual(await queryPopupState({ tabs: tabsWith({ url: 'https://example.com/' }), permissions: elsewhere }), { reply: null, miss: 'elsewhere' });
  assert.deepEqual(elsewhere.asked, []);
});

test('B5-أ: نص siteOff صادق بلا زر: يقول إن الإذن مطفأ ومن أين يُعاد في كل متصفح ثم إعادة التحميل، بالعربية والإنجليزية', () => {
  const ar = missText('siteOff');
  assert.equal(ar, messageFor('TJ_SITE_ACCESS_OFF'));
  assert.match(ar, /إذن العمل على يوتيوب/);
  assert.match(ar, /Chrome وEdge وBrave/);
  assert.match(ar, /الوصول إلى المواقع/);
  assert.match(ar, /Firefox/);
  assert.match(ar, /أعد تحميل صفحة الفيديو/);
  assert.equal(/افتح فيديو/.test(ar), false, 'ليس «افتح فيديو» ولا «أعد التحميل» وحده');
  setLocale('en');
  try {
    const en = missText('siteOff');
    assert.equal(en, messageFor('TJ_SITE_ACCESS_OFF'));
    assert.equal(ARABIC.test(en), false, en);
    assert.match(en, /permission to run on YouTube/);
    assert.match(en, /Chrome, Edge, and Brave/);
    assert.match(en, /site access/);
    assert.match(en, /Firefox/);
    assert.match(en, /reload the video page/);
  } finally {
    setLocale('ar');
  }
});
