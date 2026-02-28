import type { QueryOptions } from './operations';
export interface IStorage<T = unknown> {
    init(): Promise<void>;
    save(data: T): Promise<IDBValidKey>;
    update(data: T): Promise<IDBValidKey>;
    query(options?: QueryOptions): Promise<T[]>;
    get(key: IDBValidKey): Promise<T | undefined>;
    delete(key: IDBValidKey): Promise<void>;
    clear(): Promise<void>;
    count(): Promise<number>;
    cleanup(): Promise<void>;
    close(): void;
    destroy(): void;
}
//# sourceMappingURL=storage.d.ts.map