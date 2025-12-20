import type { StorageOptions, StoreConfig, CleanupConfig } from '../types/index';
export declare class ConfigManager {
    private storageOptions;
    private storeConfig?;
    constructor(options: StorageOptions, storeConfig?: StoreConfig);
    getDbName(): string;
    getStoreName(): string;
    getInstanceKey(): string;
    getStoreConfig(): StoreConfig;
    getCleanupConfig(): CleanupConfig | null;
    isCleanupEnabled(): boolean;
    getAllOptions(): Readonly<StorageOptions>;
}
//# sourceMappingURL=config-manager.d.ts.map