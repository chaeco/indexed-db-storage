import type { QueryOptions } from '../types/index';
export declare function saveData<T>(db: IDBDatabase, storeName: string, data: T): Promise<IDBValidKey>;
export declare function updateData<T>(db: IDBDatabase, storeName: string, data: T): Promise<IDBValidKey>;
export declare function queryData<T>(db: IDBDatabase, storeName: string, options?: QueryOptions): Promise<T[]>;
export declare function getData<T>(db: IDBDatabase, storeName: string, key: IDBValidKey): Promise<T | undefined>;
export declare function deleteData(db: IDBDatabase, storeName: string, key: IDBValidKey): Promise<void>;
export declare function clearAllData(db: IDBDatabase, storeName: string): Promise<void>;
export declare function getCount(db: IDBDatabase, storeName: string): Promise<number>;
//# sourceMappingURL=data-operations.d.ts.map