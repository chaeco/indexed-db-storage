import type { StorageOptions, StoreConfig, QueryOptions, IStorage } from './types/index';
export declare class IndexedDBStorage<T = unknown> implements IStorage<T> {
    private config;
    private db;
    private cleanupManager?;
    private initPromise;
    constructor(options: StorageOptions, storeConfig?: StoreConfig);
    static getInstance<T = unknown>(options: StorageOptions, storeConfig?: StoreConfig): IndexedDBStorage<T>;
    static clearInstance(options?: StorageOptions): void;
    init(): Promise<void>;
    save(data: T): Promise<IDBValidKey>;
    update(data: T): Promise<IDBValidKey>;
    query(options?: QueryOptions): Promise<T[]>;
    get(key: IDBValidKey): Promise<T | undefined>;
    delete(key: IDBValidKey): Promise<void>;
    clear(): Promise<void>;
    count(): Promise<number>;
    cleanup(): Promise<void>;
    stopCleanupTimer(): void;
    close(): void;
    destroy(): void;
    private ensureInitialized;
}
//# sourceMappingURL=storage.d.ts.map