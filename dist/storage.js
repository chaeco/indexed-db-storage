import { ConfigManager } from './core/config-manager';
import { initDatabase } from './managers/database';
import { CleanupManager } from './managers/cleanup';
import * as InstanceManager from './managers/instance';
import { saveData, updateData, queryData, getData, deleteData, clearAllData, getCount, } from './core/data-operations';
export class IndexedDBStorage {
    constructor(options, storeConfig) {
        this.db = null;
        this.initPromise = null;
        this.config = new ConfigManager(options, storeConfig);
        const instanceKey = this.config.getInstanceKey();
        const existing = InstanceManager.getInstance(instanceKey);
        if (existing) {
            return existing;
        }
        InstanceManager.registerInstance(instanceKey, this);
    }
    static getInstance(options, storeConfig) {
        return new IndexedDBStorage(options, storeConfig);
    }
    static clearInstance(options) {
        if (options) {
            const config = new ConfigManager(options);
            const key = config.getInstanceKey();
            const instance = InstanceManager.getInstance(key);
            if (instance) {
                instance.close();
                InstanceManager.removeInstance(key);
            }
        }
        else {
            InstanceManager.clearAllInstances();
        }
    }
    async init() {
        if (this.db)
            return Promise.resolve();
        if (this.initPromise)
            return this.initPromise;
        this.initPromise = (async () => {
            try {
                const storeConfig = this.config.getStoreConfig();
                this.db = await initDatabase(this.config.getDbName(), storeConfig);
                const cleanupConfig = this.config.getCleanupConfig();
                if (cleanupConfig && this.db) {
                    this.cleanupManager = new CleanupManager(this.db, this.config.getStoreName(), cleanupConfig);
                    this.cleanupManager.start();
                }
            }
            finally {
                this.initPromise = null;
            }
        })();
        return this.initPromise;
    }
    async save(data) {
        this.ensureInitialized();
        const key = await saveData(this.db, this.config.getStoreName(), data);
        if (this.cleanupManager) {
            const cleanupConfig = this.config.getCleanupConfig();
            if (cleanupConfig?.maxRecords) {
                this.cleanupManager.cleanup().catch((err) => {
                    console.warn('Cleanup after save failed:', err);
                });
            }
        }
        return key;
    }
    async update(data) {
        this.ensureInitialized();
        return updateData(this.db, this.config.getStoreName(), data);
    }
    async query(options) {
        if (!this.db)
            return [];
        return queryData(this.db, this.config.getStoreName(), options);
    }
    async get(key) {
        if (!this.db)
            return undefined;
        return getData(this.db, this.config.getStoreName(), key);
    }
    async delete(key) {
        if (!this.db)
            return;
        return deleteData(this.db, this.config.getStoreName(), key);
    }
    async clear() {
        if (!this.db)
            return;
        return clearAllData(this.db, this.config.getStoreName());
    }
    async count() {
        if (!this.db)
            return 0;
        return getCount(this.db, this.config.getStoreName());
    }
    async cleanup() {
        if (this.cleanupManager) {
            await this.cleanupManager.cleanup();
        }
    }
    stopCleanupTimer() {
        if (this.cleanupManager) {
            this.cleanupManager.stop();
        }
    }
    close() {
        this.stopCleanupTimer();
        if (this.db) {
            this.db.close();
            this.db = null;
            this.initPromise = null;
        }
    }
    destroy() {
        this.close();
        InstanceManager.removeInstance(this.config.getInstanceKey());
    }
    ensureInitialized() {
        if (!this.db) {
            throw new Error('Database not initialized. Call init() first.');
        }
    }
}
//# sourceMappingURL=storage.js.map