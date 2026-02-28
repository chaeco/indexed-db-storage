export interface StoreConfig {
    storeName: string;
    keyPath?: string;
    autoIncrement?: boolean;
    indexes?: IndexConfig[];
}
export interface IndexConfig {
    name: string;
    keyPath: string | string[];
    options?: IDBIndexParameters;
}
export interface StorageOptions {
    dbName: string;
    storeName: string;
    maxRecords?: number;
    retentionTime?: number;
    cleanupInterval?: number;
    timestampIndexName?: string;
}
export interface CleanupConfig {
    maxRecords?: number;
    retentionTime?: number;
    cleanupInterval: number;
    timestampIndexName?: string;
}
//# sourceMappingURL=config.d.ts.map