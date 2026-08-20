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
 * })
 *
 * await storage.init()
 * await storage.save({ name: 'John', age: 30 })
 * const data = await storage.query({ limit: 10 })
 * ```
 *
 * @example 开启自动清理
 * ```typescript
 * const storage = new IndexedDBStorage({
 *   dbName: 'app-logs',
 *   storeName: 'logs',
 *   maxRecords: 1000,
 *   cleanupInterval: 60 * 60 * 1000, // cleanupInterval 必须与 maxRecords/retentionTime 同时配置
 * })
 * ```
 */
export class IndexedDBStorage<T = unknown> implements IStorage<T> {
  private config: ConfigManager
  private db: IDBDatabase | null = null
  private cleanupManager?: CleanupManager
  private initPromise: Promise<void> | null = null
  // 每次 close() 递增；init() 通过对比世代检测并发关闭，避免连接泄漏
  private _initGeneration = 0

  constructor(options: StorageOptions, storeConfig?: StoreConfig) {
    this.config = new ConfigManager(options, storeConfig)

    const instanceKey = this.config.getInstanceKey()
    const existing = InstanceManager.getInstance(instanceKey)
    if (existing) {
      // 单例已存在时新 storeConfig 不会生效，避免调用方静默忽略
      if (storeConfig) {
        console.warn(
          `[IndexedDBStorage] An instance for dbName="${options.dbName}" storeName="${options.storeName}" already exists. ` +
            'The new storeConfig will be ignored. Call destroy() first if you need to reconfigure.'
        )
      }
      return existing as this
    }

    InstanceManager.registerInstance(instanceKey, this)
  }

  /**
   * 关闭并从单例缓存中移除指定实例。
   * 传入 options 时精确移除对应实例；不传时清除所有实例。
   */
  static clearInstance(options?: StorageOptions): void {
    if (options) {
      const key = ConfigManager.buildInstanceKey(options.dbName, options.storeName)
      const instance = InstanceManager.getInstance(key)
      if (instance) {
        // destroy() = close() + removeInstance()，避免在此重复实现相同逻辑
        instance.destroy()
      }
    } else {
      InstanceManager.clearAllInstances()
    }
  }

  /**
   * 初始化数据库
   */
  async init(): Promise<void> {
    if (this.db) return
    if (this.initPromise) return this.initPromise

    const generation = this._initGeneration

    this.initPromise = (async () => {
      try {
        const storeConfig = this.config.getStoreConfig()
        const db = await initDatabase(this.config.getDbName(), storeConfig)

        // 世代不匹配：等待期间 close() 已被调用，丢弃此连接避免泄漏。
        // 抛出错误而非静默返回——静默返回 void 会让调用方误以为初始化成功。
        if (this._initGeneration !== generation) {
          db.close()
          throw new Error(
            'Database initialization was cancelled because close() was called concurrently.'
          )
        }

        this.db = db

        const cleanupConfig = this.config.getCleanupConfig()
        if (cleanupConfig) {
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

    // 非阻塞地触发清理（fire-and-forget），避免影响 save() 的响应时间
    if (this.cleanupManager) {
      this.cleanupManager.cleanup().catch((err: unknown) => {
        console.warn('[IndexedDBStorage] Cleanup after save failed:', err)
      })
    }

    return key
  }

  /**
   * 更新数据（upsert 语义）。
   *
   * 底层使用 IndexedDB `put()`：若指定主键的记录已存在则替换整条记录，
   * 若不存在则插入新记录。如需严格"仅更新已有记录"语义，请先调用
   * `get()` 确认记录存在后再调用此方法。
   */
  async update(data: T): Promise<IDBValidKey> {
    this.ensureInitialized()
    return updateData(this.db!, this.config.getStoreName(), data)
  }

  /**
   * 查询数据
   */
  async query(options?: QueryOptions): Promise<T[]> {
    this.ensureInitialized()
    return queryData<T>(this.db!, this.config.getStoreName(), options)
  }

  /**
   * 根据主键获取数据
   */
  async get(key: IDBValidKey): Promise<T | undefined> {
    this.ensureInitialized()
    return getData<T>(this.db!, this.config.getStoreName(), key)
  }

  /**
   * 删除数据
   */
  async delete(key: IDBValidKey): Promise<void> {
    this.ensureInitialized()
    return deleteData(this.db!, this.config.getStoreName(), key)
  }

  /**
   * 清空所有数据
   */
  async clear(): Promise<void> {
    this.ensureInitialized()
    return clearAllData(this.db!, this.config.getStoreName())
  }

  /**
   * 获取记录总数
   */
  async count(): Promise<number> {
    this.ensureInitialized()
    return getCount(this.db!, this.config.getStoreName())
  }

  /**
   * 手动触发一次清理，不依赖定时器。
   * 若构造时未配置 maxRecords/retentionTime，此方法是 no-op，不抛出错误。
   */
  async cleanup(): Promise<void> {
    if (this.cleanupManager) {
      await this.cleanupManager.cleanup()
    }
  }

  /** close() / destroy() 的内部辅助，停止清理定时器 */
  private stopCleanupTimer(): void {
    if (this.cleanupManager) {
      this.cleanupManager.stop()
    }
  }

  /**
   * 关闭数据库连接。
   * 若 init() 正在进行中，世代递增会使其结果失效并抛出错误，避免竞态连接泄漏。
   */
  close(): void {
    this._initGeneration++
    this.stopCleanupTimer()
    this.cleanupManager = undefined
    this.initPromise = null
    if (this.db) {
      this.db.close()
      this.db = null
    }
  }

  /**
   * 关闭连接并从单例缓存中移除此实例（= close + removeInstance）。
   * 之后以相同参数调用 `new IndexedDBStorage()` 将创建全新实例。
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
