// نقطة دخول العامل الخلفي (background.service_worker): خدمة الحفظ (عقد interfaces §١٣) والكاتب الواحد للتخزين (عقد storage
// §١٢، تدقيق 7a66f91، C2). المستمعان يُسجَّلان في أول تنفيذ متزامن للعامل، كما تتطلب Manifest V3، فيوقظه وصول أي منهما.
// ومتجر العامل نفسه يكتب بكاتبه مباشرة بلا رسالة.
import { chromeLocalArea } from '../core/store/area.js';
import { createStore, createWriter, localTransport } from '../core/store/index.js';
import { createSaveService } from './save-service.js';
import { createStoreService } from './store-service.js';
import { installActionTitle } from './action-title.js';

const area = chromeLocalArea();
const writer = createWriter({ area });
createStoreService({ runtime: chrome.runtime, writer }).install();
createSaveService({ runtime: chrome.runtime, downloads: chrome.downloads, store: createStore({ area, transport: localTransport(writer) }) }).install();
installActionTitle({ store: createStore({ area, transport: localTransport(writer) }), action: chrome.action });
