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
  /** 查询数据 */
  query(options?: QueryOptions): Promise<T[]>
  /** 获取单条数据 */
  get(key: IDBValidKey): Promise<T | undefined>
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
   * 若需同时清除单例注册，请改用 `destroy()`。
   */
  close(): void
  /**
   * 关闭连接并从单例缓存中移除自身（= `close()` + 移除注册）。
   * 之后以相同参数 `new IndexedDBStorage()` 将创建全新实例。
   */
  destroy(): void
}
