export class ConfigManager {
    constructor(options, storeConfig) {
        if (!options.dbName || !options.dbName.trim()) {
            throw new Error('StorageOptions.dbName must be a non-empty string.');
        }
        if (!options.storeName || !options.storeName.trim()) {
            throw new Error('StorageOptions.storeName must be a non-empty string.');
        }
        if (options.maxRecords !== undefined) {
            if (!Number.isInteger(options.maxRecords) || options.maxRecords <= 0) {
                throw new Error('StorageOptions.maxRecords must be a positive integer.');
            }
        }
        if (options.retentionTime !== undefined) {
            if (!Number.isFinite(options.retentionTime) || options.retentionTime <= 0) {
                throw new Error('StorageOptions.retentionTime must be a finite positive number (milliseconds).');
            }
        }
        if (options.cleanupInterval !== undefined) {
            if (!Number.isFinite(options.cleanupInterval) || options.cleanupInterval <= 0) {
                throw new Error('StorageOptions.cleanupInterval must be a finite positive number (milliseconds).');
            }
        }
        if ((options.retentionTime || options.maxRecords) && !options.cleanupInterval) {
            console.warn('[IndexedDBStorage] retentionTime/maxRecords is set but cleanupInterval is missing. ' +
                'Automatic cleanup will never run. Please set cleanupInterval to enable it, ' +
                'or call cleanup() manually when needed.');
        }
        if (options.cleanupInterval && !options.maxRecords && !options.retentionTime) {
            console.warn('[IndexedDBStorage] cleanupInterval is set but neither maxRecords nor retentionTime is provided. ' +
                'No cleanup will run. Set at least one of maxRecords or retentionTime.');
        }
        if (storeConfig && storeConfig.storeName !== options.storeName) {
            throw new Error(`storeConfig.storeName ("${storeConfig.storeName}") must match options.storeName ("${options.storeName}"). ` +
                'The object store is identified by options.storeName; storeConfig.storeName must be the same.');
        }
        this.storageOptions = options;
        this.storeConfig = storeConfig;
    }
    getDbName() {
        return this.storageOptions.dbName;
    }
    getStoreName() {
        return this.storageOptions.storeName;
    }
    static buildInstanceKey(dbName, storeName) {
        return `${dbName}\x00${storeName}`;
    }
    getInstanceKey() {
        return ConfigManager.buildInstanceKey(this.storageOptions.dbName, this.storageOptions.storeName);
    }
    getStoreConfig() {
        return (this.storeConfig ?? {
            storeName: this.storageOptions.storeName,
            autoIncrement: true,
        });
    }
    getCleanupConfig() {
        const { maxRecords, retentionTime, cleanupInterval, timestampIndexName } = this.storageOptions;
        if (!cleanupInterval || (!maxRecords && !retentionTime)) {
            return null;
        }
        return {
            maxRecords,
            retentionTime,
            cleanupInterval,
            timestampIndexName,
        };
    }
}
//# sourceMappingURL=config-manager.js.map