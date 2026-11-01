// download بلا متصفح (P3-AC3 جزؤه الآلي): Blob ثم <a download> ثم إلغاء الرابط، والفشل برمز عربي.
// التنزيل الفعلي في Brave وChrome في docs/evidence/P3 (اختبار حي).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { download, SRT_MIME } from '../../../src/core/export/download.js';
import { TjError } from '../../../src/core/errors/index.js';

function fakeDoc({ failOn = null } = {}) {
  const log = [];
  const timers = [];
  const anchors = [];
  const URL_ = {
    createObjectURL(blob) {
      if (failOn === 'create') throw new Error('blocked');
      log.push(['create', blob.type, blob.size]);
      return 'blob:fake-1';
    },
    revokeObjectURL(u) {
      log.push(['revoke', u]);
    },
  };
  class Blob_ {
    constructor(parts, { type }) {
      this.text = parts.join('');
      this.type = type;
      this.size = this.text.length;
    }
  }
  const body = { append: (a) => log.push(['append', a.download]) };
  const doc = {
    body,
    createElement(tag) {
      assert.equal(tag, 'a');
      const a = {
        style: {},
        click() {
          if (failOn === 'click') throw new Error('click blocked');
          log.push(['click', this.href, this.download, this.style.display]);
        },
        remove() {
          log.push(['remove']);
        },
      };
      anchors.push(a);
      return a;
    },
    defaultView: { URL: URL_, Blob: Blob_, setTimeout: (fn, ms) => timers.push({ fn, ms }) },
  };
  return { doc, log, timers, anchors };
}

test('ينشئ Blob بنوع SRT ويضع الرابط واسم الملف وينقر ثم يزيل العنصر', () => {
  const { doc, log, timers } = fakeDoc();
  const text = '1\n00:00:00,000 --> 00:00:01,000\nHi\n';
  download({ name: 'iG9CE55wbtY.en.manual.normal.srt', text }, { doc });
  assert.deepEqual(log.map((x) => x[0]), ['create', 'append', 'click', 'remove']);
  assert.deepEqual(log[0], ['create', SRT_MIME, text.length]);
  assert.equal(log[1][1], 'iG9CE55wbtY.en.manual.normal.srt');
  assert.deepEqual(log[2], ['click', 'blob:fake-1', 'iG9CE55wbtY.en.manual.normal.srt', 'none']);
  assert.equal(timers.length, 1);
  assert.equal(timers[0].ms, 10000);
});

test('يُلغى الرابط المؤقت بعد المهلة لا فورًا', () => {
  const { doc, log, timers } = fakeDoc();
  download({ name: 'a.srt', text: 'x' }, { doc });
  assert.equal(log.some((x) => x[0] === 'revoke'), false);
  timers[0].fn();
  assert.deepEqual(log.at(-1), ['revoke', 'blob:fake-1']);
});

test('الفشل يرمي EX_DOWNLOAD_FAILED بتفاصيل منقّاة، ويُلغى الرابط إن أُنشئ', () => {
  for (const failOn of ['create', 'click']) {
    const { doc, log } = fakeDoc({ failOn });
    assert.throws(() => download({ name: 'a.srt', text: 'x' }, { doc }), (e) => e instanceof TjError && e.code === 'EX_DOWNLOAD_FAILED' && /Error/.test(e.detail));
    assert.equal(log.some((x) => x[0] === 'revoke'), failOn === 'click', failOn);
  }
});

test('النص العربي والأسطر كما هي في الـBlob (UTF-8 بلا BOM)', () => {
  const { doc, log } = fakeDoc();
  const text = '1\n00:00:00,000 --> 00:00:01,000\nمرحبًا\nبكم\n';
  download({ name: 'a.ar.srt', text }, { doc });
  assert.equal(log[0][2], text.length);
  assert.equal(text.charCodeAt(0) === 0xfeff, false);
});
