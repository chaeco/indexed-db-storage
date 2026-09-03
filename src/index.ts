/**
 * @chaeco/indexed-db-storage
 * 通用 IndexedDB 存储解决方案
 *
 * @packageDocumentation
 */

export { IndexedDBStorage } from './storage'
export type {
  // 配置类型
  StorageOptions,
  StoreConfig,
  IndexConfig,
  CleanupConfig,
  // 查询类型
  QueryOperator,
  WhereCondition,
  SortOption,
  QueryOptions,
  // 存储类型
  IStorage,
  ITransactionScope,
  StorageWriteEvent,
  // 向后兼容别名
  StorageOptions as IndexedDBStorageOptions,
  QueryOptions as IndexedDBQueryOptions,
} from './types/index'
