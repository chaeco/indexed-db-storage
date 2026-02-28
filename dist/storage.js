import { ConfigManager } from './core/config-manager';
import { initDatabase } from './managers/database';
import { CleanupManager } from './managers/cleanup';
import * as InstanceManager from './managers/instance';
import { saveData, updateData, queryData, getData, deleteData, clearAllData, getCount, } from './core/data-operations';
export class IndexedDBStorage {
    constructor(options, storeConfig) {
        this.db = null;
        this.initPromise = null;
        this._initGeneration = 0;
        this.config = new ConfigManager(options, storeConfig);
        const instanceKey = this.config.getInstanceKey();
        const existing = InstanceManager.getInstance(instanceKey);
        if (existing) {
            if (storeConfig) {
                console.warn(`[IndexedDBStorage] An instance for dbName="${options.dbName}" storeName="${options.storeName}" already exists. ` +
                    'The new storeConfig will be ignored. Call destroy() first if you need to reconfigure.');
            }
            return existing;
        }
        InstanceManager.registerInstance(instanceKey, this);
    }
    static clearInstance(options) {
        if (options) {
            const key = ConfigManager.buildInstanceKey(options.dbName, options.storeName);
            const instance = InstanceManager.getInstance(key);
            if (instance) {
                instance.destroy();
            }
        }
        else {
            InstanceManager.clearAllInstances();
        }
    }
    async init() {
        if (this.db)
            return;
        if (this.initPromise)
            return this.initPromise;
        const generation = this._initGeneration;
        this.initPromise = (async () => {
            try {
                const storeConfig = this.config.getStoreConfig();
                const db = await initDatabase(this.config.getDbName(), storeConfig);
                if (this._initGeneration !== generation) {
                    db.close();
                    throw new Error('Database initialization was cancelled because close() was called concurrently.');
                }
                this.db = db;
                const cleanupConfig = this.config.getCleanupConfig();
                if (cleanupConfig) {
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
            this.cleanupManager.cleanup().catch((err) => {
                console.warn('[IndexedDBStorage] Cleanup after save failed:', err);
            });
        }
        return key;
    }
    async update(data) {
        this.ensureInitialized();
        return updateData(this.db, this.config.getStoreName(), data);
    }
    async query(options) {
        this.ensureInitialized();
        return queryData(this.db, this.config.getStoreName(), options);
    }
    async get(key) {
        this.ensureInitialized();
        return getData(this.db, this.config.getStoreName(), key);
    }
    async delete(key) {
        this.ensureInitialized();
        return deleteData(this.db, this.config.getStoreName(), key);
    }
    async clear() {
        this.ensureInitialized();
        return clearAllData(this.db, this.config.getStoreName());
    }
    async count() {
        this.ensureInitialized();
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
        this._initGeneration++;
        this.stopCleanupTimer();
        this.cleanupManager = undefined;
        this.initPromise = null;
        if (this.db) {
            this.db.close();
            this.db = null;
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