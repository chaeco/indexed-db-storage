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
    if (!options.dbName || !options.dbName.trim()) {
      throw new Error('StorageOptions.dbName must be a non-empty string.')
    }
    if (!options.storeName || !options.storeName.trim()) {
      throw new Error('StorageOptions.storeName must be a non-empty string.')
    }
    // 数值型清理参数必须是有限正数；负数、0、NaN、Infinity 均无意义且会导致异常行为
    if (options.maxRecords !== undefined) {
      // maxRecords 还必须是整数——小数在理论上可通过，但语义不清，统一拒绝
      if (!Number.isInteger(options.maxRecords) || options.maxRecords <= 0) {
        throw new Error('StorageOptions.maxRecords must be a positive integer.')
      }
    }
    if (options.retentionTime !== undefined) {
      if (!Number.isFinite(options.retentionTime) || options.retentionTime <= 0) {
        throw new Error('StorageOptions.retentionTime must be a finite positive number (milliseconds).')
      }
    }
    if (options.cleanupInterval !== undefined) {
      // Infinity 会使 setInterval 行为因运行时而异（可能立即触发或永不触发）
      if (!Number.isFinite(options.cleanupInterval) || options.cleanupInterval <= 0) {
        throw new Error('StorageOptions.cleanupInterval must be a finite positive number (milliseconds).')
      }
    }
    // retentionTime / maxRecords 必须配合 cleanupInterval 才会生效；
    // 仅配置二者之一而不设 cleanupInterval，定时清理逻辑永远不会运行，属于静默失效的常见误用。
    // 注意：即使不设 cleanupInterval，仍可通过手动调用 cleanup() 触发一次性清理。
    if ((options.retentionTime || options.maxRecords) && !options.cleanupInterval) {
      console.warn(
        '[IndexedDBStorage] retentionTime/maxRecords is set but cleanupInterval is missing. ' +
        'Automatic cleanup will never run. Please set cleanupInterval to enable it, ' +
        'or call cleanup() manually when needed.'
      )
    }
    // 反向情况：设置了 cleanupInterval 但没有配置任何清理规则
    // getCleanupConfig() 在此场景下返回 null，CleanupManager 不会创建，定时器不会启动。
    if (options.cleanupInterval && !options.maxRecords && !options.retentionTime) {
      console.warn(
        '[IndexedDBStorage] cleanupInterval is set but neither maxRecords nor retentionTime is provided. ' +
        'No cleanup will run. Set at least one of maxRecords or retentionTime.'
      )
    }
    // storeConfig.storeName 必须与 options.storeName 完全一致：
    // 数据库创建时使用 storeConfig.storeName 命名 objectStore，
    // 而后续所有读写操作都通过 options.storeName 定位 store。
    // 两者不一致会导致运行时 "Failed to execute 'transaction': object store not found" 错误。
    if (storeConfig && storeConfig.storeName !== options.storeName) {
      throw new Error(
        `storeConfig.storeName ("${storeConfig.storeName}") must match options.storeName ("${options.storeName}"). ` +
        'The object store is identified by options.storeName; storeConfig.storeName must be the same.'
      )
    }
    this.storageOptions = options
    this.storeConfig = storeConfig
  }

  getDbName(): string {
    return this.storageOptions.dbName
  }

  getStoreName(): string {
    return this.storageOptions.storeName
  }

  /**
   * 使用 `\x00`（null byte）作分隔符，避免 `dbName+storeName` 组合碰撞
   * （如 `"a:b"+"c"` 与 `"a"+"b:c"` 使用 `:` 分隔时会产生相同的键）。
   */
  static buildInstanceKey(dbName: string, storeName: string): string {
    return `${dbName}\x00${storeName}`
  }

  getInstanceKey(): string {
    return ConfigManager.buildInstanceKey(this.storageOptions.dbName, this.storageOptions.storeName)
  }

  /** 未传 storeConfig 时返回最小默认配置（storeName + autoIncrement=true，无 keyPath） */
  getStoreConfig(): StoreConfig {
    return (
      this.storeConfig ?? {
        storeName: this.storageOptions.storeName,
        autoIncrement: true,
      }
    )
  }

  /**
   * 返回清理配置，或 null（表示不启动 CleanupManager）。
   * cleanupInterval 未设置，或 maxRecords/retentionTime 均未设置时，返回 null。
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

}
