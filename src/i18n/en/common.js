// Shared English strings: mirrors src/i18n/ar/common.js key for key.
export default Object.freeze({
  productName: 'Tarjuman',
  listSep: ', ',
  pair: '{from} → {to}',
  pairNoFrom: '? → {to}',
  languageUnknown: 'Unknown language',
  track: {
    kind: { manual: 'manual', asr: 'auto-generated' },
    via: '{name}, auto-translated by YouTube from {source}',
    state: { captured: 'captured', saved: 'saved' },
    original: 'Original',
    roundTrip: {
      lead: ({ name }) => `This video is in ${name}:`,
      action: 'pick its own track',
      how: ({ name }) => `This track was auto-translated by YouTube from ${name}. To pick the video’s original track in the player: CC, then Settings, then “Subtitles/CC”, then ${name}. You can also continue with this track.`,
    },
  },
  cancel: 'Cancel',
  count: {
    cue: { one: '1 segment', other: 'segments' },
    video: { one: '1 video', other: 'videos' },
    change: { one: '1 change', other: 'changes' },
    language: { one: '1 language', other: 'languages' },
    file: { one: '1 file', other: 'files' },
    term: { one: '1 term', other: 'terms' },
  },
  bytes: { zero: '0 KB', kb: '{n} KB', mb: '{n} MB', gb: '{n} GB' },
  nav: {
    library: 'Library', settings: 'Settings', editor: 'Editor',
    brand: 'Tarjuman — Library', pages: 'Tarjuman pages', yourData: 'Your translations and settings stay in your browser',
  },
  page: { title: 'Tarjuman — {page}', renderFailed: 'Couldn’t display this page' },
  continuation: {
    note: 'Completed with “{file}”: {count}.',
  },
  bilingual: { remove: 'Remove the original line from each segment' },
  slot: {
    label: 'Translation {n}', labelActive: 'Translation {n}, active', labelEmpty: 'Translation {n}, empty', picker: 'Active translation',
  },
  langPicker: {
    from: 'From', to: 'To', empty: 'Select', search: 'Search languages', auto: 'Auto from video', autoShort: 'Auto',
    quick: 'Quick access', video: 'In this video', recent: 'Recently used', all: 'All languages', results: 'Results', none: 'No language with that name or code',
    swap: 'Swap languages', list: 'Languages', row: 'Translation languages',
  },
  fonts: {
    almarai: { name: 'Almarai', note: 'Clear and balanced for fast reading' },
    'noto-sans-arabic': { name: 'Noto Sans Arabic', note: 'Supports more letters and diacritics' },
    tajawal: { name: 'Tajawal', note: 'Narrower, so it needs fewer lines' },
    markazi: { name: 'Markazi', note: 'Classic Naskh style' },
  },
});
