export { load, out, tick, gate, TJ } from './common.mjs';
/** يمرّر عدة مهام setTimeout حتى تنتهي سلاسل الوعود وإعادة القراءة. */
export const settleAll = async (n = 10) => { for (let i = 0; i < n; i++) await new Promise((r) => setTimeout(r, 0)); };
