// نموذج البيانات المشترك (عقد docs/contracts/data-model.md). ثبّتته P2 ووسّعته P10 للإصدار الثاني؛ كل تغيير فيه تغيير عقد.
export { LIMITS, OK, assertValid } from './validate.js';
export {
  VIDEO_ID_RE, ENGLISH_LANG_RE, SOURCE_LANG_RE, FINGERPRINT_ID_RE, TRACK_KINDS, PAGES,
  isVideoId, isSourceLang, trackKey, parseTrackKey, parseV1TrackKey, newFingerprintId, pagePath, videoParam, watchUrl,
} from './ids.js';
export { validateCue, validateCues, validateCueTime, cloneCues, cueTimes } from './cue.js';
export {
  EXPORT_MODES, validateEnglishTrack, validateSourceTrack, isV1Track, validateFingerprint, validateComparisonReport, validateArabicTrack,
} from './tracks.js';
export { LANG_SCHEMA, validateLangValue, packLang, mergeLang, splitRecord, isEmptyLang } from './lang-store.js';
export {
  RECORD_SCHEMA, DISPLAY_MODES, validateView, validateVideoRecord, createVideoRecord, arabicCues, summarizeVideo,
  validateIndexEntry,
} from './video.js';
export {
  SETTINGS_SCHEMA, DEFAULT_SETTINGS, DISPLAY_MODE_DEFAULTS, SUBTITLE_FONTS, SUBTITLE_SCALE, LEGACY_SUBTITLE_SIZES,
  SUBTITLE_BACKGROUNDS, SUBTITLE_POSITIONS,
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
  MESSAGE_VERSION, MSG, isExtensionPage, isVideoStateRequest, videoStateRequest, videoIdRequest, isVideoIdRequest, isVideoIdReply, buildVideoStateReply, isVideoStateReply,
  isVideoStateReplyV2, isOwnContentScript, pageDiagnosticsRequest, isPageDiagnosticsRequest, seekRequest, isSeekRequest, isSeekReply,
  saveRequest, isSaveRequest, isSaveReply,
} from './messages.js';
// الإصدار الثاني (عقد data-model §١٠–§١٦)
export {
  SLOT_NUMBERS, SLOT_NAME_MAX, isSlotNumber, validateSlotName, validateAltSlot, validatePrevious, validateHead, validateAltsValue,
  validatePrevValue, validateMarksValue, validateSummary, validateBundle,
} from './slots.js';
export {
  MARK_KINDS, MOVE_WINDOW_MS, cueTextHash, markAnchor, sameAnchor, validateMark, validateMarks, validatePosition, prepareCues,
  resolveMark, resolveMarks, resolvePosition, markCounts,
} from './marks.js';
export {
  bundleFromRecord, syncActive, applyRecordChange, withActiveSlot, withSlotLang, withSlotUpload, withSlotEdit, withSlotOriginalRestored, withSlotOffset,
  withoutSlot, withPreviousRestored, withoutPrevious, withSlotReference, withSlotName, withMark, withMarksReplaced, withPosition,
  summarizeBundle, slotModels, isTrivialBundle, packBundle, unpackBundle, bundleToBackup, bundleFromBackup, referencedFingerprints,
} from './bundle.js';
export {
  PREFS_SCHEMA, DEFAULT_PREFS, SAVE_MODES, GLOSSARY_LIMITS, READING_SPEED, FOLDER_MAX, DEFAULT_FOLDER, isValidFolderName,
  validateTerm, validatePrefs, normalizePrefs, mergePrefs,
} from './prefs.js';
