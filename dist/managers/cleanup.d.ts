import type { CleanupConfig } from '../types/index';
export declare class CleanupManager {
    private db;
    private storeName;
    private config;
    private cleanupTimer?;
    constructor(db: IDBDatabase, storeName: string, config: CleanupConfig);
    start(): void;
    stop(): void;
    cleanup(): Promise<void>;
    private deleteExpiredData;
    private enforceMaxRecords;
}
//# sourceMappingURL=cleanup.d.ts.map