// قراءات Git فقط (عدا ما يطلبه المستدعي صراحة). GIT_OPTIONAL_LOCKS=0 كي لا تأخذ القراءةُ من worktrees
// الجلسات الأخرى قفلَ فهارسها فتُفشل التزاماتها.
import { spawnSync } from 'node:child_process';

const ENV = { ...process.env, GIT_OPTIONAL_LOCKS: '0', GIT_TERMINAL_PROMPT: '0' };

function run(cwd, args) {
  return spawnSync('git', ['-c', 'core.quotePath=false', ...args], {
    cwd,
    env: ENV,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
}

export function git(cwd, args, { allowFail = false } = {}) {
  const r = run(cwd, args);
  if (r.error || r.status !== 0) {
    if (allowFail) return null;
    throw new Error(`git ${args.join(' ')}: ${(r.stderr || String(r.error || '')).trim()}`);
  }
  return r.stdout.replace(/\n$/, '');
}

export const gitOk = (cwd, args) => run(cwd, args).status === 0;

export function toplevel(cwd) {
  return git(cwd, ['rev-parse', '--show-toplevel'], { allowFail: true });
}

export function hasHead(cwd) {
  return gitOk(cwd, ['rev-parse', '--verify', '-q', 'HEAD']);
}

export function currentBranch(cwd) {
  const b = git(cwd, ['rev-parse', '--abbrev-ref', 'HEAD'], { allowFail: true });
  return b && b !== 'HEAD' ? b : null;
}

// هل المجلد هو النسخة الرئيسية لا worktree إضافيًا؟
export function isMainCheckout(cwd) {
  const out = git(cwd, ['rev-parse', '--path-format=absolute', '--git-dir', '--git-common-dir'], { allowFail: true });
  if (!out) return false;
  const [dir, common] = out.split('\n');
  return dir === common;
}

export function worktrees(cwd) {
  const out = git(cwd, ['worktree', 'list', '--porcelain'], { allowFail: true });
  if (!out) return [];
  const list = [];
  let cur = null;
  for (const line of out.split('\n')) {
    if (line.startsWith('worktree ')) {
      cur = { path: line.slice(9), head: null, branch: null, detached: false, prunable: false };
      list.push(cur);
    } else if (!cur) {
      continue;
    } else if (line.startsWith('HEAD ')) {
      cur.head = line.slice(5);
    } else if (line.startsWith('branch ')) {
      cur.branch = line.slice(7).replace(/^refs\/heads\//, '');
    } else if (line === 'detached') {
      cur.detached = true;
    } else if (line.startsWith('prunable')) {
      cur.prunable = true;
    }
  }
  return list;
}

export function refs(cwd) {
  const out = git(
    cwd,
    ['for-each-ref', '--format=%(refname)%09%(objectname)%09%(*objectname)', 'refs/heads', 'refs/tags'],
    { allowFail: true },
  );
  const heads = {};
  const tags = {};
  for (const line of (out || '').split('\n')) {
    if (!line) continue;
    const [name, sha, peeled] = line.split('\t');
    if (name.startsWith('refs/heads/')) heads[name.slice(11)] = sha;
    else if (name.startsWith('refs/tags/')) tags[name.slice(10)] = peeled || sha;
  }
  return { heads, tags };
}

export function show(cwd, ref, file) {
  return git(cwd, ['show', `${ref}:${file}`], { allowFail: true });
}

export function isAncestor(cwd, a, b) {
  return gitOk(cwd, ['merge-base', '--is-ancestor', a, b]);
}

export function revCount(cwd, range) {
  const n = git(cwd, ['rev-list', '--count', range], { allowFail: true });
  return n == null ? null : Number(n);
}

export function lastCommit(cwd, ref) {
  const out = git(cwd, ['log', '-1', '--format=%h%x1f%cI%x1f%s', ref], { allowFail: true });
  if (!out) return null;
  const [hash, at, subject] = out.split('\x1f');
  return { hash, at, subject };
}

export function diffNames(cwd, range, ...pathspec) {
  const args = ['diff', '--name-only', range];
  if (pathspec.length) args.push('--', ...pathspec);
  const out = git(cwd, args, { allowFail: true });
  return out ? out.split('\n').filter(Boolean) : [];
}

export function statusPorcelain(cwd) {
  return git(cwd, ['status', '--porcelain', '--untracked-files=normal'], { allowFail: true }) || '';
}

export function blobId(cwd, ref, file) {
  return git(cwd, ['rev-parse', '-q', '--verify', `${ref}:${file}`], { allowFail: true });
}

export function logTouching(cwd, range, file) {
  const out = git(cwd, ['log', '--format=%h%x1f%s', range, '--', file], { allowFail: true });
  return (out || '').split('\n').filter(Boolean).map((l) => {
    const [hash, subject] = l.split('\x1f');
    return { hash, subject };
  });
}
