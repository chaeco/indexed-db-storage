export class CleanupManager {
    constructor(db, storeName, config) {
        this.db = db;
        this.storeName = storeName;
        this.config = config;
    }
    start() {
        if (!this.config.cleanupInterval)
            return;
        this.cleanupTimer = setInterval(async () => {
            try {
                await this.cleanup();
            }
            catch (error) {
                console.warn('IndexedDB cleanup failed:', error);
            }
        }, this.config.cleanupInterval);
    }
    stop() {
        if (this.cleanupTimer) {
            clearInterval(this.cleanupTimer);
            this.cleanupTimer = undefined;
        }
    }
    async cleanup() {
        if (this.config.retentionTime) {
            await this.deleteExpiredData();
        }
        if (this.config.maxRecords) {
            await this.enforceMaxRecords();
        }
    }
    async deleteExpiredData() {
        if (!this.config.retentionTime)
            return;
        const timestampIndexName = this.config.timestampIndexName ?? 'timestamp';
        const now = Date.now();
        const expiredTime = now - this.config.retentionTime;
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.storeName], 'readwrite');
            const store = transaction.objectStore(this.storeName);
            if (!store.indexNames.contains(timestampIndexName)) {
                resolve();
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
        if (!this.config.maxRecords)
            return;
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.storeName], 'readwrite');
            const store = transaction.objectStore(this.storeName);
            const countRequest = store.count();
            countRequest.onerror = () => reject(countRequest.error);
            countRequest.onsuccess = () => {
                const count = countRequest.result;
                if (count > this.config.maxRecords) {
                    const toDelete = count - Math.floor(this.config.maxRecords * 0.9);
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