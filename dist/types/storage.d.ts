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
    close(): void;
}
export interface LifecycleHooks {
    beforeInit?(): Promise<void> | void;
    afterInit?(): Promise<void> | void;
    beforeSave?<T>(data: T): Promise<T> | T;
    afterSave?<T>(data: T, key: IDBValidKey): Promise<void> | void;
    beforeClose?(): Promise<void> | void;
}
//# sourceMappingURL=storage.d.ts.map