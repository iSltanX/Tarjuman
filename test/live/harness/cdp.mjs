// عميل CDP بلا اعتماديات: عبر الأنبوب (--remote-debugging-pipe، الواصفان 3 و4) أو عبر WebSocket المدمج في Node.
// جلسات الأهداف مسطّحة (flatten) فتمر كل الرسائل على اتصال واحد مع sessionId.

export class CdpError extends Error {
  constructor(method, error) {
    super(`${method}: ${error.message}${error.data ? ` (${error.data})` : ''}`);
    this.name = 'CdpError';
    this.code = error.code;
  }
}

export class CdpConnection {
  /** @param {{ send: (s: string) => void, onMessage: (cb: (s: string) => void) => void, close: () => void }} transport */
  constructor(transport) {
    this.transport = transport;
    this.nextId = 1;
    this.pending = new Map();
    this.listeners = new Set();
    this.closed = false;
    transport.onMessage((raw) => this.#dispatch(raw));
  }

  #dispatch(raw) {
    let msg;
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }
    if (msg.id !== undefined) {
      const p = this.pending.get(msg.id);
      if (!p) return;
      this.pending.delete(msg.id);
      if (msg.error) p.reject(new CdpError(p.method, msg.error));
      else p.resolve(msg.result);
      return;
    }
    for (const l of this.listeners) {
      if (l.method === msg.method && (l.sessionId === undefined || l.sessionId === msg.sessionId)) {
        try {
          l.cb(msg.params, msg.sessionId);
        } catch (err) {
          console.error(`مستمع ${msg.method} فشل: ${err.message}`);
        }
      }
    }
  }

  /**
   * @param {string} method
   * @param {object} [params]
   * @param {string} [sessionId]
   * @param {number} [timeoutMs]
   */
  send(method, params = {}, sessionId, timeoutMs = 30000) {
    if (this.closed) return Promise.reject(new Error('الاتصال مغلق'));
    const id = this.nextId++;
    const msg = { id, method, params };
    if (sessionId) msg.sessionId = sessionId;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`${method}: انتهت المهلة`));
      }, timeoutMs);
      this.pending.set(id, {
        method,
        resolve: (v) => { clearTimeout(timer); resolve(v); },
        reject: (e) => { clearTimeout(timer); reject(e); },
      });
      this.transport.send(JSON.stringify(msg));
    });
  }

  /** @returns {() => void} */
  on(method, cb, sessionId) {
    const l = { method, cb, sessionId };
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  }

  waitFor(method, predicate = () => true, { sessionId, timeoutMs = 30000 } = {}) {
    return new Promise((resolve, reject) => {
      const off = this.on(method, (params) => {
        if (!predicate(params)) return;
        clearTimeout(timer);
        off();
        resolve(params);
      }, sessionId);
      const timer = setTimeout(() => {
        off();
        reject(new Error(`انتظار ${method}: انتهت المهلة`));
      }, timeoutMs);
    });
  }

  close() {
    this.closed = true;
    for (const p of this.pending.values()) p.reject(new Error('أُغلق الاتصال'));
    this.pending.clear();
    this.transport.close();
  }
}

/** @param {import('node:child_process').ChildProcess} child */
export function pipeTransport(child) {
  const out = child.stdio[3];
  const inp = child.stdio[4];
  let buf = '';
  let cb = () => {};
  inp.setEncoding('utf8');
  inp.on('data', (chunk) => {
    buf += chunk;
    let i;
    while ((i = buf.indexOf('\0')) !== -1) {
      const raw = buf.slice(0, i);
      buf = buf.slice(i + 1);
      cb(raw);
    }
  });
  return {
    send: (s) => out.write(`${s}\0`),
    onMessage: (fn) => { cb = fn; },
    close: () => { try { out.end(); } catch { /* مغلق */ } },
  };
}

/** @param {string} url ws://127.0.0.1:<port>/devtools/browser/<id> */
export async function wsTransport(url) {
  const ws = new WebSocket(url);
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true });
    ws.addEventListener('error', () => reject(new Error('تعذّر فتح WebSocket')), { once: true });
  });
  let cb = () => {};
  ws.addEventListener('message', (e) => cb(String(e.data)));
  return { send: (s) => ws.send(s), onMessage: (fn) => { cb = fn; }, close: () => ws.close() };
}
