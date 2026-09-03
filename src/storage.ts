/**
 * IndexedDB 通用存储类 - 主入口
 */

import type { StorageOptions, StoreConfig, QueryOptions, IStorage } from './types/index'
import type { ITransactionScope, StorageWriteEvent } from './types/storage'
import { ConfigManager } from './core/config-manager'
import { initDatabase } from './managers/database'
import { CleanupManager } from './managers/cleanup'
import * as InstanceManager from './managers/instance'
import {
  saveData,
  updateData,
  bulkAddData,
  bulkPutData,
  bulkDeleteData,
  queryData,
  getData,
  getManyData,
  iterateData,
  deleteManyData,
  queryKeysData,
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
  // onWrite 监听器（本地 + 远程事件共用）
  private _writeListeners = new Set<(event: StorageWriteEvent) => void>()
  // 跨标签页通知通道（按 dbName 复用；BroadcastChannel 不可用时为 undefined）
  private _writeChannel?: BroadcastChannel

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
        const db = await initDatabase(
          this.config.getDbName(),
          this.config.getStoreConfig(),
          // 连接被 versionchange 让位逻辑或其他外部原因关闭时，同步清空内部引用，
          // 避免 ensureInitialized() 在陈旧连接上继续操作
          () => {
            if (this.db === db) this.db = null
          }
        )

        // 世代不匹配：等待期间 close() 已被调用，丢弃此连接避免泄漏。
        // 抛出错误而非静默返回——静默返回 void 会让调用方误以为初始化成功。
        if (this._initGeneration !== generation) {
          db.close()
          throw new Error(
            'Database initialization was cancelled because close() was called concurrently.'
          )
        }

        this.db = db

        // 跨标签页通知通道：同名库的所有实例共用一个频道，按 storeName 过滤
        if (typeof BroadcastChannel !== 'undefined' && !this._writeChannel) {
          this._writeChannel = new BroadcastChannel(`indexed-db-storage:${this.config.getDbName()}`)
          this._writeChannel.onmessage = (event: MessageEvent) => {
            const data = event.data as StorageWriteEvent | undefined
            if (data && data.storeName === this.config.getStoreName()) {
              this.dispatchWrite({ ...data, source: 'remote' })
            }
          }
        }

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

    this.emitWrite('add', [key])
    this.maybeTriggerCleanup()

    return key
  }

  /**
   * 批量插入数据（单事务，全有或全无）。
   *
   * N 条数据仅使用 1 次事务，吞吐量显著高于逐条 save()。
   * 任一记录写入失败（如键冲突）时整个批次回滚并以首个错误 reject。
   */
  async bulkAdd(items: T[]): Promise<IDBValidKey[]> {
    this.ensureInitialized()
    const keys = await bulkAddData(this.db!, this.config.getStoreName(), items)

    this.emitWrite('bulkAdd', keys)
    this.maybeTriggerCleanup()

    return keys
  }

  /**
   * 批量更新/插入数据（单事务 upsert，全有或全无）。
   */
  async bulkPut(items: T[]): Promise<IDBValidKey[]> {
    this.ensureInitialized()
    const keys = await bulkPutData(this.db!, this.config.getStoreName(), items)

    this.emitWrite('bulkPut', keys)
    this.maybeTriggerCleanup()

    return keys
  }

  /**
   * 批量删除数据（单事务）。
   * @returns 实际删除的记录数（删除不存在的 key 不算错误，也不计数）
   */
  async bulkDelete(keys: IDBValidKey[]): Promise<number> {
    this.ensureInitialized()
    const deleted = await bulkDeleteData(this.db!, this.config.getStoreName(), keys)

    this.emitWrite('bulkDelete', keys)

    return deleted
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
    const key = await updateData(this.db!, this.config.getStoreName(), data)

    this.emitWrite('put', [key])

    return key
  }

  /**
   * 查询数据
   */
  async query(options?: QueryOptions<T>): Promise<T[]> {
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
    await deleteData(this.db!, this.config.getStoreName(), key)

    this.emitWrite('delete', [key])
  }

  /**
   * 清空所有数据
   */
  async clear(): Promise<void> {
    this.ensureInitialized()
    await clearAllData(this.db!, this.config.getStoreName())

    this.emitWrite('clear')
  }

  /**
   * 获取记录总数
   */
  async count(): Promise<number> {
    this.ensureInitialized()
    return getCount(this.db!, this.config.getStoreName())
  }

  /**
   * 批量获取数据（单事务）。与输入顺序一致；不存在的 key 对应 undefined。
   */
  async getMany(keys: IDBValidKey[]): Promise<(T | undefined)[]> {
    this.ensureInitialized()
    return getManyData<T>(this.db!, this.config.getStoreName(), keys)
  }

  /**
   * 流式遍历记录：游标逐条回调，不在内存中累积全量结果。
   * onItem 返回 false 可提前终止。不支持 sort（传入将抛出错误）。
   * @returns 实际回调的记录数
   */
  async iterate(
    onItem: (item: T, key: IDBValidKey) => void | false,
    options?: QueryOptions<T>
  ): Promise<number> {
    this.ensureInitialized()
    return iterateData<T>(this.db!, this.config.getStoreName(), options, onItem)
  }

  /**
   * 按查询条件批量删除（单事务）。
   * sort+limit 可实现"删除最旧的 N 条"；不带条件时等价于 clear()。
   * @returns 实际删除的记录数
   */
  async deleteMany(options?: QueryOptions<T>): Promise<number> {
    this.ensureInitialized()
    return deleteManyData<T>(this.db!, this.config.getStoreName(), options)
  }

  /**
   * 只查询键、不反序列化记录值。不支持 sort（传入将抛出错误）。
   * 未指定 indexName 时返回主键；指定时返回该索引的键。
   */
  async queryKeys(options?: QueryOptions<T>): Promise<IDBValidKey[]> {
    this.ensureInitialized()
    return queryKeysData(this.db!, this.config.getStoreName(), options)
  }

  /**
   * 订阅写入事件（本地写入 + 其他标签页经 BroadcastChannel 同步的写入）。
   * @returns 取消订阅函数
   */
  onWrite(listener: (event: StorageWriteEvent) => void): () => void {
    this._writeListeners.add(listener)
    return () => {
      this._writeListeners.delete(listener)
    }
  }

  /** 分发写入事件给监听器；单个监听器异常不影响其他监听器 */
  private dispatchWrite(event: StorageWriteEvent): void {
    this._writeListeners.forEach(listener => {
      try {
        listener(event)
      } catch (err) {
        console.warn('[IndexedDBStorage] onWrite listener error:', err)
      }
    })
  }

  /** 写入操作完成后调用：通知本地监听器 + 广播到其他标签页 */
  private emitWrite(type: StorageWriteEvent['type'], keys?: IDBValidKey[]): void {
    const event: StorageWriteEvent = {
      storeName: this.config.getStoreName(),
      type,
      keys,
      source: 'local',
    }
    this.dispatchWrite(event)

    if (this._writeChannel) {
      try {
        // 广播体不携带 source——接收方以 'remote' 分发
        this._writeChannel.postMessage({
          storeName: event.storeName,
          type: event.type,
          keys: event.keys,
        })
      } catch {
        // 消息不可结构化克隆等场景：跨标签页通知失败不影响写入本身
      }
    }
  }

  /**
   * 在单个事务中原子执行一组操作。任何操作失败都会中止事务并回滚。
   *
   * ⚠️ scope 内只允许 await IndexedDB 请求；await 非 IDB 异步操作会导致
   * 事务自动提交（IndexedDB 规范行为），后续请求将抛出 InvalidStateError。
   */
  async runInTransaction<R>(
    mode: IDBTransactionMode,
    scope: (tx: ITransactionScope<T>) => Promise<R> | R
  ): Promise<R> {
    this.ensureInitialized()
    const tx = this.db!.transaction([this.config.getStoreName()], mode)
    const scopeObj = this.createTransactionScope(tx)

    // 收集 scope 内的写入，待事务成功提交后统一发出 onWrite 事件
    const pendingWrites: { type: StorageWriteEvent['type']; keys?: IDBValidKey[] }[] = []
    const trackWrite = (type: StorageWriteEvent['type']): (keys?: IDBValidKey[]) => void => {
      return keys => {
        pendingWrites.push({ type, keys })
      }
    }

    const scopedTx: ITransactionScope<T> = {
      get: scopeObj.get,
      getMany: scopeObj.getMany,
      count: scopeObj.count,
      query: scopeObj.query,
      save: data => scopeObj.save(data).then(key => (trackWrite('add')([key]), key)),
      update: data => scopeObj.update(data).then(key => (trackWrite('put')([key]), key)),
      bulkAdd: items =>
        scopeObj.bulkAdd(items).then(keys => (trackWrite('bulkAdd')(keys), keys)),
      bulkPut: items => scopeObj.bulkPut(items).then(keys => (trackWrite('bulkPut')(keys), keys)),
      delete: key => scopeObj.delete(key).then(() => trackWrite('delete')([key])),
      bulkDelete: keys =>
        scopeObj.bulkDelete(keys).then(n => (trackWrite('bulkDelete')(keys), n)),
    }

    let outcome: { ok: true; value: R } | { ok: false; error: unknown } | null = null

    // 事务落定信号：必须在 scope 执行前挂载。
    // 若 scope 内 await 了非 IDB 异步操作，事务会在事件循环空闲时自动提交，
    // 完成事件先于 scope 结束触发——晚挂载会让完成信号永远无人接收而挂起。
    const settled = new Promise<'complete' | 'abort'>(resolve => {
      tx.oncomplete = () => resolve('complete')
      tx.onabort = () => resolve('abort')
      // request 级错误未阻止时必然伴随 abort；resolve 幂等，与 onabort 竞争无副作用
      tx.onerror = () => resolve('abort')
    })

    try {
      const value = await scope(scopedTx)
      outcome = { ok: true, value }
    } catch (err) {
      outcome = { ok: false, error: err }
      try {
        tx.abort()
      } catch {
        // 事务已落定（如等待期间自动提交）：以 scope 抛出的错误为准
      }
    }

    const settledState = await settled

    if (outcome && !outcome.ok) {
      throw outcome.error
    }
    if (settledState === 'abort') {
      throw tx.error ?? new Error('Transaction aborted')
    }

    // 事务成功提交：统一发出 scope 内累积的写入事件
    for (const write of pendingWrites) {
      this.emitWrite(write.type, write.keys)
    }

    return (outcome as { ok: true; value: R }).value
  }

  /** 创建绑定到指定事务的操作集 */
  private createTransactionScope(tx: IDBTransaction): ITransactionScope<T> {
    const db = this.db!
    const storeName = this.config.getStoreName()
    return {
      get: key => getData<T>(db, storeName, key, tx),
      getMany: keys => getManyData<T>(db, storeName, keys, tx),
      save: data => saveData(db, storeName, data, tx),
      update: data => updateData(db, storeName, data, tx),
      bulkAdd: items => bulkAddData(db, storeName, items, tx),
      bulkPut: items => bulkPutData(db, storeName, items, tx),
      delete: key => deleteData(db, storeName, key, tx),
      bulkDelete: keys => bulkDeleteData(db, storeName, keys, tx),
      count: () => getCount(db, storeName, tx),
      query: options => queryData<T>(db, storeName, options, tx),
    }
  }

  /**
   * 请求将当前源（origin）标记为持久化存储，降低浏览器在存储压力下
   * 驱逐本库数据的概率。注意：对 Safari ITP 的"7 天不活跃清除"无效，
   * 该策略只能通过用户交互（如添加到主屏幕）规避。
   * @returns 用户授权结果；环境不支持时返回 null
   */
  static async requestPersistence(): Promise<boolean | null> {
    const storage = (globalThis as typeof globalThis & { navigator?: Navigator }).navigator?.storage
    if (!storage?.persist) return null
    return storage.persist()
  }

  /**
   * 查询当前源是否已被标记为持久化存储。
   * @returns 环境不支持时返回 null
   */
  static async isPersistent(): Promise<boolean | null> {
    const storage = (globalThis as typeof globalThis & { navigator?: Navigator }).navigator?.storage
    if (!storage?.persisted) return null
    return storage.persisted()
  }

  /**
   * 查询当前源的存储配额与用量（origin 级别，非单库）。
   * @returns 环境不支持时返回 null
   */
  static async estimate(): Promise<StorageEstimate | null> {
    const storage = (globalThis as typeof globalThis & { navigator?: Navigator }).navigator?.storage
    if (!storage?.estimate) return null
    return storage.estimate()
  }

  /**
   * save/bulk 后的 cleanup 触发。
   *
   * CleanupManager 自身有重入锁：上一轮清理未完成时 cleanup() 直接返回，
   * 因此这里无需额外时间窗去抖——高频写入时并发清理自然被跳过，
   * 同时保留"save 后过期数据尽快被清理"的语义（既有测试与文档依赖此行为）。
   * fire-and-forget，不影响 save/bulk 调用的响应时间。
   */
  private maybeTriggerCleanup(): void {
    if (!this.cleanupManager) return

    this.cleanupManager.cleanup().catch((err: unknown) => {
      console.warn('[IndexedDBStorage] Cleanup after save failed:', err)
    })
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
    // 关闭跨标签页通知通道并清空监听器（重新 init() 后需重新订阅 onWrite）
    if (this._writeChannel) {
      this._writeChannel.close()
      this._writeChannel = undefined
    }
    this._writeListeners.clear()
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
  }}
