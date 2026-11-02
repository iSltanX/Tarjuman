// نقطة دخول العامل الخلفي (background.service_worker): خدمة الحفظ وحدها (عقد interfaces §١٣). المستمع يُسجَّل في
// أول تنفيذ متزامن للعامل، كما تتطلب Manifest V3، فيوقظه وصول رسالة الحفظ.
import { createStore } from '../core/store/index.js';
import { createSaveService } from './save-service.js';

createSaveService({ runtime: chrome.runtime, downloads: chrome.downloads, store: createStore() }).install();
