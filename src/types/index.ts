/**
 * 类型定义统一导出
 */

export * from './config'
export * from './operations'
export * from './storage'

// 向后兼容
export type { StorageOptions as IndexedDBStorageOptions } from './config'
export type { QueryOptions as IndexedDBQueryOptions } from './operations'
