/**
 * 配置管理器
 */

import type { StorageOptions, StoreConfig, CleanupConfig } from '../types/index'

/**
 * 配置管理器类
 */
export class ConfigManager {
  private storageOptions: StorageOptions
  private storeConfig?: StoreConfig

  constructor(options: StorageOptions, storeConfig?: StoreConfig) {
    this.storageOptions = options
    this.storeConfig = storeConfig
  }

  /**
   * 获取数据库名称
   */
  getDbName(): string {
    return this.storageOptions.dbName
  }

  /**
   * 获取存储名称
   */
  getStoreName(): string {
    return this.storageOptions.storeName
  }

  /**
   * 获取实例唯一键
   */
  getInstanceKey(): string {
    return `${this.storageOptions.dbName}:${this.storageOptions.storeName}`
  }

  /**
   * 获取存储配置
   */
  getStoreConfig(): StoreConfig {
    return (
      this.storeConfig ?? {
        storeName: this.storageOptions.storeName,
        autoIncrement: true,
      }
    )
  }

  /**
   * 获取清理配置
   */
  getCleanupConfig(): CleanupConfig | null {
    const { maxRecords, retentionTime, cleanupInterval, timestampIndexName } = this.storageOptions

    if (!cleanupInterval || (!maxRecords && !retentionTime)) {
      return null
    }

    return {
      maxRecords,
      retentionTime,
      cleanupInterval,
      timestampIndexName,
    }
  }

  /**
   * 是否启用清理
   */
  isCleanupEnabled(): boolean {
    return this.getCleanupConfig() !== null
  }

  /**
   * 获取所有配置
   */
  getAllOptions(): Readonly<StorageOptions> {
    return Object.freeze({ ...this.storageOptions })
  }
}
