export async function initDatabase(dbName, storeConfig) {
    return new Promise((resolve, reject) => {
        if (!('indexedDB' in window)) {
            reject(new Error('IndexedDB not supported'));
            return;
        }
        const request = window.indexedDB.open(dbName, 1);
        request.onerror = () => {
            reject(request.error);
        };
        request.onsuccess = () => {
            const db = request.result;
            if (!db.objectStoreNames.contains(storeConfig.storeName)) {
                db.close();
                upgradeDatabase(dbName, storeConfig).then(resolve).catch(reject);
            }
            else {
                resolve(db);
            }
        };
        request.onupgradeneeded = () => {
            const db = request.result;
            createObjectStore(db, storeConfig);
        };
    });
}
async function upgradeDatabase(dbName, storeConfig) {
    return new Promise((resolve, reject) => {
        const upgradeRequest = window.indexedDB.open(dbName, 2);
        upgradeRequest.onupgradeneeded = () => {
            const db = upgradeRequest.result;
            if (!db.objectStoreNames.contains(storeConfig.storeName)) {
                createObjectStore(db, storeConfig);
            }
        };
        upgradeRequest.onsuccess = () => {
            resolve(upgradeRequest.result);
        };
        upgradeRequest.onerror = () => {
            reject(upgradeRequest.error);
        };
    });
}
function createObjectStore(db, config) {
    const store = db.createObjectStore(config.storeName, {
        keyPath: config.keyPath,
        autoIncrement: config.autoIncrement ?? true,
    });
    if (config.indexes) {
        config.indexes.forEach(index => {
            store.createIndex(index.name, index.keyPath, index.options);
        });
    }
}
//# sourceMappingURL=database.js.map