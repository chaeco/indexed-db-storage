export class ConfigManager {
    constructor(options, storeConfig) {
        this.storageOptions = options;
        this.storeConfig = storeConfig;
    }
    getDbName() {
        return this.storageOptions.dbName;
    }
    getStoreName() {
        return this.storageOptions.storeName;
    }
    getInstanceKey() {
        return `${this.storageOptions.dbName}:${this.storageOptions.storeName}`;
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
    isCleanupEnabled() {
        return this.getCleanupConfig() !== null;
    }
    getAllOptions() {
        return Object.freeze({ ...this.storageOptions });
    }
}
//# sourceMappingURL=config-manager.js.map