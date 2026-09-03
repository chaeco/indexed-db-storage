/**
 * 存储相关类型定义
 */

import type { QueryOptions } from './operations'

/**
 * 存储实例接口
 */
export interface IStorage<T = unknown> {
  /** 初始化 */
  init(): Promise<void>
  /** 保存数据 */
  save(data: T): Promise<IDBValidKey>
  /** 更新数据（upsert：主键已存在则替换，否则插入） */
  update(data: T): Promise<IDBValidKey>
  /**
   * 批量插入数据（单事务，全有或全无）。
   * 任一记录写入失败（如键冲突）时整个批次回滚并以首个错误 reject。
   */
  bulkAdd(items: T[]): Promise<IDBValidKey[]>
  /**
   * 批量更新/插入数据（单事务 upsert，全有或全无）。
   * 任一记录写入失败时整个批次回滚并以首个错误 reject。
   */
  bulkPut(items: T[]): Promise<IDBValidKey[]>
  /**
   * 批量删除数据（单事务）。
   * @returns 实际删除的记录数（删除不存在的 key 不算错误，也不计数）
   */
  bulkDelete(keys: IDBValidKey[]): Promise<number>
  /** 查询数据 */
  query(options?: QueryOptions<T>): Promise<T[]>
  /** 获取单条数据 */
  get(key: IDBValidKey): Promise<T | undefined>
  /**
   * 批量获取数据（单事务）。结果与输入顺序一致；不存在的 key 对应 `undefined`。
   * 列表页按 ID 批量取详情时，替代循环 `get()`（N 个事务 → 1 个）。
   */
  getMany(keys: IDBValidKey[]): Promise<(T | undefined)[]>
  /**
   * 流式遍历记录：游标逐条回调，不在内存中累积全量结果。
   * 适合大数据量导出/批处理。遍历顺序 = 游标顺序（主键序或 indexName 索引序），
   * 不支持 `sort`（传入将抛出错误）。
   * @param onItem 每条记录的回调（key 为记录主键，与遍历源无关）；返回 `false` 可提前终止遍历
   * @returns 实际回调的记录数
   */
  iterate(
    onItem: (item: T, key: IDBValidKey) => void | false,
    options?: QueryOptions<T>
  ): Promise<number>
  /**
   * 按查询条件批量删除（单事务）。支持 `where`/`filter`/`indexName`/`range`/
   * `after`/`before`/`direction`/`sort`/`limit`/`offset`（`sort`+`limit` 可实现
   * "删除最旧的 N 条"）。不带任何条件时等价于 `clear()`（大表清空请直接用 `clear()`）。
   * @returns 实际删除的记录数
   */
  deleteMany(options?: QueryOptions<T>): Promise<number>
  /**
   * 只查询键、不反序列化记录值，适合存在性检查/批量取 ID。
   * 始终返回记录的**主键**（依据 IDB 规范，即使经 indexName 遍历亦为主键）。
   * 不支持 `sort`（传入将抛出错误）。
   */
  queryKeys(options?: QueryOptions<T>): Promise<IDBValidKey[]>
  /**
   * 订阅写入事件（本标签页 + 其他标签页经 BroadcastChannel 同步的写入）。
   * 注意：BroadcastChannel 不可用的环境下仅收到本地事件；`close()` 会清空所有监听器。
   * @returns 取消订阅函数
   */
  onWrite(listener: (event: StorageWriteEvent) => void): () => void
  /**
   * 在单个事务中原子执行一组操作。任何操作失败都会中止事务并回滚。
   *
   * ⚠️ 限制：scope 内只允许 await IndexedDB 请求（scope 提供的方法）。
   * 若 await 了非 IDB 的异步操作（fetch/setTimeout 等），事务会在事件循环
   * 空闲时自动提交，后续请求将抛出 InvalidStateError——这是 IndexedDB 规范行为。
   *
   * @example
   * ```ts
   * await storage.runInTransaction('readwrite', async tx => {
   *   await tx.save(order)
   *   await tx.update(inventory)
   * })
   * ```
   */
  runInTransaction<R>(
    mode: IDBTransactionMode,
    scope: (tx: ITransactionScope<T>) => Promise<R> | R
  ): Promise<R>
  /** 删除数据 */
  delete(key: IDBValidKey): Promise<void>
  /** 清空数据 */
  clear(): Promise<void>
  /** 获取总数 */
  count(): Promise<number>
  /**
   * 手动触发一次清理（不依赖定时器，始终可调用）。
   * 若构造时未配置 maxRecords/retentionTime，此方法是 no-op，不抛出错误。
   */
  cleanup(): Promise<void>
  /**
   * 关闭数据库连接，但**保留**单例缓存中的注册记录。
   * 关闭后以相同参数 `new IndexedDBStorage()` 仍返回此实例（需重新调用 `init()`）。
   * 同时会关闭跨标签页通知通道并清空 onWrite 监听器。
   * 若需同时清除单例注册，请改用 `destroy()`。
   */
  close(): void
  /**
   * 关闭连接并从单例缓存中移除自身（= `close()` + 移除注册）。
   * 之后以相同参数 `new IndexedDBStorage()` 将创建全新实例。
   */
  destroy(): void
}

/**
 * runInTransaction 的 scope：一组共享同一 IDBTransaction 的操作。
 * 任何操作失败都会中止整个事务并回滚。
 */
export interface ITransactionScope<T = unknown> {
  get(key: IDBValidKey): Promise<T | undefined>
  getMany(keys: IDBValidKey[]): Promise<(T | undefined)[]>
  save(data: T): Promise<IDBValidKey>
  update(data: T): Promise<IDBValidKey>
  bulkAdd(items: T[]): Promise<IDBValidKey[]>
  bulkPut(items: T[]): Promise<IDBValidKey[]>
  delete(key: IDBValidKey): Promise<void>
  bulkDelete(keys: IDBValidKey[]): Promise<number>
  count(): Promise<number>
  query(options?: QueryOptions<T>): Promise<T[]>
}

/**
 * 写入事件（onWrite 回调参数）。
 */
export interface StorageWriteEvent {
  /** 发生写入的 store 名称 */
  storeName: string
  /** 写入类型 */
  type: 'add' | 'put' | 'delete' | 'bulkAdd' | 'bulkPut' | 'bulkDelete' | 'clear'
  /** 受影响记录的主键（`clear` 时无） */
  keys?: IDBValidKey[]
  /** 'local' = 本标签页；'remote' = 其他标签页（经 BroadcastChannel 同步） */
  source: 'local' | 'remote'
}
