// نموذج البيانات المشترك (عقد docs/contracts/data-model.md). يُجمَّد بعد P2؛ كل تغيير فيه تغيير عقد.
export { LIMITS, OK, assertValid } from './validate.js';
export {
  VIDEO_ID_RE, ENGLISH_LANG_RE, FINGERPRINT_ID_RE, TRACK_KINDS, PAGES,
  isVideoId, trackKey, parseTrackKey, newFingerprintId, pagePath, videoParam, watchUrl,
} from './ids.js';
export { validateCue, validateCues, validateCueTime, cloneCues, cueTimes } from './cue.js';
export {
  EXPORT_MODES, validateEnglishTrack, validateFingerprint, validateComparisonReport, validateArabicTrack,
} from './tracks.js';
export {
  RECORD_SCHEMA, DISPLAY_MODES, validateView, validateVideoRecord, createVideoRecord, arabicCues, summarizeVideo,
  validateIndexEntry,
} from './video.js';
export {
  SETTINGS_SCHEMA, DEFAULT_SETTINGS, DISPLAY_MODE_DEFAULTS, SUBTITLE_SIZES, SUBTITLE_BACKGROUNDS, SUBTITLE_POSITIONS,
  validateSettings, normalizeSettings, mergeSettings,
} from './settings.js';
export {
  OFFSET_GRID_MS, MAX_OFFSET_MS, DEFAULT_OFFSET_STEP_MS, isValidOffset, normalizeOffset, lookupMs, shownTimes,
  shiftCues, commitOffset, exportTiming,
} from './timing.js';
export {
  withExport, withArabicImport, withView, withArabicEdit, withOriginalRestored, withoutArabic,
} from './transitions.js';
export {
  MESSAGE_VERSION, MSG, isExtensionPage, isVideoStateRequest, videoStateRequest, buildVideoStateReply, isVideoStateReply,
} from './messages.js';
