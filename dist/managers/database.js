function getIndexedDB() {
    const idb = 'indexedDB' in globalThis
        ? globalThis.indexedDB
        : undefined;
    if (!idb) {
        throw new Error('IndexedDB is not supported in this environment.');
    }
    return idb;
}
export async function initDatabase(dbName, storeConfig) {
    return new Promise((resolve, reject) => {
        let idb;
        try {
            idb = getIndexedDB();
        }
        catch (e) {
            reject(e);
            return;
        }
        const probeRequest = idb.open(dbName);
        probeRequest.onerror = () => reject(probeRequest.error);
        probeRequest.onupgradeneeded = () => {
            createObjectStore(probeRequest.result, storeConfig);
        };
        probeRequest.onsuccess = () => {
            const db = probeRequest.result;
            if (db.objectStoreNames.contains(storeConfig.storeName)) {
                resolve(db);
                return;
            }
            const nextVersion = db.version + 1;
            db.close();
            const upgradeRequest = idb.open(dbName, nextVersion);
            upgradeRequest.onblocked = () => {
                reject(new Error(`Database "${dbName}" upgrade to v${nextVersion} is blocked. ` +
                    'Close all other tabs or connections to this database and retry.'));
            };
            upgradeRequest.onupgradeneeded = () => {
                const upgradedDb = upgradeRequest.result;
                if (!upgradedDb.objectStoreNames.contains(storeConfig.storeName)) {
                    createObjectStore(upgradedDb, storeConfig);
                }
            };
            upgradeRequest.onsuccess = () => resolve(upgradeRequest.result);
            upgradeRequest.onerror = () => reject(upgradeRequest.error);
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