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
  /** 最大记录数（可选，必须为正整数） */
  maxRecords?: number
  /** 数据保留时间（毫秒，可选，必须 > 0） */
  retentionTime?: number
  /** 清理间隔（毫秒，可选，必须 > 0） */
  cleanupInterval?: number
  /** 时间戳索引名称（用于清理，可选） */
  timestampIndexName?: string
}

/**
 * 清理配置（由 ConfigManager.getCleanupConfig() 构造，cleanupInterval 始终有值）
 */
export interface CleanupConfig {
  /** 最大记录数 */
  maxRecords?: number
  /** 保留时间（毫秒） */
  retentionTime?: number
  /**
   * 清理间隔（毫秒）。
   * 此字段在 CleanupConfig 对象内始终为正数——getCleanupConfig() 在
   * cleanupInterval 未设置时直接返回 null，不会构造出该对象。
   */
  cleanupInterval: number
  /** 时间戳索引名称 */
  timestampIndexName?: string
}
