// تدقيق 7a66f91، U84 (قرارا سلطان Q12 وQ13): صيغ الأسرار الواقعية التي كان الفاحص يفوّتها تُمنع الآن، والنصوص العادية لا تُمنع؛
// وتنبيه منفصل غير مانع لرابط يوتيوب أو بريد أو معرّف في وصف البلاغ، مع حالات النتائج الخاطئة المحتملة.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findSecrets, sanitizeText } from '../../../src/core/diagnostics/sanitize.js';
import { personalHintText, personalHints } from '../../../src/core/report/personal.js';
import { reportPanel } from '../../../src/pages/settings/report.js';
import { buttonNamed, newDocument, settle } from '../pages/library/fake-dom.js';

const V = 'AbCdEf0123456789-_xyzAB';

test('U84: صيغ نسخ الكوكيز الواقعية تُكشف وتُحذف (بأحرف صغيرة، وبـ«:»، وصف أدوات المطوّر، وJSON، وcookies.txt)', () => {
  const cases = {
    lower: `sapisid=${V}`,
    colon: `SAPISID: ${V}`,
    devtoolsRow: `__Secure-3PSID\t${V}\t.youtube.com\t/\t2027-01-01T00:00:00.000Z\t160\t✓\t✓`,
    devtoolsShort: `SID\t${V}\t.youtube.com\t/`,
    json: `{"domain": ".youtube.com", "name": "SAPISID", "path": "/", "value": "${V}"}`,
    jsonShort: `{"name": "HSID", "value": "${V}"}`,
    cookiesTxt: `.youtube.com\tTRUE\t/\tTRUE\t1790000000\tLOGIN_INFO\t${V}`,
    loginInfoLower: `login_info: ${V}`,
  };
  for (const [name, text] of Object.entries(cases)) {
    const found = findSecrets(text);
    assert.ok(found.some((f) => f.type === 'cookie'), `${name}: يُكشف`);
    assert.equal(sanitizeText(text).includes(V), false, `${name}: يُحذف`);
  }
});

test('U84: رموز الدخول (JWT وحده ومع Bearer، وya29.) وpot المرمّزة تُكشف', () => {
  const jwt = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dBjftJeZ4CVPmB92K27uhbUJU1p1r';
  for (const text of [jwt, `Authorization: Bearer ${jwt}`, `Bearer abcDEF1234567890xyz`, 'ya29.a0AfH6SMBxXyZ1234567890abcdefgh', 'pot%3DABCDEFGHIJKLMNOPQRSTUV']) {
    assert.ok(findSecrets(text).length > 0, text.slice(0, 20));
  }
});

test('U84 (النتائج الخاطئة المحتملة): نصوص البلاغ العادية لا تُمنع', () => {
  const benign = [
    'الترجمة تتأخر ثانية بعد القفز في الفيديو، وأعدت تحميل الصفحة فلم يتغير شيء.',
    'Subtitles disappear after seeking; Chrome 130.0.6723.91 on macOS 15.6.',
    'my wifi ssid: HomeNetwork5G is unrelated',
    'pref = normalizePrefs(raw) and sid = session id in my notes',
    'The bearer of this report is responsible for testing instructions carefully.',
    'Bearer token missing',
    'error code ST_READ_FAILED then SV_BAD_FILE, BK_TOO_LARGE',
    'name: SAPISID is the cookie I mean, no value here',
    '{"name": "theme", "value": "dark-mode-enabled"}',
    'youtube.com\tTRUE is just text',
  ];
  for (const text of benign) assert.deepEqual(findSecrets(text, ['url']), [], text);
});

test('U84: التنبيه يرى رابط يوتيوب والبريد والمعرّف، بترتيب ثابت ونص واحد', () => {
  assert.deepEqual(personalHints('شاهد https://www.youtube.com/watch?v=dQw4w9WgXcQ'), ['youtube-link', 'video-id']);
  assert.deepEqual(personalHints('youtu.be/dQw4w9WgXcQ'), ['youtube-link', 'video-id']);
  assert.deepEqual(personalHints('m.youtube.com/shorts'), ['youtube-link']);
  assert.deepEqual(personalHints('راسلني على someone.name+tag@example.co.uk'), ['email']);
  assert.deepEqual(personalHints('المعرّف iG9CE55wbtY يتعطل'), ['video-id']);
  assert.equal(personalHintText(['youtube-link', 'email', 'video-id']), 'يبدو أن في وصفك رابط يوتيوب، عنوان بريد أو معرّف فيديو. يُرسل الوصف كما كتبته، فاحذفه إن لم يحتجه البلاغ.');
  assert.equal(personalHintText(['email']), 'يبدو أن في وصفك عنوان بريد. يُرسل الوصف كما كتبته، فاحذفه إن لم يحتجه البلاغ.');
  assert.equal(personalHintText([]), '');
});

test('U84 (النتائج الخاطئة المحتملة): كلمات من 11 حرفًا ورموز الأخطاء والأرقام والإصدارات لا تُنبَّه', () => {
  const benign = [
    'translation subtitlesss Translation',
    'SV_BAD_FILE and ST_NO_RECORD',
    '12345678901 and 2026-11-05 and 130.0.6723.91',
    'version 1.1.0 build 20261102144711',
    'ترجمان لا يعرض الترجمة بعد الإعلان',
    'path/to/file.srt and @mention and a@b',
    'notyoutube.company is not a link',
  ];
  for (const text of benign) assert.deepEqual(personalHints(text), [], text);
});

test('U84: في لوحة البلاغ يظهر التنبيه والإرسال ممكن؛ وما يشبه رمز جلسة يمنع ويحل محل التنبيه', async () => {
  const doc = newDocument();
  const sent = [];
  const panel = reportPanel({
    doc,
    env: {
      diagnostics: async () => ({ appVersion: '1.1.0', os: 'macos', osVersion: '15.6.1', arch: 'arm64', browser: 'Google Chrome', browserVersion: '156.0.0.0', buildTarget: 'chromium', test: false }),
      requestPermission: async () => true, send: async (p) => { sent.push(p); return { ok: true, id: 7, replayed: false }; },
      copy: async () => {}, newKey: () => '00000001-0000-4000-8000-000000000000',
    },
  });
  doc.body.append(panel.root);
  buttonNamed(panel.root, 'الإبلاغ عن مشكلة').click();
  await settle();
  const area = panel.root.querySelector('textarea');
  const type = (v) => { area.value = v; area.dispatchEvent({ type: 'input' }); };
  const note = panel.root.querySelector('#st-report-hint');
  const send = buttonNamed(panel.root, 'إرسال البلاغ');

  type('يتعطل على youtu.be/dQw4w9WgXcQ');
  assert.equal(note.hidden, false);
  assert.match(note.textContent, /رابط يوتيوب، معرّف فيديو|رابط يوتيوب أو معرّف فيديو/);
  assert.equal(note.getAttribute('role'), 'status', 'تذكير لا تنبيه مانع');
  assert.equal(send.getAttribute('aria-disabled'), null, 'الإرسال ممكن');
  assert.ok(area.getAttribute('aria-describedby').split(' ').includes('st-report-hint'));
  send.click();
  await settle(10);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].description, 'يتعطل على youtu.be/dQw4w9WgXcQ', 'يُرسل كما كُتب');

  type(`sapisid=${V}`);
  assert.equal(send.getAttribute('aria-disabled'), 'true', 'الصيغة الجديدة تمنع');
  assert.equal(note.hidden, true, 'والتنبيه المانع وحده ظاهر');
  type('وصف عادي بلا شيء');
  assert.equal(note.hidden, true);
  assert.equal(note.textContent, '');
});

test('U84: JSON بالقيمة قبل الاسم يُحذف أيضًا', () => {
  const text = `{"value": "${V}", "domain": ".youtube.com", "name": "SAPISID"}`;
  assert.ok(findSecrets(text).some((f) => f.type === 'cookie'));
  assert.equal(sanitizeText(text).includes(V), false);
});
