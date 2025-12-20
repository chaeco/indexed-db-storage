/**
 * IndexedDB 通用存储类 - 主入口
 */

import type { StorageOptions, StoreConfig, QueryOptions, IStorage } from './types/index'
import { ConfigManager } from './core/config-manager'
import { initDatabase } from './managers/database'
import { CleanupManager } from './managers/cleanup'
import * as InstanceManager from './managers/instance'
import {
  saveData,
  updateData,
  queryData,
  getData,
  deleteData,
  clearAllData,
  getCount,
} from './core/data-operations'

/**
 * IndexedDB 通用存储类
 *
 * @example
 * ```typescript
 * const storage = new IndexedDBStorage({
 *   dbName: 'my-app',
 *   storeName: 'users',
 *   maxRecords: 1000,
 * })
 *
 * await storage.init()
 * await storage.save({ name: 'John', age: 30 })
 * const data = await storage.query({ limit: 10 })
 * ```
 */
export class IndexedDBStorage<T = unknown> implements IStorage<T> {
  private config: ConfigManager
  private db: IDBDatabase | null = null
  private cleanupManager?: CleanupManager
  private initPromise: Promise<void> | null = null

  constructor(options: StorageOptions, storeConfig?: StoreConfig) {
    this.config = new ConfigManager(options, storeConfig)

    // 实现单例模式
    const instanceKey = this.config.getInstanceKey()
    const existing = InstanceManager.getInstance(instanceKey)
    if (existing) {
      return existing as this
    }

    InstanceManager.registerInstance(instanceKey, this)
  }

  /**
   * 获取实例（推荐直接使用构造函数）
   * @deprecated 直接使用 new IndexedDBStorage() 即可
   */
  static getInstance<T = unknown>(
    options: StorageOptions,
    storeConfig?: StoreConfig
  ): IndexedDBStorage<T> {
    return new IndexedDBStorage<T>(options, storeConfig)
  }

  /**
   * 清除指定的实例缓存
   */
  static clearInstance(options?: StorageOptions): void {
    if (options) {
      const config = new ConfigManager(options)
      const key = config.getInstanceKey()
      const instance = InstanceManager.getInstance(key)
      if (instance) {
        instance.close()
        InstanceManager.removeInstance(key)
      }
    } else {
      InstanceManager.clearAllInstances()
    }
  }

  /**
   * 初始化数据库
   */
  async init(): Promise<void> {
    if (this.db) return Promise.resolve()
    if (this.initPromise) return this.initPromise

    this.initPromise = (async () => {
      try {
        const storeConfig = this.config.getStoreConfig()
        this.db = await initDatabase(this.config.getDbName(), storeConfig)

        // 启动清理管理器
        const cleanupConfig = this.config.getCleanupConfig()
        if (cleanupConfig && this.db) {
          this.cleanupManager = new CleanupManager(
            this.db,
            this.config.getStoreName(),
            cleanupConfig
          )
          this.cleanupManager.start()
        }
      } finally {
        this.initPromise = null
      }
    })()

    return this.initPromise
  }

  /**
   * 保存数据
   */
  async save(data: T): Promise<IDBValidKey> {
    this.ensureInitialized()
    const key = await saveData(this.db!, this.config.getStoreName(), data)

    // 异步触发清理
    if (this.cleanupManager) {
      const cleanupConfig = this.config.getCleanupConfig()
      if (cleanupConfig?.maxRecords) {
        this.cleanupManager.cleanup().catch((err: unknown) => {
          console.warn('Cleanup after save failed:', err)
        })
      }
    }

    return key
  }

  /**
   * 更新数据
   */
  async update(data: T): Promise<IDBValidKey> {
    this.ensureInitialized()
    return updateData(this.db!, this.config.getStoreName(), data)
  }

  /**
   * 查询数据
   */
  async query(options?: QueryOptions): Promise<T[]> {
    if (!this.db) return []
    return queryData<T>(this.db, this.config.getStoreName(), options)
  }

  /**
   * 根据主键获取数据
   */
  async get(key: IDBValidKey): Promise<T | undefined> {
    if (!this.db) return undefined
    return getData<T>(this.db, this.config.getStoreName(), key)
  }

  /**
   * 删除数据
   */
  async delete(key: IDBValidKey): Promise<void> {
    if (!this.db) return
    return deleteData(this.db, this.config.getStoreName(), key)
  }

  /**
   * 清空所有数据
   */
  async clear(): Promise<void> {
    if (!this.db) return
    return clearAllData(this.db, this.config.getStoreName())
  }

  /**
   * 获取记录总数
   */
  async count(): Promise<number> {
    if (!this.db) return 0
    return getCount(this.db, this.config.getStoreName())
  }

  /**
   * 手动触发清理
   */
  async cleanup(): Promise<void> {
    if (this.cleanupManager) {
      await this.cleanupManager.cleanup()
    }
  }

  /**
   * 停止清理任务
   */
  stopCleanupTimer(): void {
    if (this.cleanupManager) {
      this.cleanupManager.stop()
    }
  }

  /**
   * 关闭数据库连接
   */
  close(): void {
    this.stopCleanupTimer()
    if (this.db) {
      this.db.close()
      this.db = null
      this.initPromise = null
    }
  }

  /**
   * 销毁实例
   */
  destroy(): void {
    this.close()
    InstanceManager.removeInstance(this.config.getInstanceKey())
  }

  /**
   * 确保数据库已初始化
   */
  private ensureInitialized(): void {
    if (!this.db) {
      throw new Error('Database not initialized. Call init() first.')
    }
  }
}
