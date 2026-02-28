import { openStore } from '../utils/idb';
export class CleanupManager {
    constructor(db, storeName, config) {
        this.isCleanupRunning = false;
        this.db = db;
        this.storeName = storeName;
        this.config = config;
    }
    start() {
        if (this.cleanupTimer !== undefined)
            return;
        this.cleanupTimer = setInterval(async () => {
            try {
                await this.cleanup();
            }
            catch (error) {
                console.warn('[IndexedDBStorage] Cleanup timer error:', error);
            }
        }, this.config.cleanupInterval);
    }
    stop() {
        if (this.cleanupTimer !== undefined) {
            clearInterval(this.cleanupTimer);
            this.cleanupTimer = undefined;
        }
    }
    async cleanup() {
        if (this.isCleanupRunning)
            return;
        this.isCleanupRunning = true;
        try {
            if (this.config.retentionTime) {
                await this.deleteExpiredData();
            }
            if (this.config.maxRecords) {
                await this.enforceMaxRecords();
            }
        }
        finally {
            this.isCleanupRunning = false;
        }
    }
    async deleteExpiredData() {
        const timestampIndexName = this.config.timestampIndexName ?? 'timestamp';
        const expiredTime = Date.now() - this.config.retentionTime;
        return new Promise((resolve, reject) => {
            const store = openStore(this.db, this.storeName, 'readwrite', reject);
            const transaction = store.transaction;
            if (!store.indexNames.contains(timestampIndexName)) {
                console.warn(`[IndexedDBStorage] Cleanup: timestamp index "${timestampIndexName}" not found on store "${this.storeName}". ` +
                    'Expired data will not be deleted. Add the index or set timestampIndexName correctly.');
                transaction.onabort = () => resolve();
                transaction.abort();
                return;
            }
            const index = store.index(timestampIndexName);
            const range = IDBKeyRange.upperBound(expiredTime);
            const request = index.openCursor(range);
            request.onerror = () => reject(request.error);
            request.onsuccess = () => {
                const cursor = request.result;
                if (cursor) {
                    cursor.delete();
                    cursor.continue();
                }
                else {
                    resolve();
                }
            };
        });
    }
    async enforceMaxRecords() {
        return new Promise((resolve, reject) => {
            const store = openStore(this.db, this.storeName, 'readwrite', reject);
            const countRequest = store.count();
            countRequest.onerror = () => reject(countRequest.error);
            countRequest.onsuccess = () => {
                const count = countRequest.result;
                if (count > this.config.maxRecords) {
                    const targetCount = Math.max(1, Math.floor(this.config.maxRecords * 0.9));
                    const toDelete = count - targetCount;
                    const request = store.openCursor();
                    let deleted = 0;
                    request.onerror = () => reject(request.error);
                    request.onsuccess = () => {
                        const cursor = request.result;
                        if (cursor && deleted < toDelete) {
                            cursor.delete();
                            deleted++;
                            cursor.continue();
                        }
                        else {
                            resolve();
                        }
                    };
                }
                else {
                    resolve();
                }
            };
        });
    }
}
//# sourceMappingURL=cleanup.js.map