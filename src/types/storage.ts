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
  /** 更新数据 */
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
  /** 关闭连接 */
  close(): void
}

/**
 * 生命周期钩子
 */
export interface LifecycleHooks {
  /** 初始化前 */
  beforeInit?(): Promise<void> | void
  /** 初始化后 */
  afterInit?(): Promise<void> | void
  /** 保存前 */
  beforeSave?<T>(data: T): Promise<T> | T
  /** 保存后 */
  afterSave?<T>(data: T, key: IDBValidKey): Promise<void> | void
  /** 关闭前 */
  beforeClose?(): Promise<void> | void
}
