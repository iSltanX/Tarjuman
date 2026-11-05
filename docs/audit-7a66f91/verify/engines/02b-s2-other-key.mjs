import { TJ_ROOT as T } from '../_root.mjs';
const { createExtractor } = await import(`${T}/src/extract/index.js`);
const VID = 'AAAAAAAAAAA';
const body = (segs) => JSON.stringify({ events: [{ tStartMs: 0, dDurationMs: 1000, segs }] });
const msg = (b, lang) => ({ source: 'tarjuman', v: 1, kind: 'timedtext', videoId: VID, lang, trackKind: 'manual', format: 'json3', status: 200, bodyLength: b.length, body: b });
const e = createExtractor({ currentVideoId: () => VID, durationMs: () => 1000 });
e.handleMessage(msg(body([{ utf8: 'good' }]), 'en-US'));
try { e.handleMessage(msg(body([1, { utf8: 'x' }]), 'en')); } catch (err) { console.log('handle threw', err.constructor.name); }
try { console.log(e.tracks()); } catch (err) { console.log('tracks() threw for ALL slots incl. en-US:', err.constructor.name); }
try { console.log('convert en-US still works:', e.convert('en-US|manual').ok); } catch (err) { console.log('convert en-US threw', err.message); }
