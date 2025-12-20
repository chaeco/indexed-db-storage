/**
 * 配置相关类型定义
 */

/**
 * 对象存储配置
 */
export interface StoreConfig {
  /** 对象存储名称 */
  storeName: string
  /** 主键路径 */
  keyPath?: string
  /** 是否自动递增 */
  autoIncrement?: boolean
  /** 索引配置 */
  indexes?: IndexConfig[]
}

/**
 * 索引配置
 */
export interface IndexConfig {
  /** 索引名称 */
  name: string
  /** 索引键路径 */
  keyPath: string | string[]
  /** 索引选项 */
  options?: IDBIndexParameters
}

/**
 * 存储配置选项
 */
export interface StorageOptions {
  /** 数据库名称 */
  dbName: string
  /** 对象存储名称 */
  storeName: string
  /** 最大记录数（可选） */
  maxRecords?: number
  /** 数据保留时间（毫秒，可选） */
  retentionTime?: number
  /** 清理间隔（毫秒，可选） */
  cleanupInterval?: number
  /** 时间戳索引名称（用于清理，可选） */
  timestampIndexName?: string
}

/**
 * 清理配置
 */
export interface CleanupConfig {
  /** 最大记录数 */
  maxRecords?: number
  /** 保留时间（毫秒） */
  retentionTime?: number
  /** 清理间隔（毫秒） */
  cleanupInterval?: number
  /** 时间戳索引名称 */
  timestampIndexName?: string
}
