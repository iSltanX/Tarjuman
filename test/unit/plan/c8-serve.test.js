// تدقيق 7a66f91، C8 (U66، CDX-S7 وDS-T-09): خادم لوحة الخطة لا يجيب إلا اللوحة نفسها. كان يقدّم state.js (بمسارات الجهاز)
// والحالة والوثائق لطلب بمضيف أجنبي (إعادة ربط DNS) وبترويسات عابرة للموقع، بلا CORP، ويتبع الروابط الرمزية إلى خارج الجذر.
// بالمعالج الحقيقي في الذاكرة على جذر مؤقت، لا منفذ ولا Git.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createHandler } from '../../../tools/plan/lib/serve.mjs';

const root = await mkdtemp(path.join(os.tmpdir(), 'tj-c8-serve-'));
const outside = await mkdtemp(path.join(os.tmpdir(), 'tj-c8-outside-'));
test.after(async () => {
  await rm(root, { recursive: true, force: true });
  await rm(outside, { recursive: true, force: true });
});
await mkdir(path.join(root, 'dashboard'), { recursive: true });
await mkdir(path.join(root, 'docs'), { recursive: true });
await mkdir(path.join(root, 'plan'), { recursive: true });
await writeFile(path.join(root, 'dashboard', 'index.html'), '<!doctype html><title>لوحة</title>');
await writeFile(path.join(root, 'docs', 'a.md'), 'وثيقة');
await writeFile(path.join(root, 'README.md'), 'اقرأني');
await writeFile(path.join(outside, 'secret.txt'), 'synthetic-secret');
await mkdir(path.join(outside, 'dir'));
await writeFile(path.join(outside, 'dir', 'x.md'), 'synthetic-secret-2');
await symlink(path.join(outside, 'secret.txt'), path.join(root, 'docs', 'link.md'));
await symlink(path.join(outside, 'dir'), path.join(root, 'plan', 'up'), 'dir');
// رابط رمزي داخل الجذر إلى ملف داخله: مقبول.
await symlink(path.join(root, 'docs', 'a.md'), path.join(root, 'docs', 'alias.md'));
// ورابط داخل الجذر إلى ملف غير مسموح (مجلد خفي كـ.git): مرفوض (ملاحظة المراجعة المستقلة).
await mkdir(path.join(root, '.git'), { recursive: true });
await writeFile(path.join(root, '.git', 'config'), 'synthetic-git-config');
await symlink(path.join(root, '.git', 'config'), path.join(root, 'docs', 'cfg.md'));

const handler = createHandler(root, { port: 4317, derive: () => ({ schema: 1, source: { root: '/synthetic/root' } }) });
const call = (url, headers = {}, method = 'GET') => new Promise((resolve) => {
  const res = {
    writeHead(code, h) { this.code = code; this.h = h; },
    end(body) { resolve({ code: this.code, h: this.h, body: body == null ? '' : String(body) }); },
  };
  handler({ method, url, headers }, res);
});
const own = { host: '127.0.0.1:4317', 'sec-fetch-site': 'same-origin' };

test('مضيف أجنبي (إعادة ربط DNS) أو بلا Host أو بمنفذ آخر: 421 لكل الموارد', async () => {
  for (const host of ['rebind.attacker.test:4317', '127.0.0.1:9999', 'localhost', '', undefined]) {
    for (const url of ['/dashboard/data/state.js', '/api/state.json', '/README.md', '/docs/a.md', '/dashboard/']) {
      const r = await call(url, host === undefined ? {} : { host });
      assert.equal(r.code, 421, `${host} ${url}`);
      assert.doesNotMatch(r.body, /synthetic/);
    }
  }
});

test('طلب من موقع آخر أو موقع شقيق: 403، والانتقال إلى صفحة مقبول', async () => {
  for (const site of ['cross-site', 'same-site']) {
    const r = await call('/dashboard/data/state.js', { host: '127.0.0.1:4317', 'sec-fetch-site': site, 'sec-fetch-dest': 'script', 'sec-fetch-mode': 'no-cors' });
    assert.equal(r.code, 403, site);
    assert.equal((await call('/api/state.json', { host: 'localhost:4317', 'sec-fetch-site': site, 'sec-fetch-mode': 'cors' })).code, 403);
  }
  const nav = await call('/dashboard/', { host: 'localhost:4317', 'sec-fetch-site': 'cross-site', 'sec-fetch-mode': 'navigate', 'sec-fetch-dest': 'document' });
  assert.equal(nav.code, 200);
  assert.match(nav.body, /لوحة/);
  const embed = await call('/dashboard/data/state.js', { host: 'localhost:4317', 'sec-fetch-site': 'cross-site', 'sec-fetch-mode': 'navigate', 'sec-fetch-dest': 'embed' });
  assert.equal(embed.code, 403);
});

test('اللوحة نفسها ومن شريط العنوان ومن أداة بلا Fetch Metadata: 200، وكل رد بـCORP same-origin', async () => {
  for (const headers of [own, { host: 'localhost:4317', 'sec-fetch-site': 'none' }, { host: '127.0.0.1:4317' }]) {
    const st = await call('/dashboard/data/state.js', headers);
    assert.equal(st.code, 200);
    assert.equal(st.h['cross-origin-resource-policy'], 'same-origin');
    assert.match(st.body, /^window\.TJ_STATE = /);
    assert.equal((await call('/docs/a.md', headers)).body, 'وثيقة');
  }
  const denied = await call('/api/state.json', { host: 'evil.test:4317' });
  assert.equal(denied.h['cross-origin-resource-policy'], 'same-origin', 'والرفض أيضًا');
});

test('رابط رمزي إلى ملف أو مجلد خارج الجذر: 404 بلا محتواه، وإلى ملف داخله مقبول', async () => {
  for (const url of ['/docs/link.md', '/plan/up/x.md']) {
    const r = await call(url, own);
    assert.equal(r.code, 404, url);
    assert.doesNotMatch(r.body, /synthetic-secret/);
  }
  assert.equal((await call('/docs/alias.md', own)).body, 'وثيقة');
  const inner = await call('/docs/cfg.md', own);
  assert.equal(inner.code, 404);
  assert.doesNotMatch(inner.body, /synthetic-git-config/);
  assert.equal((await call('/docs/../../etc/passwd', own)).code, 404);
  assert.equal((await call('/.git/config', own)).code, 404);
});
