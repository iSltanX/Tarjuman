// نقطة دخول العامل الخلفي (background.service_worker): خدمة الحفظ (عقد interfaces §١٣) والكاتب الواحد للتخزين (عقد storage
// §١٢، تدقيق 7a66f91، C2)، ومنذ الفكرة ١٠ تمرير أوامر الاختصارات إلى التبويب النشط (عقد messages §٩). المستمعون يُسجَّلون في أول
// تنفيذ متزامن للعامل، كما تتطلب Manifest V3، فيوقظه وصول أي منهم.
// ومتجر العامل نفسه يكتب بكاتبه مباشرة بلا رسالة.
import { chromeLocalArea } from '../core/store/area.js';
import { createStore, createWriter, localTransport } from '../core/store/index.js';
import { createSaveService } from './save-service.js';
import { createStoreService } from './store-service.js';
import { installActionTitle } from './action-title.js';
import { installThumbsPin } from './thumbs-pin.js';
import { installCommands } from './commands.js';
import { buildTarget } from '../core/consent/thumbnails.js';

const area = chromeLocalArea();
const writer = createWriter({ area });
createStoreService({ runtime: chrome.runtime, writer }).install();
createSaveService({ runtime: chrome.runtime, downloads: chrome.downloads, store: createStore({ area, transport: localTransport(writer) }) }).install();
installActionTitle({ store: createStore({ area, transport: localTransport(writer) }), action: chrome.action });
// و2: من رقّى بلا تفضيلات مكتوبة تبقى صوره ظاهرة (الافتراضي الجديد «مطفأة» للتثبيت الجديد وحده).
installThumbsPin({ runtime: chrome.runtime, area, store: createStore({ area, transport: localTransport(writer) }), target: buildTarget() });
// اختصارات لوحة المفاتيح (الفكرة ١٠، ح-55): الأمر المضغوط إلى سكربت ترجمان في التبويب النشط، ومستمعه متزامن كالرسائل لأن الضغطة توقظ العامل.
installCommands({ commands: chrome.commands, tabs: chrome.tabs });
