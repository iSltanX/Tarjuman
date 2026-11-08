// الفهرس الكامل للغتين. كل مجال ملف بالاسم نفسه في ar وen، ومفاتيح الملفين متطابقة (test/unit/i18n/coverage.test.js).
import arCommon from './ar/common.js';
import arErrors from './ar/errors.js';
import arCore from './ar/core.js';
import arPlayer from './ar/player.js';
import arPopup from './ar/popup.js';
import arLibrary from './ar/library.js';
import arSettings from './ar/settings.js';
import arEditor from './ar/editor.js';
import enCommon from './en/common.js';
import enErrors from './en/errors.js';
import enCore from './en/core.js';
import enPlayer from './en/player.js';
import enPopup from './en/popup.js';
import enLibrary from './en/library.js';
import enSettings from './en/settings.js';
import enEditor from './en/editor.js';

export const CATALOG = Object.freeze({
  ar: Object.freeze({ common: arCommon, errors: arErrors, core: arCore, player: arPlayer, popup: arPopup, library: arLibrary, settings: arSettings, editor: arEditor }),
  en: Object.freeze({ common: enCommon, errors: enErrors, core: enCore, player: enPlayer, popup: enPopup, library: enLibrary, settings: enSettings, editor: enEditor }),
});
