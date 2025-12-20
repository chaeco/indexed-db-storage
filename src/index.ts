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
  // 操作类型
  QueryOptions,
  QueryResult,
  // 存储类型
  IStorage,
  LifecycleHooks,
  // 向后兼容
  StorageOptions as IndexedDBStorageOptions,
  QueryOptions as IndexedDBQueryOptions,
} from './types/index'
